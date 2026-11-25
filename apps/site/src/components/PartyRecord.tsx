/**
 * Secção da página inicial: o balanço de cada partido na legislatura.
 *  - "Leis que propôs": projetos de lei de cada grupo parlamentar e o que lhes aconteceu.
 *  - "Como votou": sentido de voto de cada partido na votação decisiva de cada lei.
 *  - "Mês a mês": a mesma informação ao longo da legislatura, um pequeno gráfico por partido
 *    com a mesma escala para todos.
 * Os números vêm de /api/party-record (dados oficiais da AR, sem estimativas).
 */
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  PartyMonthlyRowDTO,
  PartyRecordDTO,
  PartyRecordRowDTO,
  ProposalOutcomeCounts,
  VotePositionCounts,
} from "@estadodalei/shared";
import { partyMeta } from "@/data/groups";
import { shortAuthor } from "@/lib/authors";
import { PartyIcon, PARTY_ICONS } from "@/components/PartyIcon";
import { formatDate } from "@/lib/format";

type Tab = "propostas" | "votos";
type View = "total" | "mensal";

type Bucket<K> = { key: K; label: string; one: string; many: string; color: string; ink: string };

const OUTCOMES = [
  { key: "approved", label: "Aprovadas", one: "aprovada", many: "aprovadas", color: "#059669", ink: "#047857" },
  { key: "pending", label: "Em curso", one: "em curso", many: "em curso", color: "#93B4FF", ink: "#135BFF" },
  { key: "rejected", label: "Chumbadas", one: "chumbada", many: "chumbadas", color: "#F43F5E", ink: "#BE123C" },
  { key: "other", label: "Retiradas ou vetadas", one: "retirada ou vetada", many: "retiradas ou vetadas", color: "#CBD5E1", ink: "#4C5D85" },
] as const satisfies readonly Bucket<keyof ProposalOutcomeCounts>[];

const POSITIONS = [
  { key: "favor", label: "A favor", one: "a favor", many: "a favor", color: "#059669", ink: "#047857" },
  { key: "abstencao", label: "Abstenção", one: "abstenção", many: "abstenções", color: "#F59E0B", ink: "#B45309" },
  { key: "contra", label: "Contra", one: "contra", many: "contra", color: "#F43F5E", ink: "#BE123C" },
  { key: "ausente", label: "Ausente", one: "ausência", many: "ausências", color: "#CBD5E1", ink: "#4C5D85" },
] as const satisfies readonly Bucket<keyof VotePositionCounts>[];

// Verde e vermelho validados para daltonismo (ΔE ≥ 8); nunca ficam lado a lado sem separação.
const GREEN = OUTCOMES[0].color;
const RED = OUTCOMES[2].color;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

type Segment = { key: string; label: string; color: string; ink: string; value: number; words: string };

function StackedBar({ segments, total, label }: { segments: Segment[]; total: number; label: string }) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${segments.filter((s) => s.value > 0).map((s) => `${s.value} ${s.words}`).join(", ")}`}
      className="flex h-3 w-full overflow-hidden rounded-full bg-[#EEF3FE] sm:h-3.5"
    >
      {total > 0
        ? segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.key}
                title={`${s.value} ${s.words}`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              />
            ))
        : null}
    </div>
  );
}

function Legend({ items }: { items: readonly { key: string; label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold text-[#4C5D85] sm:text-xs">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function PartyLabel({ party, seats }: { party: string; seats: number }) {
  const meta = partyMeta(party);
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={meta.name}>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-[#E4ECFC]">
        {PARTY_ICONS.has(party) ? (
          <PartyIcon code={party} />
        ) : (
          <span className="size-3 rounded-full" style={{ backgroundColor: meta.color }} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold text-[#0A1D56]">{party}</span>
        <span className="block truncate text-[11px] font-semibold text-[#7A89AD]">
          {seats === 1 ? "1 deputado" : `${seats} deputados`}
        </span>
      </span>
    </div>
  );
}

function OtherLabel({ author }: { author: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F1F5FF] ring-1 ring-[#E4ECFC]">
        <span className="size-3 rounded-full bg-[#94A3B8]" />
      </span>
      <span className="min-w-0 text-sm font-extrabold leading-tight text-[#0A1D56]">{shortAuthor(author) ?? author}</span>
    </div>
  );
}

function outcomeSegments(c: ProposalOutcomeCounts): Segment[] {
  return OUTCOMES.map((o) => ({
    key: o.key,
    label: o.label,
    color: o.color,
    ink: o.ink,
    value: c[o.key],
    words: c[o.key] === 1 ? o.one : o.many,
  }));
}

function voteSegments(c: VotePositionCounts): Segment[] {
  return POSITIONS.map((p) => ({
    key: p.key,
    label: p.label,
    color: p.color,
    ink: p.ink,
    value: c[p.key],
    words: c[p.key] === 1 ? p.one : p.many,
  }));
}

function Row({
  label,
  segments,
  total,
  aside,
  barLabel,
}: {
  label: ReactNode;
  segments: Segment[];
  total: number;
  aside: ReactNode;
  barLabel: string;
}) {
  const shown = segments.filter((s) => s.value > 0 || s.key === segments[0]!.key);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3.5 sm:grid-cols-[12rem_minmax(0,1fr)_7.5rem]">
      <div className="col-start-1 row-start-1">{label}</div>
      <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <StackedBar segments={segments} total={total} label={barLabel} />
        <p className="mt-1.5 text-[11px] font-semibold text-[#4C5D85] sm:text-xs">
          {shown.map((s, i) => (
            <span key={s.key}>
              {i > 0 ? " · " : ""}
              <strong className="font-extrabold" style={{ color: s.value > 0 ? s.ink : "#7A89AD" }}>
                {s.value}
              </strong>{" "}
              {s.words}
            </span>
          ))}
        </p>
      </div>
      <div className="col-start-2 row-start-1 text-right sm:col-start-3">{aside}</div>
    </li>
  );
}

/* ───────────────────────── Mês a mês ───────────────────────── */

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const splitMonth = (m: string) => {
  const [y, mm] = m.split("-");
  return { year: y ?? "", index: Number(mm) - 1 };
};
const monthShort = (m: string) => {
  const { year, index } = splitMonth(m);
  return `${MONTHS_SHORT[index]} ${year.slice(2)}`;
};
const monthLong = (m: string) => {
  const { year, index } = splitMonth(m);
  return `${MONTHS_LONG[index]} de ${year}`;
};

/** Etiquetas esparsas no eixo: cada janeiro, mais o primeiro e o último mês quando não colidem. */
function monthTicks(months: string[]): number[] {
  const out = months.flatMap((m, i) => (m.endsWith("-01") ? [i] : []));
  const far = (i: number) => out.every((j) => Math.abs(j - i) >= 4);
  if (months.length > 0 && far(0)) out.push(0);
  if (months.length > 1 && far(months.length - 1)) out.push(months.length - 1);
  return out.sort((a, b) => a - b);
}

type TipLine = { key: string; color?: string; text: string };
type Tip = { title: string; lines: TipLine[] };

/**
 * Gráfico de colunas por mês, com dica ao passar o rato ou com as setas do teclado.
 * `column(i)` desenha o mês i; `baseline` é a posição da linha de base (% a partir do topo).
 */
function MonthChart({
  months,
  label,
  baseline,
  describe,
  column,
}: {
  months: string[];
  label: string;
  baseline: number;
  describe: (i: number) => Tip;
  column: (i: number) => ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = months.length;
  const ticks = useMemo(() => monthTicks(months), [months]);
  const tip = active != null ? describe(active) : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };
  // Perto das pontas, a dica e as etiquetas encostam à margem em vez de sair do cartão.
  const place = (i: number) =>
    i <= 1
      ? { left: 0 }
      : i >= n - 2
        ? { right: 0 }
        : { left: `${((i + 0.5) / n) * 100}%`, transform: "translateX(-50%)" };

  return (
    <div className="relative">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use as setas para percorrer os meses.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
        className="relative flex h-28 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#135BFF] focus-visible:ring-offset-4"
      >
        {months.map((m, i) => (
          <div key={m} aria-hidden onMouseEnter={() => setActive(i)} className="relative flex-1">
            {active === i ? <div className="absolute inset-0 rounded bg-[#EEF3FE]" /> : null}
            {column(i)}
          </div>
        ))}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-px bg-[#C9D5F0]"
          style={baseline >= 100 ? { bottom: 0 } : { top: `${baseline}%` }}
        />
      </div>
      <div aria-hidden className="relative mt-1.5 h-4 text-[10px] font-semibold text-[#7A89AD]">
        {ticks.map((i) => (
          <span key={i} className="absolute whitespace-nowrap" style={place(i)}>
            {monthShort(months[i]!)}
          </span>
        ))}
      </div>
      {tip && active != null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[16rem] rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-[#E4ECFC]"
          style={place(active)}
        >
          <p className="font-extrabold text-[#0A1D56]">{tip.title}</p>
          <ul className="mt-1 space-y-0.5">
            {tip.lines.map((l) => (
              <li key={l.key} className="flex items-center gap-1.5 font-semibold text-[#4C5D85]">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={l.color ? { backgroundColor: l.color } : { boxShadow: "inset 0 0 0 1.5px #93B4FF" }}
                />
                {l.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {tip ? `${tip.title}: ${tip.lines.map((l) => l.text).join(", ")}` : ""}
      </p>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Aprovadas para cima da linha, chumbadas para baixo — a posição distingue, não só a cor. */
function MirrorColumn({ up, down, scaleUp, scaleDown }: { up: number; down: number; scaleUp: number; scaleDown: number }) {
  const total = scaleUp + scaleDown;
  return (
    <>
      {up > 0 ? (
        <span
          className="absolute inset-x-px mx-auto max-w-6 rounded-t-[4px]"
          style={{ bottom: `${(scaleDown / total) * 100}%`, height: `${(up / total) * 100}%`, backgroundColor: GREEN }}
        />
      ) : null}
      {down > 0 ? (
        <span
          className="absolute inset-x-px mx-auto max-w-6 rounded-b-[4px]"
          style={{ top: `${(scaleUp / total) * 100}%`, height: `${(down / total) * 100}%`, backgroundColor: RED }}
        />
      ) : null}
    </>
  );
}

/**
 * Coluna empilhada com o número de votações do mês (a altura mostra quantas houve):
 * a favor em baixo, abstenção ao meio, contra em cima (ausências no topo).
 */
function StackColumn({ values, scale }: { values: { key: string; color: string; value: number }[]; scale: number }) {
  const shown = values.filter((v) => v.value > 0);
  const total = shown.reduce((sum, v) => sum + v.value, 0);
  if (total === 0) return null;
  return (
    <div
      className="absolute inset-x-px bottom-0 mx-auto flex max-w-6 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
      style={{ height: `${(total / scale) * 100}%` }}
    >
      {shown.map((v) => (
        <span key={v.key} className="basis-0" style={{ flexGrow: v.value, backgroundColor: v.color }} />
      ))}
    </div>
  );
}

function MonthlyCard({ row, summary, children }: { row: PartyRecordRowDTO; summary: ReactNode; children: ReactNode }) {
  return (
    <li className="min-w-0">
      <div className="flex items-end justify-between gap-3">
        <PartyLabel party={row.party} seats={row.seats} />
        <p className="shrink-0 text-right text-[11px] font-semibold leading-tight text-[#4C5D85]">{summary}</p>
      </div>
      <div className="mt-3">{children}</div>
    </li>
  );
}

function MonthlyTable({
  months,
  rows,
  caption,
  cell,
}: {
  months: string[];
  rows: PartyMonthlyRowDTO[];
  caption: string;
  cell: (row: PartyMonthlyRowDTO, i: number) => string;
}) {
  return (
    <details className="mt-8">
      <summary className="cursor-pointer text-sm font-bold text-[#135BFF]">Ver os números em tabela</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left text-xs tabular-nums">
          <caption className="mb-2 text-left text-[11px] font-semibold text-[#7A89AD]">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-extrabold text-[#0A1D56]">
                Mês
              </th>
              {rows.map((r) => (
                <th key={r.party} scope="col" className="px-2 py-1.5 font-extrabold text-[#0A1D56]">
                  {r.party}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m} className="border-t border-[#EEF3FE]">
                <th scope="row" className="whitespace-nowrap py-1.5 pr-3 font-semibold text-[#4C5D85]">
                  {monthLong(m)}
                </th>
                {rows.map((r) => (
                  <td key={r.party} className="whitespace-nowrap px-2 py-1.5 text-[#0A1D56]">
                    {cell(r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ProposalsMonthly({ record, parties }: { record: PartyRecordDTO; parties: PartyRecordRowDTO[] }) {
  const { months } = record;
  const byParty = new Map(record.monthly.map((r) => [r.party, r]));
  const rows = parties.flatMap((p) => (byParty.has(p.party) ? [{ p, m: byParty.get(p.party)! }] : []));
  // A mesma escala para todos os partidos, para que as alturas se possam comparar.
  const scaleUp = Math.max(1, ...rows.flatMap(({ m }) => m.approved));
  const scaleDown = Math.max(1, ...rows.flatMap(({ m }) => m.rejected));

  return (
    <>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold text-[#4C5D85] sm:text-xs">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: GREEN }} />
          Aprovadas (acima da linha)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: RED }} />
          Chumbadas (abaixo da linha)
        </li>
      </ul>
      <ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ p, m }) => (
          <MonthlyCard
            key={p.party}
            row={p}
            summary={
              <>
                <strong className="font-extrabold text-[#047857]">{p.proposed.approved}</strong>{" "}
                {p.proposed.approved === 1 ? "aprovada" : "aprovadas"} ·{" "}
                <strong className="font-extrabold text-[#BE123C]">{p.proposed.rejected}</strong>{" "}
                {p.proposed.rejected === 1 ? "chumbada" : "chumbadas"}
              </>
            }
          >
            <MonthChart
              months={months}
              label={`${p.party}: leis aprovadas e chumbadas por mês`}
              baseline={(scaleUp / (scaleUp + scaleDown)) * 100}
              describe={(i) => ({
                title: `${p.party} · ${monthLong(months[i]!)}`,
                lines: [
                  { key: "a", color: GREEN, text: plural(m.approved[i] ?? 0, "aprovada", "aprovadas") },
                  { key: "r", color: RED, text: plural(m.rejected[i] ?? 0, "chumbada", "chumbadas") },
                  { key: "p", text: plural(m.proposed[i] ?? 0, "proposta nova", "propostas novas") },
                ],
              })}
              column={(i) => (
                <MirrorColumn up={m.approved[i] ?? 0} down={m.rejected[i] ?? 0} scaleUp={scaleUp} scaleDown={scaleDown} />
              )}
            />
          </MonthlyCard>
        ))}
      </ul>
      <MonthlyTable
        months={months}
        rows={rows.map(({ m }) => m)}
        caption="Em cada célula: leis aprovadas / chumbadas nesse mês."
        cell={(r, i) => `${r.approved[i] ?? 0} / ${r.rejected[i] ?? 0}`}
      />
    </>
  );
}

function VotesMonthly({ record, parties }: { record: PartyRecordDTO; parties: PartyRecordRowDTO[] }) {
  const { months } = record;
  const byParty = new Map(record.monthly.map((r) => [r.party, r]));
  const rows = parties.flatMap((p) => (byParty.has(p.party) ? [{ p, m: byParty.get(p.party)! }] : []));
  const monthTotal = (m: PartyMonthlyRowDTO, i: number) => POSITIONS.reduce((sum, pos) => sum + (m[pos.key][i] ?? 0), 0);
  // A mesma escala para todos: o mês com mais votações de qualquer partido.
  const scale = Math.max(1, ...rows.flatMap(({ m }) => months.map((_, i) => monthTotal(m, i))));

  return (
    <>
      <Legend items={POSITIONS} />
      <ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ p, m }) => (
          <MonthlyCard
            key={p.party}
            row={p}
            summary={
              <>
                <strong className="font-extrabold text-[#047857]">{pct(p.votes.favor, p.votes.total)}%</strong> a favor
                <span className="block font-medium text-[#7A89AD]">{p.votes.total} votações</span>
              </>
            }
          >
            <MonthChart
              months={months}
              label={`${p.party}: sentido de voto por mês`}
              baseline={100}
              describe={(i) => {
                const total = monthTotal(m, i);
                return {
                  title: `${p.party} · ${monthLong(months[i]!)}${total > 0 ? ` · ${plural(total, "votação", "votações")}` : ""}`,
                  lines:
                    total === 0
                      ? [{ key: "none", text: "Sem votações decisivas publicadas" }]
                      : POSITIONS.filter((pos) => pos.key !== "ausente" || (m.ausente[i] ?? 0) > 0).map((pos) => {
                          const n = m[pos.key][i] ?? 0;
                          return { key: pos.key, color: pos.color, text: `${plural(n, pos.one, pos.many)} (${pct(n, total)}%)` };
                        }),
                };
              }}
              column={(i) => (
                <StackColumn
                  scale={scale}
                  values={POSITIONS.map((pos) => ({ key: pos.key, color: pos.color, value: m[pos.key][i] ?? 0 }))}
                />
              )}
            />
          </MonthlyCard>
        ))}
      </ul>
      <MonthlyTable
        months={months}
        rows={rows.map(({ m }) => m)}
        caption="Em cada célula: votos a favor / abstenções / contra nesse mês."
        cell={(r, i) => `${r.favor[i] ?? 0} / ${r.abstencao[i] ?? 0} / ${r.contra[i] ?? 0}`}
      />
    </>
  );
}

/* ───────────────────────── Secção ───────────────────────── */

export function PartyRecord({ record }: { record: PartyRecordDTO }) {
  const [tab, setTab] = useState<Tab>("propostas");
  const [view, setView] = useState<View>("total");
  const parties = record.parties.filter((p) => p.seats > 0);
  const hasMonthly = (record.months?.length ?? 0) > 0 && (record.monthly?.length ?? 0) > 0;
  const monthly = hasMonthly && view === "mensal";
  const currentMonth = hasMonthly ? record.months.at(-1)! : null;

  const tabClass = (active: boolean) =>
    `cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      active ? "bg-[#135BFF] text-white" : "bg-white text-[#4C5D85] ring-1 ring-[#E4ECFC] hover:text-[#0A1D56]"
    }`;

  return (
    <section id="balanco-partidos" aria-labelledby="balanco-partidos-titulo" className="bg-[#F5F8FF] text-[#0A1D56]">
      <div className="mx-auto w-full max-w-6xl px-3 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h2 id="balanco-partidos-titulo" className="font-editorial text-2xl font-extrabold sm:text-3xl">
          O balanço de cada partido
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4C5D85] sm:text-base">
          Quantas leis cada partido propôs e o que lhes aconteceu, e como votou nas leis que foram a votos.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Balanço por partido">
          <button
            type="button"
            role="tab"
            id="balanco-tab-propostas"
            aria-selected={tab === "propostas"}
            aria-controls="balanco-painel"
            onClick={() => setTab("propostas")}
            className={tabClass(tab === "propostas")}
          >
            Leis que propôs
          </button>
          <button
            type="button"
            role="tab"
            id="balanco-tab-votos"
            aria-selected={tab === "votos"}
            aria-controls="balanco-painel"
            onClick={() => setTab("votos")}
            className={tabClass(tab === "votos")}
          >
            Como votou
          </button>
        </div>
          {hasMonthly ? (
            <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-[#E4ECFC]" role="group" aria-label="Período">
              {(
                [
                  ["total", "Total"],
                  ["mensal", "Mês a mês"],
                ] as const
              ).map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    view === key ? "bg-[#0A1D56] text-white" : "text-[#4C5D85] hover:text-[#0A1D56]"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div
          id="balanco-painel"
          role="tabpanel"
          aria-labelledby={tab === "propostas" ? "balanco-tab-propostas" : "balanco-tab-votos"}
          className="mt-4 rounded-[24px] bg-white px-4 py-5 civic-capsule sm:rounded-[28px] sm:px-6 sm:py-6"
        >
          {monthly && tab === "propostas" ? (
            <ProposalsMonthly record={record} parties={parties} />
          ) : monthly ? (
            <VotesMonthly record={record} parties={parties} />
          ) : tab === "propostas" ? (
            <>
              <Legend items={OUTCOMES} />
              <ul className="mt-2 divide-y divide-[#EEF3FE]">
                {parties.map((p) => (
                  <Row
                    key={p.party}
                    label={<PartyLabel party={p.party} seats={p.seats} />}
                    segments={outcomeSegments(p.proposed)}
                    total={p.proposed.total}
                    barLabel={`${p.party}, ${p.proposed.total} projetos de lei`}
                    aside={
                      <>
                        <span className="block text-lg font-extrabold leading-none">{p.proposed.total}</span>
                        <span className="text-[11px] font-semibold text-[#7A89AD]">
                          {p.proposed.total === 1 ? "lei proposta" : "leis propostas"}
                        </span>
                      </>
                    }
                  />
                ))}
              </ul>

              {record.others.length > 0 ? (
                <>
                  <h3 className="mt-6 text-xs font-extrabold tracking-wide text-[#7A89AD] uppercase">Outros autores</h3>
                  <ul className="mt-1 divide-y divide-[#EEF3FE]">
                    {record.others.map((o) => (
                      <Row
                        key={o.author}
                        label={<OtherLabel author={o.author} />}
                        segments={outcomeSegments(o.proposed)}
                        total={o.proposed.total}
                        barLabel={`${shortAuthor(o.author) ?? o.author}, ${o.proposed.total} iniciativas de lei`}
                        aside={
                          <>
                            <span className="block text-lg font-extrabold leading-none">{o.proposed.total}</span>
                            <span className="text-[11px] font-semibold text-[#7A89AD]">
                              {o.proposed.total === 1 ? "lei proposta" : "leis propostas"}
                            </span>
                          </>
                        }
                      />
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Legend items={POSITIONS} />
              <ul className="mt-2 divide-y divide-[#EEF3FE]">
                {parties.map((p) => (
                  <Row
                    key={p.party}
                    label={<PartyLabel party={p.party} seats={p.seats} />}
                    segments={voteSegments(p.votes)}
                    total={p.votes.total}
                    barLabel={`${p.party}, ${p.votes.total} votações`}
                    aside={
                      <>
                        <span className="block text-lg font-extrabold leading-none">{pct(p.votes.favor, p.votes.total)}%</span>
                        <span className="text-[11px] font-semibold text-[#7A89AD]">a favor</span>
                      </>
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-[#7A89AD]">
          {monthly && tab === "propostas" ? (
            <>
              Cada lei conta no mês em que foi decidida: a votação final global, nas aprovadas, ou a votação que a
              chumbou. Todos os partidos estão na mesma escala. As leis do Governo e de outros autores estão na vista
              «Total».{currentMonth ? <> {capitalize(monthLong(currentMonth))} ainda está a decorrer.</> : null}
            </>
          ) : monthly ? (
            <>
              Cada coluna é o número de votações decisivas desse mês (a votação final global ou, nas leis chumbadas, a
              votação na generalidade), dividido pelo sentido de voto do partido. Todos os partidos estão na mesma
              escala. Meses sem coluna não têm votações decisivas com o sentido
              de voto publicado{record.votesUntil ? <>; os dados vão até {formatDate(record.votesUntil)}</> : null}.
            </>
          ) : tab === "propostas" ? (
            <>
              Projetos de lei apresentados por cada grupo parlamentar desde o início da legislatura. Uma lei proposta por
              vários partidos conta para cada um. «Aprovadas» inclui as já publicadas em Diário da República. O Governo
              apresenta as suas leis como propostas de lei, em «Outros autores».
            </>
          ) : (
            <>
              Sentido de voto de cada partido na votação decisiva de {record.votedLaws} leis de todos os autores: a votação
              final global ou, nas leis chumbadas, a votação na generalidade
              {record.votesUntil ? <>, até {formatDate(record.votesUntil)}</> : null}. A Assembleia da República publica o
              detalhe das votações com algum atraso.
            </>
          )}{" "}
          Fonte: dados abertos da Assembleia da República.
        </p>
      </div>
    </section>
  );
}
