import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/data/groups";
import type { ProposalStatus } from "@/data/types";
import {
  Ban,
  CheckCircle2,
  Clock,
  FileCheck2,
  MessageSquareText,
  Undo2,
  XCircle,
} from "lucide-react";

interface StatusBadgeProps {
  status: ProposalStatus;
  compact?: boolean;
}

const ICONS: Record<ProposalStatus, typeof Clock> = {
  promulgated: FileCheck2,
  approved: CheckCircle2,
  voting: Clock,
  committee: MessageSquareText,
  rejected: XCircle,
  withdrawn: Undo2,
  vetoed: Ban,
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];

  return (
    <Badge variant={meta.badgeVariant} className="font-medium" title={meta.description}>
      <Icon className="size-3.5 shrink-0" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </Badge>
  );
}
