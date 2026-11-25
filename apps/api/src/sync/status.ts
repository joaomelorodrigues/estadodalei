/**
 * Deriva o estado e a fase de uma iniciativa a partir dos eventos de tramitação
 * e das votações publicadas pela AR. Regras conservadoras: na dúvida, "em-curso".
 */
import { normalizeSearch, type InitiativeStage, type InitiativeStatus } from "@estadodalei/shared";
import type { NEvent, NVote } from "../sources/types.js";

export const STAGE_ORDER: InitiativeStage[] = [
  "entrada",
  "discussao",
  "generalidade",
  "especialidade",
  "votacao-final",
  "promulgacao",
  "publicacao",
];

export function stageForPhase(phase: string): InitiativeStage {
  const p = normalizeSearch(phase);
  if (/^(lei|resolucao|resolucao da ar|deliberacao) \(publicacao (dr|dar)\)/.test(p)) return "publicacao";
  if (/^votacao (final|global|deliberacao|novo decreto)/.test(p)) return "votacao-final";
  if (
    /^decreto|envio incm|envio para promulgacao|^promulgacao|^referenda|^veto|reapreciacao do decreto|confirmacao do decreto|envio para ratificacao/.test(
      p,
    )
  )
    return "promulgacao";
  if (/^votacao na generalidade/.test(p)) return "generalidade";
  if (/especialidade|redacao final|proposta de alteracao|avocacao/.test(p)) return "especialidade";
  if (/^entrada$|^admissao$|^anuncio|^nao admissao|despacho admissibilidade|^publicacao$|processo de urgencia/.test(p))
    return "entrada";
  return "discussao";
}

const stageIndex = (s: InitiativeStage) => STAGE_ORDER.indexOf(s);

/** Fases cuja votação decide o destino da iniciativa. */
const DECISIVE_VOTE = /^votacao (na generalidade|final global|final|global|deliberacao|novo decreto)/;
export const isDecisivePhase = (phase: string) => DECISIVE_VOTE.test(normalizeSearch(phase));

/** Resoluções e deliberações são votadas de uma só vez (generalidade, especialidade e final). */
const SINGLE_VOTE_TYPES = new Set(["R", "D"]);

const byDateThenId = <T extends { date: string | null; id: string }>(a: T, b: T) =>
  (a.date ?? "").localeCompare(b.date ?? "") || Number(a.id) - Number(b.id);

export interface DerivedState {
  status: InitiativeStatus;
  stage: InitiativeStage;
  voteResultPending: boolean;
  enteredAt: string | null;
  lastActivityAt: string | null;
  lastEvent: { phase: string; date: string | null } | null;
  lastVote: { phase: string; date: string | null; result: string; unanimous: boolean } | null;
}

export function deriveState(typeCode: string, events: NEvent[], votes: NVote[]): DerivedState {
  const sortedEvents = [...events].sort(byDateThenId);
  const sortedVotes = [...votes].sort(byDateThenId);

  const stageIdx = sortedEvents.reduce((max, e) => Math.max(max, stageIndex(stageForPhase(e.phase))), 0);
  const stage = STAGE_ORDER[stageIdx]!;

  const decisiveVotes = sortedVotes.filter((v) => isDecisivePhase(v.phase));
  const lastDecisive = decisiveVotes.at(-1) ?? null;

  // Votação marcada nos eventos mas cujo resultado ainda não foi publicado nos dados abertos.
  // A AR regista por vezes várias fases de votação no mesmo dia (generalidade, especialidade
  // e final global em conjunto) mas só publica o resultado de uma; um voto nesse dia conta.
  const lastVoteEvent = sortedEvents.filter((e) => isDecisivePhase(e.phase)).at(-1);
  const pendingVote =
    !!lastVoteEvent &&
    !votes.some((v) => v.eventId === lastVoteEvent.id || (!!v.date && !!lastVoteEvent.date && v.date >= lastVoteEvent.date)) &&
    stageIdx === stageIndex(stageForPhase(lastVoteEvent.phase));

  // Rejeitada se, depois do dia do chumbo, nenhuma fase posterior avançou o processo.
  const rejection = lastDecisive?.result === "Rejeitado" ? lastDecisive : null;
  const progressedAfterRejection =
    !!rejection &&
    sortedEvents.some(
      (e) =>
        (e.date ?? "") > (rejection.date ?? "") &&
        stageIndex(stageForPhase(e.phase)) > stageIndex(stageForPhase(rejection.phase)),
    );

  const phases = sortedEvents.map((e) => normalizeSearch(e.phase));
  const lastVeto = phases.findLastIndex((p) => p.startsWith("veto"));
  const afterVeto = phases.findLastIndex((p) => /^promulgacao|confirmacao do decreto|votacao novo decreto/.test(p));

  let status: InitiativeStatus = "em-curso";
  if (phases.some((p) => p.startsWith("retirada"))) status = "retirada";
  else if (stage === "publicacao") status = "publicada";
  else if (rejection && !pendingVote && !progressedAfterRejection) status = "rejeitada";
  else if (lastVeto >= 0 && lastVeto > afterVeto) status = "vetada";
  else if (stageIdx >= stageIndex("promulgacao")) status = "aprovada";
  else if (
    lastDecisive?.result === "Aprovado" &&
    !pendingVote &&
    (stageForPhase(lastDecisive.phase) === "votacao-final" || SINGLE_VOTE_TYPES.has(typeCode))
  )
    status = "aprovada";

  const dates = [...sortedEvents.map((e) => e.date), ...sortedVotes.map((v) => v.date)].filter(
    (d): d is string => !!d,
  );
  const entry = sortedEvents.find((e) => normalizeSearch(e.phase) === "entrada") ?? sortedEvents[0];
  const lastEvent = sortedEvents.at(-1);
  const lastVote = lastDecisive ?? sortedVotes.at(-1) ?? null;

  return {
    status,
    stage,
    voteResultPending: pendingVote && status === "em-curso",
    enteredAt: entry?.date ?? null,
    lastActivityAt: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    lastEvent: lastEvent ? { phase: lastEvent.phase, date: lastEvent.date } : null,
    lastVote: lastVote
      ? { phase: lastVote.phase, date: lastVote.date, result: lastVote.result, unanimous: lastVote.unanimous }
      : null,
  };
}
