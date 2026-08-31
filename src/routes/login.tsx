import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [resetSending, setResetSending] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Preserva a URL inteira de origem, não só o pathname: um deep link como
  // /oauth/consent?authorization_id=… perde o sentido sem a query string.
  const origem = (
    location.state as { from?: { pathname: string; search?: string; hash?: string } } | null
  )?.from;
  const destino = origem ? `${origem.pathname}${origem.search ?? ""}${origem.hash ?? ""}` : "/";

  if (session) {
    return <Navigate to={destino} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const { error } = await signIn(values.email, values.password);
    if (error) {
      setSubmitError(traduzirErro(error));
      return;
    }
    void navigate(destino, { replace: true });
  });

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-2">
      {/* Painel hero */}
      <div className="bento-mesh relative hidden items-end p-12 lg:flex">
        <div className="surface-gradient-brand absolute inset-6 rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]" />
        <div className="relative z-10 text-white">
          <p className="text-display font-display leading-[1.05] font-semibold text-balance">
            Visão financeira
            <br />
            de todo o grupo,
            <br />
            em um só lugar.
          </p>
          <p className="mt-4 max-w-md text-sm opacity-90">
            DRE, fluxo de caixa, folha e KPIs em tempo real — consolidados ou por empresa.
          </p>
          <div className="mt-8 flex gap-2">
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              OTM Holding
            </div>
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              OTM Assessoria
            </div>
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              OTM Corretora
            </div>
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              RCO Tecnologia
            </div>
          </div>
        </div>
      </div>

      {/* Painel form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="surface-gradient-brand grid h-9 w-9 place-items-center rounded-[var(--radius-md)] shadow-[var(--shadow-accent)]">
              <span className="text-sm font-bold text-white">F</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold">Finance Dashboard</span>
              <span className="text-2xs text-text-subtle">OTM Group</span>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-text-muted">
            Entre com seu e-mail corporativo para acessar o painel financeiro.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="voce@otmgroup.com.br"
                {...register("email")}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-2xs text-expense">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <p className="text-2xs text-expense">{errors.password.message}</p>
              )}
            </div>

            {submitError && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-expense)]/20 bg-expense-soft px-3 py-2 text-xs text-expense">
                {submitError}
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </form>

          <button
            type="button"
            disabled={resetSending}
            onClick={async () => {
              const email = (
                document.getElementById("email") as HTMLInputElement | null
              )?.value?.trim();
              if (!email) {
                toast.error("Informe seu email no campo acima primeiro");
                return;
              }
              setResetSending(true);
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setResetSending(false);
              if (error) {
                toast.error("Erro", { description: error.message });
                return;
              }
              toast.success("Link enviado", {
                description: `Verifique a caixa de entrada de ${email}.`,
              });
            }}
            className="mt-8 text-xs text-text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-50"
          >
            {resetSending ? "Enviando link…" : "Esqueceu a senha? Receber link por email"}
          </button>
        </div>
      </div>
    </div>
  );
}

function traduzirErro(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar.";
  return msg;
}
