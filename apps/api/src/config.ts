import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// Carrega o .env da app ou da raiz do monorepo (o primeiro que existir).
for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (fs.existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27018/estadodalei"),
  /** "auto" (deteta a mais recente publicada pela AR) ou uma legislatura fixa em numeração romana (ex.: XVII). */
  LEGISLATURE: z
    .string()
    .regex(/^(auto|[IVXLC]+)$/, 'LEGISLATURE deve ser "auto" ou numeração romana (ex.: XVII)')
    .default("auto"),
  SYNC_CRON: z.string().optional().default("15 */3 * * *"),
  /** Ao arrancar, sincroniza se os dados estiverem desatualizados (por omissão: sim). */
  SYNC_ON_START: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "" || v === "true" || v === "1"),
  /** Tempo máximo de uma sincronização completa antes de ser dada como falhada. */
  SYNC_TIMEOUT_MIN: z.coerce.number().positive().default(30),
  /**
   * URL de "heartbeat" (ex.: healthchecks.io). Depois de cada sincronização é chamado se os
   * dados estiverem em dia, ou HEARTBEAT_URL/fail se estiverem desatualizados.
   */
  HEARTBEAT_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  /** auto = AR oficial com reserva no open-data.pt; ar/opendata forçam uma fonte. */
  SYNC_PROVIDER: z.enum(["auto", "ar", "opendata"]).default("auto"),
  ADMIN_TOKEN: z.string().optional().default(""),
  SYNC_USER_AGENT: z.string().default("Mozilla/5.0 (compatible; civic-open-data-sync/1.0)"),
  /**
   * Estatísticas de visitas (PostHog, sem cookies). Vazio = desligado: cópias do código
   * não enviam dados para a conta do projeto. Lido também pelo site (Analytics.astro).
   */
  POSTHOG_KEY: z.string().trim().optional().default(""),
  POSTHOG_HOST: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || "https://eu.i.posthog.com")
    .pipe(z.string().url()),
  /** Pasta do build do site Astro (por omissão ../site/dist). */
  SITE_DIST: z.string().optional(),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
