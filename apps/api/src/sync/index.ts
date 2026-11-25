import { normalizeSearch, type SourceProvider } from "@estadodalei/shared";
import type { AnyBulkWriteOperation } from "mongoose";
import { config } from "../config.js";
import { reportHeartbeat } from "../freshness.js";
import { getLegislature, refreshLegislature } from "../legislature.js";
import { logger } from "../logger.js";
import { Composition, Diploma, DreAct, Initiative, SyncRun } from "../models.js";
import { fetchParliamentFromAr } from "../sources/ar.js";
import { fetchComposition } from "../sources/composition.js";
import { fetchDreSerie1 } from "../sources/dre.js";
import { fetchParliamentFromOpenData } from "../sources/opendata.js";
import type { ParliamentSnapshot } from "../sources/types.js";
import { deriveState } from "./status.js";

const log = logger("sync");
const BATCH = 250;

type Job = "parliament" | "dre" | "composition";

async function inBatches<T>(ops: T[], write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < ops.length; i += BATCH) await write(ops.slice(i, i + BATCH));
}

/** Regista a execução em SyncRun, com sucesso ou erro. */
async function tracked<T extends { provider: SourceProvider; stats: Record<string, number>; dataAsOf: string | null; fallbackReason?: string | null }>(
  job: Job,
  fn: () => Promise<T>,
) {
  const run = await SyncRun.create({ job, startedAt: new Date() });
  try {
    const result = await fn();
    await SyncRun.updateOne(
      { _id: run._id },
      {
        $set: {
          ok: true,
          finishedAt: new Date(),
          provider: result.provider,
          stats: result.stats,
          dataAsOf: result.dataAsOf,
          fallbackReason: result.fallbackReason ?? null,
        },
      },
    );
    log.info(`${job}: concluído via ${result.provider}`, result.stats);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await SyncRun.updateOne({ _id: run._id }, { $set: { ok: false, finishedAt: new Date(), error: message } });
    log.error(`${job}: falhou — ${message}`);
    throw err;
  }
}

// --- Parlamento --------------------------------------------------------------

async function loadParliamentSnapshot(leg: string): Promise<{ snapshot: ParliamentSnapshot; fallbackReason: string | null }> {
  if (config.SYNC_PROVIDER === "ar") return { snapshot: await fetchParliamentFromAr(leg), fallbackReason: null };
  if (config.SYNC_PROVIDER === "opendata") {
    return { snapshot: await fetchParliamentFromOpenData(leg), fallbackReason: "SYNC_PROVIDER=opendata" };
  }
  try {
    return { snapshot: await fetchParliamentFromAr(leg), fallbackReason: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(`fonte oficial AR indisponível (${reason}); a usar open-data.pt`);
    return { snapshot: await fetchParliamentFromOpenData(leg), fallbackReason: reason };
  }
}

async function writeParliament(snapshot: ParliamentSnapshot) {
  const syncedAt = new Date();

  const initiativeOps: AnyBulkWriteOperation[] = snapshot.initiatives.map((ini) => {
    const derived = deriveState(ini.typeCode, ini.events, ini.votes);
    const { id, events, votes, ...fields } = ini;
    return {
      updateOne: {
        filter: { _id: id },
        update: {
          $set: {
            ...fields,
            titleSearch: normalizeSearch(ini.title),
            events: events.map(({ id: eid, ...e }) => ({ _id: eid, ...e })),
            votes: votes.map(({ id: vid, ...v }) => ({ _id: vid, ...v })),
            ...derived,
            source: { provider: snapshot.provider, syncedAt },
          },
        },
        upsert: true,
      },
    };
  });
  await inBatches(initiativeOps, (b) => Initiative.bulkWrite(b, { ordered: false }));

  const diplomaOps: AnyBulkWriteOperation[] = snapshot.diplomas.map(({ id, initiativeIds, ...fields }) => ({
    updateOne: {
      filter: { _id: id },
      // Sem initiativeIds (fonte de reserva) mantêm-se as ligações já conhecidas.
      update: { $set: { ...fields, ...(initiativeIds ? { initiativeIds } : {}) } },
      upsert: true,
    },
  }));
  await inBatches(diplomaOps, (b) => Diploma.bulkWrite(b, { ordered: false }));

  // Ligação iniciativa → diplomas (a partir de todos os diplomas conhecidos).
  const links = new Map<string, string[]>();
  for (const d of await Diploma.find({ "initiativeIds.0": { $exists: true } }, { initiativeIds: 1 }).lean()) {
    for (const iniId of d.initiativeIds ?? []) links.set(iniId, [...(links.get(iniId) ?? []), d._id]);
  }
  const linkOps: AnyBulkWriteOperation[] = [...links].map(([iniId, diplomaIds]) => ({
    updateOne: { filter: { _id: iniId }, update: { $set: { diplomaIds } } },
  }));
  await inBatches(linkOps, (b) => Initiative.bulkWrite(b, { ordered: false }));

  return {
    initiatives: snapshot.initiatives.length,
    events: snapshot.initiatives.reduce((n, i) => n + i.events.length, 0),
    votes: snapshot.initiatives.reduce((n, i) => n + i.votes.length, 0),
    diplomas: snapshot.diplomas.length,
    diplomaLinks: linkOps.length,
  };
}

export function syncParliament() {
  return tracked("parliament", async () => {
    const { snapshot, fallbackReason } = await loadParliamentSnapshot(getLegislature());
    const stats = await writeParliament(snapshot);
    return { provider: snapshot.provider, stats, dataAsOf: snapshot.dataAsOf, fallbackReason };
  });
}

// --- Diário da República -------------------------------------------------------

/** Tipos de ato do DR que correspondem a diplomas da AR com o mesmo nome. */
const AR_ACT_TYPES = new Set(["Lei", "Lei Orgânica", "Resolução da Assembleia da República"]);

export async function linkDreActsToDiplomas() {
  const acts = await DreAct.find({ actType: { $in: [...AR_ACT_TYPES] }, diplomaId: null }).lean();
  let linked = 0;
  for (const act of acts) {
    const m = /^(\d+)\/(\d{4})/.exec(act.number ?? "");
    if (!m) continue;
    const diploma = await Diploma.findOne({ type: act.actType, number: m[1], year: Number(m[2]) }, { _id: 1 }).lean();
    if (!diploma) continue;
    await DreAct.updateOne({ _id: act._id }, { $set: { diplomaId: diploma._id } });
    await Diploma.updateOne({ _id: diploma._id }, { $set: { dreActId: act._id } });
    linked++;
  }
  return linked;
}

export function syncDre() {
  return tracked("dre", async () => {
    const acts = await fetchDreSerie1();
    await inBatches(
      acts.map(({ id, ...fields }) => ({ updateOne: { filter: { _id: id }, update: { $set: fields }, upsert: true } })),
      (b) => DreAct.bulkWrite(b, { ordered: false }),
    );
    const linked = await linkDreActsToDiplomas();
    const dataAsOf = acts.reduce<string | null>((max, a) => (a.date && (!max || a.date > max) ? a.date : max), null);
    return { provider: "dre-rss" as const, stats: { acts: acts.length, linked }, dataAsOf };
  });
}

// --- Composição do Parlamento ------------------------------------------------------

export function syncComposition() {
  return tracked("composition", async () => {
    const legislature = getLegislature();
    const snapshot = await fetchComposition(legislature);
    await Composition.updateOne(
      { _id: legislature },
      { $set: { seats: snapshot.seats, total: snapshot.total, asOf: snapshot.asOf } },
      { upsert: true },
    );
    return { provider: "opendata" as const, stats: { total: snapshot.total, groups: Object.keys(snapshot.seats).length }, dataAsOf: snapshot.asOf };
  });
}

// --- Orquestração ----------------------------------------------------------------

let running: Promise<void> | null = null;

async function syncAll() {
  try {
    await refreshLegislature();
  } catch (err) {
    log.warn(`não foi possível confirmar a legislatura atual: ${err instanceof Error ? err.message : String(err)}`);
  }
  const results = await Promise.allSettled([syncParliament(), syncDre(), syncComposition()]);
  // Depois da AR, voltar a tentar ligar atos do DR a diplomas acabados de chegar.
  if (results[0].status === "fulfilled") await linkDreActsToDiplomas();
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length === results.length) throw new Error("todas as sincronizações falharam");
}

/**
 * Corre todas as sincronizações; chamadas concorrentes reutilizam a mesma execução.
 * Um tempo limite impede que uma execução presa bloqueie as seguintes.
 * No fim avisa o serviço de heartbeat (se configurado) sobre a frescura dos dados.
 */
export function runSync(): Promise<void> {
  running ??= (async () => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`a sincronização excedeu ${config.SYNC_TIMEOUT_MIN} min`)),
        config.SYNC_TIMEOUT_MIN * 60_000,
      );
    });
    try {
      await Promise.race([syncAll(), timeout]);
    } finally {
      clearTimeout(timer);
      running = null;
      await reportHeartbeat().catch((err: unknown) => log.warn("heartbeat falhou", err));
    }
  })();
  return running;
}

export const isSyncRunning = () => running !== null;
