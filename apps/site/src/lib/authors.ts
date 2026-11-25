import { AUTHOR_TYPE_LABELS } from "@/data/groups";

/** Nomes curtos para autores que não são partidos (os partidos já vêm em sigla). */
export const SHORT_AUTHOR_LABELS: Record<string, string> = {
  Governo: "Governo",
  "Assembleia Legislativa da Região Autónoma da Madeira": "Assembleia Legislativa da Madeira",
  "Assembleia Legislativa da Região Autónoma dos Açores": "Assembleia Legislativa dos Açores",
  Cidadãos: "Cidadãos (iniciativa legislativa)",
  Deputados: "Deputados a título individual",
  Comissões: "Comissões parlamentares",
  ...AUTHOR_TYPE_LABELS,
};

/** Autor curto para mostrar junto a um título; null quando é desconhecido. */
export function shortAuthor(author: string | null | undefined): string | null {
  if (!author || author === "—") return null;
  return SHORT_AUTHOR_LABELS[author] ?? author;
}
