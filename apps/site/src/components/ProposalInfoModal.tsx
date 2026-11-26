import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type React from "react";
import type { HeroProposal } from "@/data/types";
import { X } from "lucide-react";

interface ProposalInfoModalProps {
  proposal: HeroProposal;
  onClose: () => void;
}

/** Explicação da lei por cima do hemiciclo, sem sair da página. */
export const ProposalInfoModal: React.FC<ProposalInfoModalProps> = (props) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const clearText = props.proposal.kidTranslation.trim() || props.proposal.citizenSummary.trim();
  const hook = props.proposal.shortHook.trim();
  const showHook = Boolean(hook) && hook !== clearText;

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [props.onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Fechar" className="absolute inset-0 cursor-pointer bg-[#0A1D56]/45" onClick={props.onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-info-title"
        className="relative flex max-h-[min(88vh,40rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white text-[#0A1D56] shadow-[0_24px_80px_rgba(10,29,86,0.28)] sm:rounded-[28px]"
      >
        <div className="flex items-start gap-3 border-b border-[#E4ECFC] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#4C5D85]">
              {props.proposal.code}
              {props.proposal.author && props.proposal.author !== "—" ? ` · ${props.proposal.author}` : ""}
            </p>
            <h2 id="proposal-info-title" className="mt-1 font-editorial text-xl leading-snug font-extrabold">
              {props.proposal.plainTitle}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Fechar"
            onClick={props.onClose}
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#0A1D56] hover:bg-[#F1F5FF]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {showHook ? <p className="text-sm leading-relaxed text-[#4C5D85]">{hook}</p> : null}

          {clearText ? (
            <section>
              <h3 className="text-xs font-bold tracking-wider text-[#135BFF] uppercase">Em português claro</h3>
              <p className="mt-1.5 text-sm leading-relaxed">{clearText}</p>
            </section>
          ) : null}

          {props.proposal.beforeAfter.length > 0 ? (
            <section>
              <h3 className="text-xs font-bold tracking-wider text-[#135BFF] uppercase">O que muda</h3>
              <ul className="mt-2 space-y-2">
                {props.proposal.beforeAfter.map((item) => (
                  <li key={item.topic} className="rounded-2xl bg-[#FAFBFD] px-3 py-2.5">
                    <p className="text-sm font-bold">{item.topic}</p>
                    <p className="mt-1 text-[13px] leading-snug text-[#4C5D85]">{item.before}</p>
                    <p className="mt-1 text-[13px] leading-snug font-semibold">{item.after}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {props.proposal.affectedGroups.length > 0 ? (
            <section>
              <h3 className="text-xs font-bold tracking-wider text-[#135BFF] uppercase">Quem muda</h3>
              <ul className="mt-2 space-y-2">
                {props.proposal.affectedGroups.map((group) => (
                  <li key={group.groupId}>
                    <p className="text-sm font-bold">{group.label}</p>
                    <p className="text-[13px] leading-snug text-[#4C5D85]">{group.consequence}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <a
            href={props.proposal.officialLinks.parlamentoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm font-bold text-[#135BFF] hover:underline"
          >
            Ver no Parlamento
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
};
