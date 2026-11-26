import type { DiplomaDTO, EventDTO, VoteDTO } from "@estadodalei/shared";

/**
 * Estado apresentado no site. Vem do estado oficial calculado pela API:
 * publicada → promulgated, aprovada → approved, rejeitada → rejected,
 * retirada → withdrawn, vetada → vetoed; "em curso" divide-se em
 * committee (entrada/comissão) e voting (generalidade em diante).
 */
export type ProposalStatus =
  | "promulgated"
  | "approved"
  | "voting"
  | "committee"
  | "rejected"
  | "withdrawn"
  | "vetoed";

export type ProposalTheme =
  | "Habitação"
  | "Impostos"
  | "Saúde"
  | "Trabalho"
  | "Educação"
  | "Ambiente"
  | "Justiça"
  | "Transportes"
  | "Economia";

export type CitizenGroupId =
  | "trabalhadores"
  | "jovens"
  | "familias"
  | "inquilinos"
  | "proprietarios"
  | "pensionistas"
  | "empresas"
  | "utentes-sns"
  | "estudantes"
  | "contribuintes";

export type ImpactSentiment = "positive" | "warning" | "mixed";

export type PartyCode =
  | "PSD"
  | "PS"
  | "CH"
  | "IL"
  | "L"
  | "PCP"
  | "CDS-PP"
  | "BE"
  | "PAN"
  | "JPP";

export type VotePosition = "favor" | "contra" | "abstencao" | "ausente";

export interface AffectedGroupDetail {
  groupId: CitizenGroupId | string;
  label: string;
  sentiment: ImpactSentiment;
  consequence: string;
  example: string;
}

export interface BeforeAfterItem {
  topic: string;
  before: string;
  after: string;
}

/** Votação oficial (por grupo parlamentar), tal como publicada pela AR. */
export interface VoteRecord {
  phase: string;
  date: string;
  /** "Aprovada", "Rejeitada" ou o resultado tal como vem da fonte. */
  result: string;
  unanimous: boolean;
  /** Sentido de voto de cada grupo parlamentar. */
  byParty: Partial<Record<PartyCode | string, VotePosition>>;
  /** Nota factual: unanimidade, votos diferentes do grupo, incoerências na fonte. */
  summaryNote: string;
  /** Votação original, para o hemiciclo. */
  raw: VoteDTO;
}

export interface LegislativeProposal {
  id: string;
  slug: string;
  code: string;
  typeCode: string;
  legislature: string;
  session: string;
  type: string;
  officialTitle: string;
  /** Título da explicação revista; sem ela, o título oficial. */
  plainTitle: string;
  /** Frase da explicação revista; sem ela, o último passo oficial. */
  shortHook: string;
  /** Há explicação revista por uma pessoa (campos editoriais preenchidos). */
  explained: boolean;
  kidTranslation: string;
  citizenSummary: string;
  officialContext: string;
  status: ProposalStatus;
  /** 1=Entrada, 2=Comissão, 3=Generalidade, 4=Especialidade, 5=Votação Final, 6=Promulgação PR, 7=Diário da República */
  statusStep: number;
  theme?: ProposalTheme | string;
  author: string;
  authorGroups: string[];
  dateUpdated: string;
  enteredAt?: string;
  lastStep?: { phase: string; date: string | null };
  /** Há uma votação nos registos cujo resultado a AR ainda não publicou. */
  voteResultPending: boolean;
  effectiveDate?: string;
  impactLevel?: "alto" | "medio" | "baixo";
  affectedGroups: AffectedGroupDetail[];
  beforeAfter: BeforeAfterItem[];
  consequences: string[];
  /** Votação decisiva mais recente em Plenário. */
  votes?: VoteRecord;
  debate: {
    pros: string[];
    cons: string[];
  };
  officialLinks: {
    parlamentoUrl: string;
    diarioRepublicaUrl?: string;
    textUrl?: string;
  };
  /** Só na página de detalhe. */
  timeline?: EventDTO[];
  allVotes?: VoteDTO[];
  diplomas?: DiplomaDTO[];
}

/** Só os lados de uma votação (o que o hemiciclo precisa). */
export type VoteSides = Pick<VoteDTO, "inFavour" | "against" | "abstention" | "absent">;

/**
 * Proposta no hero da página inicial: só os campos que o hero e a janela "saber mais" usam.
 * As props das ilhas vão no HTML antes do conteúdo; menos dados = o título aparece mais cedo.
 */
export type HeroProposal = Pick<
  LegislativeProposal,
  | "id"
  | "slug"
  | "code"
  | "author"
  | "officialTitle"
  | "plainTitle"
  | "shortHook"
  | "kidTranslation"
  | "citizenSummary"
  | "status"
  | "statusStep"
  | "affectedGroups"
  | "beforeAfter"
> & {
  officialLinks: Pick<LegislativeProposal["officialLinks"], "parlamentoUrl">;
  votes?: Pick<VoteRecord, "phase" | "date" | "result" | "unanimous"> & { raw: VoteSides };
};

export interface CitizenGroupMeta {
  id: CitizenGroupId;
  label: string;
  shortLabel: string;
  description: string;
  iconName: string;
}
