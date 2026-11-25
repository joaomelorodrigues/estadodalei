/**
 * Composição atual do Parlamento (lugares por grupo parlamentar), calculada a partir
 * dos mandatos da legislatura publicados em open-data.pt (espelho dos Dados Abertos da AR).
 *
 * Um lugar conta quando o estado atual do mandato (sem data de fim) começa por "Efetivo"
 * (ex.: "Efetivo", "Efetivo Definitivo", "Efetivo Temporário"). O grupo é o mais recente.
 */
import { fetchAll } from "./opendata.js";

interface OdMandate {
  mandate_id: string;
  parliamentary_groups?: { abbreviation?: string | null; start_date?: string | null; end_date?: string | null }[] | null;
  mandate_statuses?: { description?: string | null; start_date?: string | null; end_date?: string | null }[] | null;
}

export interface CompositionSnapshot {
  seats: Record<string, number>;
  total: number;
  asOf: string;
}

const latest = <T extends { start_date?: string | null }>(list: T[]) =>
  [...list].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))[0];

export async function fetchComposition(legislature: string): Promise<CompositionSnapshot> {
  const mandates = await fetchAll<OdMandate>(`parliament-members-${legislature.toLowerCase()}-mandates`);
  const seats: Record<string, number> = {};
  let asOf = "";
  for (const m of mandates) {
    const statuses = m.mandate_statuses ?? [];
    const current = statuses.find((s) => !s.end_date) ?? latest(statuses);
    if (!current?.description?.startsWith("Efetivo")) continue;
    const group = latest(m.parliamentary_groups ?? [])?.abbreviation;
    if (!group) continue;
    seats[group] = (seats[group] ?? 0) + 1;
    if ((current.start_date ?? "") > asOf) asOf = current.start_date ?? asOf;
  }
  const total = Object.values(seats).reduce((a, b) => a + b, 0);
  // Sanidade: a Assembleia tem 230 lugares. Um valor muito diferente indica dados incompletos.
  if (total < 200 || total > 230) throw new Error(`composição improvável: ${total} lugares`);
  return { seats, total, asOf };
}
