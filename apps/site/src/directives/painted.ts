import type { ClientDirective } from "astro";

/**
 * client:painted: hidrata a ilha só depois da primeira pintura com conteúdo, tal como o
 * browser a regista (o evento first-contentful-paint, quando o frame aparece no ecrã).
 *
 * Com client:load, a hidratação corria às vezes antes da primeira pintura (é uma
 * corrida com a rede e o parser), e o Lighthouse soma ao LCP todo o JavaScript que
 * começa antes dela: o LCP no móvel saltava de ~0,9 s para ~2,7 s. O HTML já vem
 * completo do servidor, por isso esperar pela pintura não muda o que se vê.
 *
 * Se o browser não suportar o evento, hidrata logo; se o evento não chegar (separador
 * em segundo plano), hidrata ao fim de FALLBACK_MS.
 */
const FALLBACK_MS = 3000;

function firstContentfulPaint(): Promise<void> {
  return new Promise((resolve) => {
    const painted = () => performance.getEntriesByName("first-contentful-paint").length > 0;
    if (!PerformanceObserver.supportedEntryTypes?.includes("paint") || painted()) return resolve();
    const observer = new PerformanceObserver(() => {
      if (!painted()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe({ type: "paint", buffered: true });
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, FALLBACK_MS);
  });
}

/** Espera que algum filho da ilha entre no ecrã (como o client:visible do Astro). */
function visible(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      resolve();
    });
    for (const child of el.children) io.observe(child);
  });
}

/**
 * client:painted          hidrata depois da primeira pintura
 * client:painted="visible" depois da primeira pintura e quando entrar no ecrã (o
 *                          client:visible sozinho dispara antes da pintura se a ilha
 *                          já estiver no primeiro ecrã)
 */
const paintedDirective: ClientDirective = async (load, options, el) => {
  await firstContentfulPaint();
  if (options.value === "visible") await visible(el);
  const hydrate = await load();
  await hydrate();
};

export default paintedDirective;
