import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  Building2,
  FileBarChart,
  LayoutDashboard,
  Repeat,
  Settings,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Lançamentos", icon: ArrowLeftRight },
  { to: "/dre", label: "DRE", icon: FileBarChart },
  { to: "/cashflow", label: "Fluxo de Caixa", icon: TrendingUp },
  { to: "/payroll", label: "Folha", icon: Users },
  { to: "/recurring", label: "Recorrências", icon: Repeat },
  { to: "/import", label: "Importar", icon: Upload },
];

const adminItems: NavItem[] = [
  { to: "/companies", label: "Empresas", icon: Building2 },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-[var(--topbar-height)] items-center gap-2.5 border-b border-border px-5">
        <div className="surface-gradient-brand grid h-8 w-8 place-items-center rounded-[var(--radius-md)] shadow-[var(--shadow-accent)]">
          <span className="text-sm font-bold text-white">F</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-semibold">Finance</span>
          <span className="text-2xs text-text-subtle">OTM Group</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={navLinkClass}>
                <item.icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="text-2xs mt-6 px-2 pt-3 pb-2 font-medium tracking-wide text-text-subtle uppercase">
          Administração
        </div>
        <ul className="space-y-0.5">
          {adminItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={navLinkClass}>
                <item.icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-[var(--radius-md)] bg-accent-soft px-3 py-3 text-xs">
          <p className="font-medium text-accent">Em desenvolvimento</p>
          <p className="mt-0.5 leading-snug text-text-muted">
            Schema completo no Supabase. Frontend nas fundações.
          </p>
        </div>
      </div>
    </aside>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
    isActive ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-2 hover:text-text",
  );
}
