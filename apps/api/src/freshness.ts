/**
 * Frescura dos dados: há quanto tempo cada sincronização teve sucesso.
 * Usado por GET /api/status, pelo arranque (recuperar atrasos) e pelo heartbeat.
 */
import type { StatusDTO, SyncJob } from "@estadodalei/shared";
import { config } from "./config.js";
import { getLegislature } from "./legislature.js";
import { logger } from "./logger.js";
import { SyncRun } from "./models.js";

const log = logger("frescura");

/** Idade máxima aceitável da última sincronização com sucesso, em horas. */
export const MAX_AGE_HOURS: Record<SyncJob, number> = { parliament: 26, dre: 26, composition: 72 };
const JOBS = Object.keys(MAX_AGE_HOURS) as SyncJob[];

export async function getFreshness(running = false): Promise<StatusDTO> {
  const now = Date.now();
  const entries = await Promise.all(
    JOBS.map(async (job) => {
      const [success, last] = await Promise.all([
        SyncRun.findOne({ job, ok: true }).sort({ startedAt: -1 }).lean(),
        SyncRun.findOne({ job, finishedAt: { $ne: null } }).sort({ startedAt: -1 }).lean(),
      ]);
      const finished = success?.finishedAt ? new Date(success.finishedAt) : null;
      const ageHours = finished ? Math.round(((now - finished.getTime()) / 3_600_000) * 10) / 10 : null;
      const ok = ageHours !== null && ageHours <= MAX_AGE_HOURS[job];
      return [
        job,
        {
          ok,
          lastSuccessAt: finished?.toISOString() ?? null,
          ageHours,
          maxAgeHours: MAX_AGE_HOURS[job],
          dataAsOf: success?.dataAsOf ?? null,
          lastError: last && !last.ok ? (last.error ?? "erro desconhecido") : null,
        },
      ] as const;
    }),
  );
  const jobs = Object.fromEntries(entries) as StatusDTO["jobs"];
  return {
    ok: JOBS.every((j) => jobs[j].ok),
    legislature: getLegislature(),
    checkedAt: new Date(now).toISOString(),
    running,
    jobs,
  };
}

/** Há algum trabalho sem sucesso nas últimas `hours` horas (ou nunca)? */
export async function isBehind(hours: number): Promise<boolean> {
  const status = await getFreshness();
  return JOBS.some((j) => status.jobs[j].ageHours === null || status.jobs[j].ageHours! > hours);
}

/**
 * Heartbeat (ex.: healthchecks.io): chamado depois de cada sincronização.
 * Dados em dia → HEARTBEAT_URL; desatualizados → HEARTBEAT_URL/fail com o resumo.
 * Se o servidor parar, os pings deixam de chegar e o serviço avisa por email.
 */
export async function reportHeartbeat() {
  const url = config.HEARTBEAT_URL;
  if (!url) return;
  const status = await getFreshness();
  const summary = JOBS.map((j) => {
    const s = status.jobs[j];
    return `${j}: ${s.ok ? "ok" : "DESATUALIZADO"} (última com sucesso: ${s.lastSuccessAt ?? "nunca"}${s.lastError ? `; último erro: ${s.lastError}` : ""})`;
  }).join("\n");
  const target = status.ok ? url : `${url.replace(/\/$/, "")}/fail`;
  const res = await fetch(target, {
    method: "POST",
    body: `Legislatura ${status.legislature}\n${summary}`,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`heartbeat respondeu ${res.status}`);
  if (!status.ok) log.warn("dados desatualizados; alerta enviado ao heartbeat");
}
