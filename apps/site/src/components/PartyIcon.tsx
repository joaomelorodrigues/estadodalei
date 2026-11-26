/**
 * Símbolos públicos dos partidos, só para os identificar.
 * Origem: Wikimedia Commons (domínio público, salvo o JPP: Oijohnny, CC BY-SA 4.0).
 * O logótipo do PS é o publicado pelo partido em ps.pt.
 */
const PARTY_ICON: Record<string, string> = {
  PSD: "/parties/psd.svg",
  PS: "/parties/ps.png",
  CH: "/parties/ch.svg",
  IL: "/parties/il.png",
  L: "/parties/livre.svg",
  PCP: "/parties/pcp.svg",
  "CDS-PP": "/parties/cds.svg",
  BE: "/parties/be.svg",
  PAN: "/parties/pan.png",
  JPP: "/parties/jpp.svg",
};

/** Partidos com símbolo disponível. */
export const PARTY_ICONS = new Set(Object.keys(PARTY_ICON));

export function PartyIcon({ code }: { code: string }) {
  const src = PARTY_ICON[code];
  if (!src) return null;
  // loading="lazy": o React deixa de os pré-carregar no início da página (competiam com o primeiro ecrã).
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="max-h-full max-w-full object-contain object-center"
    />
  );
}
