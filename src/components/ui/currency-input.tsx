import * as React from "react";

import { cn } from "@/lib/cn";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/currency";

interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onValueChange, disabled, ...props }, ref) => {
    return (
      <div
        className={cn(
          "flex h-10 items-center rounded-[var(--radius-md)] border border-border bg-surface",
          "transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--color-accent-ring)]",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className="border-r border-border px-3 text-xs font-medium text-text-subtle select-none">
          R$
        </span>
        <input
          {...props}
          ref={ref}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={formatCurrencyInput(value)}
          onChange={(e) => {
            onValueChange(parseCurrencyInput(e.target.value));
          }}
          className="flex-1 bg-transparent px-3 text-right font-mono text-sm tabular-nums outline-none placeholder:text-text-subtle"
          placeholder="0,00"
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
