/**
 * Fonte oficial: Assembleia da República — Dados Abertos.
 * https://www.parlamento.pt/Cidadania/Paginas/DadosAbertos.aspx
 *
 * A AR não tem API: publica ficheiros JSON por legislatura em páginas SharePoint.
 * Os URLs dos ficheiros mudam, por isso descobrimo-los a partir das páginas:
 *   página do catálogo → "Pasta XVII Legislatura" → "IniciativasXVII_json.txt"
 */
import { romanToInt } from "../roman.js";
import { extractLinks, fetchJson, fetchText } from "./http.js";
import type { NDiploma, NEvent, NInitiative, NPublication, NVote, NVoteSide, ParliamentSnapshot } from "./types.js";

const BASE = "https://www.parlamento.pt/Cidadania/Paginas/";

// --- Formato bruto da AR (apenas os campos usados) -------------------------

interface ArPublication {
  pubTipo?: string | null;
  pubNr?: string | null;
  pubdt?: string | null;
  URLDiario?: string | null;
}

interface ArVote {
  id: string;
  data?: string | null;
  resultado?: string | null;
  unanime?: string | null;
  detalhe?: string | null;
  ausencias?: string[] | null;
  descricao?: string | null;
  reuniao?: string | null;
  tipoReuniao?: string | null;
  publicacao?: ArPublication[] | null;
}

interface ArCommittee {
  IdComissao?: string | null;
  Nome?: string | null;
  Competente?: string | null;
}

interface ArEvent {
  OevId: string;
  CodigoFase?: string | null;
  Fase?: string | null;
  DataFase?: string | null;
  ObsFase?: string | null;
  Comissao?: ArCommittee[] | null;
  PublicacaoFase?: ArPublication[] | null;
  TextosAprovados?: string | string[] | null;
  Votacao?: ArVote[] | null;
}

interface ArInitiative {
  IniId: string;
  IniNr?: string | null;
  IniTipo?: string | null;
  IniDescTipo?: string | null;
  IniTitulo?: string | null;
  IniLeg?: string | null;
  IniSel?: string | null;
  IniLinkTexto?: string | null;
  IniAutorGruposParlamentares?: { GP?: string | null }[] | null;
  IniAutorDeputados?: { idCadastro?: string | null; nome?: string | null; GP?: string | null }[] | null;
  IniAutorOutros?: { nome?: string | null } | null;
  IniciativasOrigem?: { id?: string | null }[] | null;
  IniciativasOriginadas?: { id?: string | null }[] | null;
  IniEventos?: ArEvent[] | null;
}

interface ArDiploma {
  Id: string;
  Tipo?: string | null;
  Numero?: string | null;
  Numero2?: string | null;
  AnoCivil?: string | null;
  Titulo?: string | null;
  Legislatura?: string | null;
  Sessao?: string | null;
  LinkTexto?: string | null;
  Anexos?: string[] | null;
  Publicacao?: ArPublication[] | null;
  Iniciativas?: { IniId?: string | null }[] | null;
}

// --- Descoberta dos ficheiros ----------------------------------------------

async function discoverFile(catalogPage: string, fileName: string, leg: string): Promise<string> {
  const catalogUrl = BASE + catalogPage;
  const catalog = extractLinks(await fetchText(catalogUrl), catalogUrl);
  const folder = catalog.find(
    (l) => l.title === `Pasta ${leg} Legislatura` || l.text === `${leg} Legislatura`,
  );
  if (!folder) throw new Error(`AR: pasta "${leg} Legislatura" não encontrada em ${catalogPage}`);

  const files = extractLinks(await fetchText(folder.href), folder.href);
  const file = files.find((l) => l.text === fileName);
  if (!file) throw new Error(`AR: ficheiro ${fileName} não encontrado na pasta ${leg}`);
  return file.href;
}

/** Legislaturas com pasta no catálogo de iniciativas, da mais recente para a mais antiga. */
export async function listArLegislatures(): Promise<string[]> {
  const catalogUrl = BASE + "DAIniciativas.aspx";
  const links = extractLinks(await fetchText(catalogUrl), catalogUrl);
  const legs = links
    .map((l) => /^Pasta ([IVXLC]+) Legislatura$/.exec(l.title ?? "")?.[1])
    .filter((x): x is string => !!x);
  return [...new Set(legs)].sort((a, b) => romanToInt(b) - romanToInt(a));
}

/** A legislatura mais recente que já tem o ficheiro de iniciativas publicado. */
export async function detectArLegislature(): Promise<string | null> {
  for (const leg of (await listArLegislatures()).slice(0, 2)) {
    try {
      await discoverFile("DAIniciativas.aspx", `Iniciativas${leg}_json.txt`, leg);
      return leg;
    } catch {
      // Pasta nova ainda sem ficheiro: tentar a anterior.
    }
  }
  return null;
}

/**
 * Descobre e descarrega um ficheiro da AR. Os URLs dos ficheiros levam um token que não
 * aguenta pedidos repetidos (o segundo pedido é redirecionado para uma página de erro), por
 * isso cada nova tentativa volta a descobrir o URL em vez de repetir o mesmo.
 */
async function downloadArFile<T>(catalogPage: string, fileName: string, leg: string, timeoutMs: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const url = await discoverFile(catalogPage, fileName, leg);
      return await fetchJson<T>(url, { timeoutMs, retries: 1 });
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5_000 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// --- Normalização ----------------------------------------------------------

const httpsParlamento = (url: string | null | undefined) =>
  url ? url.replace(/^http:\/\/(app|debates)\.parlamento\.pt/, "https://$1.parlamento.pt") : null;

const toInt = (v: string | null | undefined) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : null;
};

const clean = (v: string | null | undefined) => {
  const s = v?.replace(/\s+/g, " ").trim();
  return s ? s : null;
};

function publications(list: ArPublication[] | null | undefined): NPublication[] {
  return (list ?? []).map((p) => ({
    type: clean(p.pubTipo),
    number: clean(p.pubNr),
    date: clean(p.pubdt),
    url: httpsParlamento(p.URLDiario),
  }));
}

function parseSide(token: string): NVoteSide {
  const count = /^(\d+)\s*-\s*(.+)$/.exec(token);
  if (count) return { group: count[2]!.trim(), count: Number(count[1]) };
  const deputy = /^(.+?)\s*\(([^)]+)\)$/.exec(token);
  if (deputy) return { group: deputy[2]!.trim(), deputy: deputy[1]!.trim() };
  return { group: token };
}

/**
 * O detalhe vem como HTML simples:
 * "A Favor: <I>PSD</I>, <I> CH</I><BR>Contra:<I>PCP</I><BR>Abstenção:<I>JPP</I>"
 */
export function parseVoteDetail(detail: string | null | undefined) {
  const out = { inFavour: [] as NVoteSide[], against: [] as NVoteSide[], abstention: [] as NVoteSide[], absent: [] as NVoteSide[] };
  if (!detail) return out;
  for (const part of detail.split(/<BR\s*\/?>/i)) {
    const head = /^\s*([^:<]+):/.exec(part)?.[1]
      ?.normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const tokens = [...part.matchAll(/<I>([\s\S]*?)<\/I>/gi)].map((m) => m[1]!.trim()).filter(Boolean);
    const sides = tokens.map(parseSide);
    if (head === "a favor") out.inFavour.push(...sides);
    else if (head === "contra") out.against.push(...sides);
    else if (head?.startsWith("absten")) out.abstention.push(...sides);
    else if (head?.startsWith("ausen")) out.absent.push(...sides);
  }
  return out;
}

function normalizeVote(v: ArVote, event: ArEvent): NVote {
  const sides = parseVoteDetail(v.detalhe);
  for (const g of v.ausencias ?? []) {
    if (g && !sides.absent.some((s) => s.group === g && !s.deputy)) sides.absent.push({ group: g });
  }
  return {
    id: v.id,
    eventId: event.OevId,
    phase: clean(event.Fase) ?? "Votação",
    date: clean(v.data) ?? clean(event.DataFase),
    // RP = reunião plenária; CP = Comissão Permanente (substitui o Plenário fora do período normal).
    body: "plenary",
    committee: null,
    meeting: clean(v.reuniao),
    result: clean(v.resultado) ?? "Desconhecido",
    unanimous: (v.unanime ?? "").toLowerCase().startsWith("unanim"),
    description: clean(v.descricao),
    ...sides,
    publications: publications(v.publicacao),
  };
}

function normalizeEvent(e: ArEvent): NEvent {
  const texts = Array.isArray(e.TextosAprovados)
    ? e.TextosAprovados
    : (e.TextosAprovados ?? "").split(/[,;\s]+/);
  return {
    id: e.OevId,
    code: clean(e.CodigoFase),
    phase: clean(e.Fase) ?? "Evento",
    date: clean(e.DataFase),
    observation: clean(e.ObsFase),
    committees: (e.Comissao ?? [])
      .filter((c) => clean(c.Nome))
      .map((c) => ({ id: clean(c.IdComissao), name: clean(c.Nome)!, competent: c.Competente === "S" })),
    publications: publications(e.PublicacaoFase),
    approvedTextIds: texts.map((t) => t.trim()).filter(Boolean),
  };
}

function normalizeInitiative(r: ArInitiative, leg: string): NInitiative {
  const events = (r.IniEventos ?? []).filter((e) => e?.OevId);
  return {
    id: r.IniId,
    legislature: clean(r.IniLeg) ?? leg,
    session: toInt(r.IniSel),
    typeCode: clean(r.IniTipo) ?? "?",
    type: clean(r.IniDescTipo) ?? "Iniciativa",
    number: toInt(r.IniNr),
    title: clean(r.IniTitulo) ?? "(sem título)",
    authorType: clean(r.IniAutorOutros?.nome),
    authorGroups: [...new Set((r.IniAutorGruposParlamentares ?? []).map((g) => clean(g.GP)).filter((g): g is string => !!g))],
    authorDeputies: (r.IniAutorDeputados ?? [])
      .filter((d) => clean(d.nome))
      .map((d) => ({ id: clean(d.idCadastro), name: clean(d.nome)!, group: clean(d.GP) })),
    textUrl: httpsParlamento(r.IniLinkTexto),
    originIds: (r.IniciativasOrigem ?? []).map((o) => clean(o.id)).filter((x): x is string => !!x),
    originatedIds: (r.IniciativasOriginadas ?? []).map((o) => clean(o.id)).filter((x): x is string => !!x),
    events: events.map(normalizeEvent),
    votes: events.flatMap((e) => (e.Votacao ?? []).filter((v) => v?.id).map((v) => normalizeVote(v, e))),
  };
}

function normalizeDiploma(d: ArDiploma, leg: string): NDiploma {
  return {
    id: d.Id,
    type: clean(d.Tipo) ?? "Diploma",
    number: clean(d.Numero),
    secondNumber: clean(d.Numero2),
    year: toInt(d.AnoCivil),
    title: clean(d.Titulo) ?? "(sem título)",
    legislature: clean(d.Legislatura) ?? leg,
    session: toInt(d.Sessao),
    textUrl: httpsParlamento(clean(d.LinkTexto) ?? d.Anexos?.[0] ?? null),
    publications: publications(d.Publicacao),
    initiativeIds: (d.Iniciativas ?? []).map((i) => clean(i.IniId)).filter((x): x is string => !!x),
  };
}

// --- Entrada pública ---------------------------------------------------------

export async function fetchParliamentFromAr(leg: string): Promise<ParliamentSnapshot> {
  // O ficheiro de iniciativas tem ~100 MB.
  const [rawInitiatives, rawDiplomas] = await Promise.all([
    downloadArFile<ArInitiative[]>("DAIniciativas.aspx", `Iniciativas${leg}_json.txt`, leg, 5 * 60_000),
    downloadArFile<ArDiploma[]>("DADiplomasAprovados.aspx", `Diplomas${leg}_json.txt`, leg, 2 * 60_000),
  ]);

  if (!Array.isArray(rawInitiatives) || rawInitiatives.length === 0) {
    throw new Error("AR: ficheiro de iniciativas vazio ou com formato inesperado");
  }
  if (!Array.isArray(rawDiplomas)) {
    throw new Error("AR: ficheiro de diplomas com formato inesperado");
  }

  const initiatives = rawInitiatives.filter((r) => r?.IniId).map((r) => normalizeInitiative(r, leg));
  const diplomas = rawDiplomas.filter((d) => d?.Id).map((d) => normalizeDiploma(d, leg));
  const dataAsOf = initiatives
    .flatMap((i) => i.events.map((e) => e.date))
    .reduce<string | null>((max, d) => (d && (!max || d > max) ? d : max), null);

  return { provider: "ar", initiatives, diplomas, dataAsOf };
}
