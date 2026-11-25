/**
 * Hemiciclo de 230 lugares. Cada grupo parlamentar ocupa uma fatia, com os lugares
 * atuais (composição real); cada lugar é pintado com o sentido de voto do grupo.
 * A AR publica votações por grupo (e exceções individuais), não o voto nominal de todos,
 * por isso isto é uma representação: lugares do grupo × sentido de voto do grupo.
 */
import type { VoteDTO } from "@estadodalei/shared";
import { SEATING_ORDER } from "@/data/groups";
import type { VotePosition } from "@/data/types";
import { partyVotes, type PartyVote } from "@/lib/adapt";

export type SeatState = VotePosition | "sem-dados";

export interface SeatPoint {
  x: number;
  y: number;
  angle: number;
  /** Fila, de 0 (a mais próxima da mesa) a 7. */
  row: number;
  radius: number;
}

export interface Seat extends SeatPoint {
  party: string;
  state: SeatState;
}

export const ROWS = [
  { count: 16, radius: 64 },
  { count: 19, radius: 79 },
  { count: 23, radius: 94 },
  { count: 27, radius: 109 },
  { count: 31, radius: 124 },
  { count: 34, radius: 139 },
  { count: 38, radius: 154 },
  { count: 42, radius: 169 },
];

export const CENTER = { x: 210, y: 184 };

/** 230 pontos, ordenados da esquerda para a direita (fatias radiais). */
export const SEAT_POINTS: SeatPoint[] = (() => {
  const pts: SeatPoint[] = [];
  ROWS.forEach((row, rowIndex) => {
    for (let i = 0; i < row.count; i++) {
      const ratio = row.count === 1 ? 0.5 : i / (row.count - 1);
      const angle = 174 - ratio * 168;
      const rad = (angle * Math.PI) / 180;
      pts.push({
        x: CENTER.x + row.radius * Math.cos(rad),
        y: CENTER.y - row.radius * Math.sin(rad),
        angle,
        row: rowIndex,
        radius: row.radius,
      });
    }
  });
  return pts.sort((a, b) => b.angle - a.angle);
})();

const STATE_ORDER: SeatState[] = ["favor", "abstencao", "contra", "ausente", "sem-dados"];

/** Estado de cada um dos lugares de um grupo, segundo a votação. */
function partyStates(seats: number, vote: PartyVote | undefined): SeatState[] {
  const counts = new Map<SeatState, number>();
  if (!vote) return Array(seats).fill("sem-dados");

  let accounted = 0;
  for (const x of vote.exceptions) {
    counts.set(x.position, (counts.get(x.position) ?? 0) + x.n);
    accounted += x.n;
  }
  if (vote.countedOnly) {
    // Só contagens: o grupo votou com os deputados indicados; o resto não tem registo.
    const n = vote.explicit[vote.position] ?? 0;
    counts.set(vote.position, (counts.get(vote.position) ?? 0) + n);
    accounted += n;
  }
  const rest = Math.max(0, seats - accounted);
  // Sentido de voto declarado pelo grupo: os restantes lugares seguem-no.
  // Só contagens, ou sentidos contraditórios na fonte: ficam "sem registo".
  const restState: SeatState = vote.countedOnly || vote.conflict ? "sem-dados" : vote.position;
  counts.set(restState, (counts.get(restState) ?? 0) + rest);

  const states: SeatState[] = [];
  for (const state of STATE_ORDER) for (let i = 0; i < (counts.get(state) ?? 0); i++) states.push(state);
  return states.slice(0, seats);
}

/** Ordem dos blocos quando os lugares se agrupam por voto: a favor à esquerda, contra à direita. */
const VOTE_BLOCK_ORDER: SeatState[] = ["favor", "abstencao", "ausente", "sem-dados", "contra"];

/**
 * Lugares do hemiciclo. Com `order: "seating"`, cada grupo fica na sua fatia da bancada
 * (esquerda → direita); com `order: "vote"`, os lugares agrupam-se em blocos por sentido de
 * voto e, dentro de cada bloco, os grupos mantêm a ordem da bancada.
 */
export function buildSeats(
  composition: Record<string, number>,
  vote: VoteDTO | null,
  order: "seating" | "vote" = "seating",
): Seat[] {
  const parties = [
    ...SEATING_ORDER.filter((p) => composition[p]),
    ...Object.keys(composition).filter((p) => !SEATING_ORDER.includes(p)),
  ];
  const byParty = new Map((vote ? partyVotes(vote) : []).map((pv) => [pv.party, pv]));
  const assigned: { party: string; state: SeatState }[] = [];
  for (const party of parties) {
    for (const state of partyStates(composition[party] ?? 0, byParty.get(party))) assigned.push({ party, state });
  }
  if (order === "vote") {
    // Lugares vagos ficam no bloco neutro do meio, não na ponta do "contra".
    while (assigned.length < SEAT_POINTS.length) assigned.push({ party: "", state: "sem-dados" });
    // sort() é estável: dentro de cada bloco fica a ordem da bancada.
    assigned.sort((a, b) => VOTE_BLOCK_ORDER.indexOf(a.state) - VOTE_BLOCK_ORDER.indexOf(b.state));
  }
  return SEAT_POINTS.map((pt, i) => ({ ...pt, ...(assigned[i] ?? { party: "", state: "sem-dados" as const }) }));
}

export interface PartyBand {
  party: string;
  count: number;
  /** Arco exterior da fatia, logo por fora dos lugares. */
  d: string;
}

const BAND_RADIUS = 178;

function arcPoint(deg: number, radius: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: CENTER.x + radius * Math.cos(rad),
    y: CENTER.y - radius * Math.sin(rad),
  };
}

/** Fatias da bancada, da esquerda para a direita, com o arco da cor do partido. */
export function partyBands(seats: Seat[]): PartyBand[] {
  const bands: PartyBand[] = [];
  let i = 0;
  while (i < seats.length) {
    const party = seats[i]?.party ?? "";
    let j = i + 1;
    while (j < seats.length && seats[j]?.party === party) j++;
    if (party) {
      const start = seats[i]!.angle;
      const end = seats[j - 1]!.angle;
      const span = Math.max(1.6, start - end);
      const mid = (start + end) / 2;
      const a = arcPoint(mid + span / 2, BAND_RADIUS);
      const b = arcPoint(mid - span / 2, BAND_RADIUS);
      bands.push({
        party,
        count: j - i,
        d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${BAND_RADIUS} ${BAND_RADIUS} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      });
    }
    i = j;
  }
  return bands;
}

export function countStates(seats: Seat[]): Record<SeatState, number> {
  const out: Record<SeatState, number> = { favor: 0, contra: 0, abstencao: 0, ausente: 0, "sem-dados": 0 };
  for (const s of seats) out[s.state]++;
  return out;
}

export interface Run {
  state: SeatState;
  count: number;
  /** Ângulos da fatia (180° = ponta esquerda, 0° = ponta direita). */
  from: number;
  to: number;
}

/** Blocos contíguos do mesmo sentido de voto, com as fronteiras a meio entre lugares. */
export function voteRuns(seats: Seat[]): Run[] {
  const runs: { state: SeatState; count: number; first: number; last: number }[] = [];
  for (const seat of seats) {
    const current = runs[runs.length - 1];
    if (current && current.state === seat.state) {
      current.count++;
      current.last = seat.angle;
    } else {
      runs.push({ state: seat.state, count: 1, first: seat.angle, last: seat.angle });
    }
  }
  return runs.map((run, i) => ({
    state: run.state,
    count: run.count,
    from: i === 0 ? 180 : (runs[i - 1]!.last + run.first) / 2,
    to: i === runs.length - 1 ? 0 : (run.last + runs[i + 1]!.first) / 2,
  }));
}

/** Cores de cada sentido de voto: realce, base e sombra das bolas; chão e espelho dos degraus; texto. */
export const VOTE_PALETTE: Record<
  SeatState,
  { light: string; base: string; dark: string; floor: string; riser: string; text: string }
> = {
  favor: { light: "#6EE7B7", base: "#059669", dark: "#065F46", floor: "#D1FAE5", riser: "#A7F3D0", text: "#047857" },
  abstencao: { light: "#FDE68A", base: "#F59E0B", dark: "#B45309", floor: "#FEF3C7", riser: "#FDE68A", text: "#B45309" },
  contra: { light: "#FDA4AF", base: "#E11D48", dark: "#9F1239", floor: "#FFE4E6", riser: "#FECDD3", text: "#BE123C" },
  ausente: { light: "#E2E8F5", base: "#B8C4DD", dark: "#8D9BB8", floor: "#EEF2FA", riser: "#DCE4F5", text: "#4C5D85" },
  "sem-dados": { light: "#F4F7FE", base: "#D3DCEF", dark: "#AEBBD6", floor: "#F1F5FC", riser: "#E2E9F7", text: "#4C5D85" },
};

export const VOTE_LABEL: Record<SeatState, string> = {
  favor: "A favor",
  abstencao: "Abstenção",
  contra: "Contra",
  ausente: "Ausente",
  "sem-dados": "Sem registo",
};
