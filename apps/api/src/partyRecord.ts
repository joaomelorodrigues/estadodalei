/**
 * Balanço por partido na legislatura (só leis: projetos e propostas de lei):
 * - leis que cada partido propôs e o destino delas (aprovadas, chumbadas, em curso);
 * - como cada partido votou na votação decisiva de cada lei.
 *
 * Tudo calculado a partir dos dados oficiais da AR já sincronizados. Nada é estimado:
 * votações sem o sentido de voto publicado ficam de fora, e votos com dados
 * contraditórios na fonte (o mesmo grupo dos dois lados) também.
 */
import {
  TYPE_GROUPS,
  type PartyMonthlyRowDTO,
  type PartyRecordDTO,
  type ProposalOutcomeCounts,
  type VoteDTO,
  type VotePositionCounts,
} from "@estadodalei/shared";
import { Composition, Initiative } from "./models.js";
import { toVote } from "./serializers.js";
import { isDecisivePhase, stageForPhase } from "./sync/status.js";

type Position = "favor" | "abstencao" | "contra" | "ausente";
type Lean = Record<string, any>;

const LAW_TYPES = TYPE_GROUPS.leis!.codes;

const emptyOutcome = (): ProposalOutcomeCounts => ({ total: 0, approved: 0, rejected: 0, pending: 0, other: 0 });
const emptyVotes = (): VotePositionCounts => ({ favor: 0, abstencao: 0, contra: 0, ausente: 0, total: 0 });

function addOutcome(c: ProposalOutcomeCounts, status: string) {
  c.total++;
  if (status === "aprovada" || status === "publicada") c.approved++;
  else if (status === "rejeitada") c.rejected++;
  else if (status === "em-curso") c.pending++;
  else c.other++;
}

const monthOf = (date: string | null | undefined) => (date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null);

/** Mês atual em Lisboa ("AAAA-MM"). */
const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }).slice(0, 7);

/** Meses consecutivos de `from` a `to`, inclusive. */
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * Data em que o destino da lei ficou decidido: a votação final global (aprovadas)
 * ou a votação que a chumbou. Se o resultado ainda não estiver nas votações publicadas,
 * usa a data do evento da votação final.
 */
function decisionDate(ini: Lean): string | null {
  const latest = (dates: (string | null | undefined)[]) => dates.filter((d): d is string => !!d).sort().at(-1) ?? null;
  if (ini.status === "rejeitada") {
    return (
      latest(
        (ini.votes ?? [])
          .filter((v: Lean) => v.body !== "committee" && /^rejeitad/i.test(v.result ?? "") && isDecisivePhase(v.phase ?? ""))
          .map((v: Lean) => v.date),
      ) ??
      ini.lastVote?.date ??
      null
    );
  }
  if (ini.status !== "aprovada" && ini.status !== "publicada") return null;
  return (
    latest(
      (ini.votes ?? [])
        .filter((v: Lean) => v.body !== "committee" && /^aprovad/i.test(v.result ?? "") && stageForPhase(v.phase ?? "") === "votacao-final")
        .map((v: Lean) => v.date),
    ) ??
    latest((ini.events ?? []).filter((e: Lean) => stageForPhase(e.phase ?? "") === "votacao-final").map((e: Lean) => e.date)) ??
    ini.lastVote?.date ??
    null
  );
}

/** A votação decisiva mais recente (final global; na generalidade quando a lei foi chumbada). */
function decisiveVote(votes: Lean[] | undefined): VoteDTO | null {
  const decisive = (votes ?? [])
    .filter((v) => v.body !== "committee" && isDecisivePhase(v.phase ?? ""))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || Number(a._id) - Number(b._id));
  const v = decisive.at(-1);
  return v ? toVote(v) : null;
}

/**
 * Sentido de voto de cada grupo numa votação, com a mesma regra do site:
 * a posição do grupo como um todo prevalece; sem ela, conta a posição com mais deputados.
 * Grupos com a posição registada de forma contraditória ficam de fora.
 */
export function groupPositions(vote: VoteDTO, groups: string[]): Map<string, Position> {
  const sides: [Position, VoteDTO["inFavour"]][] = [
    ["favor", vote.inFavour],
    ["abstencao", vote.abstention],
    ["contra", vote.against],
    ["ausente", vote.absent],
  ];
  const acc = new Map<string, { groupLevel: Position[]; counted: Partial<Record<Position, number>>; named: Partial<Record<Position, number>> }>();
  for (const [pos, list] of sides) {
    for (const side of list) {
      const e = acc.get(side.group) ?? { groupLevel: [], counted: {}, named: {} };
      acc.set(side.group, e);
      if (side.count == null && !side.deputy) {
        if (!e.groupLevel.includes(pos)) e.groupLevel.push(pos);
      } else if (side.deputy) {
        e.named[pos] = (e.named[pos] ?? 0) + 1;
      } else {
        e.counted[pos] = (e.counted[pos] ?? 0) + (side.count ?? 0);
      }
    }
  }

  const out = new Map<string, Position>();
  for (const [group, e] of acc) {
    if (e.groupLevel.length > 1) continue; // dados contraditórios na fonte
    if (e.groupLevel[0]) {
      out.set(group, e.groupLevel[0]);
      continue;
    }
    // A AR às vezes indica o mesmo deputado duas vezes ("1-IL" e "Nome (IL)").
    const best = sides
      .map(([pos]) => [pos, Math.max(e.counted[pos] ?? 0, e.named[pos] ?? 0)] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])[0];
    if (best) out.set(group, best[0]);
  }
  // "Aprovado por unanimidade" sem lista: todos os grupos presentes votaram a favor.
  if (vote.unanimous) for (const g of groups) if (!out.has(g)) out.set(g, "favor");
  return out;
}

export async function computePartyRecord(legislature: string): Promise<PartyRecordDTO> {
  const [composition, initiatives] = await Promise.all([
    Composition.findById(legislature).lean(),
    Initiative.find(
      { legislature, typeCode: { $in: LAW_TYPES } },
      { typeCode: 1, status: 1, authorGroups: 1, authorType: 1, votes: 1, enteredAt: 1, lastVote: 1, "events.phase": 1, "events.date": 1 },
    ).lean(),
  ]);

  const seats: Record<string, number> = Object.fromEntries(
    Object.entries((composition?.seats as unknown as Record<string, number>) ?? {}),
  );
  const parties = new Set(Object.keys(seats).filter((p) => seats[p]! > 0));
  const proposed = new Map<string, ProposalOutcomeCounts>();
  const votes = new Map<string, VotePositionCounts>();
  const others = new Map<string, ProposalOutcomeCounts>();
  let votedLaws = 0;
  let votesUntil: string | null = null;
  // Contagens por mês: partido -> série -> mês -> n
  type Series = Exclude<keyof PartyMonthlyRowDTO, "party">;
  const byMonth = new Map<string, Map<Series, Map<string, number>>>();
  const bump = (party: string, series: Series, month: string | null) => {
    if (!month) return;
    if (!byMonth.has(party)) byMonth.set(party, new Map());
    const s = byMonth.get(party)!;
    if (!s.has(series)) s.set(series, new Map());
    const m = s.get(series)!;
    m.set(month, (m.get(month) ?? 0) + 1);
  };
  let firstMonth: string | null = null;
  const seeMonth = (month: string | null) => {
    if (month && (!firstMonth || month < firstMonth)) firstMonth = month;
  };

  for (const ini of initiatives as Lean[]) {
    const groups: string[] = [...new Set<string>(ini.authorGroups ?? [])];
    if (groups.length > 0) {
      const entered = monthOf(ini.enteredAt);
      const decided = monthOf(decisionDate(ini));
      seeMonth(entered);
      for (const g of groups) {
        parties.add(g);
        if (!proposed.has(g)) proposed.set(g, emptyOutcome());
        addOutcome(proposed.get(g)!, ini.status);
        bump(g, "proposed", entered);
        if (ini.status === "rejeitada") bump(g, "rejected", decided);
        else if (ini.status === "aprovada" || ini.status === "publicada") bump(g, "approved", decided);
      }
    } else {
      const author = ini.authorType || "Outros";
      if (!others.has(author)) others.set(author, emptyOutcome());
      addOutcome(others.get(author)!, ini.status);
    }

    const vote = decisiveVote(ini.votes);
    if (!vote) continue;
    const positions = groupPositions(vote, Object.keys(seats));
    if (positions.size === 0) continue; // sentido de voto ainda não publicado
    votedLaws++;
    if (vote.date && (!votesUntil || vote.date > votesUntil)) votesUntil = vote.date;
    const voteMonth = monthOf(vote.date);
    seeMonth(voteMonth);
    for (const [g, pos] of positions) {
      if (!votes.has(g)) votes.set(g, emptyVotes());
      const c = votes.get(g)!;
      c[pos]++;
      c.total++;
      bump(g, pos, voteMonth);
    }
  }

  const months = firstMonth ? monthRange(firstMonth, currentMonth()) : [];
  const SERIES: Series[] = ["proposed", "approved", "rejected", "favor", "abstencao", "contra", "ausente"];
  const rows = [...parties]
    .map((party) => ({
      party,
      seats: seats[party] ?? 0,
      proposed: proposed.get(party) ?? emptyOutcome(),
      votes: votes.get(party) ?? emptyVotes(),
    }))
    .filter((r) => r.seats > 0 || r.proposed.total > 0)
    .sort((a, b) => b.seats - a.seats || b.proposed.total - a.proposed.total);
  const monthly: PartyMonthlyRowDTO[] = rows.map(({ party }) => {
    const row = { party } as PartyMonthlyRowDTO;
    for (const series of SERIES) row[series] = months.map((m) => byMonth.get(party)?.get(series)?.get(m) ?? 0);
    return row;
  });

  return {
    legislature,
    months,
    monthly,
    parties: rows,
    others: [...others]
      .map(([author, c]) => ({ author, proposed: c }))
      .sort((a, b) => b.proposed.total - a.proposed.total),
    votedLaws,
    votesUntil,
  };
}

/** Memória curta: o cálculo percorre todas as leis da legislatura com as votações. */
let memo: { key: string; at: number; value: PartyRecordDTO } | null = null;

export async function getPartyRecord(legislature: string): Promise<PartyRecordDTO> {
  if (memo && memo.key === legislature && Date.now() - memo.at < 5 * 60_000) return memo.value;
  const value = await computePartyRecord(legislature);
  memo = { key: legislature, at: Date.now(), value };
  return value;
}
