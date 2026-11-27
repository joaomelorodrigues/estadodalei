// Tipo da diretiva client:painted (registada em astro.config.mjs; ver painted.ts).
declare module "astro" {
  interface AstroClientDirectives {
    "client:painted"?: boolean | "visible";
  }
}

export {};
