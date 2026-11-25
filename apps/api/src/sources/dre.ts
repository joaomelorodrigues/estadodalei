/**
 * Diário da República — RSS da 1.ª Série ("Diário do Dia").
 * O feed só contém os atos do dia; a sincronização regular acumula o histórico.
 */
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./http.js";
import type { NDreAct } from "./types.js";

export const DRE_SERIE1_RSS = "https://files.diariodarepublica.pt/rss/serie1-html.xml";

const ISSUER_PREFIX =
  /^(Assembleia|Presidência|Ministério|Ministérios|Região|Regiões|Tribunal|Supremo|Conselho|Banco|Provedoria|Comissão|Entidade|Secretaria|Gabinete)\b/;

// Verbos com que os sumários do DR costumam começar, para separar o emissor do sumário.
const SUMMARY_START =
  /\s(Altera|Aprova|Procede|Estabelece|Determina|Autoriza|Cria|Regulamenta|Fixa|Define|Declara|Retifica|Nomeia|Exonera|Ratifica|Transpõe|Prorroga|Designa|Homologa|Confirma|Concede|Atribui|Revoga|Suspende|Publica|Torna|Recomenda|Assegura|Adapta|Reconhece|Classifica|Identifica|Delega|Extingue|Reduz|Aumenta|Prevê|Promove|Consagra|Institui|Clarifica|Regula|Completa|Introduz|Reforça|Simplifica|Elimina|Adota|Atualiza|Integra|Deslocação|Primeira|Segunda|Terceira|Quarta|Quinta|Sexta|Sétima|Oitava|Nona|Décima)\b/;

function splitIssuer(description: string): { issuer: string | null; summary: string } {
  const text = description.replace(/\s+/g, " ").trim();
  if (!ISSUER_PREFIX.test(text)) return { issuer: null, summary: text };
  const m = SUMMARY_START.exec(text);
  if (!m || m.index > 200) return { issuer: null, summary: text };
  return { issuer: text.slice(0, m.index).trim(), summary: text.slice(m.index).trim() };
}

export function parseDreTitle(title: string) {
  const [head = "", tail = ""] = title.split(/\s+-\s+(?=Diário da República)/);
  const act = /^(.*?)\s+n\.º\s+(\S+)$/.exec(head.trim());
  return {
    actType: (act?.[1] ?? head).trim(),
    number: act?.[2] ?? null,
    drNumber: /n\.º\s+(\S+?),/.exec(tail)?.[1] ?? null,
    date: /(\d{4}-\d{2}-\d{2})/.exec(tail)?.[1] ?? null,
    heading: head.trim(),
  };
}

interface RssItem {
  title?: string;
  description?: string | { "#text"?: string };
  link?: string;
}

export async function fetchDreSerie1(): Promise<NDreAct[]> {
  const xml = await fetchText(DRE_SERIE1_RSS, { accept: "application/rss+xml, application/xml, text/xml" });
  const parser = new XMLParser({ ignoreAttributes: true, cdataPropName: false, trimValues: true });
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const raw = doc.rss?.channel?.item;
  if (raw === undefined && !xml.includes("<channel")) throw new Error("DR: RSS com formato inesperado");
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const acts = new Map<string, NDreAct>();
  for (const item of items) {
    const url = String(item.link ?? "").trim();
    const title = String(item.title ?? "").replace(/\s+/g, " ").trim();
    if (!url || !title) continue;
    const description = typeof item.description === "string" ? item.description : (item.description?.["#text"] ?? "");
    const id = /-(\d+)\/?$/.exec(url)?.[1] ?? url;
    const parsed = parseDreTitle(title);
    const { issuer, summary } = splitIssuer(description);
    acts.set(id, {
      id,
      actType: parsed.actType,
      number: parsed.number,
      title: parsed.heading,
      issuer,
      summary,
      date: parsed.date,
      drNumber: parsed.drNumber,
      url,
    });
  }
  return [...acts.values()];
}
