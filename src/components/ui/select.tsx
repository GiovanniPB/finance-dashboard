import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Whether to render with the "filter chip" compact style */
  compact?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, compact, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "appearance-none rounded-[var(--radius-md)] border border-border bg-surface pr-8 pl-3 text-sm",
          "text-text transition-colors outline-none",
          "focus:border-accent focus:ring-2 focus:ring-[var(--color-accent-ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "h-8" : "h-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-text-subtle" />
    </div>
  ),
);
Select.displayName = "Select";
