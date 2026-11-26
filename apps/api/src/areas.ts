/**
 * Leis por área do dia a dia ("O que muda para mim").
 *
 * A área de uma lei é a da comissão parlamentar que a AR indica como competente para ela
 * (eventos da iniciativa, comissões com competent = true). Não é uma classificação nossa:
 * só agrupamos as comissões em áreas com nomes do dia a dia (LAW_AREAS).
 */
import {
  areasForCommittees,
  LAW_AREAS,
  TYPE_GROUPS,
  type AreasDTO,
  type ProposalOutcomeCounts,
} from "@estadodalei/shared";
import { Initiative } from "./models.js";

type Lean = Record<string, any>;

const LAW_TYPES = TYPE_GROUPS.leis!.codes;

/** Comissões competentes indicadas nos eventos da iniciativa (sem repetições). */
export function competentCommittees(events: Lean[] | undefined): string[] {
  const names = new Set<string>();
  for (const e of events ?? []) for (const c of e.committees ?? []) if (c.competent && c.name) names.add(c.name);
  return [...names];
}

/** Filtro MongoDB: leis cuja comissão competente pertence a alguma das áreas. */
export function areaFilter(ids: string[]) {
  return {
    $or: LAW_AREAS.filter((a) => ids.includes(a.id)).map((a) => ({
      "events.committees": { $elemMatch: { competent: true, name: a.committee } },
    })),
  };
}

/** Áreas de cada iniciativa, para juntar a uma página de resultados. */
export async function areasById(ids: string[]): Promise<Map<string, string[]>> {
  const docs = await Initiative.find({ _id: { $in: ids } }, { "events.committees": 1 }).lean();
  return new Map(docs.map((d: Lean) => [String(d._id), areasForCommittees(competentCommittees(d.events))]));
}

const emptyCounts = (): ProposalOutcomeCounts => ({ total: 0, approved: 0, rejected: 0, pending: 0, other: 0 });

function addStatus(c: ProposalOutcomeCounts, status: string) {
  c.total++;
  if (status === "aprovada" || status === "publicada") c.approved++;
  else if (status === "rejeitada") c.rejected++;
  else if (status === "em-curso") c.pending++;
  else c.other++;
}

interface LawEntry {
  status: string;
  areas: string[];
}

/** Memória curta: as áreas só mudam com a sincronização. */
let memo: { key: string; at: number; laws: LawEntry[]; base: Omit<AreasDTO, "selection"> } | null = null;

async function load(legislature: string) {
  if (memo && memo.key === legislature && Date.now() - memo.at < 5 * 60_000) return memo;
  const docs = await Initiative.find(
    { legislature, typeCode: { $in: LAW_TYPES } },
    { status: 1, "events.committees": 1 },
  ).lean();

  const laws: LawEntry[] = [];
  const counts = new Map(LAW_AREAS.map((a) => [a.id, emptyCounts()]));
  const committeeLaws = new Map<string, Map<string, number>>(LAW_AREAS.map((a) => [a.id, new Map()]));
  const other = new Map<string, number>();
  let withoutCommittee = 0;

  for (const doc of docs as Lean[]) {
    const committees = competentCommittees(doc.events);
    const areas = areasForCommittees(committees);
    laws.push({ status: doc.status, areas });
    if (committees.length === 0) withoutCommittee++;
    for (const id of areas) addStatus(counts.get(id)!, doc.status);
    for (const name of committees) {
      const area = LAW_AREAS.find((a) => a.committee.test(name));
      if (area) {
        const m = committeeLaws.get(area.id)!;
        m.set(name, (m.get(name) ?? 0) + 1);
      } else {
        other.set(name, (other.get(name) ?? 0) + 1);
      }
    }
  }

  const byCount = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
  const base: Omit<AreasDTO, "selection"> = {
    legislature,
    areas: LAW_AREAS.map((a) => ({
      id: a.id,
      label: a.label,
      committees: byCount(committeeLaws.get(a.id)!).map(([name]) => name),
      laws: counts.get(a.id)!,
    })),
    otherCommittees: byCount(other).map(([name, laws]) => ({ name, laws })),
    withoutCommittee,
  };
  memo = { key: legislature, at: Date.now(), laws, base };
  return memo;
}

export async function getAreas(legislature: string, select: string[] | undefined): Promise<AreasDTO> {
  const { laws, base } = await load(legislature);
  let selection: ProposalOutcomeCounts | null = null;
  if (select?.length) {
    selection = emptyCounts();
    for (const law of laws) if (law.areas.some((a) => select.includes(a))) addStatus(selection, law.status);
  }
  return { ...base, selection };
}
