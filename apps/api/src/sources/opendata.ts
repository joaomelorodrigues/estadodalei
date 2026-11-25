/**
 * Fonte de reserva: open-data.pt — espelho normalizado (não oficial) dos
 * Dados Abertos da AR, com API REST paginada. Usado quando a fonte oficial falha.
 * Não liga diplomas a iniciativas; essas ligações ficam como estavam na base de dados.
 */
import { fetchJson } from "./http.js";
import type { NDiploma, NEvent, NInitiative, NPublication, NVote, NVoteSide, ParliamentSnapshot } from "./types.js";

const BASE = "https://open-data.pt/api/products";

interface OdPage<T> {
  data: T[];
  nextCursor?: string | null;
}

interface OdPublication {
  type?: string | null;
  number?: string | null;
  date?: string | null;
  official_url?: string | null;
}

interface OdInitiative {
  id: string;
  number?: string | null;
  type_code?: string | null;
  type?: string | null;
  title?: string | null;
  legislature?: string | null;
  session?: string | null;
  author_groups?: string[] | null;
  author_deputies?: { person_id?: string | null; name?: string | null; group?: string | null }[] | null;
  author_type?: { name?: string | null } | null;
  text_url?: string | null;
  origin_ids?: string[] | null;
  originated_ids?: string[] | null;
}

interface OdEvent {
  id: string;
  initiative_id: string;
  phase_code?: string | null;
  phase?: string | null;
  date?: string | null;
  observation?: string | null;
  committees?: { id?: string | null; name?: string | null; competent?: boolean | null }[] | null;
  publications?: OdPublication[] | null;
}

interface OdVoteSide {
  group?: string | null;
  count?: number | null;
  deputy?: string | null;
}

interface OdVote {
  id: string;
  initiative_id: string;
  event_id?: string | null;
  phase?: string | null;
  date?: string | null;
  body?: string | null;
  committee?: string | null;
  meeting?: string | null;
  result?: string | null;
  unanimous?: boolean | null;
  description?: string | null;
  in_favour?: OdVoteSide[] | null;
  against?: OdVoteSide[] | null;
  abstention?: OdVoteSide[] | null;
  absent?: OdVoteSide[] | null;
  publications?: OdPublication[] | null;
}

interface OdDiploma {
  id: string;
  title?: string | null;
  number?: string | null;
  second_number?: string | null;
  type?: string | null;
  civil_year?: string | null;
  legislature?: string | null;
  session?: string | null;
  text_url?: string | null;
  publications?: OdPublication[] | null;
}

/** Há registos para este produto? (usado para detetar uma legislatura nova). */
export async function hasRecords(slug: string): Promise<boolean> {
  try {
    const res = await fetchJson<OdPage<unknown>>(`${BASE}/${slug}/records?limit=1`, { retries: 1 });
    return Array.isArray(res.data) && res.data.length > 0;
  } catch {
    return false;
  }
}

export async function fetchAll<T>(slug: string): Promise<T[]> {
  const records: T[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < 1_000; page++) {
    const url = `${BASE}/${slug}/records?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetchJson<OdPage<T>>(url);
    if (!Array.isArray(res.data)) throw new Error(`open-data.pt: resposta inesperada em ${slug}`);
    records.push(...res.data);
    cursor = res.nextCursor;
    if (!cursor || res.data.length === 0) return records;
  }
  throw new Error(`open-data.pt: paginação sem fim em ${slug}`);
}

const clean = (v: string | null | undefined) => {
  const s = v?.replace(/\s+/g, " ").trim();
  return s ? s : null;
};
const toInt = (v: string | null | undefined) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : null;
};

const pubs = (list: OdPublication[] | null | undefined): NPublication[] =>
  (list ?? []).map((p) => ({ type: clean(p.type), number: clean(p.number), date: clean(p.date), url: clean(p.official_url) }));

const sides = (list: OdVoteSide[] | null | undefined): NVoteSide[] =>
  (list ?? [])
    .filter((s) => clean(s.group))
    .map((s) => ({
      group: clean(s.group)!,
      ...(typeof s.count === "number" ? { count: s.count } : {}),
      ...(clean(s.deputy) ? { deputy: clean(s.deputy)! } : {}),
    }));

export async function fetchParliamentFromOpenData(legislature: string): Promise<ParliamentSnapshot> {
  const leg = legislature.toLowerCase();
  const [rawInitiatives, rawEvents, rawVotes, rawDiplomas] = await Promise.all([
    fetchAll<OdInitiative>(`parliament-initiatives-${leg}-initiatives`),
    fetchAll<OdEvent>(`parliament-initiatives-${leg}-events`),
    fetchAll<OdVote>(`parliament-initiatives-${leg}-votes`),
    fetchAll<OdDiploma>(`parliament-diplomas-${leg}`),
  ]);
  if (rawInitiatives.length === 0) throw new Error("open-data.pt: sem iniciativas");

  const eventsByIni = new Map<string, NEvent[]>();
  for (const e of rawEvents) {
    const list = eventsByIni.get(e.initiative_id) ?? [];
    list.push({
      id: e.id,
      code: clean(e.phase_code),
      phase: clean(e.phase) ?? "Evento",
      date: clean(e.date),
      observation: clean(e.observation),
      committees: (e.committees ?? [])
        .filter((c) => clean(c.name))
        .map((c) => ({ id: clean(c.id), name: clean(c.name)!, competent: !!c.competent })),
      publications: pubs(e.publications),
      approvedTextIds: [],
    });
    eventsByIni.set(e.initiative_id, list);
  }

  const votesByIni = new Map<string, NVote[]>();
  for (const v of rawVotes) {
    // Só votações em Plenário, como na fonte oficial.
    if (v.body && v.body !== "plenary") continue;
    const list = votesByIni.get(v.initiative_id) ?? [];
    list.push({
      id: v.id,
      eventId: clean(v.event_id),
      phase: clean(v.phase) ?? "Votação",
      date: clean(v.date),
      body: "plenary",
      committee: clean(v.committee),
      meeting: clean(v.meeting),
      result: clean(v.result) ?? "Desconhecido",
      unanimous: !!v.unanimous,
      description: clean(v.description),
      inFavour: sides(v.in_favour),
      against: sides(v.against),
      abstention: sides(v.abstention),
      absent: sides(v.absent),
      publications: pubs(v.publications),
    });
    votesByIni.set(v.initiative_id, list);
  }

  const initiatives: NInitiative[] = rawInitiatives.map((r) => ({
    id: r.id,
    legislature: clean(r.legislature) ?? legislature,
    session: toInt(r.session),
    typeCode: clean(r.type_code) ?? "?",
    type: clean(r.type) ?? "Iniciativa",
    number: toInt(r.number),
    title: clean(r.title) ?? "(sem título)",
    authorType: clean(r.author_type?.name),
    authorGroups: [...new Set((r.author_groups ?? []).map(clean).filter((g): g is string => !!g))],
    authorDeputies: (r.author_deputies ?? [])
      .filter((d) => clean(d.name))
      .map((d) => ({ id: clean(d.person_id), name: clean(d.name)!, group: clean(d.group) })),
    textUrl: clean(r.text_url),
    originIds: r.origin_ids ?? [],
    originatedIds: r.originated_ids ?? [],
    events: eventsByIni.get(r.id) ?? [],
    votes: votesByIni.get(r.id) ?? [],
  }));

  const diplomas: NDiploma[] = rawDiplomas.map((d) => ({
    id: d.id,
    type: clean(d.type) ?? "Diploma",
    number: clean(d.number),
    secondNumber: clean(d.second_number),
    year: toInt(d.civil_year),
    title: clean(d.title) ?? "(sem título)",
    legislature: clean(d.legislature) ?? legislature,
    session: toInt(d.session),
    textUrl: clean(d.text_url),
    publications: pubs(d.publications),
    // initiativeIds: desconhecido nesta fonte
  }));

  const dataAsOf = rawEvents.reduce<string | null>((max, e) => (e.date && (!max || e.date > max) ? e.date : max), null);
  return { provider: "opendata", initiatives, diplomas, dataAsOf };
}
