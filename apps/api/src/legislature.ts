/**
 * Legislatura atual. Com LEGISLATURE=auto, a sincronização deteta a mais recente
 * publicada pela AR (com reserva no open-data.pt) e guarda-a na base de dados, para que
 * o site mude sozinho depois de eleições. Só avança, nunca recua.
 */
import { config } from "./config.js";
import { logger } from "./logger.js";
import { Setting } from "./models.js";
import { intToRoman, romanToInt } from "./roman.js";
import { detectArLegislature } from "./sources/ar.js";
import { hasRecords } from "./sources/opendata.js";

const log = logger("legislatura");
const KEY = "legislature";
/** Usada até haver deteção (instalação nova sem acesso às fontes). */
const FALLBACK = "XVII";

const isAuto = config.LEGISLATURE === "auto";
let current = isAuto ? FALLBACK : config.LEGISLATURE;

export const getLegislature = () => current;

/** No arranque: recupera a última legislatura detetada. */
export async function loadLegislature() {
  if (!isAuto) return;
  const saved = await Setting.findById(KEY).lean();
  if (typeof saved?.value === "string" && romanToInt(saved.value) > 0) current = saved.value;
}

async function detect(): Promise<string | null> {
  try {
    const fromAr = await detectArLegislature();
    if (fromAr) return fromAr;
  } catch (err) {
    log.warn(`deteção na AR falhou (${err instanceof Error ? err.message : String(err)}); a tentar open-data.pt`);
  }
  const next = intToRoman(romanToInt(current) + 1);
  return (await hasRecords(`parliament-initiatives-${next.toLowerCase()}-initiatives`)) ? next : null;
}

/** Antes de cada sincronização: avança para uma legislatura nova, se já houver dados dela. */
export async function refreshLegislature(): Promise<string> {
  if (!isAuto) return current;
  const detected = await detect();
  if (detected && romanToInt(detected) > romanToInt(current)) {
    log.info(`nova legislatura detetada: ${current} → ${detected}`);
    current = detected;
  }
  await Setting.updateOne({ _id: KEY }, { $set: { value: current } }, { upsert: true });
  return current;
}
