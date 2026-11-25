import type { CitizenGroupMeta, PartyCode, ProposalStatus, ProposalTheme } from "./types";

export const CITIZEN_GROUPS: CitizenGroupMeta[] = [
  {
    id: "trabalhadores",
    label: "Trabalhadores por conta de outrem",
    shortLabel: "Trabalhadores",
    description: "Salários, IRS, férias, teletrabalho e direitos laborais.",
    iconName: "Briefcase",
  },
  {
    id: "jovens",
    label: "Jovens (até 35 anos)",
    shortLabel: "Jovens",
    description: "IRS Jovem, primeiro emprego, apoio à compra de casa e transportes.",
    iconName: "Compass",
  },
  {
    id: "familias",
    label: "Famílias e Filhos",
    shortLabel: "Famílias",
    description: "Creches, abono de família, licenças parentais e deduções fiscais.",
    iconName: "Users",
  },
  {
    id: "inquilinos",
    label: "Inquilinos / Arrendatários",
    shortLabel: "Inquilinos",
    description: "Limites às rendas, contratos, apoios ao arrendamento e deduções.",
    iconName: "KeyRound",
  },
  {
    id: "proprietarios",
    label: "Proprietários e Crédito Habitação",
    shortLabel: "Proprietários",
    description: "IMI, IMT, juros do crédito à habitação e licenciamento.",
    iconName: "Home",
  },
  {
    id: "pensionistas",
    label: "Reformados e Pensionistas",
    shortLabel: "Pensionistas",
    description: "Atualização de pensões, suplementos, saúde e benefícios sociais.",
    iconName: "HeartHandshake",
  },
  {
    id: "empresas",
    label: "Empresas, PMEs e Recibos Verdes",
    shortLabel: "Empresas & PMEs",
    description: "IRC, IVA, licenças, burocracia e contratação.",
    iconName: "Building2",
  },
  {
    id: "utentes-sns",
    label: "Utentes do SNS",
    shortLabel: "Utentes SNS",
    description: "Consultas, urgências, medicamentos e médicos de família.",
    iconName: "Stethoscope",
  },
  {
    id: "estudantes",
    label: "Estudantes e Ensino Superior",
    shortLabel: "Estudantes",
    description: "Propinas, bolsas, alojamento estudantil e passes.",
    iconName: "GraduationCap",
  },
  {
    id: "contribuintes",
    label: "Todos os Contribuintes",
    shortLabel: "Contribuintes",
    description: "Impostos gerais, energia, combustíveis e serviços públicos.",
    iconName: "Wallet",
  },
];

export const STATUS_META: Record<
  ProposalStatus,
  {
    label: string;
    shortLabel: string;
    badgeVariant: "promulgated" | "approved" | "voting" | "committee" | "rejected" | "neutral" | "warning";
    description: string;
    colorClass: string;
  }
> = {
  promulgated: {
    label: "Publicada em Diário da República",
    shortLabel: "Publicada",
    badgeVariant: "promulgated",
    description: "Aprovada no Parlamento e publicada oficialmente.",
    colorClass: "bg-blue-600",
  },
  approved: {
    label: "Aprovada na Assembleia",
    shortLabel: "Aprovada",
    badgeVariant: "approved",
    description: "Aprovada no Parlamento; aguarda promulgação ou publicação.",
    colorClass: "bg-emerald-600",
  },
  voting: {
    label: "Em votação no Parlamento",
    shortLabel: "Em votação",
    badgeVariant: "voting",
    description: "Está nas fases de votação: generalidade, especialidade ou votação final global.",
    colorClass: "bg-amber-500",
  },
  committee: {
    label: "Em apreciação na Comissão",
    shortLabel: "Em comissão",
    badgeVariant: "committee",
    description: "Deu entrada e está a ser analisada antes da votação na generalidade.",
    colorClass: "bg-slate-500",
  },
  rejected: {
    label: "Rejeitada / Chumbada",
    shortLabel: "Chumbada",
    badgeVariant: "rejected",
    description: "Não reuniu maioria na Assembleia da República e não avança.",
    colorClass: "bg-red-600",
  },
  withdrawn: {
    label: "Retirada pelos autores",
    shortLabel: "Retirada",
    badgeVariant: "neutral",
    description: "Os autores retiraram a iniciativa antes de ser decidida.",
    colorClass: "bg-slate-400",
  },
  vetoed: {
    label: "Vetada pelo Presidente",
    shortLabel: "Vetada",
    badgeVariant: "warning",
    description: "O Presidente da República vetou o decreto aprovado pela Assembleia.",
    colorClass: "bg-orange-500",
  },
};

export const ALL_THEMES: ProposalTheme[] = [
  "Habitação",
  "Impostos",
  "Saúde",
  "Trabalho",
  "Educação",
  "Ambiente",
  "Justiça",
  "Transportes",
  "Economia",
];

export const PARTY_META: Record<
  PartyCode,
  { name: string; color: string; bgClass: string }
> = {
  PSD: { name: "PSD", color: "#F97316", bgClass: "bg-orange-500" },
  PS: { name: "PS", color: "#E11D48", bgClass: "bg-rose-600" },
  CH: { name: "Chega", color: "#1E3A8A", bgClass: "bg-blue-900" },
  IL: { name: "IL", color: "#0EA5E9", bgClass: "bg-sky-500" },
  L: { name: "Livre", color: "#10B981", bgClass: "bg-emerald-500" },
  PCP: { name: "PCP", color: "#DC2626", bgClass: "bg-red-600" },
  "CDS-PP": { name: "CDS-PP", color: "#2563EB", bgClass: "bg-blue-600" },
  BE: { name: "BE", color: "#991B1B", bgClass: "bg-red-800" },
  PAN: { name: "PAN", color: "#0D9488", bgClass: "bg-teal-600" },
  JPP: { name: "JPP", color: "#15803D", bgClass: "bg-green-700" },
};

/** Ordem aproximada dos grupos no hemiciclo, da esquerda para a direita. */
export const SEATING_ORDER: string[] = ["PCP", "BE", "L", "PAN", "PS", "JPP", "PSD", "CDS-PP", "IL", "CH"];

export function partyMeta(code: string): { name: string; color: string } {
  return (PARTY_META as Record<string, { name: string; color: string }>)[code] ?? { name: code, color: "#94A3B8" };
}

/** Quem apresentou a iniciativa, em texto legível. */
export const AUTHOR_TYPE_LABELS: Record<string, string> = {
  PAR: "Presidente da Assembleia da República",
};
