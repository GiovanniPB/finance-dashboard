import { Search } from "lucide-react";

import { CompanySwitcher } from "./CompanySwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b border-border bg-bg/80 px-5 backdrop-blur-md">
      <CompanySwitcher />

      <div className="relative hidden max-w-md flex-1 md:flex">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
        <input
          type="search"
          placeholder="Buscar lançamentos, fornecedores…  ⌘K"
          className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-text-subtle focus:border-accent focus:ring-2 focus:ring-[var(--color-accent-ring)] focus:outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
