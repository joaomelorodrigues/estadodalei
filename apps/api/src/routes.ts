import crypto from "node:crypto";
import {
  LAW_AREAS,
  normalizeSearch,
  STAGES,
  STATUS_META,
  TYPE_GROUPS,
  type CompositionDTO,
  type HighlightDTO,
  type HighlightsDTO,
  type InitiativeStage,
  type InitiativeStatus,
  type MetaDTO,
  type Paginated,
  type InitiativeSummaryDTO,
  type RecentVoteDTO,
  type TodayDTO,
} from "@estadodalei/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { config } from "./config.js";
import { getFreshness } from "./freshness.js";
import { getLegislature } from "./legislature.js";
import { getPartyRecord } from "./partyRecord.js";
import { areaFilter, areasById, getAreas } from "./areas.js";
import { Composition, Diploma, DreAct, Initiative, SyncRun } from "./models.js";
import { keyVote, toDetail, toDiploma, toDreAct, toSummary, toSyncRun, toVote } from "./serializers.js";
import { isSyncRunning, runSync } from "./sync/index.js";
import { logger } from "./logger.js";

const log = logger("api");
export const api = Router();

const LAW_TYPES = TYPE_GROUPS.leis!.codes;
const SUMMARY_PROJECTION = { events: 0, votes: 0, authorDeputies: 0 } as const;
const STATUSES = Object.keys(STATUS_META) as [InitiativeStatus, ...InitiativeStatus[]];
const STAGE_IDS = STAGES.map((s) => s.id) as [InitiativeStage, ...InitiativeStage[]];
const AREA_IDS = LAW_AREAS.map((a) => a.id) as [string, ...string[]];

/** Ordem de destaque dos atos do Diário da República. */
const DRE_PRIORITY = ["Lei Orgânica", "Lei", "Decreto-Lei", "Decreto Legislativo Regional", "Resolução da Assembleia da República", "Resolução do Conselho de Ministros", "Decreto do Presidente da República", "Decreto", "Portaria"];
const drePriority = (t: string) => {
  const i = DRE_PRIORITY.indexOf(t);
  return i === -1 ? DRE_PRIORITY.length : i;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cache(seconds: number) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", `public, max-age=${seconds}`);
    next();
  };
}

// --- Iniciativas ---------------------------------------------------------------

/** "a,b" → ["a","b"] (para filtros com vários valores; até `max`). */
const csv = <T extends z.ZodType>(item: T, max = 10) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v), z.array(item).max(max));

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(["leis", "resolucoes", "outras", "todas"]).default("todas"),
  status: csv(z.enum(STATUSES)).optional(),
  stage: csv(z.enum(STAGE_IDS)).optional(),
  party: z.string().trim().max(20).optional(),
  /** Só iniciativas com explicação revista. */
  explained: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  theme: z.string().trim().max(60).optional(),
  group: z.string().trim().max(40).optional(),
  /** Áreas do dia a dia, pela comissão competente (ver areas.ts). */
  area: csv(z.enum(AREA_IDS), AREA_IDS.length).optional(),
  ids: csv(z.string().regex(/^\d{1,12}$/)).optional(),
  sort: z.enum(["activity", "entered"]).default("activity"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

api.get("/initiatives", cache(60), async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros inválidos", details: parsed.error.issues });
    return;
  }
  const { q, type, status, stage, party, explained, theme, group, area, ids, sort, page, pageSize } = parsed.data;

  const filter: Record<string, unknown> = { legislature: getLegislature() };
  if (type !== "todas") filter.typeCode = { $in: TYPE_GROUPS[type]!.codes };
  if (status?.length) filter.status = { $in: status };
  if (stage?.length) filter.stage = { $in: stage };
  if (ids?.length) filter._id = { $in: ids };
  if (party) filter.authorGroups = party;
  if (explained !== undefined) filter["explanation.status"] = explained ? "approved" : { $ne: "approved" };
  if (theme) Object.assign(filter, { "explanation.status": "approved", "explanation.theme": theme });
  if (group) Object.assign(filter, { "explanation.status": "approved", "explanation.affectedGroups.groupId": group });
  if (area?.length) filter.$and = [areaFilter(area)];
  if (q) {
    const needle = normalizeSearch(q);
    const or: Record<string, unknown>[] = [{ titleSearch: { $regex: escapeRegex(needle) } }];
    const number = /^\d+$/.test(needle) ? Number(needle) : null;
    if (number !== null) or.push({ number }, { _id: needle });
    filter.$or = or;
  }

  const sortSpec: Record<string, 1 | -1> =
    sort === "entered" ? { enteredAt: -1, _id: -1 } : { lastActivityAt: -1, _id: -1 };

  const [docs, total] = await Promise.all([
    Initiative.find(filter, SUMMARY_PROJECTION)
      .sort(sortSpec)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Initiative.countDocuments(filter),
  ]);

  const items = docs.map(toSummary);
  if (area?.length && items.length) {
    const areas = await areasById(items.map((i) => i.id));
    for (const item of items) item.areas = areas.get(item.id) ?? [];
  }
  const body: Paginated<InitiativeSummaryDTO> = { items, total, page, pageSize };
  res.json(body);
});

// --- Áreas ("O que muda para mim") ----------------------------------------------

const areasQuery = z.object({ select: csv(z.enum(AREA_IDS), AREA_IDS.length).optional() });

api.get("/areas", cache(300), async (req, res) => {
  const parsed = areasQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros inválidos", details: parsed.error.issues });
    return;
  }
  res.json(await getAreas(getLegislature(), parsed.data.select));
});

api.get("/initiatives/:id", cache(60), async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d{1,12}$/.test(id)) {
    res.status(400).json({ error: "Identificador inválido" });
    return;
  }
  const doc = await Initiative.findById(id).lean();
  if (!doc) {
    res.status(404).json({ error: "Iniciativa não encontrada" });
    return;
  }

  const diplomaDocs = doc.diplomaIds?.length ? await Diploma.find({ _id: { $in: doc.diplomaIds } }).lean() : [];
  const actIds = diplomaDocs.map((d) => d.dreActId).filter((x): x is string => !!x);
  const acts = actIds.length ? await DreAct.find({ _id: { $in: actIds } }).lean() : [];
  const actById = new Map(acts.map((a) => [a._id, a]));
  const diplomas = diplomaDocs
    .map((d) => toDiploma(d, d.dreActId ? (actById.get(d.dreActId) ?? null) : null))
    .sort((a, b) => (a.publications[0]?.date ?? "").localeCompare(b.publications[0]?.date ?? ""));

  const relatedIds = [...new Set([...(doc.originIds ?? []), ...(doc.originatedIds ?? [])])];
  const related = relatedIds.length
    ? (await Initiative.find({ _id: { $in: relatedIds } }, { typeCode: 1, number: 1, legislature: 1, title: 1 }).lean()).map(
        (r) => {
          const s = toSummary(r);
          return { id: s.id, code: s.code, title: s.title };
        },
      )
    : [];

  res.json(toDetail(doc, diplomas, related));
});

// --- Destaques (hemiciclo e "em cima da mesa") ------------------------------------

const highlightsQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) });

api.get("/highlights", cache(60), async (req, res) => {
  const { limit } = highlightsQuery.parse(req.query);
  const laws = { legislature: getLegislature(), typeCode: { $in: LAW_TYPES } };
  const projection = { events: 0, authorDeputies: 0 } as const;
  const find = (filter: Record<string, unknown>) =>
    Initiative.find({ ...laws, ...filter }, projection).sort({ lastActivityAt: -1, _id: -1 }).limit(limit).lean();

  const filters = {
    pending: { status: "em-curso", stage: { $in: ["especialidade", "votacao-final"] } },
    approved: { status: { $in: ["aprovada", "publicada"] } },
    rejected: { status: "rejeitada" },
  };
  const count = (filter: Record<string, unknown>) => Initiative.countDocuments({ ...laws, ...filter });
  const [pending, approved, rejected, nPending, nApproved, nRejected] = await Promise.all([
    find(filters.pending),
    find(filters.approved),
    find(filters.rejected),
    count(filters.pending),
    count(filters.approved),
    count(filters.rejected),
  ]);
  const toHighlight = (doc: Record<string, any>): HighlightDTO => ({ initiative: toSummary(doc), keyVote: keyVote(doc.votes) });
  const body: HighlightsDTO = {
    pending: pending.map(toHighlight),
    approved: approved.map(toHighlight),
    rejected: rejected.map(toHighlight),
    counts: { pending: nPending, approved: nApproved, rejected: nRejected },
  };
  res.json(body);
});

api.get("/composition", cache(300), async (_req, res) => {
  const doc = await Composition.findById(getLegislature()).lean();
  const body: CompositionDTO = {
    legislature: getLegislature(),
    seats: doc?.seats ? Object.fromEntries(Object.entries(doc.seats as Record<string, number>)) : {},
    total: doc?.total ?? 0,
    asOf: doc?.asOf ?? null,
  };
  res.json(body);
});

/** Balanço por partido: leis propostas (aprovadas, chumbadas, em curso) e sentido de voto. */
api.get("/party-record", cache(300), async (_req, res) => {
  res.json(await getPartyRecord(getLegislature()));
});

// --- Resumo "Hoje" ---------------------------------------------------------------

api.get("/today", cache(60), async (_req, res) => {
  const legislature = getLegislature();

  const latestAct = await DreAct.findOne({ date: { $ne: null } }, { date: 1 }).sort({ date: -1 }).lean();
  const dreDate = latestAct?.date ?? null;
  const actDocs = dreDate ? await DreAct.find({ date: dreDate }).lean() : [];
  const actDiplomaIds = actDocs.map((a) => a.diplomaId).filter((x): x is string => !!x);
  const actDiplomas = actDiplomaIds.length ? await Diploma.find({ _id: { $in: actDiplomaIds } }, { initiativeIds: 1 }).lean() : [];
  const iniByDiploma = new Map(actDiplomas.map((d) => [d._id, d.initiativeIds ?? []]));
  const acts = actDocs
    .map((a) => toDreAct(a, a.diplomaId ? (iniByDiploma.get(a.diplomaId) ?? []) : []))
    .sort((a, b) => drePriority(a.actType) - drePriority(b.actType) || a.title.localeCompare(b.title, "pt"));

  const voteRows = await Initiative.aggregate<{ vote: Record<string, unknown>; ini: Record<string, unknown> }>([
    { $match: { legislature } },
    { $unwind: "$votes" },
    { $match: { "votes.body": "plenary", "votes.phase": { $not: /^Requerimento/ } } },
    { $sort: { "votes.date": -1, "votes._id": -1 } },
    // Uma entrada por iniciativa: a votação mais recente (no mesmo dia, a última registada,
    // normalmente a votação final global).
    {
      $group: {
        _id: "$_id",
        vote: { $first: "$votes" },
        ini: { $first: { _id: "$_id", typeCode: "$typeCode", type: "$type", number: "$number", legislature: "$legislature", title: "$title", authorGroups: "$authorGroups", explanation: "$explanation", status: "$status", stage: "$stage" } },
      },
    },
    { $sort: { "vote.date": -1, "vote._id": -1 } },
    { $limit: 12 },
    { $project: { _id: 0, vote: 1, ini: 1 } },
  ]);
  const recentVotes: RecentVoteDTO[] = voteRows.map(({ vote, ini }) => {
    const s = toSummary(ini);
    return {
      ...toVote(vote),
      initiative: { id: s.id, code: s.code, title: s.title, typeCode: s.typeCode, type: s.type, authorGroups: s.authorGroups, plainTitle: s.plainTitle, status: s.status, stage: s.stage },
    };
  });

  const laws = { legislature, typeCode: { $in: LAW_TYPES } };
  const [approved, published, fresh, statusCounts, lastEventDoc] = await Promise.all([
    Initiative.find({ ...laws, status: "aprovada" }, SUMMARY_PROJECTION).sort({ lastActivityAt: -1 }).limit(6).lean(),
    Initiative.find({ ...laws, status: "publicada" }, SUMMARY_PROJECTION).sort({ lastActivityAt: -1 }).limit(6).lean(),
    Initiative.find(laws, SUMMARY_PROJECTION).sort({ enteredAt: -1, _id: -1 }).limit(8).lean(),
    Initiative.aggregate<{ _id: InitiativeStatus; n: number }>([{ $match: laws }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Initiative.findOne({ legislature }, { lastEvent: 1 }).sort({ "lastEvent.date": -1 }).lean(),
  ]);

  const stats = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<InitiativeStatus, number>;
  for (const row of statusCounts) if (row._id in stats) stats[row._id] = row.n;

  const body: TodayDTO = {
    dre: { date: dreDate, acts },
    recentVotes,
    recentlyApproved: approved.map(toSummary),
    recentlyPublished: published.map(toSummary),
    newInitiatives: fresh.map(toSummary),
    stats,
    dataAsOf: { lastEventDate: lastEventDoc?.lastEvent?.date ?? null, lastVoteDate: recentVotes[0]?.date ?? null },
  };
  res.json(body);
});

// --- Diário da República -----------------------------------------------------------

api.get("/dre", cache(60), async (req, res) => {
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  const target = date ?? (await DreAct.findOne({ date: { $ne: null } }, { date: 1 }).sort({ date: -1 }).lean())?.date ?? null;
  const acts = target ? await DreAct.find({ date: target }).lean() : [];
  res.json({ date: target, acts: acts.map((a) => toDreAct(a)).sort((a, b) => drePriority(a.actType) - drePriority(b.actType)) });
});

// --- Estado das fontes ---------------------------------------------------------------

api.get("/meta", cache(30), async (_req, res) => {
  const [runs, lastParliament, lastDre, lastComposition, initiatives, diplomas, dreActs] = await Promise.all([
    SyncRun.find().sort({ startedAt: -1 }).limit(10).lean(),
    SyncRun.findOne({ job: "parliament", ok: true }).sort({ startedAt: -1 }).lean(),
    SyncRun.findOne({ job: "dre", ok: true }).sort({ startedAt: -1 }).lean(),
    SyncRun.findOne({ job: "composition", ok: true }).sort({ startedAt: -1 }).lean(),
    Initiative.estimatedDocumentCount(),
    Diploma.estimatedDocumentCount(),
    DreAct.estimatedDocumentCount(),
  ]);
  const body: MetaDTO = {
    legislature: getLegislature(),
    lastRuns: runs.map(toSyncRun),
    lastSuccess: {
      ...(lastParliament ? { parliament: toSyncRun(lastParliament) } : {}),
      ...(lastDre ? { dre: toSyncRun(lastDre) } : {}),
      ...(lastComposition ? { composition: toSyncRun(lastComposition) } : {}),
    },
    counts: { initiatives, diplomas, dreActs },
  };
  res.json(body);
});

// --- Administração ---------------------------------------------------------------------

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = config.ADMIN_TOKEN;
  const given = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1] ?? "";
  const ok =
    token.length > 0 &&
    given.length === token.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  next();
}

api.post("/admin/sync", requireAdmin, (_req, res) => {
  const alreadyRunning = isSyncRunning();
  runSync().catch((err: unknown) => log.error("sincronização manual falhou", err));
  res.status(202).json({ started: !alreadyRunning, running: true });
});

/** Vivo e ligado à base de dados (para o Docker/orquestrador). */
api.get("/health", (_req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.setHeader("Cache-Control", "no-store");
  res.status(db ? 200 : 503).json({ ok: db, db });
});

/** Frescura dos dados: 503 se alguma fonte não sincroniza há demasiado tempo (para monitores externos). */
api.get("/status", async (_req, res) => {
  const status = await getFreshness(isSyncRunning());
  res.setHeader("Cache-Control", "no-store");
  res.status(status.ok ? 200 : 503).json(status);
});

api.use((_req, res) => {
  res.status(404).json({ error: "Não encontrado" });
});
