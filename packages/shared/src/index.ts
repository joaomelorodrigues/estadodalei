/**
 * Tipos e constantes partilhados entre a API e o frontend.
 * Os factos (estado, votações, datas) vêm sempre das fontes oficiais;
 * nada aqui é conteúdo editorial.
 */

// ---------------------------------------------------------------------------
// Estado e fase de uma iniciativa
// ---------------------------------------------------------------------------

export type InitiativeStatus =
  | "em-curso"
  | "aprovada"
  | "publicada"
  | "rejeitada"
  | "retirada"
  | "vetada";

export type InitiativeStage =
  | "entrada"
  | "discussao"
  | "generalidade"
  | "especialidade"
  | "votacao-final"
  | "promulgacao"
  | "publicacao";

export const STAGES: { id: InitiativeStage; label: string; description: string }[] = [
  { id: "entrada", label: "Entrada", description: "O texto é entregue na Assembleia e admitido." },
  { id: "discussao", label: "Discussão", description: "Análise em comissão e debate em Plenário." },
  { id: "generalidade", label: "Generalidade", description: "Votação da ideia geral em Plenário." },
  { id: "especialidade", label: "Especialidade", description: "Discussão e votação artigo a artigo, normalmente em comissão." },
  { id: "votacao-final", label: "Votação final", description: "Votação final global do texto em Plenário." },
  { id: "promulgacao", label: "Promulgação", description: "O Presidente da República promulga ou veta (no caso das leis)." },
  { id: "publicacao", label: "Publicação", description: "Publicação oficial no Diário da República ou no Diário da Assembleia." },
];

export const STATUS_META: Record<
  InitiativeStatus,
  { label: string; description: string; tone: "neutral" | "positive" | "negative" | "info" | "warning" }
> = {
  "em-curso": { label: "Em curso", description: "Ainda está a ser discutida ou votada.", tone: "neutral" },
  aprovada: { label: "Aprovada", description: "Aprovada na Assembleia; aguarda promulgação ou publicação.", tone: "positive" },
  publicada: { label: "Publicada", description: "Publicada oficialmente.", tone: "info" },
  rejeitada: { label: "Rejeitada", description: "Não teve maioria na votação.", tone: "negative" },
  retirada: { label: "Retirada", description: "Os autores retiraram a iniciativa.", tone: "neutral" },
  vetada: { label: "Vetada", description: "O Presidente da República vetou o decreto.", tone: "warning" },
};

// ---------------------------------------------------------------------------
// Tipos de iniciativa (códigos usados pela AR)
// ---------------------------------------------------------------------------

export const INITIATIVE_TYPES: Record<string, { label: string; short: string; plural: string }> = {
  J: { label: "Projeto de Lei", short: "PJL", plural: "Projetos de Lei" },
  P: { label: "Proposta de Lei", short: "PPL", plural: "Propostas de Lei" },
  R: { label: "Projeto de Resolução", short: "PJR", plural: "Projetos de Resolução" },
  S: { label: "Proposta de Resolução", short: "PPR", plural: "Propostas de Resolução" },
  D: { label: "Projeto de Deliberação", short: "PJD", plural: "Projetos de Deliberação" },
  A: { label: "Apreciação Parlamentar", short: "APP", plural: "Apreciações Parlamentares" },
  I: { label: "Inquérito Parlamentar", short: "INQ", plural: "Inquéritos Parlamentares" },
  C: { label: "Projeto de Revisão Constitucional", short: "PRC", plural: "Projetos de Revisão Constitucional" },
};

/** Grupos de tipos usados nos filtros. */
export const TYPE_GROUPS: Record<string, { label: string; codes: string[] }> = {
  leis: { label: "Leis", codes: ["J", "P"] },
  resolucoes: { label: "Resoluções", codes: ["R", "S"] },
  outras: { label: "Outras", codes: ["D", "A", "I", "C"] },
};

// ---------------------------------------------------------------------------
// Grupos parlamentares (apenas identidade visual; a composição vem dos dados)
// ---------------------------------------------------------------------------

export const PARTIES: Record<string, { name: string; color: string }> = {
  PSD: { name: "Partido Social Democrata", color: "#F97316" },
  PS: { name: "Partido Socialista", color: "#E11D48" },
  CH: { name: "Chega", color: "#1E3A8A" },
  IL: { name: "Iniciativa Liberal", color: "#0EA5E9" },
  L: { name: "Livre", color: "#10B981" },
  PCP: { name: "Partido Comunista Português", color: "#DC2626" },
  "CDS-PP": { name: "CDS – Partido Popular", color: "#2563EB" },
  BE: { name: "Bloco de Esquerda", color: "#991B1B" },
  PAN: { name: "Pessoas–Animais–Natureza", color: "#0D9488" },
  JPP: { name: "Juntos pelo Povo", color: "#15803D" },
};

// ---------------------------------------------------------------------------
// DTOs da API
// ---------------------------------------------------------------------------

export interface PublicationDTO {
  type: string | null;
  number: string | null;
  date: string | null;
  url: string | null;
}

export interface VoteSideDTO {
  group: string;
  /** Número de deputados, quando a AR o indica (ex.: "1-PS"). */
  count?: number;
  /** Nome do deputado quando votou de forma diferente do grupo. */
  deputy?: string;
}

export interface VoteDTO {
  id: string;
  eventId: string | null;
  phase: string;
  date: string | null;
  body: "plenary" | "committee";
  committee: string | null;
  result: string;
  unanimous: boolean;
  description: string | null;
  inFavour: VoteSideDTO[];
  against: VoteSideDTO[];
  abstention: VoteSideDTO[];
  absent: VoteSideDTO[];
  publications: PublicationDTO[];
}

export interface EventDTO {
  id: string;
  code: string | null;
  phase: string;
  date: string | null;
  observation: string | null;
  committees: { id: string | null; name: string; competent?: boolean }[];
  publications: PublicationDTO[];
}

export interface DreActDTO {
  id: string;
  actType: string;
  number: string | null;
  title: string;
  issuer: string | null;
  summary: string;
  date: string | null;
  drNumber: string | null;
  url: string;
  diplomaId: string | null;
  initiativeIds: string[];
}

export interface DiplomaDTO {
  id: string;
  type: string;
  number: string | null;
  year: number | null;
  title: string;
  textUrl: string | null;
  publications: PublicationDTO[];
  dreAct: DreActDTO | null;
}

/** Grupo de cidadãos afetado, segundo a explicação revista. */
export interface AffectedGroupDTO {
  groupId: string;
  label: string;
  sentiment: "positive" | "warning" | "mixed";
  consequence: string;
  example: string;
}

/**
 * Explicação em linguagem simples. Conteúdo editorial: só chega ao site depois de
 * revisto por uma pessoa. Os campos vazios não são mostrados.
 */
export interface ExplanationDTO {
  plainTitle: string;
  shortHook: string | null;
  summary: string;
  kidTranslation: string | null;
  officialContext: string | null;
  theme: string | null;
  impactLevel: "alto" | "medio" | "baixo" | null;
  effectiveDate: string | null;
  affectedGroups: AffectedGroupDTO[];
  beforeAfter: { topic: string; before: string; after: string }[];
  consequences: string[];
  debate: { pros: string[]; cons: string[] };
  reviewedAt: string | null;
}

export interface InitiativeSummaryDTO {
  id: string;
  legislature: string;
  session: number | null;
  typeCode: string;
  type: string;
  number: number | null;
  code: string;
  title: string;
  authorType: string | null;
  authorGroups: string[];
  status: InitiativeStatus;
  stage: InitiativeStage;
  /** Há uma votação registada nos eventos cujo resultado a AR ainda não publicou. */
  voteResultPending: boolean;
  enteredAt: string | null;
  lastActivityAt: string | null;
  lastEvent: { phase: string; date: string | null } | null;
  lastVote: { phase: string; date: string | null; result: string; unanimous: boolean } | null;
  plainTitle: string | null;
  /** Explicação revista, quando existe. */
  explanation: ExplanationDTO | null;
}

export interface InitiativeDetailDTO extends InitiativeSummaryDTO {
  authorDeputies: { id: string | null; name: string; group: string | null }[];
  textUrl: string | null;
  parlamentoUrl: string;
  events: EventDTO[];
  votes: VoteDTO[];
  /** A votação em Plenário que decidiu ou fez avançar a iniciativa. */
  keyVote: VoteDTO | null;
  diplomas: DiplomaDTO[];
  related: { id: string; code: string; title: string }[];
  source: { provider: SourceProvider; syncedAt: string | null };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecentVoteDTO extends VoteDTO {
  initiative: Pick<InitiativeSummaryDTO, "id" | "code" | "title" | "typeCode" | "type" | "authorGroups" | "plainTitle" | "status" | "stage">;
}

export interface TodayDTO {
  dre: { date: string | null; acts: DreActDTO[] };
  recentVotes: RecentVoteDTO[];
  recentlyApproved: InitiativeSummaryDTO[];
  recentlyPublished: InitiativeSummaryDTO[];
  newInitiatives: InitiativeSummaryDTO[];
  stats: Record<InitiativeStatus, number>;
  dataAsOf: { lastEventDate: string | null; lastVoteDate: string | null };
}

/** Iniciativa com a votação decisiva mais recente (para destaques e hemiciclo). */
export interface HighlightDTO {
  initiative: InitiativeSummaryDTO;
  keyVote: VoteDTO | null;
}

export interface HighlightsDTO {
  /** Leis em curso que já passaram na generalidade (aguardam votação final). */
  pending: HighlightDTO[];
  /** Leis aprovadas ou já publicadas. */
  approved: HighlightDTO[];
  rejected: HighlightDTO[];
  /** Totais de cada grupo (as listas trazem só os mais recentes). */
  counts: { pending: number; approved: number; rejected: number };
}

export interface CompositionDTO {
  legislature: string;
  seats: Record<string, number>;
  total: number;
  asOf: string | null;
}

/** Destino das leis apresentadas por um autor. */
export interface ProposalOutcomeCounts {
  total: number;
  /** Aprovadas em votação final global, incluindo as já publicadas em Diário da República. */
  approved: number;
  rejected: number;
  pending: number;
  /** Retiradas pelo autor ou vetadas. */
  other: number;
}

/** Sentido de voto de um partido nas votações decisivas das leis. */
export interface VotePositionCounts {
  favor: number;
  abstencao: number;
  contra: number;
  ausente: number;
  total: number;
}

export interface PartyRecordRowDTO {
  party: string;
  seats: number;
  /** Projetos de lei do grupo parlamentar (os de vários partidos contam para cada um). */
  proposed: ProposalOutcomeCounts;
  votes: VotePositionCounts;
}

/** Balanço da legislatura por partido: leis que propôs e como votou. */
export interface PartyRecordDTO {
  legislature: string;
  parties: PartyRecordRowDTO[];
  /** Autores que não são partidos (Governo, assembleias regionais, cidadãos…). */
  others: { author: string; proposed: ProposalOutcomeCounts }[];
  /** Leis com votação decisiva e sentido de voto por partido publicado. */
  votedLaws: number;
  /** Data da votação mais recente considerada (a AR publica o detalhe com atraso). */
  votesUntil: string | null;
  /** Meses da legislatura ("AAAA-MM"), do primeiro ao atual. */
  months: string[];
  /** Evolução mês a mês por partido; cada lista está alinhada com `months`. */
  monthly: PartyMonthlyRowDTO[];
}

export interface PartyMonthlyRowDTO {
  party: string;
  /** Projetos de lei do partido que deram entrada nesse mês. */
  proposed: number[];
  /** Projetos de lei do partido aprovados nesse mês (votação final global). */
  approved: number[];
  /** Projetos de lei do partido chumbados nesse mês. */
  rejected: number[];
  /** Sentido de voto do partido nas votações decisivas desse mês. */
  favor: number[];
  abstencao: number[];
  contra: number[];
  ausente: number[];
}

export type SourceProvider = "ar" | "opendata" | "dre-rss";

export type SyncJob = "parliament" | "dre" | "composition";

export interface SyncRunDTO {
  job: SyncJob;
  provider: SourceProvider | null;
  ok: boolean;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: Record<string, number>;
  dataAsOf: string | null;
  fallbackReason: string | null;
}

/** Frescura dos dados (GET /api/status). ok=false quando alguma fonte está atrasada. */
export interface StatusDTO {
  ok: boolean;
  legislature: string;
  checkedAt: string;
  running: boolean;
  jobs: Record<
    SyncJob,
    {
      ok: boolean;
      lastSuccessAt: string | null;
      ageHours: number | null;
      maxAgeHours: number;
      dataAsOf: string | null;
      lastError: string | null;
    }
  >;
}

export interface MetaDTO {
  legislature: string;
  lastRuns: SyncRunDTO[];
  lastSuccess: Partial<Record<SyncJob, SyncRunDTO>>;
  counts: { initiatives: number; diplomas: number; dreActs: number };
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export function initiativeCode(typeCode: string, number: number | null, legislature: string): string {
  const short = INITIATIVE_TYPES[typeCode]?.short ?? typeCode;
  return `${short} ${number ?? "?"}/${legislature}`;
}

export function parlamentoInitiativeUrl(id: string): string {
  return `https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=${encodeURIComponent(id)}`;
}

/** Minúsculas sem acentos, para pesquisa. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
