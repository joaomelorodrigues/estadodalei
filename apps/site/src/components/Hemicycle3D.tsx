import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { partyMeta } from "@/data/groups";
import { PARTY_ICONS, PartyIcon } from "@/components/PartyIcon";
import type { HemicycleScene } from "@/lib/hemicycleScene";
import {
  ROWS,
  VOTE_LABEL as STATE_LABEL,
  VOTE_PALETTE as PALETTE,
  countStates,
  voteRuns,
  type Seat,
  type SeatState,
} from "@/lib/hemicycle";

/**
 * Hemiciclo em perspetiva: um anfiteatro visto de frente e de cima, com as filas em
 * degraus. Cada partido fica sempre na sua bancada; a cor de cada lugar, e do chão e da
 * parede por trás, é o sentido de voto, para se ler de relance.
 *
 * Os totais ficam numa linha por baixo: a favor à esquerda, abstenção ao centro e contra
 * à direita.
 *
 * As medidas do desenho (VIEW_W × VIEW_H) estão repetidas em global.css (.hero-seats).
 */
const VIEW_W = 360;
const VIEW_H = 150;
const CX = VIEW_W / 2;
/** Linha do chão, à frente (as pontas do hemiciclo). */
const BASE = 114;
/** Achatamento do chão visto de cima (1 = visto de cima, 0 = de lado). */
const TILT = 0.72;
/** Distância da câmara: quanto menor, mais pequenas ficam as filas do fundo. */
const DEPTH = 420;
/** Altura de cada degrau. */
const RISE = 2.4;
/** Meia largura de cada degrau (as filas estão a 15 unidades umas das outras). */
const HALF = 7.5;
const WALL_H = 8;
const WALL_T = 3;
const SEAT_R = 4.3;

const PIT_R = ROWS[0]!.radius - HALF;
const OUTER_R = ROWS[ROWS.length - 1]!.radius + HALF;
const stepLift = (row: number) => (row + 1) * RISE;
const TOP_LIFT = stepLift(ROWS.length - 1);

interface Point {
  x: number;
  y: number;
  s: number;
}

/** Ponto do chão (coordenadas cartesianas, Y para o fundo) → ecrã. */
function projectXY(X: number, Y: number, lift: number): Point {
  const s = 1 / (1 + Y / DEPTH);
  return { x: CX + X * s, y: BASE - (Y * TILT + lift) * s, s };
}

function project(radius: number, angle: number, lift: number): Point {
  const a = (angle * Math.PI) / 180;
  return projectXY(radius * Math.cos(a), radius * Math.sin(a), lift);
}

function arcPoints(radius: number, from: number, to: number, lift: number): Point[] {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / 2) + 1);
  return Array.from({ length: n }, (_, i) => project(radius, from + ((to - from) * i) / (n - 1), lift));
}

const toPath = (pts: { x: number; y: number }[]) =>
  `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}Z`;

/** Tampo de um degrau (coroa circular entre dois raios, à mesma altura). */
const band = (rIn: number, rOut: number, from: number, to: number, lift: number) =>
  toPath([...arcPoints(rOut, from, to, lift), ...arcPoints(rIn, to, from, lift)]);

/** Face vertical (espelho de um degrau ou parede) a um raio, entre duas alturas. */
const face = (radius: number, from: number, to: number, low: number, high: number) =>
  toPath([...arcPoints(radius, from, to, high), ...arcPoints(radius, to, from, low)]);

/** Perfil em escada visto de lado, numa das pontas (ângulo 180° ou 0°). */
function cheek(angle: number) {
  const pts: Point[] = [project(PIT_R, angle, 0)];
  ROWS.forEach((row, i) => {
    pts.push(project(row.radius - HALF, angle, stepLift(i)), project(row.radius + HALF, angle, stepLift(i)));
  });
  pts.push(
    project(OUTER_R, angle, TOP_LIFT + WALL_H),
    project(OUTER_R + WALL_T, angle, TOP_LIFT + WALL_H),
    project(OUTER_R + WALL_T, angle, 0),
  );
  return toPath(pts);
}

interface Label {
  state: SeatState;
  count: number;
  /** Centro do texto, em % da largura do desenho. */
  left: number;
}

const LABEL_X: Partial<Record<SeatState, number>> = { favor: CX - 118, abstencao: CX, contra: CX + 118 };

/** Total de cada sentido de voto (somando todas as bancadas que votaram assim). */
function voteLabels(seats: Seat[]): Label[] {
  const counts = countStates(seats);
  const shown = (["favor", "abstencao", "contra"] as const).filter((state) => counts[state] > 0);
  return shown.map((state) => ({
    state,
    count: counts[state],
    // Um só sentido (ex.: unanimidade): o total fica ao centro.
    left: ((shown.length === 1 ? CX : LABEL_X[state]!) / VIEW_W) * 100,
  }));
}

interface Hemicycle3DProps {
  seats: Seat[];
  ariaLabel: string;
  /** Partido fixado (ao tocar num lugar, num ponto ou na lista): os restantes lugares ficam esbatidos. */
  focusParty?: string | null;
  /** Partido debaixo do rato (aqui ou na lista): os lugares dele sobem, sem esbater os outros. */
  hoverParty?: string | null;
  onFocusParty?: (party: string | null) => void;
  /** Rato por cima de um lugar ou ponto de um partido (só rato). */
  onHoverParty?: (party: string | null) => void;
  /** Nota extra de um grupo, por `${partido}|${sentido}` (ex.: quem votou diferente do grupo). */
  notes?: Record<string, string>;
}

/** Partido × sentido de voto: um ponto no hemiciclo 3D. */
interface Spot {
  key: string;
  party: string;
  state: SeatState;
  seats: number[];
  /** Os mesmos lugares, do mais central do grupo para o mais afastado. */
  order: number[];
}

type SceneModule = typeof import("@/lib/hemicycleScene");

/** O módulo 3D, depois de carregado (fica para os próximos hemiciclos da página). */
let sceneModule: SceneModule | null = null;

/**
 * Se nenhum lugar do grupo estiver livre, o ponto fica logo ao lado, com uma haste: posições em
 * dois anéis, das mais próximas para as mais afastadas e, a igual distância, primeiro as de cima.
 */
const PIN_RING = (() => {
  const ring: { dx: number; dy: number }[] = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx || dy) ring.push({ dx, dy });
  return ring.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy) || a.dy - b.dy);
})();

function deputies(n: number) {
  return `${n} ${n === 1 ? "deputado" : "deputados"}`;
}

export function Hemicycle3D({
  seats,
  ariaLabel,
  focusParty = null,
  hoverParty = null,
  onFocusParty,
  onHoverParty,
  notes,
}: Hemicycle3DProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const runs = useMemo(() => voteRuns(seats), [seats]);
  const labels = useMemo(() => voteLabels(seats), [seats]);

  // Do fundo para a frente, para os lugares mais próximos taparem os de trás. A profundidade é
  // arredondada e os empates seguem o índice: Math.sin pode diferir na última casa decimal entre
  // o servidor (Node) e o Safari, e a ordem tem de ser a mesma nos dois (hidratação).
  const ordered = useMemo(
    () =>
      seats
        .map((seat, index) => ({ seat, index, depth: Math.round(seat.radius * Math.sin((seat.angle * Math.PI) / 180) * 1e4) }))
        .sort((a, b) => b.depth - a.depth || a.index - b.index),
    [seats],
  );

  const first = runs[0];
  const last = runs[runs.length - 1];

  /* ---------- 3D (three.js), por cima do desenho ---------- */

  const spots = useMemo(() => {
    const map = new Map<string, Spot>();
    seats.forEach((seat, index) => {
      if (!seat.party) return;
      const key = `${seat.party}|${seat.state}`;
      const spot = map.get(key) ?? { key, party: seat.party, state: seat.state, seats: [], order: [] };
      spot.seats.push(index);
      map.set(key, spot);
    });
    // Do lugar mais perto do centro do grupo (na planta do hemiciclo) para o mais afastado.
    for (const spot of map.values()) {
      const cx = spot.seats.reduce((sum, i) => sum + seats[i]!.x, 0) / spot.seats.length;
      const cy = spot.seats.reduce((sum, i) => sum + seats[i]!.y, 0) / spot.seats.length;
      const dist = (i: number) => Math.hypot(seats[i]!.x - cx, seats[i]!.y - cy);
      spot.order = [...spot.seats].sort((a, b) => dist(a) - dist(b));
    }
    return [...map.values()];
  }, [seats]);

  const [mod, setMod] = useState<SceneModule | null>(sceneModule);
  // Num hemiciclo novo com o módulo já carregado, o 3D aparece logo (sem passar pelo desenho).
  const [ready, setReady] = useState(() => sceneModule?.getHemicycleScene() != null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HemicycleScene | null>(null);
  const pinRefs = useRef(new Map<string, HTMLButtonElement>());
  const stemRefs = useRef(new Map<string, SVGLineElement>());
  const dotRefs = useRef(new Map<string, SVGCircleElement>());
  const cardRef = useRef<HTMLDivElement>(null);

  // Valores atuais para as funções chamadas pela cena (que não mudam entre renders).
  const latest = useRef({ seats, spots, openKey, focusParty, onFocusParty, onHoverParty });
  latest.current = { seats, spots, openKey, focusParty, onFocusParty, onHoverParty };

  // three.js só se carrega depois de a página estar pronta.
  useEffect(() => {
    if (mod) return;
    let alive = true;
    const load = () =>
      import("@/lib/hemicycleScene")
        .then((m) => {
          sceneModule = m;
          if (alive) setMod(m);
        })
        .catch(() => {});
    const idle = window.requestIdleCallback?.(load, { timeout: 1500 });
    const timer = idle == null ? window.setTimeout(load, 200) : undefined;
    return () => {
      alive = false;
      if (idle != null) window.cancelIdleCallback(idle);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [mod]);

  /**
   * Coloca cada ponto em cima dos lugares do próprio grupo (o mais central que esteja livre), sem
   * se sobreporem; só os grupos sem lugar livre ficam ao lado, com uma haste. Corre a cada imagem.
   */
  function layoutPins(seatPoints: Float32Array, width: number, height: number) {
    const { spots: current, openKey: open } = latest.current;
    const firstPin = pinRefs.current.get(current[0]?.key ?? "");
    const size = firstPin?.offsetWidth || 24;
    const card = cardRef.current;
    const cardW = card?.offsetWidth ?? 0;
    const cardH = card?.offsetHeight ?? 0;
    const gap = 3;
    const px = (i: number) => seatPoints[i * 2]!;
    const py = (i: number) => seatPoints[i * 2 + 1]!;
    const inside = (x: number, y: number) =>
      x >= size / 2 && x <= width - size / 2 && y >= size / 2 - 2 && y <= height - size / 2;

    // Pontos já colocados (centro e meia largura/altura).
    const placed: { x: number; y: number; hw: number; hh: number }[] = [];
    const half = size / 2 + gap / 2;
    /** Área sobreposta a pontos já colocados (0 = livre). */
    const overlap = (x: number, y: number) =>
      placed.reduce(
        (sum, p) =>
          sum + Math.max(0, p.hw + half - Math.abs(p.x - x)) * Math.max(0, p.hh + half - Math.abs(p.y - y)),
        0,
      );
    const free = (x: number, y: number) => overlap(x, y) === 0;

    // Os grupos mais pequenos escolhem primeiro: têm 1–3 lugares possíveis, os grandes têm dezenas.
    const order = [...current].sort((a, b) => a.seats.length - b.seats.length);
    const pos = new Map<string, { x: number; y: number; onSeat: boolean }>();
    const put = (key: string, x: number, y: number, onSeat: boolean) => {
      pos.set(key, { x, y, onSeat });
      placed.push({ x, y, hw: half, hh: half });
    };

    // 1.ª volta: cada grupo em cima de um lugar seu que esteja livre (o mais central possível).
    for (const spot of order) {
      const seat = spot.order.find((i) => inside(px(i), py(i)) && free(px(i), py(i)));
      if (seat != null) put(spot.key, px(seat), py(seat), true);
    }

    // 2.ª volta (só depois, para não tirar lugares aos outros grupos): os que ficaram sem lugar
    // vão logo para o lado; se tudo à volta estiver ocupado, para onde se sobrepuserem menos
    // (melhor um pouco por cima de outro ponto do que longe dos próprios deputados).
    for (const spot of order) {
      if (pos.has(spot.key) || !spot.order.length) continue;
      const first = spot.order[0]!;
      let best = { x: px(first), y: py(first), o: Infinity };
      for (const { dx, dy } of [{ dx: 0, dy: 0 }, ...PIN_RING]) {
        const cx = Math.min(width - size / 2, Math.max(size / 2, px(first) + dx * (size + gap)));
        const cy = Math.min(height - size / 2, Math.max(size / 2, py(first) + dy * (size + gap)));
        const o = overlap(cx, cy);
        if (o === 0 && (dx || dy)) {
          best = { x: cx, y: cy, o };
          break;
        }
        if (o < best.o) best = { x: cx, y: cy, o };
      }
      put(spot.key, best.x, best.y, false);
    }

    for (const spot of current) {
      const at = pos.get(spot.key);
      if (!at) continue;
      const { x, y, onSeat } = at;

      const pin = pinRefs.current.get(spot.key);
      // Propriedade `translate` e não `transform`: o `scale` do hover aplica-se por cima do
      // `transform` e ampliava também a deslocação (o ponto fugia do rato e voltava, em ciclo).
      if (pin) pin.style.translate = `${(x - size / 2).toFixed(1)}px ${(y - size / 2).toFixed(1)}px`;

      // Haste só quando o ponto ficou fora dos lugares: vai do ponto ao lugar do grupo mais próximo.
      const line = stemRefs.current.get(spot.key);
      const dot = dotRefs.current.get(spot.key);
      let ax = x;
      let ay = y;
      if (!onSeat) {
        let best = Infinity;
        for (const i of spot.seats) {
          const d = Math.hypot(px(i) - x, py(i) - y);
          if (d < best) {
            best = d;
            ax = px(i);
            ay = py(i);
          }
        }
      }
      if (line) {
        line.style.display = onSeat ? "none" : "";
        line.setAttribute("x1", ax.toFixed(1));
        line.setAttribute("y1", ay.toFixed(1));
        // Até ao centro do ponto (o ponto, por cima, tapa o resto da haste).
        line.setAttribute("x2", x.toFixed(1));
        line.setAttribute("y2", y.toFixed(1));
      }
      if (dot) {
        dot.style.display = onSeat ? "none" : "";
        dot.setAttribute("cx", ax.toFixed(1));
        dot.setAttribute("cy", ay.toFixed(1));
      }
      if (card && spot.key === open) {
        const left = Math.min(width - cardW - 4, Math.max(4, x - cardW / 2));
        const above = y - size / 2 - 8 - cardH;
        const top = above >= -cardH * 0.35 ? above : y + size / 2 + 8;
        card.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      }
    }
  }

  // Partido debaixo do rato, vindo de um lugar do hemiciclo ou de um ponto. As duas origens ficam
  // separadas porque o browser pode avisar "saiu do hemiciclo" depois de "entrou no ponto". O
  // destaque só se desliga depois de um instante, para não piscar entre dois lugares.
  const hoverFrom = useRef<{ seat: string | null; pin: string | null }>({ seat: null, pin: null });
  const hoverTimer = useRef<number | undefined>(undefined);
  function trackHover(source: "seat" | "pin", party: string | null) {
    hoverFrom.current[source] = party;
    const next = hoverFrom.current.pin ?? hoverFrom.current.seat;
    window.clearTimeout(hoverTimer.current);
    if (next) latest.current.onHoverParty?.(next);
    else hoverTimer.current = window.setTimeout(() => latest.current.onHoverParty?.(null), 140);
  }
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  /** Abre (ou fecha) o cartão de um grupo e fixa o partido no hemiciclo. */
  function toggleSpot(key: string | null) {
    const { openKey: open, focusParty: focused, onFocusParty: setFocus } = latest.current;
    if (key == null || key === open) {
      setOpenKey(null);
      if (focused) setFocus?.(null);
      return;
    }
    setOpenKey(key);
    setFocus?.(key.split("|")[0]!);
  }

  useLayoutEffect(() => {
    const host = canvasHostRef.current;
    if (!mod || !host) return;
    const scene = mod.getHemicycleScene();
    if (!scene) return;
    sceneRef.current = scene;
    scene.attach(host, {
      onFrame: (points, width, height) => layoutPins(points, width, height),
      onTap: (index) => {
        const seat = latest.current.seats[index];
        toggleSpot(seat?.party ? `${seat.party}|${seat.state}` : null);
      },
      onHover: (index) => trackHover("seat", latest.current.seats[index]?.party || null),
      onContext: (ok) => setReady(ok),
    });
    setReady(true);
    return () => {
      scene.detach(host);
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as funções leem `latest`
  }, [mod]);

  useLayoutEffect(() => {
    if (!ready) return;
    sceneRef.current?.setSeats(seats, true);
  }, [ready, seats, spots]);

  useEffect(() => {
    sceneRef.current?.setHighlight(focusParty, hoverParty);
  }, [ready, focusParty, hoverParty]);

  // O cartão novo tem de ser posicionado antes de aparecer.
  useLayoutEffect(() => {
    if (ready) sceneRef.current?.redraw();
  }, [ready, openKey]);

  // Outro partido fixado (na lista por baixo): o cartão deste fecha.
  useEffect(() => {
    if (!onFocusParty || !openKey) return;
    if (openKey.split("|")[0] !== focusParty) setOpenKey(null);
  }, [focusParty, openKey, onFocusParty]);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggleSpot(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleSpot lê `latest`
  }, [openKey]);

  const openSpot = spots.find((spot) => spot.key === openKey);

  return (
    <div className="hemicycle relative mx-auto">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`block h-auto w-full select-none transition-opacity duration-500 ${ready ? "opacity-0" : ""}`}
        role="img"
        aria-label={ariaLabel}
        aria-hidden={ready || undefined}
      >
        <defs>
          {(Object.keys(PALETTE) as SeatState[]).map((state) => (
            <radialGradient key={state} id={`${id}-${state}`} cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor={PALETTE[state].light} />
              <stop offset="0.55" stopColor={PALETTE[state].base} />
              <stop offset="1" stopColor={PALETTE[state].dark} />
            </radialGradient>
          ))}
          <linearGradient id={`${id}-pit`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E7EDFA" />
            <stop offset="1" stopColor="#F5F8FE" />
          </linearGradient>
        </defs>

        {/* Parede do fundo, com a cor de cada bloco */}
        {runs.map((run, i) => (
          <g key={`wall-${i}`}>
            <path d={face(OUTER_R, run.from, run.to, TOP_LIFT, TOP_LIFT + WALL_H)} fill={PALETTE[run.state].base} />
            <path
              d={band(OUTER_R, OUTER_R + WALL_T, run.from, run.to, TOP_LIFT + WALL_H)}
              fill={PALETTE[run.state].light}
            />
          </g>
        ))}

        {/* Degraus, do fundo para a frente: tampo e espelho, com a cor clara do bloco */}
        {ROWS.map((_, k) => {
          const i = ROWS.length - 1 - k;
          const row = ROWS[i]!;
          return runs.map((run, j) => (
            <g key={`step-${i}-${j}`}>
              <path d={band(row.radius - HALF, row.radius + HALF, run.from, run.to, stepLift(i))} fill={PALETTE[run.state].floor} />
              <path
                d={face(row.radius - HALF, run.from, run.to, i === 0 ? 0 : stepLift(i - 1), stepLift(i))}
                fill={PALETTE[run.state].riser}
              />
            </g>
          ));
        })}

        {/* Chão do centro e perfis laterais */}
        <path d={band(0, PIT_R, 180, 0, 0)} fill={`url(#${id}-pit)`} />
        {first ? <path d={cheek(180)} fill={PALETTE[first.state].riser} /> : null}
        {last ? <path d={cheek(0)} fill={PALETTE[last.state].riser} /> : null}

        {/* Mesa da Assembleia */}
        <path
          d={toPath([projectXY(-26, 10, 0), projectXY(26, 10, 0), projectXY(26, 10, 7), projectXY(-26, 10, 7)])}
          fill="#C9D5EE"
        />
        <path
          d={toPath([projectXY(-26, 10, 7), projectXY(26, 10, 7), projectXY(26, 22, 7), projectXY(-26, 22, 7)])}
          fill="#E3EAF8"
        />

        {/* 230 lugares, com sombra no degrau */}
        {ordered.map(({ seat, index }) => {
          const p = project(seat.radius, seat.angle, stepLift(seat.row));
          const r = SEAT_R * p.s;
          const dim = focusParty != null && seat.party !== focusParty && seat.party !== hoverParty;
          return (
            <g key={index} opacity={dim ? 0.15 : 1} className="transition-opacity duration-300">
              <g className="seat-pop" style={{ animationDelay: `${index * 1.6}ms` }}>
                <ellipse cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} rx={(r * 1.15).toFixed(2)} ry={(r * 0.5).toFixed(2)} fill="#0A1D56" fillOpacity={0.16} />
                <circle cx={p.x.toFixed(1)} cy={(p.y - r * 0.8).toFixed(1)} r={r.toFixed(2)} fill={`url(#${id}-${seat.state})`}>
                  <title>{`${partyMeta(seat.party).name} · ${STATE_LABEL[seat.state]}`}</title>
                </circle>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Hemiciclo 3D (a vista muda a cada lei); um ponto por partido e sentido de voto */}
      <div
        role="group"
        aria-roledescription="hemiciclo 3D"
        aria-label={ariaLabel}
        aria-hidden={!ready || undefined}
        className={`absolute inset-x-0 top-0 transition-opacity duration-500 select-none ${
          ready ? "" : "pointer-events-none opacity-0"
        }`}
        style={{ height: `${((BASE + 4) / VIEW_H) * 100}%` }}
      >
        <div
          ref={canvasHostRef}
          className="absolute inset-0 touch-pan-y"
        />

        {ready ? (
          <>
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
              {spots.map((spot) => (
                <g
                  key={spot.key}
                  className={`transition-opacity duration-300 ${focusParty && focusParty !== spot.party && hoverParty !== spot.party ? "opacity-25" : ""}`}
                >
                  <line
                    ref={(el) => {
                      if (el) stemRefs.current.set(spot.key, el);
                      else stemRefs.current.delete(spot.key);
                    }}
                    stroke={PALETTE[spot.state].dark}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  <circle
                    ref={(el) => {
                      if (el) dotRefs.current.set(spot.key, el);
                      else dotRefs.current.delete(spot.key);
                    }}
                    r={2.6}
                    fill={PALETTE[spot.state].base}
                    stroke="#fff"
                    strokeWidth={1.2}
                  />
                </g>
              ))}
            </svg>

            {spots.map((spot) => {
              const meta = partyMeta(spot.party);
              const open = spot.key === openKey;
              return (
                <button
                  key={spot.key}
                  ref={(el) => {
                    if (el) pinRefs.current.set(spot.key, el);
                    else pinRefs.current.delete(spot.key);
                  }}
                  type="button"
                  data-swipe
                  aria-expanded={open}
                  aria-label={`${meta.name}: ${STATE_LABEL[spot.state].toLowerCase()}, ${deputies(spot.seats.length)}. Ver detalhes.`}
                  onClick={() => toggleSpot(spot.key)}
                  onPointerEnter={(event) => event.pointerType === "mouse" && trackHover("pin", spot.party)}
                  onPointerLeave={(event) => event.pointerType === "mouse" && trackHover("pin", null)}
                  className={`absolute top-0 left-0 flex size-6 cursor-pointer items-center justify-center rounded-full border-2 bg-white p-px shadow-[0_2px_6px_-1px_rgba(10,29,86,0.35)] transition-[opacity,scale] duration-200 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#135BFF] sm:size-8 sm:p-[2px] ${
                    open || focusParty === spot.party || hoverParty === spot.party ? "z-10 scale-110" : ""
                  } ${focusParty && focusParty !== spot.party && hoverParty !== spot.party ? "opacity-30" : ""}`}
                  style={{ borderColor: PALETTE[spot.state].base }}
                >
                  {PARTY_ICONS.has(spot.party) ? (
                    <PartyIcon code={spot.party} />
                  ) : (
                    <span className="text-[8px] leading-none font-extrabold text-[#0A1D56]">{meta.name.slice(0, 3)}</span>
                  )}
                </button>
              );
            })}

            {openSpot ? (
              <div
                ref={cardRef}
                role="status"
                className="absolute top-0 left-0 z-20 w-max max-w-[15rem] rounded-xl bg-white px-3 py-2 text-left shadow-[0_10px_28px_-8px_rgba(10,29,86,0.4)] ring-1 ring-[#DCE5F8]"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-6 shrink-0 items-center justify-center">
                    <PartyIcon code={openSpot.party} />
                  </span>
                  <span className="font-editorial text-sm leading-tight font-extrabold text-[#0A1D56]">
                    {partyMeta(openSpot.party).name}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs leading-tight font-bold">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[openSpot.state].base }} />
                  <span style={{ color: PALETTE[openSpot.state].text }}>{STATE_LABEL[openSpot.state]}</span>
                  <span className="font-semibold text-[#4C5D85]">· {deputies(openSpot.seats.length)}</span>
                </span>
                {notes?.[openSpot.key] ? (
                  <span className="mt-1 block text-[11px] leading-snug font-medium text-[#4C5D85]">{notes[openSpot.key]}</span>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Totais de cada bloco, junto ao próprio bloco (em HTML para o texto não encolher com o desenho) */}
      {labels.map((label) => (
        <span
          key={label.state}
          aria-hidden
          className="pointer-events-none absolute flex items-baseline gap-1 whitespace-nowrap"
          style={{ left: `${label.left}%`, top: `${((BASE + 5) / VIEW_H) * 100}%`, transform: "translateX(-50%)" }}
        >
          <span
            className="font-editorial text-xl leading-none font-extrabold tracking-tight sm:text-3xl"
            style={{ color: PALETTE[label.state].text }}
          >
            {label.count}
          </span>
          <span className="text-[11px] leading-none font-bold text-[#4C5D85] sm:text-sm">
            {label.state === "abstencao" && label.count !== 1 ? "abstenções" : STATE_LABEL[label.state].toLowerCase()}
          </span>
        </span>
      ))}
    </div>
  );
}
