/**
 * Cliente da API para o servidor Astro (SSR). No browser usa-se fetch("/api/...") diretamente.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const API_URL = (env.API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  // /status usa 503 para "dados atrasados", mas o corpo é a resposta útil.
  if (!res.ok && !(res.status === 503 && path.startsWith("/status"))) {
    throw new ApiError(res.status, `API ${res.status} em ${path}`);
  }
  return (await res.json()) as T;
}
