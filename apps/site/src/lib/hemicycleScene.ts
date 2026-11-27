/**
 * Hemiciclo em WebGL (three.js). Este módulo só é carregado no browser, depois de a
 * página aparecer (o desenho SVG fica no lugar até lá, e para sempre se não houver WebGL).
 *
 * Há um único renderer para a página: o hero recria o componente a cada lei e os browsers
 * limitam os contextos WebGL abertos, por isso o mesmo <canvas> muda de contentor.
 *
 * Coordenadas nas mesmas unidades do desenho (raios das filas 64–169). Chão em y = 0; a mesa
 * da Assembleia à frente, as filas para trás (z < 0). Ângulo 180° = ponta esquerda, 0° = direita.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { ROWS, VOTE_PALETTE, voteRuns, type Run, type Seat, type SeatState } from "@/lib/hemicycle";

/* ---------- Medidas do anfiteatro ---------- */

/** Meia profundidade de cada degrau (as filas estão a 15 unidades umas das outras). */
const HALF = 7.5;
/** Altura de cada degrau. */
const RISE = 4.2;
const SEAT_R = 4.4;
const WALL_H = 10;
const WALL_T = 4;
const PIT_R = ROWS[0]!.radius - HALF;
const OUTER_R = ROWS[ROWS.length - 1]!.radius + HALF;
const stepTop = (row: number) => (row + 1) * RISE;
const TOP = stepTop(ROWS.length - 1);

const DEG = Math.PI / 180;
const polar = (radius: number, angle: number, y: number) =>
  new Vector3(radius * Math.cos(angle * DEG), y, -radius * Math.sin(angle * DEG));

/* ---------- Vista ---------- */

/** Vista inicial: de frente, a 40° de altura. */
const EL_DEFAULT = 40 * DEG;
/**
 * A cada lei, a câmara vai para uma vista sorteada dentro destes limites (para o hemiciclo
 * continuar fácil de ler): até 36° para cada lado, entre 26° e 54° de altura, pelo menos 16°
 * de diferença para a vista anterior (para se notar a mudança) e sem o hemiciclo ficar com
 * menos de 75% do tamanho que tem de frente (de lado e visto de cima, fica estreito).
 */
const VIEW_AZ = 36 * DEG;
const VIEW_EL_MIN = 26 * DEG;
const VIEW_EL_MAX = 54 * DEG;
const VIEW_MIN_TURN = 16 * DEG;
const VIEW_MIN_SIZE = 0.75;
const VIEW_MS = 1100;
/** Visto de lado, o hemiciclo fica mais alto e encolheria muito: a câmara desce um pouco (esta fração aos 60°). */
const EL_DROP = 0.3;
const EL_DROP_AT = 60 * DEG;
/** Distância da câmara ao centro de rotação: define a força da perspetiva (o enquadramento é automático). */
const DISTANCE = 470;
const TARGET = new Vector3(0, 12, -68);
/** Margem à volta do hemiciclo, em fração de meia largura/altura do canvas. */
const PAD_X = 0.03;
const PAD_Y = 0.05;

/** Pontos que têm de caber no ecrã, seja qual for o ângulo. */
const FIT_POINTS: Vector3[] = (() => {
  const pts: Vector3[] = [];
  for (let a = 0; a <= 180; a += 10) {
    pts.push(polar(OUTER_R + WALL_T, a, TOP + WALL_H), polar(OUTER_R + WALL_T, a, 0));
  }
  for (let a = 0; a <= 180; a += 30) pts.push(polar(PIT_R, a, 0));
  return pts;
})();

/* ---------- Cores ---------- */

const DIM_COLOR = new Color("#E3E9F5");
const PIT_COLOR = new Color("#E9EEF9");
const MESA_COLOR = new Color("#D3DDF1");

const seatColor = (state: SeatState) => new Color(VOTE_PALETTE[state].base);

/* ---------- Geometria do anfiteatro ---------- */

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];

  /** Quadrilátero (a→b→c→d à volta), virado para o lado das normais. */
  quad(pts: [Vector3, Vector3, Vector3, Vector3], ns: Vector3[], color: Color) {
    const n = (i: number) => ns[i] ?? ns[0]!;
    const avg = new Vector3().add(n(0)).add(n(1)).add(n(2)).add(n(3));
    const [a, b, c] = pts;
    const facing = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).dot(avg);
    const order = facing >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      const p = pts[i]!;
      const normal = n(i);
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Ângulos de `from` a `to` (graus, a descer), de 2 em 2 no máximo. */
function arc(from: number, to: number): number[] {
  const n = Math.max(1, Math.ceil(Math.abs(from - to) / 2));
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
}

const UP = new Vector3(0, 1, 0);
const FRONT = new Vector3(0, 0, 1);
const inward = (angle: number) => new Vector3(-Math.cos(angle * DEG), 0, Math.sin(angle * DEG));
const outward = (angle: number) => inward(angle).negate();

/** Degraus, parede do fundo e perfis das pontas, com as cores de cada bloco de voto. */
function buildStands(runs: Run[]): BufferGeometry {
  const b = new Builder();

  for (const run of runs) {
    const pal = VOTE_PALETTE[run.state];
    const floor = new Color(pal.floor);
    const riser = new Color(pal.riser);
    const wall = new Color(pal.base);
    const wallTop = new Color(pal.light);
    const wallBack = new Color(pal.dark);
    const angles = arc(run.from, run.to);

    for (let k = 0; k < angles.length - 1; k++) {
      const a0 = angles[k]!;
      const a1 = angles[k + 1]!;
      const in0 = inward(a0);
      const in1 = inward(a1);

      ROWS.forEach((row, i) => {
        const rIn = row.radius - HALF;
        const rOut = row.radius + HALF;
        const y = stepTop(i);
        const yLow = i === 0 ? 0 : stepTop(i - 1);
        b.quad([polar(rIn, a0, y), polar(rOut, a0, y), polar(rOut, a1, y), polar(rIn, a1, y)], [UP], floor);
        b.quad([polar(rIn, a0, yLow), polar(rIn, a1, yLow), polar(rIn, a1, y), polar(rIn, a0, y)], [in0, in1, in1, in0], riser);
      });

      const yWall = TOP + WALL_H;
      b.quad(
        [polar(OUTER_R, a0, TOP), polar(OUTER_R, a1, TOP), polar(OUTER_R, a1, yWall), polar(OUTER_R, a0, yWall)],
        [in0, in1, in1, in0],
        wall,
      );
      b.quad(
        [polar(OUTER_R, a0, yWall), polar(OUTER_R + WALL_T, a0, yWall), polar(OUTER_R + WALL_T, a1, yWall), polar(OUTER_R, a1, yWall)],
        [UP],
        wallTop,
      );
      const out0 = outward(a0);
      const out1 = outward(a1);
      b.quad(
        [polar(OUTER_R + WALL_T, a0, 0), polar(OUTER_R + WALL_T, a1, 0), polar(OUTER_R + WALL_T, a1, yWall), polar(OUTER_R + WALL_T, a0, yWall)],
        [out0, out1, out1, out0],
        wallBack,
      );
    }
  }

  // Perfis em escada nas duas pontas (viradas para a frente).
  const ends: [number, Run | undefined][] = [
    [180, runs[0]],
    [0, runs[runs.length - 1]],
  ];
  for (const [angle, run] of ends) {
    if (!run) continue;
    const pal = VOTE_PALETTE[run.state];
    const riser = new Color(pal.riser);
    ROWS.forEach((row, i) => {
      const rIn = row.radius - HALF;
      const rOut = row.radius + HALF;
      const y = stepTop(i);
      b.quad([polar(rIn, angle, 0), polar(rOut, angle, 0), polar(rOut, angle, y), polar(rIn, angle, y)], [FRONT], riser);
    });
    const yWall = TOP + WALL_H;
    b.quad(
      [polar(OUTER_R, angle, 0), polar(OUTER_R + WALL_T, angle, 0), polar(OUTER_R + WALL_T, angle, yWall), polar(OUTER_R, angle, yWall)],
      [FRONT],
      new Color(pal.base),
    );
  }

  // Chão do centro.
  const pit = arc(180, 0);
  for (let k = 0; k < pit.length - 1; k++) {
    const a0 = pit[k]!;
    const a1 = pit[k + 1]!;
    b.quad([polar(0, a0, 0.1), polar(PIT_R, a0, 0.1), polar(PIT_R, a1, 0.1), polar(0, a1, 0.1)], [UP], PIT_COLOR);
  }

  return b.build();
}

/* ---------- Cena ---------- */

export interface SceneCallbacks {
  /** Depois de cada imagem: posição no ecrã (px, relativa ao canvas) do centro de cada lugar, [x0, y0, x1, y1, …]. */
  onFrame?: (seatPoints: Float32Array, width: number, height: number) => void;
  /** Toque/clique sem deslizar: índice do lugar tocado, ou -1. */
  onTap?: (seat: number) => void;
  /** Rato por cima de um lugar (índice) ou de nenhum (-1). */
  onHover?: (seat: number) => void;
  /** O browser perdeu (false) ou recuperou (true) o contexto WebGL. */
  onContext?: (ok: boolean) => void;
}

const SEAT_COUNT = ROWS.reduce((sum, row) => sum + row.count, 0);
/** Duração da troca de cor de cada lugar e atraso entre lugares (onda da esquerda para a direita). */
const SEAT_ANIM_MS = 380;
const SEAT_STAGGER_MS = 1.6;
const HOP = 7;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const damp = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

export class HemicycleScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 2, 10, 3000);
  private stands: Mesh<BufferGeometry, MeshStandardMaterial>;
  private seatsMesh: InstancedMesh<SphereGeometry, MeshStandardMaterial>;

  private host: HTMLElement | null = null;
  private callbacks: SceneCallbacks = {};
  private resizeObserver: ResizeObserver;
  private width = 0;
  private height = 0;
  private raf = 0;
  private lastTime = 0;
  private reducedMotion: MediaQueryList;

  // Lugares
  private seats: Seat[] = [];
  private seatPos: Vector3[] = [];
  private colorFrom: Color[] = [];
  private colorTo: Color[] = [];
  private colorNow: Color[] = [];
  private animStart = new Float64Array(SEAT_COUNT);
  private dimNow = new Float32Array(SEAT_COUNT);
  private dimTo = new Float32Array(SEAT_COUNT);
  private litNow = new Float32Array(SEAT_COUNT);
  private litTo = new Float32Array(SEAT_COUNT);
  /** Partido fixado (os restantes esbatem-se) e partido debaixo do rato (só realce, sem esbater). */
  private focusParty: string | null = null;
  private hoverParty: string | null = null;
  private runsKey = "";

  /** Centro de cada lugar no ecrã, depois da última imagem. */
  private seatScreen = new Float32Array(SEAT_COUNT * 2);

  // Câmara
  private az = 0;
  private el = EL_DEFAULT;
  /** Passagem animada de uma vista para outra (pelo relógio). */
  private viewTween: { az0: number; el0: number; az1: number; el1: number; t: number } | null = null;
  /** Dedo ou botão do rato em baixo: se não deslizar, é um toque num lugar. */
  private press: { id: number; type: string; x0: number; y0: number; moved: boolean } | null = null;
  private hoverSeat = -1;

  // Auxiliares reutilizados
  private m4 = new Matrix4();
  private q = new Quaternion();
  private v3 = new Vector3();
  private s3 = new Vector3();
  private c = new Color();

  constructor() {
    // Sem aceleração gráfica o contexto falha e fica o SVG (ver hasFastWebGL em Hemicycle3D).
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "block size-full";
    this.canvas.setAttribute("aria-hidden", "true");

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Luz
    const hemi = new HemisphereLight("#FFFFFF", "#B9C6E4", 2.1);
    this.scene.add(hemi);
    const sun = new DirectionalLight("#FFFFFF", 1.5);
    sun.position.set(TARGET.x - 150, 320, TARGET.z + 230);
    sun.target.position.copy(TARGET);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -240;
    sun.shadow.camera.right = 240;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.4;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);

    // Sombra no chão à volta (o resto do chão é transparente: vê-se o cartão por trás)
    const ground = new Mesh(new PlaneGeometry(900, 700), new ShadowMaterial({ opacity: 0.13 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -60);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Anfiteatro (reconstruído quando mudam os blocos de voto)
    this.stands = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    this.stands.receiveShadow = true;
    this.stands.castShadow = true;
    this.scene.add(this.stands);

    // Mesa da Assembleia
    const mesa = new Mesh(new BoxGeometry(52, 7, 12), new MeshStandardMaterial({ color: MESA_COLOR, roughness: 0.8 }));
    mesa.position.set(0, 3.5, -16);
    mesa.castShadow = true;
    mesa.receiveShadow = true;
    this.scene.add(mesa);

    // 230 lugares numa só malha
    this.seatsMesh = new InstancedMesh(
      new SphereGeometry(SEAT_R, 22, 14),
      new MeshStandardMaterial({ roughness: 0.38, metalness: 0 }),
      SEAT_COUNT,
    );
    this.seatsMesh.castShadow = true;
    this.seatsMesh.receiveShadow = true;
    this.seatsMesh.frustumCulled = false;
    this.seatsMesh.count = 0;
    this.scene.add(this.seatsMesh);

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.renderNow();
    });

    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.callbacks.onContext?.(false);
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.callbacks.onContext?.(true);
      this.invalidate();
    });
  }

  /* ----- Ligar a um contentor ----- */

  attach(host: HTMLElement, callbacks: SceneCallbacks) {
    if (this.host && this.host !== host) this.detach(this.host);
    this.host = host;
    this.callbacks = callbacks;
    host.prepend(this.canvas);
    host.addEventListener("pointerdown", this.onPointerDown);
    host.addEventListener("pointermove", this.onPointerMove);
    host.addEventListener("pointerup", this.onPointerUp);
    host.addEventListener("pointercancel", this.onPointerCancel);
    host.addEventListener("pointerleave", this.onPointerLeave);
    this.resizeObserver.observe(host);
    this.resize();
    if (this.seats.length) this.renderNow();
  }

  detach(host: HTMLElement) {
    if (this.host !== host) return;
    this.resizeObserver.disconnect();
    host.removeEventListener("pointerdown", this.onPointerDown);
    host.removeEventListener("pointermove", this.onPointerMove);
    host.removeEventListener("pointerup", this.onPointerUp);
    host.removeEventListener("pointercancel", this.onPointerCancel);
    host.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.remove();
    this.host = null;
    this.callbacks = {};
    this.press = null;
    this.hoverSeat = -1;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /* ----- Dados ----- */

  /**
   * Lugares da lei atual. Com `animate`, os lugares que mudam de cor dão um salto, numa onda
   * da esquerda para a direita, e (a partir da segunda lei) a câmara passa para uma vista nova.
   */
  setSeats(seats: Seat[], animate: boolean) {
    const first = this.seats.length === 0;
    const changed = seats !== this.seats;
    const motion = animate && !this.reducedMotion.matches;
    const now = performance.now();
    this.seats = seats;
    this.seatsMesh.count = seats.length;

    seats.forEach((seat, i) => {
      this.seatPos[i] = polar(seat.radius, seat.angle, stepTop(seat.row) + SEAT_R * 0.9);
      const target = seatColor(seat.state);
      const current = this.colorNow[i] ?? target.clone();
      this.colorNow[i] = current;
      this.colorFrom[i] = current.clone();
      this.colorTo[i] = target;
      if (motion && (first || !current.equals(target))) {
        this.animStart[i] = now + i * SEAT_STAGGER_MS;
      } else {
        this.animStart[i] = 0;
        current.copy(target);
      }
    });

    const runs = voteRuns(seats);
    const key = runs.map((run) => `${run.state}:${run.from.toFixed(2)}:${run.to.toFixed(2)}`).join("|");
    if (key !== this.runsKey) {
      this.runsKey = key;
      this.stands.geometry.dispose();
      this.stands.geometry = buildStands(runs);
    }

    // Com movimento reduzido, a câmara fica parada na vista inicial.
    if (!first && changed && motion) this.shuffleView();

    this.applyLit(true);
    this.writeSeats(now);
    this.seatsMesh.computeBoundingSphere();
    this.renderNow();
    this.invalidate();
  }

  /** Volta a desenhar já (ex.: apareceu um elemento que tem de ser posicionado). */
  redraw() {
    this.renderNow();
  }

  /**
   * Partido fixado: os lugares dele sobem um pouco e os restantes esbatem-se. Partido debaixo do
   * rato: os lugares dele sobem, sem esbater nada.
   */
  setHighlight(focus: string | null, hover: string | null) {
    if (focus === this.focusParty && hover === this.hoverParty) return;
    this.focusParty = focus;
    this.hoverParty = hover;
    this.applyLit(this.reducedMotion.matches);
    this.invalidate();
  }

  private applyLit(immediate: boolean) {
    const { focusParty: focus, hoverParty: hover } = this;
    this.seats.forEach((seat, i) => {
      const lit = seat.party !== "" && (seat.party === focus || seat.party === hover);
      this.dimTo[i] = focus != null && !lit ? 1 : 0;
      this.litTo[i] = lit ? 1 : 0;
      if (immediate) {
        this.dimNow[i] = this.dimTo[i]!;
        this.litNow[i] = this.litTo[i]!;
      }
    });
  }

  /* ----- Vista ----- */

  /** Sorteia uma vista nova (dentro dos limites) e anima a câmara até lá. */
  private shuffleView() {
    const previous = this.viewTween?.az1 ?? this.az;
    const measurable = this.width > 0 && this.height > 0;
    const front = measurable ? this.aim(0, EL_DEFAULT).width : 1;
    let best: { az: number; el: number; size: number } | null = null;
    for (let i = 0; i < 60 && !(best && best.size >= VIEW_MIN_SIZE); i++) {
      const az = (Math.random() * 2 - 1) * VIEW_AZ;
      if (Math.abs(az - previous) < VIEW_MIN_TURN) continue;
      const el = VIEW_EL_MIN + Math.random() * (VIEW_EL_MAX - VIEW_EL_MIN);
      const size = measurable ? this.aim(az, el).width / front : 1;
      if (!best || size > best.size) best = { az, el, size };
    }
    if (!best) return;
    this.viewTween = { az0: this.az, el0: this.el, az1: best.az, el1: best.el, t: performance.now() };
  }

  /* ----- Ciclo de desenho (só quando há alguma coisa a mudar) ----- */

  invalidate() {
    if (!this.host || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private renderNow() {
    if (!this.host || !this.width || !this.height) return;
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.emitFrame();
  }

  private frame = (time: number) => {
    this.raf = 0;
    const dt = this.lastTime ? Math.min(64, time - this.lastTime) : 16;
    this.lastTime = time;
    const cameraBusy = this.stepCamera();
    const seatsBusy = this.stepSeats(performance.now(), dt);
    this.renderNow();
    if (cameraBusy || seatsBusy) this.invalidate();
    else this.lastTime = 0;
  };

  private stepCamera(): boolean {
    const tween = this.viewTween;
    if (!tween) return false;
    // Pelo relógio, não pelo número de imagens: dura o mesmo num telemóvel lento.
    const p = clamp((performance.now() - tween.t) / VIEW_MS, 0, 1);
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    this.az = tween.az0 + (tween.az1 - tween.az0) * eased;
    this.el = tween.el0 + (tween.el1 - tween.el0) * eased;
    if (p < 1) return true;
    this.viewTween = null;
    return false;
  }

  private stepSeats(now: number, dt: number): boolean {
    let busy = false;
    const kDim = damp(dt, 90);
    for (let i = 0; i < this.seats.length; i++) {
      const start = this.animStart[i]!;
      if (start) {
        const p = clamp((now - start) / SEAT_ANIM_MS, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        this.colorNow[i]!.lerpColors(this.colorFrom[i]!, this.colorTo[i]!, eased);
        if (p >= 1) this.animStart[i] = 0;
        else busy = true;
      }
      const dDim = this.dimTo[i]! - this.dimNow[i]!;
      const dLit = this.litTo[i]! - this.litNow[i]!;
      if (Math.abs(dDim) > 0.002 || Math.abs(dLit) > 0.002) {
        this.dimNow[i] = this.dimNow[i]! + dDim * kDim;
        this.litNow[i] = this.litNow[i]! + dLit * kDim;
        busy = true;
      } else {
        this.dimNow[i] = this.dimTo[i]!;
        this.litNow[i] = this.litTo[i]!;
      }
    }
    this.writeSeats(now);
    return busy;
  }

  /** Posição, tamanho e cor de cada lugar na malha instanciada. */
  private writeSeats(now: number) {
    for (let i = 0; i < this.seats.length; i++) {
      const start = this.animStart[i]!;
      const p = start ? clamp((now - start) / SEAT_ANIM_MS, 0, 1) : 0;
      const hop = start && p > 0 ? Math.sin(Math.PI * p) * HOP : 0;
      const dim = this.dimNow[i]!;
      const lit = this.litNow[i]!;
      const scale = 1 - dim * 0.18 + lit * 0.12;
      this.v3.copy(this.seatPos[i]!);
      this.v3.y += hop + lit * 2.2 - dim * SEAT_R * 0.18;
      this.s3.setScalar(scale);
      this.m4.compose(this.v3, this.q, this.s3);
      this.seatsMesh.setMatrixAt(i, this.m4);
      this.c.copy(this.colorNow[i]!).lerp(DIM_COLOR, dim * 0.82);
      this.seatsMesh.setColorAt(i, this.c);
    }
    this.seatsMesh.instanceMatrix.needsUpdate = true;
    if (this.seatsMesh.instanceColor) this.seatsMesh.instanceColor.needsUpdate = true;
  }

  private resize() {
    if (!this.host) return;
    this.setCanvasSize(this.host.clientWidth, this.host.clientHeight);
  }

  /** Muda o tamanho do canvas só quando mudou (cada mudança volta a reservar a imagem no GPU). */
  private setCanvasSize(w: number, h: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (w === this.width && h === this.height && ratio === this.renderer.getPixelRatio()) return;
    this.width = w;
    this.height = h;
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
  }

  /**
   * Adianta o trabalho do primeiro desenho sem bloquear a página (chamar antes de `attach`):
   * o canvas fica já com o tamanho do contentor e os shaders são compilados em paralelo pelo
   * browser, em vez de numa só tarefa longa ao mostrar o 3D.
   */
  async prepare(width: number, height: number) {
    this.setCanvasSize(width, height);
    // O programa dos lugares depende de haver uma cor por lugar: cria-a já (setSeats escreve-as).
    if (!this.seatsMesh.instanceColor) this.seatsMesh.setColorAt(0, DIM_COLOR);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      // Um desenho de ensaio, noutra tarefa: compila os shaders das sombras (o compileAsync não
      // os inclui) e reserva o mapa de sombras no GPU.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (!this.host) this.renderer.render(this.scene, this.camera);
    } catch {
      // Sem compilação prévia, compila no primeiro desenho (como antes).
    }
  }

  /** Câmara em órbita à volta do centro e enquadramento justo do hemiciclo, a cada imagem. */
  /**
   * Põe a câmara numa vista (sem zoom) e calcula o enquadramento que faz caber o hemiciclo:
   * zoom, centro e a fração da largura do canvas que o hemiciclo ocupa.
   */
  private aim(az: number, elevation: number) {
    const cam = this.camera;
    const el = elevation * (1 - (EL_DROP * Math.abs(az)) / EL_DROP_AT);
    const cosEl = Math.cos(el);
    cam.position.set(
      TARGET.x + DISTANCE * Math.sin(az) * cosEl,
      TARGET.y + DISTANCE * Math.sin(el),
      TARGET.z + DISTANCE * Math.cos(az) * cosEl,
    );
    cam.lookAt(TARGET);
    cam.aspect = this.width / this.height;
    cam.zoom = 1;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of FIT_POINTS) {
      this.v3.copy(point).project(cam);
      minX = Math.min(minX, this.v3.x);
      maxX = Math.max(maxX, this.v3.x);
      minY = Math.min(minY, this.v3.y);
      maxY = Math.max(maxY, this.v3.y);
    }
    const zoom = Math.min((2 - 2 * PAD_X) / (maxX - minX), (2 - 2 * PAD_Y) / (maxY - minY));
    return { zoom, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: (zoom * (maxX - minX)) / 2 };
  }

  private updateCamera() {
    const cam = this.camera;
    const { zoom, cx, cy } = this.aim(this.az, this.el);
    cam.zoom = zoom;
    cam.setViewOffset(
      this.width,
      this.height,
      (zoom * cx * this.width) / 2,
      (-zoom * cy * this.height) / 2,
      this.width,
      this.height,
    );
    cam.updateProjectionMatrix();
  }

  private emitFrame() {
    const out = this.seatScreen;
    for (let i = 0; i < this.seats.length; i++) {
      this.v3.copy(this.seatPos[i]!).project(this.camera);
      out[i * 2] = ((this.v3.x + 1) / 2) * this.width;
      out[i * 2 + 1] = ((1 - this.v3.y) / 2) * this.height;
    }
    this.callbacks.onFrame?.(out, this.width, this.height);
  }

  /** Lugar mais próximo de um ponto do ecrã (px relativos ao canvas), ou -1. */
  private pick(x: number, y: number, tolerance: number): number {
    let best = -1;
    let bestD = tolerance * tolerance;
    for (let i = 0; i < this.seats.length; i++) {
      this.v3.copy(this.seatPos[i]!).project(this.camera);
      const dx = ((this.v3.x + 1) / 2) * this.width - x;
      const dy = ((1 - this.v3.y) / 2) * this.height - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private localPoint(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /* ----- Toques e rato (deslizar na horizontal muda de lei: é o carrossel que trata disso) ----- */

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    this.press = { id: event.pointerId, type: event.pointerType, x0: event.clientX, y0: event.clientY, moved: false };
  };

  private onPointerMove = (event: PointerEvent) => {
    const press = this.press;
    if (press && press.id === event.pointerId) {
      if (!press.moved && Math.hypot(event.clientX - press.x0, event.clientY - press.y0) >= 6) {
        press.moved = true;
        this.setHover(-1);
      }
      return;
    }
    if (event.pointerType === "mouse") this.hoverAt(event);
  };

  private onPointerUp = (event: PointerEvent) => {
    const press = this.press;
    if (!press || press.id !== event.pointerId) return;
    this.press = null;
    if (press.moved) return;
    const { x, y } = this.localPoint(event);
    this.callbacks.onTap?.(this.pick(x, y, press.type === "mouse" ? 12 : 18));
  };

  private onPointerCancel = (event: PointerEvent) => {
    if (this.press?.id === event.pointerId) this.press = null;
  };

  private onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === "mouse") this.setHover(-1);
  };

  private hoverAt(event: PointerEvent) {
    if ((event.target as HTMLElement).closest("button, a")) {
      this.setHover(-1);
      return;
    }
    const { x, y } = this.localPoint(event);
    this.setHover(this.pick(x, y, 12));
  }

  private setHover(seat: number) {
    if (seat === this.hoverSeat) return;
    this.hoverSeat = seat;
    if (this.host) this.host.style.cursor = seat >= 0 ? "pointer" : "";
    this.callbacks.onHover?.(seat);
  }
}

let instance: HemicycleScene | null | undefined;

/** O renderer da página (criado na primeira chamada), ou null se o browser não tiver WebGL. */
export function getHemicycleScene(): HemicycleScene | null {
  if (instance === undefined) {
    try {
      instance = new HemicycleScene();
    } catch {
      instance = null;
    }
  }
  return instance;
}
