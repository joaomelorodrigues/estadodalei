import { config } from "../config.js";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
  }
}

interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

/** GET com timeout e novas tentativas com espera crescente. Devolve o corpo como texto. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 60_000, retries = 3, accept = "*/*" } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": config.SYNC_USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, url);
      return await res.text();
    } catch (err) {
      lastError = err;
      // 4xx (exceto 429) não melhora com novas tentativas.
      const fatal = err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429;
      if (fatal || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  // Aceitar qualquer formato: o servidor de ficheiros da AR responde 406 a "application/json" de forma intermitente.
  const text = (await fetchText(url, { accept: "application/json, text/plain;q=0.9, */*;q=0.8", ...opts })).replace(/^﻿/, "");
  // Uma página de erro em HTML pode chegar com 200 (ex.: depois de um redirecionamento).
  if (/^\s*</.test(text)) throw new Error(`resposta HTML em vez de JSON (${new URL(url).host})`);
  // Os ficheiros da AR vêm com BOM UTF-8 (removido acima).
  return JSON.parse(text) as T;
}

/** Decodifica as entidades HTML mais comuns (suficiente para atributos href). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export interface HtmlLink {
  href: string;
  text: string;
  title: string | null;
}

/** Extrai as ligações <a> de uma página HTML. */
export function extractLinks(html: string, baseUrl: string): HtmlLink[] {
  const links: HtmlLink[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[1] ?? "";
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    if (!href) continue;
    const title = /\btitle\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? null;
    const text = decodeEntities((m[2] ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    try {
      links.push({ href: new URL(decodeEntities(href), baseUrl).toString(), text, title: title && decodeEntities(title) });
    } catch {
      // href inválido: ignorar
    }
  }
  return links;
}
