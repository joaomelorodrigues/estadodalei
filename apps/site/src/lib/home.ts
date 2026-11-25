import type { HighlightDTO, HighlightsDTO, TodayDTO } from "@estadodalei/shared";
import type { Takeaway } from "@/components/FriendlyHomeClient";
import { toProposal, voteSummary } from "@/lib/adapt";
import { formatDate } from "@/lib/format";

function fromHighlight(h: HighlightDTO, kind: "approved" | "rejected"): Takeaway {
  const p = toProposal(h.initiative, h.keyVote);
  const date = p.votes?.date ? formatDate(p.votes.date) : null;
  const tag =
    kind === "rejected"
      ? `Chumbada${date ? ` a ${date}` : ""}`
      : p.status === "promulgated"
        ? `Publicada${date ? ` · aprovada a ${date}` : ""}`
        : `Aprovada${date ? ` a ${date}` : ""}`;
  return {
    kind,
    tag,
    title: p.plainTitle,
    detail: p.explained ? p.shortHook : voteSummary(p.votes) || p.shortHook,
    href: "/",
    cta: p.explained ? "Ler em português simples" : "Ver percurso e votações",
  };
}

/** Três destaques do dia: última lei aprovada, ato do Diário da República, última lei chumbada. */
export function buildTakeaways(highlights: HighlightsDTO, dre: TodayDTO["dre"]): Takeaway[] {
  const out: Takeaway[] = [];

  const approved = highlights.approved.find((h) => h.initiative.status === "aprovada") ?? highlights.approved[0];
  if (approved) out.push(fromHighlight(approved, "approved"));

  const act = dre.acts[0];
  if (act) {
    const iniId = act.initiativeIds[0];
    out.push({
      kind: "published",
      tag: `Diário da República · ${formatDate(act.date ?? dre.date)}`,
      title: act.title,
      detail: act.summary,
      href: act.url,
      external: !iniId,
      cta: iniId ? "Ver percurso no Parlamento" : "Ler no Diário da República",
    });
  } else {
    const published = highlights.approved.find((h) => h.initiative.status === "publicada");
    if (published) out.push({ ...fromHighlight(published, "approved"), kind: "published" });
  }

  const rejected = highlights.rejected[0];
  if (rejected) out.push(fromHighlight(rejected, "rejected"));
  return out;
}
