import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupIcon } from "@/components/GroupIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { CITIZEN_GROUPS } from "@/data/groups";
import type { CitizenGroupId, LegislativeProposal } from "@/data/types";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Info,
  RotateCcw,
  Scale,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

interface PersonalImpactSimulatorProps {
  /** Iniciativas com explicação revista (só estas dizem quem é afetado). */
  proposals: LegislativeProposal[];
}

const STORAGE_KEY = "estadodalei_perfil_v1";
const LEGACY_STORAGE_KEY = "estadopolitico_perfil_v1";

export function PersonalImpactSimulator({ proposals }: PersonalImpactSimulatorProps) {
  const [selected, setSelected] = useState<CitizenGroupId[]>(["trabalhadores", "inquilinos"]);

  useEffect(() => {
    try {
      const current = window.localStorage.getItem(STORAGE_KEY);
      const saved = current ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!current && saved) window.localStorage.setItem(STORAGE_KEY, saved);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelected(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const hasExplanations = proposals.some((p) => p.affectedGroups.length > 0);

  function toggleGroup(id: CitizenGroupId) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function applyPreset(preset: CitizenGroupId[]) {
    setSelected(preset);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
    } catch {
      // ignore
    }
  }

  const matchedProposals = useMemo(() => {
    if (selected.length === 0) return [];
    return proposals
      .map((proposal) => {
        const matchingDetails = proposal.affectedGroups.filter((g) =>
          selected.includes(g.groupId as CitizenGroupId)
        );
        if (matchingDetails.length === 0) return null;
        return { proposal, matchingDetails };
      })
      .filter(
        (
          item
        ): item is {
          proposal: LegislativeProposal;
          matchingDetails: LegislativeProposal["affectedGroups"];
        } => item !== null
      )
      .sort((a, b) => b.matchingDetails.length - a.matchingDetails.length);
  }, [proposals, selected]);

  const summary = useMemo(() => {
    const inForceOrApproved = matchedProposals.filter(
      ({ proposal }) => proposal.status === "promulgated" || proposal.status === "approved"
    ).length;
    const votingSoon = matchedProposals.filter(
      ({ proposal }) => proposal.status === "voting"
    ).length;
    const positiveCount = matchedProposals.filter(({ matchingDetails }) =>
      matchingDetails.some((d) => d.sentiment === "positive")
    ).length;
    const warningCount = matchedProposals.filter(({ matchingDetails }) =>
      matchingDetails.some((d) => d.sentiment === "warning")
    ).length;

    return { inForceOrApproved, votingSoon, positiveCount, warningCount };
  }, [matchedProposals]);

  return (
    <div className="space-y-8">
      {/* Profile Selector */}
      <Card className="bg-card">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">1. Seleciona tudo o que se aplica a ti</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                100% anónimo e guardado apenas no teu navegador — sem registo nem recolha de dados.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">Exemplos rápidos:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPreset(["jovens", "trabalhadores", "inquilinos"])}
              >
                Jovem a arrendar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPreset(["familias", "proprietarios", "utentes-sns"])}
              >
                Família com casa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPreset(["pensionistas", "utentes-sns"])}
              >
                Reformado
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          {/* ph-no-capture: as estatísticas de visitas não registam o perfil escolhido. */}
          <div className="ph-no-capture grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {CITIZEN_GROUPS.map((group) => {
              const isSelected = selected.includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={`group flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-accent/60 shadow-xs ring-1 ring-primary/20"
                      : "border-border bg-background/60 hover:border-primary/40 hover:bg-card"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div
                      className={`flex size-8 items-center justify-center rounded-lg ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <GroupIcon name={group.iconName} className="size-4" />
                    </div>
                    <span
                      className={`flex size-5 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-card"
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground leading-snug">
                      {group.shortLabel}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                      {group.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              O teu perfil fica guardado localmente no dispositivo.
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => applyPreset([])}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
              >
                <RotateCcw className="size-3" />
                Limpar seleção
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Personalized Bulletin */}
      {!hasExplanations ? (
        <Card className="p-10 sm:p-12">
          <div className="mx-auto max-w-xl space-y-3 text-center">
            <Info className="mx-auto size-8 text-primary" />
            <h2 className="font-editorial text-2xl font-semibold text-foreground">
              As explicações por perfil ainda estão a ser preparadas
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Dizer quem é afetado por uma lei exige ler o texto e ter cada explicação revista por uma pessoa. Não
              mostramos estimativas automáticas. O teu perfil fica guardado neste dispositivo e o boletim aparece aqui
              assim que houver explicações revistas.
            </p>
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/">
                  Ver as leis no hemiciclo
                  <ArrowRight className="size-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </Card>
      ) : selected.length === 0 ? (
        <Card className="p-12 text-center">
          <h2 className="font-editorial text-2xl font-semibold text-foreground">
            Seleciona pelo menos uma opção acima
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            Assim que escolheres o teu perfil, geramos imediatamente o teu boletim legislativo com as leis que afetam o teu dia-a-dia.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary KPI bar */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-muted-foreground">Leis que te afetam</p>
              <p className="mt-1 font-editorial text-3xl font-bold text-foreground">
                {matchedProposals.length}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Para os {selected.length} perfis selecionados
              </p>
            </Card>
            <Card className="p-5 border-emerald-200/80 bg-emerald-50/40">
              <p className="text-xs font-medium text-emerald-800">Já aprovadas ou em vigor</p>
              <p className="mt-1 font-editorial text-3xl font-bold text-emerald-950">
                {summary.inForceOrApproved}
              </p>
              <p className="mt-1 text-[11px] text-emerald-800">
                Impacto confirmado ou próximo
              </p>
            </Card>
            <Card className="p-5 border-amber-200/80 bg-amber-50/40">
              <p className="text-xs font-medium text-amber-800">Em votação no Parlamento</p>
              <p className="mt-1 font-editorial text-3xl font-bold text-amber-950">
                {summary.votingSoon}
              </p>
              <p className="mt-1 text-[11px] text-amber-800">
                Ainda podem mudar ou ser chumbadas
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-muted-foreground">Balanço de consequências</p>
              <div className="mt-2 flex items-center gap-3">
                <Badge variant="positive">+{summary.positiveCount} Alívios</Badge>
                <Badge variant="warning">{summary.warningCount} Atenção</Badge>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Baseado nas consequências diretas
              </p>
            </Card>
          </div>

          {/* Personalized List */}
          <div className="space-y-4">
            <h2 className="font-editorial text-2xl font-semibold text-foreground">
              2. O teu Boletim Legislativo Personalizado
            </h2>

            {matchedProposals.map(({ proposal, matchingDetails }) => (
              <Card
                key={proposal.id}
                className="overflow-hidden transition-all hover:border-primary/40"
              >
                <div className="border-b border-border/70 bg-secondary/35 px-6 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      {proposal.code}
                    </span>
                    <Badge variant="outline">{proposal.theme ?? proposal.type}</Badge>
                    <StatusBadge status={proposal.status} compact />
                  </div>
                </div>

                <CardContent className="pt-5 space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="font-editorial text-xl sm:text-2xl font-semibold text-foreground">
                      {proposal.plainTitle}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {proposal.kidTranslation || proposal.shortHook}
                    </p>
                  </div>

                  {/* Exact matched impacts */}
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchingDetails.map((detail) => {
                      const Icon =
                        detail.sentiment === "positive"
                          ? TrendingUp
                          : detail.sentiment === "warning"
                            ? AlertTriangle
                            : Scale;
                      const variant =
                        detail.sentiment === "positive"
                          ? "positive"
                          : detail.sentiment === "warning"
                            ? "warning"
                            : "neutral";
                      const label =
                        detail.sentiment === "positive"
                          ? "Alívio / Benefício"
                          : detail.sentiment === "warning"
                            ? "Atenção / Custo"
                            : "Impacto Misto";

                      return (
                        <div
                          key={detail.groupId}
                          className="rounded-xl border border-border/80 bg-background p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              Porque és: {detail.label.split(" (")[0]}
                            </span>
                            <Badge variant={variant}>
                              <Icon className="size-3" />
                              {label}
                            </Badge>
                          </div>
                          <p className="text-xs leading-relaxed text-foreground/90">
                            {detail.consequence}
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground border-t border-border/60 pt-2">
                            <strong className="text-primary">Na prática:</strong> {detail.example}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
