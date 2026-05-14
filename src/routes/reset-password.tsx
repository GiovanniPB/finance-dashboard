import * as React from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<Status>("checking");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    // Supabase auto-processes the recovery token in the URL hash on page load.
    // We listen for the PASSWORD_RECOVERY event to confirm the session is ready.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
      } else if (session) {
        setStatus("ready");
      }
    });

    // Fallback: if no event arrives within 2s and there's no recovery hash, mark invalid.
    const timeout = setTimeout(() => {
      const hash = window.location.hash;
      if (!hash.includes("type=recovery") && !hash.includes("access_token")) {
        setStatus("invalid");
      }
    }, 2000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Senha deve ter ao menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("Erro ao redefinir senha", { description: error.message });
      return;
    }
    setStatus("done");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
            <KeyRound className="size-5" />
          </div>

          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="size-4 animate-spin" />
              Validando link…
            </div>
          )}

          {status === "invalid" && (
            <>
              <h1 className="font-display text-xl font-semibold">Link inválido ou expirado</h1>
              <p className="text-sm text-text-muted">
                Solicite um novo link de redefinição de senha na página de perfil ou pelo login.
              </p>
              <Button onClick={() => void navigate("/login")}>Voltar ao login</Button>
            </>
          )}

          {status === "ready" && (
            <>
              <div>
                <h1 className="font-display text-xl font-semibold">Definir nova senha</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Escolha uma senha forte. Mínimo 8 caracteres.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Nova senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirmar senha</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" disabled={submitting || !password} className="w-full">
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Redefinir senha
                </Button>
              </form>
            </>
          )}

          {status === "done" && (
            <>
              <div className="grid size-10 place-items-center rounded-full bg-income-soft text-income">
                <CheckCircle2 className="size-5" />
              </div>
              <h1 className="font-display text-xl font-semibold">Senha redefinida</h1>
              <p className="text-sm text-text-muted">Você já pode entrar com sua nova senha.</p>
              <Button onClick={() => void navigate("/")} className="w-full">
                Ir para o dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
