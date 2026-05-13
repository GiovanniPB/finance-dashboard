import * as React from "react";
import { Search } from "lucide-react";

import { useCommandPalette } from "@/features/command/CommandPalette";

import { CompanySwitcher } from "./CompanySwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface Props {
  mobileMenuTrigger?: React.ReactNode;
}

export function Topbar({ mobileMenuTrigger }: Props) {
  const { open } = useCommandPalette();

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b border-border bg-bg/80 px-3 backdrop-blur-md sm:px-5">
      {mobileMenuTrigger}
      <CompanySwitcher />

      <button
        type="button"
        onClick={open}
        className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-left text-sm text-text-subtle transition-colors hover:border-border-strong md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Buscar lançamentos, navegar…</span>
        <kbd className="text-2xs rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-text-muted">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
