/** Sincronização manual: pnpm sync */
import { connectDb, disconnectDb } from "../db.js";
import { loadLegislature } from "../legislature.js";
import { logger } from "../logger.js";
import { runSync } from "../sync/index.js";

const log = logger("cli");

const started = Date.now();
try {
  await connectDb();
  await loadLegislature();
  await runSync();
  log.info(`concluído em ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exitCode = 0;
} catch (err) {
  log.error("sincronização falhou", err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
