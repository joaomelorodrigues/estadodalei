import cron from "node-cron";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { logger } from "./logger.js";
import { isBehind } from "./freshness.js";
import { loadLegislature } from "./legislature.js";
import { runSync } from "./sync/index.js";

const log = logger("server");

async function main() {
  await connectDb();
  await loadLegislature();

  const app = await createApp();
  const server = app.listen(config.PORT, () => {
    log.info(`API em http://localhost:${config.PORT}`);
  });

  if (config.SYNC_CRON) {
    if (!cron.validate(config.SYNC_CRON)) throw new Error(`SYNC_CRON inválido: "${config.SYNC_CRON}"`);
    cron.schedule(
      config.SYNC_CRON,
      () => {
        runSync().catch((err: unknown) => log.error("sincronização agendada falhou", err));
      },
      { timezone: "Europe/Lisbon" },
    );
    log.info(`sincronização agendada: "${config.SYNC_CRON}"`);
  }

  // Recuperar atrasos (ex.: servidor desligado durante horas): sincroniza já em vez de esperar pelo cron.
  if (config.SYNC_ON_START && (await isBehind(3))) {
    log.info("dados com mais de 3 h (ou nunca sincronizados): a sincronizar em segundo plano");
    runSync().catch((err: unknown) => log.error("sincronização de arranque falhou", err));
  }

  const shutdown = (signal: string) => {
    log.info(`${signal}: a terminar`);
    server.close(() => {
      disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  log.error("falha ao arrancar", err);
  process.exit(1);
});
