import { useCallback, useEffect, useRef, useState } from "react";
import {
  parlamentoInitiativeUrl,
  type AreasDTO,
  type InitiativeSummaryDTO,
  type Paginated,
  type ProposalOutcomeCounts,
} from "@estadodalei/shared";
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  ChevronDown,
  GraduationCap,
  Home,
  Landmark,
  Leaf,
  Palette,
  RotateCcw,
  Scale,
  ShieldCheck,
  Stethoscope,
  Wallet,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { partyMeta } from "@/data/groups";
import { toProposalStatus } from "@/lib/adapt";
import { shortAuthor } from "@/lib/authors";
import { formatDate } from "@/lib/format";

/**
 * "O que muda para mim", só com dados oficiais: escolhes as áreas do dia a dia e vês as
 * leis que a Assembleia da República tratou em cada uma. A área de uma lei é a da comissão
 * parlamentar que a AR indicou como competente (ver apps/api/src/areas.ts).
 */

const ICONS: Record<string, LucideIcon> = {
  trabalho: Briefcase,
  impostos: Wallet,
  habitacao: Home,
  saude: Stethoscope,
  educacao: GraduationCap,
  direitos: Scale,
  ambiente: Leaf,
  economia: Building2,
  agricultura: Wheat,
  cultura: Palette,
  estado: Landmark,
};

const TABS = [
  {
    id: "aprovadas",
    label: "Aprovadas",
    status: "aprovada,publicada",
    count: (c: ProposalOutcomeCounts) => c.approved,
  },
  {
    id: "em-curso",
    label: "Em discussão",
    status: "em-curso",
    count: (c: ProposalOutcomeCounts) => c.pending,
  },
  {
    id: "chumbadas",
    label: "Chumbadas",
    status: "rejeitada",
    count: (c: ProposalOutcomeCounts) => c.rejected,
  },
  {
    id: "todas",
    label: "Todas",
    status: null,
    count: (c: ProposalOutcomeCounts) => c.total,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STORAGE_KEY = "estadodalei_areas_v1";
const DEFAULT_AREAS = ["trabalho", "habitacao", "saude"];
const PAGE_SIZE = 20;

const shortCommittee = (name: string) => name.replace(/^Comissão (de|da|do|das|dos) /, "");

function authorText(s: InitiativeSummaryDTO): string {
  if (s.authorGroups.length > 0) {
    const names = s.authorGroups.map((g) => partyMeta(g).name);
    return `${names.length > 1 ? "Autores" : "Autor"}: ${names.join(", ")}`;
  }
  const author = shortAuthor(s.authorType);
  return author ? `Autor: ${author}` : "";
}

function phaseText(s: InitiativeSummaryDTO): string {
  if (s.lastEvent) {
    const date = formatDate(s.lastEvent.date);
    return `Última fase: ${s.lastEvent.phase}${date ? `, ${date}` : ""}`;
  }
  return s.enteredAt ? `Entrou a ${formatDate(s.enteredAt)}` : "";
}

interface LawsByAreaProps {
  data: AreasDTO;
}

export function LawsByArea({ data }: LawsByAreaProps) {
  const order = data.areas.map((a) => a.id);
  const labels = Object.fromEntries(data.areas.map((a) => [a.id, a.label]));
  const sortAreas = (ids: string[]) => order.filter((id) => ids.includes(id));

  const [selected, setSelected] = useState<string[]>(DEFAULT_AREAS);
  const [areasOpen, setAreasOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>("aprovadas");
  const [counts, setCounts] = useState<ProposalOutcomeCounts | null>(null);
  const [items, setItems] = useState<InitiativeSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const areasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!areasOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!areasRef.current?.contains(event.target as Node)) setAreasOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAreasOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [areasOpen]);

  // A escolha fica só neste dispositivo.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved)) setSelected(sortAreas(saved.filter((id) => typeof id === "string")));
    } catch {
      // sem armazenamento: fica a escolha por omissão
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(next: string[]) {
    const sorted = sortAreas(next);
    setSelected(sorted);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      // ignorar
    }
  }

  const toggle = (id: string) => choose(selected.includes(id) ? selected.filter((a) => a !== id) : [...selected, id]);

  const fetchPage = useCallback(
    async (areas: string[], tabId: TabId, pageNumber: number) => {
      const id = ++request.current;
      setLoading(true);
      setFailed(false);
      const params = new URLSearchParams({ type: "leis", area: areas.join(","), pageSize: String(PAGE_SIZE), page: String(pageNumber) });
      const status = TABS.find((t) => t.id === tabId)!.status;
      if (status) params.set("status", status);
      try {
        const res = await fetch(`/api/initiatives?${params}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Paginated<InitiativeSummaryDTO>;
        if (id !== request.current) return; // já há um pedido mais recente
        setItems((prev) => (pageNumber === 1 ? body.items : [...prev, ...body.items]));
        setTotal(body.total);
        setPage(pageNumber);
      } catch {
        if (id === request.current) setFailed(true);
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [],
  );

  // Contagens da escolha (sem repetir leis que estão em duas áreas).
  useEffect(() => {
    if (!ready) return;
    setCounts(null);
    if (selected.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/areas?select=${selected.join(",")}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<AreasDTO>) : null))
      .then((body) => setCounts(body?.selection ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, [ready, selected]);

  useEffect(() => {
    if (!ready) return;
    if (selected.length === 0) {
      request.current++;
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    void fetchPage(selected, tab, 1);
  }, [ready, selected, tab, fetchPage]);

  const othersTotal = data.otherCommittees.reduce((n, c) => n + c.laws, 0);
  const areaSummary =
    selected.length === 0
      ? "Nenhuma área escolhida"
      : selected.length === order.length
        ? "Todas as áreas"
        : selected.map((id) => labels[id]).join(", ");

  return (
    <div className="space-y-8">
      <Card className="relative z-20 bg-card">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle className="text-lg">1. Escolhe as áreas que te dizem respeito</CardTitle>
            <div className="flex items-center gap-4 text-xs font-medium">
              {selected.length < order.length && (
                <button type="button" onClick={() => choose(order)} className="cursor-pointer text-primary hover:underline">
                  Escolher todas
                </button>
              )}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => choose([])}
                  className="inline-flex cursor-pointer items-center gap-1 text-primary hover:underline"
                >
                  <RotateCcw className="size-3" />
                  Limpar
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          {/* ph-no-capture: as estatísticas de visitas não registam as áreas escolhidas. */}
          <div ref={areasRef} className="ph-no-capture relative">
            <button
              type="button"
              aria-expanded={areasOpen}
              aria-controls="areas-opcoes"
              onClick={() => setAreasOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left hover:border-primary/40"
            >
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">{areaSummary}</span>
              <ChevronDown
                className={`size-4 shrink-0 text-[#4C5D85] transition-transform ${areasOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {areasOpen ? (
              <div
                id="areas-opcoes"
                className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-[0_12px_40px_rgba(10,29,86,0.12)]"
              >
                {data.areas.map((area) => {
                  const on = selected.includes(area.id);
                  const Icon = ICONS[area.id] ?? Landmark;
                  return (
                    <label
                      key={area.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#F5F8FF]"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(area.id)}
                        className="size-4 shrink-0 accent-[#135BFF]"
                      />
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 text-sm font-semibold leading-snug text-foreground">{area.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>

          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            A tua escolha fica guardada só neste dispositivo.
          </p>
        </CardContent>
      </Card>

      {selected.length === 0 ? (
        <Card className="p-10 text-center sm:p-12">
          <h2 className="font-editorial text-2xl font-semibold text-foreground">Escolhe pelo menos uma área acima</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            Mostramos as leis aprovadas, em discussão e chumbadas nessas áreas.
          </p>
        </Card>
      ) : (
        <section className="space-y-4" aria-labelledby="leis-por-area">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="leis-por-area" className="font-editorial text-2xl font-semibold text-foreground">
              2. As leis nessas áreas
            </h2>
            <div className="inline-flex flex-wrap rounded-full bg-secondary p-1" role="group" aria-label="Estado das leis">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    tab === t.id ? "bg-[#0A1D56] text-white" : "text-[#4C5D85] hover:text-[#0A1D56]"
                  }`}
                >
                  {t.label}
                  {counts && <span className="ml-1.5 font-semibold tabular-nums opacity-75">{t.count(counts)}</span>}
                </button>
              ))}
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {loading ? "A carregar" : `${total} ${total === 1 ? "lei" : "leis"}`}
          </p>

          {failed ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Não foi possível carregar as leis.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchPage(selected, tab, items.length ? page + 1 : 1)}>
                Tentar outra vez
              </Button>
            </Card>
          ) : loading && items.length === 0 ? (
            <ul className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-28 animate-pulse rounded-xl border border-border bg-secondary/40" />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Não há leis neste estado nas áreas escolhidas.</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {items.map((s) => {
                const shared = selected.length > 1 ? (s.areas ?? []).filter((a) => selected.includes(a)) : [];
                const meta = [authorText(s), phaseText(s)].filter(Boolean).join(" · ");
                return (
                  <li
                    key={s.id}
                    className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={toProposalStatus(s)} compact />
                      {shared.map((a) => (
                        <span key={a} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {labels[a]}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-2 font-editorial text-base font-semibold leading-snug text-foreground sm:text-lg">
                      {s.plainTitle ?? s.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-xs leading-relaxed text-muted-foreground">{meta}</p>
                      <a
                        href={parlamentoInitiativeUrl(s.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-primary hover:underline"
                      >
                        Ver na Assembleia da República
                        <ArrowUpRight className="size-3" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!failed && items.length > 0 && items.length < total && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => fetchPage(selected, tab, page + 1)} disabled={loading}>
                {loading ? "A carregar…" : `Ver mais (${total - items.length})`}
              </Button>
            </div>
          )}
        </section>
      )}

      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        As áreas seguem a comissão parlamentar que a Assembleia da República indicou como competente para cada lei. Uma lei
        pode mexer com outras áreas além da sua comissão, e as leis analisadas por várias comissões (como o Orçamento do
        Estado) aparecem em várias áreas.
        {othersTotal > 0 &&
          ` Ficam de fora ${othersTotal} ${othersTotal === 1 ? "lei" : "leis"} de outras comissões (${data.otherCommittees
            .map((c) => shortCommittee(c.name))
            .join(", ")})`}
        {data.withoutCommittee > 0 &&
          `${othersTotal > 0 ? " e" : " Ficam de fora"} ${data.withoutCommittee} ${
            data.withoutCommittee === 1 ? "que ainda não tem comissão indicada" : "que ainda não têm comissão indicada"
          }`}
        {(othersTotal > 0 || data.withoutCommittee > 0) && "."} Fonte: dados abertos da Assembleia da República.
      </p>
    </div>
  );
}
