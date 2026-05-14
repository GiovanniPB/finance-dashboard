import * as React from "react";
import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/cn";

type Tone = "income" | "expense" | "info" | "warning" | "neutral";

interface InsightCalloutProps {
  title?: string;
  tone?: Tone;
  /** Auto-pick tone from the direction of the most relevant variation. */
  direction?: "up" | "down" | null;
  children: React.ReactNode;
  className?: string;
}

const TONE_STYLES: Record<Tone, { border: string; bg: string; text: string; icon: string }> = {
  income: {
    border: "border-income/40",
    bg: "bg-income-soft/30",
    text: "text-income",
    icon: "text-income",
  },
  expense: {
    border: "border-expense/40",
    bg: "bg-expense-soft/30",
    text: "text-expense",
    icon: "text-expense",
  },
  info: {
    border: "border-info/40",
    bg: "bg-info-soft/25",
    text: "text-info",
    icon: "text-info",
  },
  warning: {
    border: "border-warning/40",
    bg: "bg-warning-soft/25",
    text: "text-warning",
    icon: "text-warning",
  },
  neutral: {
    border: "border-border",
    bg: "bg-surface-2/40",
    text: "text-text-muted",
    icon: "text-text-muted",
  },
};

export function InsightCallout({
  title = "Insight",
  tone,
  direction = null,
  children,
  className,
}: InsightCalloutProps) {
  const resolvedTone: Tone =
    tone ?? (direction === "up" ? "income" : direction === "down" ? "expense" : "info");
  const styles = TONE_STYLES[resolvedTone];
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Lightbulb;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3",
        styles.border,
        styles.bg,
        className,
      )}
    >
      <div
        className={cn(
          "text-2xs mb-1 flex items-center gap-1.5 font-semibold tracking-wide uppercase",
          styles.text,
        )}
      >
        <Icon className={cn("size-3.5", styles.icon)} />
        {title}
      </div>
      <p className="text-sm leading-snug text-text">{children}</p>
    </div>
  );
}
