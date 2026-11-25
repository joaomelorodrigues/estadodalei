import {
  initiativeCode,
  parlamentoInitiativeUrl,
  type DiplomaDTO,
  type DreActDTO,
  type EventDTO,
  type ExplanationDTO,
  type InitiativeDetailDTO,
  type InitiativeStage,
  type InitiativeStatus,
  type InitiativeSummaryDTO,
  type PublicationDTO,
  type SourceProvider,
  type SyncRunDTO,
  type VoteDTO,
  type VoteSideDTO,
} from "@estadodalei/shared";
import { isDecisivePhase } from "./sync/status.js";

/* Os documentos chegam via .lean(): objetos simples com campos possivelmente ausentes. */
type Lean = Record<string, any>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export const toPublication = (p: Lean): PublicationDTO => ({
  type: str(p.type),
  number: str(p.number),
  date: str(p.date),
  url: str(p.url),
});

const toSides = (list: Lean[] | undefined): VoteSideDTO[] =>
  (list ?? []).map((s) => ({
    group: s.group,
    ...(typeof s.count === "number" ? { count: s.count } : {}),
    ...(s.deputy ? { deputy: s.deputy } : {}),
  }));

export const toVote = (v: Lean): VoteDTO => ({
  id: v._id,
  eventId: str(v.eventId),
  phase: v.phase ?? "Votação",
  date: str(v.date),
  body: v.body === "committee" ? "committee" : "plenary",
  committee: str(v.committee),
  result: v.result ?? "Desconhecido",
  unanimous: !!v.unanimous,
  description: str(v.description),
  inFavour: toSides(v.inFavour),
  against: toSides(v.against),
  abstention: toSides(v.abstention),
  absent: toSides(v.absent),
  publications: (v.publications ?? []).map(toPublication),
});

/** A votação em Plenário que decidiu (ou fez avançar) a iniciativa: a última decisiva, ou a última. */
export function keyVote(votes: Lean[] | undefined): VoteDTO | null {
  const plenary = (votes ?? [])
    .filter((v) => v.body !== "committee" && !/^Requerimento/i.test(v.phase ?? ""))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || Number(a._id) - Number(b._id));
  const decisive = plenary.filter((v) => isDecisivePhase(v.phase ?? ""));
  const vote = decisive.at(-1) ?? plenary.at(-1);
  return vote ? toVote(vote) : null;
}

export const toEvent = (e: Lean): EventDTO => ({
  id: e._id,
  code: str(e.code),
  phase: e.phase ?? "Evento",
  date: str(e.date),
  observation: str(e.observation),
  committees: (e.committees ?? []).map((c: Lean) => ({ id: str(c.id), name: c.name, competent: !!c.competent })),
  publications: (e.publications ?? []).map(toPublication),
});

export const toDreAct = (a: Lean, initiativeIds: string[] = []): DreActDTO => ({
  id: a._id,
  actType: a.actType,
  number: str(a.number),
  title: a.title ?? a.actType,
  issuer: str(a.issuer),
  summary: a.summary ?? "",
  date: str(a.date),
  drNumber: str(a.drNumber),
  url: a.url,
  diplomaId: str(a.diplomaId),
  initiativeIds,
});

export const toDiploma = (d: Lean, act: Lean | null): DiplomaDTO => ({
  id: d._id,
  type: d.type,
  number: str(d.number),
  year: typeof d.year === "number" ? d.year : null,
  title: d.title ?? "",
  textUrl: str(d.textUrl),
  publications: (d.publications ?? []).map(toPublication),
  dreAct: act ? toDreAct(act, d.initiativeIds ?? []) : null,
});

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

/** Só as explicações revistas (status "approved") saem da API. */
export function toExplanation(doc: Lean): ExplanationDTO | null {
  const e = doc.explanation;
  if (e?.status !== "approved" || !str(e.plainTitle)) return null;
  return {
    plainTitle: e.plainTitle,
    shortHook: str(e.shortHook),
    summary: e.summary ?? "",
    kidTranslation: str(e.kidTranslation),
    officialContext: str(e.officialContext),
    theme: str(e.theme),
    impactLevel: ["alto", "medio", "baixo"].includes(e.impactLevel) ? e.impactLevel : null,
    effectiveDate: str(e.effectiveDate),
    affectedGroups: (e.affectedGroups ?? [])
      .filter((g: Lean) => g.groupId && g.label)
      .map((g: Lean) => ({
        groupId: g.groupId,
        label: g.label,
        sentiment: ["positive", "warning", "mixed"].includes(g.sentiment) ? g.sentiment : "mixed",
        consequence: g.consequence ?? "",
        example: g.example ?? "",
      })),
    beforeAfter: (e.beforeAfter ?? [])
      .filter((b: Lean) => b.topic && (b.before || b.after))
      .map((b: Lean) => ({ topic: b.topic, before: b.before ?? "", after: b.after ?? "" })),
    consequences: strings(e.consequences),
    debate: { pros: strings(e.debate?.pros), cons: strings(e.debate?.cons) },
    reviewedAt: e.reviewedAt ? new Date(e.reviewedAt).toISOString() : null,
  };
}

export const toSummary = (doc: Lean): InitiativeSummaryDTO => {
  const explanation = toExplanation(doc);
  return {
    id: doc._id,
    legislature: doc.legislature,
    session: typeof doc.session === "number" ? doc.session : null,
    typeCode: doc.typeCode,
    type: doc.type,
    number: typeof doc.number === "number" ? doc.number : null,
    code: initiativeCode(doc.typeCode, doc.number ?? null, doc.legislature),
    title: doc.title,
    authorType: str(doc.authorType),
    authorGroups: doc.authorGroups ?? [],
    status: doc.status as InitiativeStatus,
    stage: doc.stage as InitiativeStage,
    voteResultPending: !!doc.voteResultPending,
    enteredAt: str(doc.enteredAt),
    lastActivityAt: str(doc.lastActivityAt),
    lastEvent: doc.lastEvent?.phase ? { phase: doc.lastEvent.phase, date: str(doc.lastEvent.date) } : null,
    lastVote: doc.lastVote?.phase
      ? {
          phase: doc.lastVote.phase,
          date: str(doc.lastVote.date),
          result: doc.lastVote.result ?? "Desconhecido",
          unanimous: !!doc.lastVote.unanimous,
        }
      : null,
    plainTitle: explanation?.plainTitle ?? null,
    explanation,
  };
};

export function toDetail(
  doc: Lean,
  diplomas: DiplomaDTO[],
  related: { id: string; code: string; title: string }[],
): InitiativeDetailDTO {
  const byDate = <T extends { date: string | null; id: string }>(a: T, b: T) =>
    (a.date ?? "").localeCompare(b.date ?? "") || Number(a.id) - Number(b.id);
  return {
    ...toSummary(doc),
    authorDeputies: (doc.authorDeputies ?? []).map((d: Lean) => ({ id: str(d.id), name: d.name, group: str(d.group) })),
    textUrl: str(doc.textUrl),
    parlamentoUrl: parlamentoInitiativeUrl(doc._id),
    events: (doc.events ?? []).map(toEvent).sort(byDate),
    votes: (doc.votes ?? []).map(toVote).sort(byDate),
    keyVote: keyVote(doc.votes),
    diplomas,
    related,
    source: {
      provider: (doc.source?.provider ?? "ar") as SourceProvider,
      syncedAt: doc.source?.syncedAt ? new Date(doc.source.syncedAt).toISOString() : null,
    },
  };
}

export const toSyncRun = (r: Lean): SyncRunDTO => ({
  job: r.job,
  provider: (r.provider ?? null) as SourceProvider | null,
  ok: !!r.ok,
  startedAt: new Date(r.startedAt).toISOString(),
  finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
  error: str(r.error),
  stats: r.stats ?? {},
  dataAsOf: str(r.dataAsOf),
  fallbackReason: str(r.fallbackReason),
});
