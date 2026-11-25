import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "cli/sync": "src/cli/sync.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // O pacote partilhado é TypeScript fonte: é incluído no bundle.
  noExternal: ["@estadodalei/shared"],
});
