import { cn } from "@/lib/cn";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Toggle acessível e simples (não há primitivo de switch no projeto). */
export function FieldToggle({ checked, onChange, label, description, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-left transition-colors",
        "hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span>
        <span className="block text-sm font-medium text-text">{label}</span>
        {description && (
          <span className="text-2xs mt-0.5 block text-text-subtle">{description}</span>
        )}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
