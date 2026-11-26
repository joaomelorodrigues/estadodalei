import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { HeroProposal, VoteSides } from "@/data/types";
import { buildSeats, countStates, type Seat, type SeatState } from "@/lib/hemicycle";
import { partyVotes } from "@/lib/adapt";
import { formatDate } from "@/lib/format";
import { Hemicycle3D } from "@/components/Hemicycle3D";
import { ProposalInfoModal } from "@/components/ProposalInfoModal";
import { shortAuthor } from "@/lib/authors";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

/** Autor da proposta antes do título (ex.: "PS · …", "Governo · …"). */
function TitleAuthor({ author }: { author: string }) {
  const label = shortAuthor(author);
  if (!label) return null;
  return (
    <>
      <span className="text-[#135BFF]">{label}</span>
      <span className="text-[#B4C3E6]"> · </span>
    </>
  );
}

interface ParliamentHeroProps {
  pending: HeroProposal[];
  approved: HeroProposal[];
  rejected: HeroProposal[];
  /** Totais oficiais de cada grupo (as listas trazem só as mais recentes). */
  counts: { pending: number; approved: number; rejected: number };
  /** Lugares atuais por grupo parlamentar. */
  composition: Record<string, number>;
}

type HeroMode = "pending" | "approved" | "rejected";

interface VoteChip {
  party: string;
  count: number;
  /** Deputados que votaram de forma diferente do resto do grupo. */
  dissent?: string;
}

interface VoteRow {
  state: SeatState;
  total: number;
  chips: VoteChip[];
  /** Todos os partidos, com todos os deputados, votaram assim. */
  everyone: boolean;
}

const ROW_ORDER: SeatState[] = ["favor", "abstencao", "contra", "ausente", "sem-dados"];

/**
 * Partidos agrupados por sentido de voto, a partir dos mesmos lugares do hemiciclo.
 * Um grupo dividido aparece em mais de uma linha (ex.: PS 56 em Abstenção, PS 2 em Contra).
 */
function buildVoteRows(seats: Seat[], composition: Record<string, number>, vote: VoteSides | null): VoteRow[] {
  if (!vote) return [];

  const byState = new Map<SeatState, Map<string, number>>();
  for (const seat of seats) {
    if (!seat.party) continue;
    const parties = byState.get(seat.state) ?? new Map<string, number>();
    byState.set(seat.state, parties);
    parties.set(seat.party, (parties.get(seat.party) ?? 0) + 1);
  }

  // Sentido da maioria dos deputados de cada grupo (o do grupo, salvo exceções).
  const mainState = new Map<string, { state: SeatState; n: number }>();
  for (const [state, parties] of byState) {
    for (const [party, n] of parties) {
      if (n > (mainState.get(party)?.n ?? 0)) mainState.set(party, { state, n });
    }
  }

  // Nomes (ou contagens) de quem votou diferente do grupo, tal como a AR os publica.
  const dissentLabels = new Map<string, { label: string; n: number }>();
  for (const pv of partyVotes(vote)) {
    for (const x of pv.exceptions) dissentLabels.set(`${pv.party}|${x.position}`, { label: x.label, n: x.n });
  }

  const allParties = Object.keys(composition).filter((party) => composition[party]);

  return ROW_ORDER.flatMap((state) => {
    const parties = byState.get(state) ?? new Map<string, number>();
    const total = [...parties.values()].reduce((sum, n) => sum + n, 0);
    if (total === 0 && state !== "favor" && state !== "contra") return [];

    const chips: VoteChip[] = [...parties]
      .map(([party, count]) => {
        const dissenting = state !== "sem-dados" && mainState.get(party)?.state !== state;
        const known = dissentLabels.get(`${party}|${state}`);
        const who = known?.label ?? `${count} ${count === 1 ? "deputado" : "deputados"}`;
        const verb = (known?.n ?? count) === 1 ? "votou" : "votaram";
        return {
          party,
          count,
          dissent: dissenting ? `${who} ${verb} de forma diferente do resto do grupo` : undefined,
        };
      })
      // Maior primeiro; empates na ordem da bancada (a ordem dos lugares).
      .sort((a, b) => b.count - a.count);

    const everyone =
      allParties.length > 1 && allParties.every((party) => parties.get(party) === composition[party]);

    return [{ state, total, chips, everyone }];
  });
}

/** "Votação na generalidade · aprovada · 14/11/2026" */
function voteCaption(votes: HeroProposal["votes"]): string {
  if (!votes) return "Ainda sem votação em Plenário";
  const result = `${votes.result.toLowerCase()}${votes.unanimous ? " por unanimidade" : ""}`;
  return [votes.phase, result, formatDate(votes.date)].filter(Boolean).join(" · ");
}

const STATUS_NOTES = [
  {
    id: "approved",
    title: "Aprovada",
    body: "Os deputados já votaram a favor. A lei ainda não manda na vida das pessoas: falta o Presidente da República assinar e o texto sair no jornal oficial.",
  },
  {
    id: "published",
    title: "Publicada",
    body: "O texto já saiu no Diário da República. Só a partir daí passa a existir para o cidadão. O dia em que começa a aplicar-se vem escrito na própria lei: pode ser no dia seguinte ou numa data marcada.",
  },
] as const;

const INFO_TONE: Record<HeroMode, string> = {
  pending: "text-[#135BFF] hover:bg-[#EEF3FF]",
  approved: "text-[#059669] hover:bg-[#ECFDF5]",
  rejected: "text-[#DC2626] hover:bg-[#FEF2F2]",
};

interface TitleInfoProps {
  caption: string;
  tone: HeroMode;
  note?: (typeof STATUS_NOTES)[number];
}

/** Ícone ao lado do título do hemiciclo: a votação que os lugares mostram, e a nota de estado quando existe. */
const TitleInfo: React.FC<TitleInfoProps> = (props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = props.note
    ? `O que significa ${props.note.title.toLowerCase()}. ${props.caption}`
    : props.caption;

  return (
    <div ref={rootRef} data-no-drag>
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className={`-my-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-full ${INFO_TONE[props.tone]}`}
      >
        <Info className="size-4" strokeWidth={2.25} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={props.note?.title ?? "Esta votação"}
          className="absolute top-full left-1/2 z-30 mt-2 w-[min(22rem,calc(100%-2.5rem))] -translate-x-1/2 rounded-2xl border border-[#E4ECFC] bg-white p-4 text-left shadow-[0_12px_40px_rgba(10,29,86,0.12)]"
        >
          {props.note ? (
            <>
              <p className="font-editorial text-sm font-extrabold text-[#0A1D56]">{props.note.title}</p>
              <p className="mt-2 text-[13px] leading-snug text-[#4C5D85]">{props.note.body}</p>
              <p className="mt-3 border-t border-[#E4ECFC] pt-3 text-[13px] font-semibold leading-snug text-[#4C5D85]">
                {props.caption}
              </p>
            </>
          ) : (
            <p className="text-[13px] font-semibold leading-snug text-[#4C5D85]">{props.caption}</p>
          )}
        </div>
      ) : null}
    </div>
  );
};

function centerInfo(proposal: HeroProposal, mode: HeroMode) {
  if (mode === "pending") {
    return { centerTitle: proposal.statusStep >= 5 ? "Votação final" : "Na especialidade" };
  }
  if (mode === "rejected") return { centerTitle: "Chumbada" };
  return { centerTitle: proposal.status === "promulgated" ? "Publicada" : "Aprovada" };
}

export function ParliamentHero({
  pending: pendingList,
  approved: approvedList,
  rejected: rejectedList,
  counts,
  composition,
}: ParliamentHeroProps) {
  const initialMode: HeroMode = pendingList.length ? "pending" : approvedList.length ? "approved" : "rejected";
  const [mode, setMode] = useState<HeroMode>(initialMode);
  const [selectedSlug, setSelectedSlug] = useState<string>(
    (initialMode === "pending" ? pendingList : initialMode === "approved" ? approvedList : rejectedList)[0]?.slug ?? ""
  );
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const dragStart = useRef<number | null>(null);

  const activeList =
    mode === "pending" ? pendingList : mode === "approved" ? approvedList : rejectedList;

  const activeProposal: HeroProposal | undefined =
    activeList.find((p) => p.slug === selectedSlug) ?? activeList[0];

  function switchMode(next: HeroMode) {
    setMode(next);
    const list =
      next === "pending" ? pendingList : next === "approved" ? approvedList : rejectedList;
    if (list[0]) setSelectedSlug(list[0].slug);
  }

  const seats = useMemo(
    // Cada partido fica sempre na sua bancada; o voto vê-se na cor dos lugares.
    () => buildSeats(composition, activeProposal?.votes?.raw ?? null, "seating"),
    [composition, activeProposal]
  );
  const voteRows = useMemo(
    () => buildVoteRows(seats, composition, activeProposal?.votes?.raw ?? null),
    [seats, composition, activeProposal]
  );
  // Partido destacado no hemiciclo: fixo ao tocar (mantém-se ao mudar de lei,
  // para comparar como o mesmo partido votou) ou temporário ao passar o rato.
  const [focusParty, setFocusParty] = useState<string | null>(null);
  const [hoverParty, setHoverParty] = useState<string | null>(null);
  // Notas para os cartões do hemiciclo 3D (ex.: quem votou diferente do resto do grupo).
  const voteNotes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of voteRows) for (const chip of row.chips) if (chip.dissent) out[`${chip.party}|${row.state}`] = chip.dissent;
    return out;
  }, [voteRows]);
  const seatCounts = countStates(seats);
  const seatDist = activeProposal ? centerInfo(activeProposal, mode) : { centerTitle: "" };
  const activeIndex = Math.max(
    0,
    activeList.findIndex((item) => item.slug === activeProposal?.slug)
  );
  const canSlide = activeList.length > 1;
  const [detailOpen, setDetailOpen] = useState(false);
  const closeDetail = useCallback(() => setDetailOpen(false), []);
  const [titleOpen, setTitleOpen] = useState(false);
  const [titleClamped, setTitleClamped] = useState(false);
  const titleMeasureRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setTitleOpen(false);
    setDetailOpen(false);
    // Os chips mudam com a lei; um "pointerleave" perdido deixaria o destaque preso.
    setHoverParty(null);
  }, [activeProposal?.slug, mode]);

  useLayoutEffect(() => {
    const el = titleMeasureRef.current;
    if (!el || titleOpen) return;
    const measure = () => {
      const line = parseFloat(getComputedStyle(el).lineHeight);
      setTitleClamped(el.scrollHeight > line * 2 + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeProposal?.plainTitle, activeProposal?.author, titleOpen]);

  // O CSS (.hero-fit) encolhe o hemiciclo para o cartão caber no primeiro ecrã.
  // Se nem com o hemiciclo no tamanho mínimo cabe (telemóvel deitado, título
  // expandido), o conteúdo ficaria sobreposto: aí o cartão volta ao tamanho
  // natural e a página faz scroll.
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    // Numa coluna flex encolhida abaixo do conteúdo, o último filho passa do fundo.
    const overflows = (box: HTMLElement) => {
      const last = box.lastElementChild;
      if (!last) return false;
      const bottom = box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom);
      return last.getBoundingClientRect().bottom > bottom + 1;
    };
    const check = () => {
      section.removeAttribute("data-fit-off");
      const overflowing = Array.from(section.querySelectorAll<HTMLElement>("[data-fit-box]")).some(overflows);
      section.toggleAttribute("data-fit-off", overflowing);
    };
    check();
    document.fonts?.ready.then(check);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [activeProposal?.slug, mode, titleOpen]);

  function showProposal(index: number, dir: 1 | -1) {
    const item = activeList[index];
    if (!item || item.slug === activeProposal?.slug) return;
    setSlideDir(dir);
    setSelectedSlug(item.slug);
  }

  function step(delta: 1 | -1) {
    if (!canSlide) return;
    const next = (activeIndex + delta + activeList.length) % activeList.length;
    showProposal(next, delta);
  }

  function onCarouselPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Os pontos do hemiciclo (data-swipe) deixam deslizar: tocar abre o cartão, deslizar muda de lei.
    if ((event.target as HTMLElement).closest("a, [data-no-drag], button:not([data-swipe])")) return;
    dragStart.current = event.clientX;
  }

  function onCarouselPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current == null) return;
    const dx = event.clientX - dragStart.current;
    dragStart.current = null;
    if (dx <= -48) step(1);
    else if (dx >= 48) step(-1);
  }

  return (
    <section ref={sectionRef} className="hero-fit flex flex-col bg-[#135BFF] text-white">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col px-3 py-[clamp(0.75rem,3svh,1.5rem)] short:py-2 sm:px-6 sm:py-[clamp(1rem,7svh,4rem)] sm:short:py-[clamp(0.75rem,3svh,1.5rem)] lg:px-8">
        <div className="mx-auto flex min-h-0 w-full flex-col">
            <div data-fit-box className="flex min-h-0 flex-col overflow-hidden rounded-[24px] bg-white text-[#0A1D56] civic-capsule sm:rounded-[28px]">
              {/* Top Mode Switcher */}
              <div className="flex shrink-0 flex-col gap-3 border-b border-[#E4ECFC] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 short:py-2 sm:short:py-2.5 max-sm:shorter:py-1.5">
                <div
                  className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center"
                  role="tablist"
                  aria-label="Estado das propostas no Parlamento"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "pending"}
                    onClick={() => switchMode("pending")}
                    className={`cursor-pointer rounded-full px-2 py-2 text-center text-[11px] leading-tight font-bold transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                      mode === "pending"
                        ? "bg-[#135BFF] text-white"
                        : "bg-[#F1F5FF] text-[#4C5D85] hover:text-[#0A1D56]"
                    }`}
                  >
                    <span className="sm:hidden">Por aprovar</span>
                    <span className="mt-0.5 block text-[11px] font-extrabold sm:hidden max-sm:shorter:ml-1 max-sm:shorter:mt-0 max-sm:shorter:inline">{counts.pending}</span>
                    <span className="hidden sm:inline">Por aprovar ({counts.pending})</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "approved"}
                    onClick={() => switchMode("approved")}
                    className={`cursor-pointer rounded-full px-2 py-2 text-center text-[11px] leading-tight font-bold transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                      mode === "approved"
                        ? "bg-[#047857] text-white"
                        : "bg-[#F1F5FF] text-[#4C5D85] hover:text-[#0A1D56]"
                    }`}
                  >
                    <span className="sm:hidden">Aprovadas</span>
                    <span className="mt-0.5 block text-[11px] font-extrabold sm:hidden max-sm:shorter:ml-1 max-sm:shorter:mt-0 max-sm:shorter:inline">{counts.approved}</span>
                    <span className="hidden sm:inline">Aprovadas ({counts.approved})</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "rejected"}
                    onClick={() => switchMode("rejected")}
                    className={`cursor-pointer rounded-full px-2 py-2 text-center text-[11px] leading-tight font-bold transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                      mode === "rejected"
                        ? "bg-[#DC2626] text-white"
                        : "bg-[#F1F5FF] text-[#4C5D85] hover:text-[#0A1D56]"
                    }`}
                  >
                    <span className="sm:hidden">Chumbadas</span>
                    <span className="mt-0.5 block text-[11px] font-extrabold sm:hidden max-sm:shorter:ml-1 max-sm:shorter:mt-0 max-sm:shorter:inline">{counts.rejected}</span>
                    <span className="hidden sm:inline">Chumbadas ({counts.rejected})</span>
                  </button>
                </div>
              </div>

              {!activeProposal ? (
                <p className="px-6 py-16 text-center text-sm font-medium text-[#4C5D85]">
                  Sem leis neste estado na legislatura atual.
                </p>
              ) : (
              <>
              <div id="hero-titulo" className="relative grid shrink-0 bg-white px-4 pt-4 pb-1 sm:px-6 sm:pt-5 short:pt-3">
                <p
                  ref={titleMeasureRef}
                  aria-hidden
                  className="pointer-events-none invisible absolute inset-x-4 top-0 font-editorial text-xl font-extrabold leading-snug break-words sm:inset-x-6 sm:text-2xl max-sm:shorter:text-lg"
                >
                  <TitleAuthor author={activeProposal.author} />
                  {activeProposal.plainTitle}
                </p>
                {activeList.map((item) => {
                  const current = item.slug === activeProposal.slug;
                  return (
                    <h1
                      key={item.slug}
                      title={item.officialTitle}
                      aria-hidden={current ? undefined : true}
                      className={`col-start-1 row-start-1 font-editorial text-xl font-extrabold leading-snug break-words text-[#0A1D56] sm:text-2xl max-sm:shorter:text-lg ${
                        current && titleOpen ? "" : "line-clamp-2"
                      } ${current ? "" : "invisible"}`}
                    >
                      <TitleAuthor author={item.author} />
                      {item.plainTitle}
                    </h1>
                  );
                })}
                {/*
                  A linha do botão existe sempre (invisível quando o título cabe): o título só se
                  mede no browser, e o botão a aparecer depois empurrava o resto da página.
                */}
                <button
                  type="button"
                  onClick={() => setTitleOpen((open) => !open)}
                  className={`col-start-1 row-start-2 mt-1 max-sm:shorter:mt-0 cursor-pointer justify-self-start text-sm font-bold text-[#135BFF] hover:underline ${
                    titleClamped || titleOpen ? "" : "invisible"
                  }`}
                >
                  {titleOpen ? "ver menos" : "ver mais"}
                </button>
              </div>

              <div
                data-fit-box
                className="hero-carousel relative flex min-h-0 flex-col items-center bg-[#FAFBFD] px-3 pt-3 pb-4 touch-pan-y sm:px-6 sm:pt-4 short:pt-2 short:pb-2 max-sm:shorter:pt-1"
                role="region"
                aria-roledescription="carrossel"
                aria-label="Leis no hemiciclo"
                onPointerDown={onCarouselPointerDown}
                onPointerUp={onCarouselPointerUp}
                onPointerCancel={() => {
                  dragStart.current = null;
                }}
              >
                <div
                  key={activeProposal.slug}
                  data-fit-box
                  className={`flex min-h-0 w-full flex-col items-center ${
                    slideDir === 1 ? "hemicycle-slide-next" : "hemicycle-slide-prev"
                  }`}
                >
                <div className="hero-seats relative w-full max-w-[720px]">
                {canSlide ? (
                  <>
                    <button
                      type="button"
                      aria-label="Lei anterior"
                      onClick={() => step(-1)}
                      className="absolute left-0 top-1/2 z-10 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-[#0A1D56] shadow-sm sm:flex"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Lei seguinte"
                      onClick={() => step(1)}
                      className="absolute right-0 top-1/2 z-10 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-[#0A1D56] shadow-sm sm:flex"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </>
                ) : null}
                <Hemicycle3D
                  seats={seats}
                  focusParty={focusParty}
                  hoverParty={hoverParty}
                  onFocusParty={setFocusParty}
                  onHoverParty={setHoverParty}
                  notes={voteNotes}
                  ariaLabel={`Hemiciclo da Assembleia da República — ${seatDist.centerTitle}. A favor: ${seatCounts.favor}, abstenção: ${seatCounts.abstencao}, contra: ${seatCounts.contra} lugares.`}
                />
                </div>

                <div className="relative flex w-full shrink-0 items-center justify-center gap-1.5">
                  <p
                    className={`px-2 text-center font-editorial text-[1.65rem] leading-none font-extrabold tracking-tight sm:text-[2rem] max-sm:shorter:text-[1.4rem] ${
                      mode === "pending"
                        ? "text-[#135BFF]"
                        : mode === "approved"
                          ? "text-[#059669]"
                          : "text-[#DC2626]"
                    }`}
                  >
                    {seatDist.centerTitle}
                  </p>
                  <TitleInfo
                    caption={voteCaption(activeProposal.votes)}
                    tone={mode}
                    note={
                      mode === "approved"
                        ? (STATUS_NOTES.find(
                            (item) => item.id === (activeProposal.status === "promulgated" ? "published" : "approved")
                          ) ?? STATUS_NOTES[0])
                        : undefined
                    }
                  />
                </div>
                </div>

                {canSlide ? (
                  <div className="mt-1 flex shrink-0 items-center justify-center short:mt-0">
                    {activeList.map((item, index) => (
                      // Área de toque com 24 px (mínimo recomendado); o ponto visível fica por dentro.
                      <button
                        key={item.slug}
                        type="button"
                        aria-label={item.plainTitle}
                        aria-current={index === activeIndex ? "true" : undefined}
                        onClick={() => showProposal(index, index > activeIndex ? 1 : -1)}
                        className="group flex h-6 cursor-pointer items-center justify-center px-[9px]"
                      >
                        <span
                          className={`block h-1.5 rounded-full transition-all ${
                            index === activeIndex
                              ? "w-5 bg-[#135BFF]"
                              : "w-1.5 bg-[#D0D9EE] group-hover:bg-[#4C5D85]"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 bg-white px-4 py-4 text-center sm:px-6 short:py-2.5 max-sm:shorter:py-2">
                <button
                  type="button"
                  data-no-drag
                  onClick={() => setDetailOpen(true)}
                  className="cursor-pointer text-sm font-bold text-[#135BFF] hover:underline"
                >
                  saber mais
                </button>
              </div>
              {detailOpen ? <ProposalInfoModal proposal={activeProposal} onClose={closeDetail} /> : null}
              </>
              )}
            </div>
        </div>
      </div>
    </section>
  );
}
