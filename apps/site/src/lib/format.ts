/** "2026-10-28" → "28/10/2026" (sem conversões de fuso horário). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** "2026-10-28" → "28/10" */
export function formatShortDate(iso: string | null | undefined): string {
  return formatDate(iso).slice(0, 5);
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/** "2026-11-23" → "Segunda-feira, 23 de novembro de 2026" */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Data de hoje em Lisboa, "YYYY-MM-DD". */
export function todayInLisbon(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}
