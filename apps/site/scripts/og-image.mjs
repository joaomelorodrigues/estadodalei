#!/usr/bin/env node
/**
 * Gera public/og-image.jpg (1200×630, JPEG para ficar bem abaixo dos ~300 KB que o WhatsApp aceita): a imagem das pré-visualizações quando alguém
 * partilha um link do site (WhatsApp, Facebook, LinkedIn, X…).
 *
 * Desenha a página em HTML, com as fontes e as cores do site, e tira-lhe uma captura
 * com o Chrome em modo headless. Uso (na pasta apps/site):
 *
 *   node scripts/og-image.mjs
 *   CHROME=/caminho/para/chrome node scripts/og-image.mjs   (fora do macOS)
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "og-image.jpg");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const require = createRequire(import.meta.url);
const font = (pkg, file) => pathToFileURL(join(dirname(require.resolve(`${pkg}/package.json`)), "files", file)).href;
const figtree = font("@fontsource-variable/figtree", "figtree-latin-wght-normal.woff2");
const redHat = font("@fontsource-variable/red-hat-display", "red-hat-display-latin-wght-normal.woff2");

// As mesmas filas do hemiciclo do site (src/lib/hemicycle.ts): 230 lugares.
const ROWS = [
  { count: 16, radius: 64 },
  { count: 19, radius: 79 },
  { count: 23, radius: 94 },
  { count: 27, radius: 109 },
  { count: 31, radius: 124 },
  { count: 34, radius: 139 },
  { count: 38, radius: 154 },
  { count: 42, radius: 169 },
];
const CENTER = { x: 210, y: 184 };
const seats = ROWS.flatMap((row) =>
  Array.from({ length: row.count }, (_, i) => {
    const rad = ((174 - (i / (row.count - 1)) * 168) * Math.PI) / 180;
    return { x: CENTER.x + row.radius * Math.cos(rad), y: CENTER.y - row.radius * Math.sin(rad) };
  }),
);
const seatSvg = seats
  .map(({ x, y }) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.6" fill="url(#seat)" />`)
  .join("");

const html = `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><style>
  @font-face { font-family: "Figtree"; src: url("${figtree}") format("woff2"); font-weight: 300 900; }
  @font-face { font-family: "Red Hat Display"; src: url("${redHat}") format("woff2"); font-weight: 300 900; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    background: radial-gradient(900px 600px at 85% 110%, #3D78FF 0%, #135BFF 55%, #0E4BE0 100%);
    color: #fff;
    font-family: "Figtree", sans-serif;
  }
  .text { position: absolute; left: 76px; top: 70px; width: 720px; }
  .logo { font-family: "Red Hat Display", sans-serif; font-weight: 800; font-size: 34px; letter-spacing: -0.02em; }
  .logo span { color: #B9CEFF; }
  h1 {
    margin-top: 64px;
    font-family: "Red Hat Display", sans-serif; font-weight: 800;
    font-size: 66px; line-height: 1.04; letter-spacing: -0.035em;
  }
  p { margin-top: 28px; font-size: 27px; line-height: 1.35; font-weight: 500; color: #DCE6FF; max-width: 540px; }
  svg { position: absolute; right: -36px; bottom: -14px; width: 640px; }
</style></head><body>
  <div class="text">
    <div class="logo">estadodalei<span>.pt</span></div>
    <h1>As leis de Portugal<br />explicadas para todos</h1>
    <p>O que se discute e vota no Parlamento, em português simples e com dados oficiais.</p>
  </div>
  <svg viewBox="28 2 364 196" aria-hidden="true">
    <defs>
      <radialGradient id="seat" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset="0.55" stop-color="#E4ECFF" />
        <stop offset="1" stop-color="#9DB8FF" />
      </radialGradient>
    </defs>
    <rect x="186" y="170" width="48" height="12" rx="3" fill="#FFFFFF" opacity="0.28" />
    ${seatSvg}
  </svg>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), "og-image-"));
try {
  const page = join(dir, "og.html");
  writeFileSync(page, html);
  execFileSync(chrome, [
    "--headless=new",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1200,630",
    "--virtual-time-budget=3000",
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ], { stdio: "ignore" });
  console.log(`Imagem gerada: ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
