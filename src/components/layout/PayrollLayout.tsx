import { NavLink, Outlet } from "react-router-dom";

import { cn } from "@/lib/cn";

const NAV = [
  { to: "/payroll/runs", label: "Folhas mensais" },
  { to: "/payroll/employees", label: "Colaboradores" },
] as const;

export function PayrollLayout() {
  return (
    <div className="mx-auto max-w-[var(--content-max-width)] p-6 lg:p-8">
      <div className="mb-6">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          Folha de Pagamento
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Gestão de folha</h1>
        <p className="mt-1 text-sm text-text-muted">
          Cadastre colaboradores e gere as folhas mensais. O posting cria automaticamente os
          lançamentos contábeis.
        </p>
      </div>

      <div className="mb-5 flex items-center gap-1 border-b border-border">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
