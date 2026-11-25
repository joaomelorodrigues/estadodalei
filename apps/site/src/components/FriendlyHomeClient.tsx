import { useMemo, useState } from "react";
import type { DreActDTO } from "@estadodalei/shared";
import { GroupIcon } from "@/components/GroupIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { CITIZEN_GROUPS } from "@/data/groups";
import type { CitizenGroupId, LegislativeProposal } from "@/data/types";
import { formatDate } from "@/lib/format";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Newspaper,
  XCircle,
} from "lucide-react";

/** Destaque do dia, construído no servidor a partir de dados oficiais. */
export interface Takeaway {
  kind: "approved" | "published" | "rejected";
  tag: string;
  title: string;
  detail: string;
  href: string;
  external?: boolean;
  cta: string;
}

interface FriendlyHomeClientProps {
  dateLabel: string;
  takeaways: Takeaway[];
  dre: { date: string | null; acts: DreActDTO[] };
  /** Iniciativas com explicação revista (alimentam "O que muda para ti?"). */
  explained: LegislativeProposal[];
  ledger: Record<"pending" | "approved" | "rejected", LegislativeProposal[]>;
  counts: Record<"pending" | "approved" | "rejected", number>;
  totalInitiatives: number;
  lastVoteDate: string | null;
}

const FEATURED_GROUP_IDS: CitizenGroupId[] = [
  "jovens",
  "trabalhadores",
  "inquilinos",
  "familias",
  "utentes-sns",
  "pensionistas",
];

type LedgerFilter = "pending" | "approved" | "rejected";

export function FriendlyHomeClient({
  dateLabel,
  takeaways,
  dre,
  explained,
  ledger,
  counts,
  totalInitiatives,
  lastVoteDate,
}: FriendlyHomeClientProps) {
  const [showAgenda, setShowAgenda] = useState(false);
  const [activeGroup, setActiveGroup] = useState<CitizenGroupId>("jovens");
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("pending");

  const featuredGroups = useMemo(
    () => CITIZEN_GROUPS.filter((g) => FEATURED_GROUP_IDS.includes(g.id)),
    []
  );

  const groupMatches = useMemo(() => {
    return explained
      .map((proposal) => {
        const match = proposal.affectedGroups.find((g) => g.groupId === activeGroup);
        return match ? { proposal, detail: match } : null;
      })
      .filter(
        (
          item
        ): item is {
          proposal: LegislativeProposal;
          detail: LegislativeProposal["affectedGroups"][number];
        } => item !== null
      )
      .slice(0, 3);
  }, [explained, activeGroup]);

  const ledgerProposals = ledger[ledgerFilter].slice(0, 5);
  const dreLabel = dre.date ? formatDate(dre.date).slice(0, 5) : "";

  return (
    <div className="space-y-16">
      {/* 1. RESUMO DE HOJE — 3 destaques limpos com ícone quadrado arredondado + agenda opcional */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-editorial text-3xl font-extrabold text-foreground">
              O resumo de hoje
            </h2>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              {dateLabel} · O mais importante em menos de um minuto.
            </p>
            {lastVoteDate && (
              <p className="text-xs text-muted-foreground mt-1">
                A AR publica o detalhe das votações com atraso: as mais recentes disponíveis são de {formatDate(lastVoteDate)}.
              </p>
            )}
          </div>

          {dre.acts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAgenda((v) => !v)}
              aria-expanded={showAgenda}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-xs font-bold text-foreground civic-card-shadow transition-colors hover:border-primary hover:text-primary cursor-pointer"
            >
              <Newspaper className="size-4 text-primary" />
              <span>Diário da República de {dreLabel} ({dre.acts.length} {dre.acts.length === 1 ? "ato" : "atos"})</span>
              {showAgenda ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          )}
        </div>

        {/* Progressive disclosure: atos publicados no Diário da República */}
        {showAgenda && (
          <div className="rounded-2xl border border-primary/20 bg-white p-5 civic-card-shadow">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {dre.acts.map((act) => (
                <a
                  key={act.id}
                  href={act.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-xl bg-background p-4 transition-colors hover:bg-accent"
                >
                  <p className="font-mono text-[11px] font-bold text-primary">
                    {act.title}
                    {act.issuer ? ` · ${act.issuer}` : ""}
                  </p>
                  <p className="mt-1.5 line-clamp-4 text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
                    {act.summary}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          {takeaways.slice(0, 3).map((item) => {
            const Icon = item.kind === "approved" ? CheckCircle2 : item.kind === "published" ? FileText : XCircle;
            const iconBg =
              item.kind === "approved"
                ? "bg-[#059669]"
                : item.kind === "published"
                  ? "bg-[#135BFF]"
                  : "bg-[#DC2626]";
            const tagLabel = item.tag;

            return (
              <a
                key={item.href + item.kind}
                href={item.href}
                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-white p-6 civic-card-shadow transition-all hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-white ${iconBg}`}
                    >
                      <Icon className="size-5 stroke-[2.2]" />
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {tagLabel}
                    </span>
                  </div>

                  <h3 className="line-clamp-4 font-editorial text-xl font-extrabold leading-snug text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>

                  <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                </div>

                <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  {item.cta}
                  {item.external ? (
                    <ExternalLink className="size-3.5" />
                  ) : (
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  )}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {/* 2. SELETOR DE PERFIL EM CÁPSULAS TÁTEIS (assinatura visual do brand).
          Só aparece quando há explicações revistas com grupos afetados. */}
      {explained.some((p) => p.affectedGroups.length > 0) && (
      <section className="rounded-3xl bg-[#135BFF] p-6 sm:p-10 text-white civic-capsule space-y-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl space-y-1.5">
            <h2 className="font-editorial text-3xl font-extrabold text-white">
              O que muda para ti?
            </h2>
            <p className="text-sm sm:text-base font-medium text-blue-100">
              Escolhe o teu perfil para ver só as consequências práticas que te dizem respeito.
            </p>
          </div>
          <a
            href="/para-mim"
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/25 transition-colors"
          >
            Combinar vários perfis
            <ArrowRight className="size-3.5" />
          </a>
        </div>

        {/* Signature White Capsules with Rounded-Square Blue Icons */}
        <div className="flex flex-wrap gap-2.5">
          {featuredGroups.map((group) => {
            const isActive = activeGroup === group.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroup(group.id)}
                className={`inline-flex items-center gap-2.5 rounded-full p-1.5 pr-4 transition-all cursor-pointer ${
                  isActive
                    ? "bg-white text-[#0A1D56] shadow-lg ring-4 ring-white/25"
                    : "bg-white/90 text-[#0A1D56]/85 hover:bg-white"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-xl transition-colors ${
                    isActive
                      ? "bg-[#135BFF] text-white"
                      : "bg-[#EBF1FF] text-[#135BFF]"
                  }`}
                >
                  <GroupIcon name={group.iconName} className="size-4" />
                </span>
                <span className="font-editorial text-sm font-extrabold">
                  {group.shortLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Clean White Consequence Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {groupMatches.map(({ proposal, detail }) => {
            const sentimentText =
              detail.sentiment === "positive"
                ? "Alívio / benefício"
                : detail.sentiment === "warning"
                  ? "Atenção / custo"
                  : "Impacto misto";
            const sentimentClass =
              detail.sentiment === "positive"
                ? "text-emerald-700 bg-emerald-50"
                : detail.sentiment === "warning"
                  ? "text-orange-700 bg-orange-50"
                  : "text-[#0B3EC2] bg-[#EBF1FF]";

            return (
              <a
                key={proposal.id}
                href="/"
                className="group flex flex-col justify-between rounded-2xl bg-white p-5 text-[#0A1D56] transition-transform hover:-translate-y-0.5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={proposal.status} compact />
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${sentimentClass}`}>
                      {sentimentText}
                    </span>
                  </div>

                  <h3 className="font-editorial text-lg font-extrabold leading-snug text-[#0A1D56] group-hover:text-[#135BFF] transition-colors">
                    {proposal.plainTitle}
                  </h3>

                  <p className="text-sm leading-relaxed text-[#253663]">
                    {detail.consequence}
                  </p>

                  <p className="rounded-xl bg-[#F4F7FE] p-3 text-xs leading-relaxed text-[#4C5D85]">
                    <strong className="font-bold text-[#0A1D56]">Na prática: </strong>
                    {detail.example}
                  </p>
                </div>

                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#135BFF]">
                  Ver detalhes da lei
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            );
          })}
        </div>
      </section>
      )}

      {/* 3. LISTA LIMPA: POR APROVAR / APROVADAS / CHUMBADAS */}
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-editorial text-3xl font-extrabold text-foreground">
            Em cima da mesa no Parlamento
          </h2>

          <div className="inline-flex w-fit rounded-full border border-border bg-white p-1 civic-card-shadow">
            <button
              type="button"
              onClick={() => setLedgerFilter("pending")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                ledgerFilter === "pending"
                  ? "bg-[#135BFF] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por aprovar ({counts.pending})
            </button>
            <button
              type="button"
              onClick={() => setLedgerFilter("approved")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                ledgerFilter === "approved"
                  ? "bg-[#059669] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Aprovadas ({counts.approved})
            </button>
            <button
              type="button"
              onClick={() => setLedgerFilter("rejected")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                ledgerFilter === "rejected"
                  ? "bg-[#DC2626] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Chumbadas ({counts.rejected})
            </button>
          </div>
        </div>

        <div className="divide-y divide-border rounded-2xl border border-border bg-white civic-card-shadow overflow-hidden">
          {ledgerProposals.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem leis neste estado na legislatura atual.</p>
          )}
          {ledgerProposals.map((proposal) => (
            <a
              key={proposal.id}
              href="/"
              className="group flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-[#F7FAFF]"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-[11px] font-semibold text-primary">
                    {proposal.code}
                  </span>
                  <span className="text-border">·</span>
                  <span className="font-semibold text-muted-foreground">{proposal.theme ?? proposal.type}</span>
                  <StatusBadge status={proposal.status} compact />
                </div>
                <h3 className="line-clamp-3 font-editorial text-lg sm:text-xl font-extrabold text-foreground group-hover:text-primary transition-colors">
                  {proposal.plainTitle}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {proposal.shortHook}
                </p>
              </div>

              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary">
                {proposal.explained ? "Ler tradução" : "Ver detalhes"}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 pt-1 text-sm">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-xs font-bold text-white hover:bg-primary transition-colors"
          >
            Ver todas as {totalInitiatives.toLocaleString("pt-PT")} iniciativas
            <ArrowRight className="size-3.5" />
          </a>
        </div>
      </section>
    </div>
  );
}
