import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "text-2xs inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
  {
    variants: {
      tone: {
        default: "border border-border bg-surface-2 text-text-muted",
        accent: "bg-accent-soft text-accent",
        income: "bg-income-soft text-income",
        expense: "bg-expense-soft text-expense",
        warning: "bg-warning-soft text-warning",
        info: "bg-info-soft text-info",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
