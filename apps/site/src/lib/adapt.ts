/**
 * Converte os DTOs da API no modelo usado pelos componentes do site.
 * Factos (estado, fases, votações) vêm sempre da API; os campos editoriais
 * só são preenchidos quando há explicação revista.
 */
import {
  INITIATIVE_TYPES,
  STAGES,
  parlamentoInitiativeUrl,
  type InitiativeSummaryDTO,
  type VoteDTO,
  type VoteSideDTO,
} from "@estadodalei/shared";
import { AUTHOR_TYPE_LABELS } from "@/data/groups";
import type { LegislativeProposal, ProposalStatus, VotePosition, VoteRecord } from "@/data/types";
import { formatDate } from "@/lib/format";

const stageIndex = (stage: string) => Math.max(0, STAGES.findIndex((s) => s.id === stage));

export function toProposalStatus(s: Pick<InitiativeSummaryDTO, "status" | "stage">): ProposalStatus {
  switch (s.status) {
    case "publicada":
      return "promulgated";
    case "aprovada":
      return "approved";
    case "rejeitada":
      return "rejected";
    case "retirada":
      return "withdrawn";
    case "vetada":
      return "vetoed";
    default:
      return stageIndex(s.stage) >= stageIndex("generalidade") ? "voting" : "committee";
  }
}

const POSITION_LABEL: Record<VotePosition, string> = {
  favor: "a favor",
  contra: "contra",
  abstencao: "abstenção",
  ausente: "ausente",
};

/** Lados da votação na ordem usada no site. */
export function voteSides(v: VoteDTO): [VotePosition, VoteSideDTO[]][] {
  return [
    ["favor", v.inFavour],
    ["abstencao", v.abstention],
    ["contra", v.against],
    ["ausente", v.absent],
  ];
}

/** Como votou um grupo parlamentar numa votação. */
export interface PartyVote {
  party: string;
  /** Sentido de voto do grupo (o declarado pela AR ou, sem ele, o da maioria dos deputados). */
  position: VotePosition;
  /** A AR declara mais de um sentido de voto para o grupo (erro na fonte). */
  conflict: boolean;
  /** O grupo votou só por contagens (ex.: "85-PSD"), sem sentido de voto declarado. */
  countedOnly: boolean;
  /** Deputados contados explicitamente em cada sentido (sem duplicar nome + contagem). */
  explicit: Partial<Record<VotePosition, number>>;
  /** Votos diferentes do sentido do grupo. */
  exceptions: { position: VotePosition; label: string; n: number }[];
}

/** Agrega os lados da votação por grupo parlamentar. */
export function partyVotes(v: VoteDTO): PartyVote[] {
  const acc = new Map<
    string,
    { groupLevel: VotePosition[]; counted: Partial<Record<VotePosition, number>>; names: Partial<Record<VotePosition, string[]>> }
  >();
  for (const [pos, list] of voteSides(v)) {
    for (const side of list) {
      const e = acc.get(side.group) ?? { groupLevel: [], counted: {}, names: {} };
      acc.set(side.group, e);
      if (side.count == null && !side.deputy) {
        if (!e.groupLevel.includes(pos)) e.groupLevel.push(pos);
      } else if (side.deputy) {
        (e.names[pos] ??= []).push(side.deputy);
      } else {
        e.counted[pos] = (e.counted[pos] ?? 0) + (side.count ?? 0);
      }
    }
  }

  const out: PartyVote[] = [];
  for (const [party, e] of acc) {
    const explicit: Partial<Record<VotePosition, number>> = {};
    for (const [pos] of voteSides(v)) {
      // A AR às vezes indica o mesmo deputado duas vezes ("1-IL" e "Nome (IL)").
      const n = Math.max(e.counted[pos] ?? 0, e.names[pos]?.length ?? 0);
      if (n > 0) explicit[pos] = n;
    }
    const byCount = (Object.entries(explicit) as [VotePosition, number][]).sort((a, b) => b[1] - a[1]);
    const position = e.groupLevel[0] ?? byCount[0]?.[0] ?? "ausente";
    const exceptions = (Object.entries(explicit) as [VotePosition, number][])
      .filter(([pos]) => pos !== position)
      .map(([pos, n]) => {
        const names = e.names[pos] ?? [];
        const label = names.length >= n ? names.join(", ") : `${n} ${n === 1 ? "deputado" : "deputados"}`;
        return { position: pos, label, n };
      });
    out.push({
      party,
      position,
      conflict: e.groupLevel.length > 1,
      countedOnly: e.groupLevel.length === 0,
      explicit,
      exceptions,
    });
  }
  return out;
}

export function toVoteRecord(v: VoteDTO): VoteRecord {
  const parties = partyVotes(v);
  const byParty: Record<string, VotePosition> = {};
  for (const pv of parties) byParty[pv.party] = pv.position;

  const individual = parties.flatMap((pv) =>
    pv.exceptions.map((x) => `${x.label} (${pv.party}) ${POSITION_LABEL[x.position]}`),
  );
  const conflicts = parties.filter((pv) => pv.conflict).map((pv) => pv.party);

  const notes = [`Resultado oficial: ${v.result}${v.unanimous ? " por unanimidade" : ""}.`];
  if (individual.length) notes.push(`Votos diferentes do grupo: ${individual.join("; ")}.`);
  if (conflicts.length) {
    notes.push(`A fonte oficial regista posições contraditórias para ${conflicts.join(", ")}; mostramos a primeira.`);
  }
  notes.push("Votação por grupo parlamentar, segundo a Assembleia da República.");

  return {
    phase: v.phase,
    date: v.date ?? "",
    result: /^aprovad/i.test(v.result) ? "Aprovada" : /^rejeitad/i.test(v.result) ? "Rejeitada" : v.result,
    unanimous: v.unanimous,
    byParty,
    summaryNote: notes.join(" "),
    raw: v,
  };
}

function authorLabel(s: InitiativeSummaryDTO): string {
  if (s.authorGroups.length) return s.authorGroups.join(", ");
  if (s.authorType) return AUTHOR_TYPE_LABELS[s.authorType] ?? s.authorType;
  return "—";
}

/** Frase factual com o último passo oficial (usada quando não há explicação revista). */
export function factualHook(s: InitiativeSummaryDTO): string {
  const parts: string[] = [];
  if (s.lastVote) {
    const when = s.lastVote.date ? ` (${formatDate(s.lastVote.date)})` : "";
    parts.push(`${s.lastVote.phase}: ${s.lastVote.result.toLowerCase()}${s.lastVote.unanimous ? " por unanimidade" : ""}${when}.`);
  }
  if (s.lastEvent && !(s.lastVote && s.lastEvent.phase === s.lastVote.phase && s.lastEvent.date === s.lastVote.date)) {
    const when = s.lastEvent.date ? ` (${formatDate(s.lastEvent.date)})` : "";
    parts.push(`Último passo: ${s.lastEvent.phase}${when}.`);
  }
  if (s.voteResultPending) parts.push("A AR ainda não publicou o resultado da última votação.");
  return parts.join(" ") || "Ainda sem fases registadas.";
}

export function toProposal(s: InitiativeSummaryDTO, keyVote?: VoteDTO | null): LegislativeProposal {
  const e = s.explanation;
  return {
    id: s.id,
    slug: s.id,
    code: s.code,
    typeCode: s.typeCode,
    legislature: s.legislature,
    session: s.session ? `${s.session}.ª sessão` : "",
    type: INITIATIVE_TYPES[s.typeCode]?.label ?? s.type,
    officialTitle: s.title,
    plainTitle: e?.plainTitle ?? s.title,
    shortHook: e?.shortHook ?? factualHook(s),
    explained: !!e,
    kidTranslation: e?.kidTranslation ?? "",
    citizenSummary: e?.summary ?? "",
    officialContext: e?.officialContext ?? "",
    status: toProposalStatus(s),
    statusStep: stageIndex(s.stage) + 1,
    theme: e?.theme ?? undefined,
    author: authorLabel(s),
    authorGroups: s.authorGroups,
    dateUpdated: s.lastActivityAt ?? s.enteredAt ?? "",
    enteredAt: s.enteredAt ?? undefined,
    lastStep: s.lastEvent ?? undefined,
    voteResultPending: s.voteResultPending,
    effectiveDate: e?.effectiveDate ?? undefined,
    impactLevel: e?.impactLevel ?? undefined,
    affectedGroups: e?.affectedGroups ?? [],
    beforeAfter: e?.beforeAfter ?? [],
    consequences: e?.consequences ?? [],
    votes: keyVote ? toVoteRecord(keyVote) : undefined,
    debate: e?.debate ?? { pros: [], cons: [] },
    officialLinks: { parlamentoUrl: parlamentoInitiativeUrl(s.id) },
  };
}

/** "A favor: PSD, CDS-PP. Contra: CH, PS. Abstenção: IL." */
export function voteSummary(v: VoteRecord | undefined): string {
  if (!v) return "";
  if (v.unanimous) return `${v.result} por unanimidade (${v.phase.toLowerCase()}).`;
  const by: Record<"favor" | "contra" | "abstencao", string[]> = { favor: [], contra: [], abstencao: [] };
  for (const [party, pos] of Object.entries(v.byParty)) {
    if (pos === "favor" || pos === "contra" || pos === "abstencao") by[pos].push(party);
  }
  const parts: string[] = [];
  if (by.favor.length) parts.push(`A favor: ${by.favor.join(", ")}`);
  if (by.contra.length) parts.push(`Contra: ${by.contra.join(", ")}`);
  if (by.abstencao.length) parts.push(`Abstenção: ${by.abstencao.join(", ")}`);
  return parts.length ? `${parts.join(". ")}.` : `${v.result}.`;
}
