import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap border",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-foreground",
        outline: "border-border text-muted-foreground bg-white",
        approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
        promulgated: "border-blue-200 bg-blue-50 text-[#0B3EC2]",
        voting: "border-orange-200 bg-orange-50 text-orange-800",
        committee: "border-border bg-secondary text-muted-foreground",
        rejected: "border-red-200 bg-red-50 text-red-700",
        positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
        warning: "border-orange-200 bg-orange-50 text-orange-800",
        neutral: "border-border bg-secondary text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
