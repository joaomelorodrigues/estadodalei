import type { SourceProvider } from "@estadodalei/shared";

/**
 * Formato normalizado comum a todos os adaptadores de fonte.
 * Datas em "YYYY-MM-DD" (como vêm da AR) ou null.
 */

export interface NPublication {
  type: string | null;
  number: string | null;
  date: string | null;
  url: string | null;
}

export interface NVoteSide {
  group: string;
  count?: number;
  deputy?: string;
}

export interface NVote {
  id: string;
  eventId: string | null;
  phase: string;
  date: string | null;
  body: "plenary" | "committee";
  committee: string | null;
  meeting: string | null;
  result: string;
  unanimous: boolean;
  description: string | null;
  inFavour: NVoteSide[];
  against: NVoteSide[];
  abstention: NVoteSide[];
  absent: NVoteSide[];
  publications: NPublication[];
}

export interface NEvent {
  id: string;
  code: string | null;
  phase: string;
  date: string | null;
  observation: string | null;
  committees: { id: string | null; name: string; competent?: boolean }[];
  publications: NPublication[];
  /** IDs de textos aprovados (diplomas) associados ao evento — só na fonte AR. */
  approvedTextIds: string[];
}

export interface NInitiative {
  id: string;
  legislature: string;
  session: number | null;
  typeCode: string;
  type: string;
  number: number | null;
  title: string;
  authorType: string | null;
  authorGroups: string[];
  authorDeputies: { id: string | null; name: string; group: string | null }[];
  textUrl: string | null;
  originIds: string[];
  originatedIds: string[];
  events: NEvent[];
  votes: NVote[];
}

export interface NDiploma {
  id: string;
  type: string;
  number: string | null;
  secondNumber: string | null;
  year: number | null;
  title: string;
  legislature: string;
  session: number | null;
  textUrl: string | null;
  publications: NPublication[];
  /** Só a fonte AR liga diplomas a iniciativas; undefined = desconhecido (não sobrescrever). */
  initiativeIds?: string[];
}

export interface ParliamentSnapshot {
  provider: SourceProvider;
  initiatives: NInitiative[];
  diplomas: NDiploma[];
  /** Data mais recente presente nos dados (para mostrar a frescura real). */
  dataAsOf: string | null;
}

export interface NDreAct {
  id: string;
  actType: string;
  number: string | null;
  title: string;
  issuer: string | null;
  summary: string;
  date: string | null;
  drNumber: string | null;
  url: string;
}
