import * as React from "react";

import { cn } from "@/lib/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm",
      "transition-colors placeholder:text-text-subtle",
      "focus:border-accent focus:ring-2 focus:ring-[var(--color-accent-ring)] focus:outline-none",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "resize-y",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
