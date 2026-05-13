import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-2xs font-medium tracking-wide text-text-subtle uppercase">404</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="max-w-md text-sm text-text-muted">
        A rota que você acessou não existe ou foi movida.
      </p>
      <Button asChild>
        <Link to="/">Voltar à visão geral</Link>
      </Button>
    </div>
  );
}
