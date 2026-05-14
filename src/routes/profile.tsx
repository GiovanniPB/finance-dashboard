import * as React from "react";
import { LogOut, Mail, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { roleLabel, usePermissions, type UserRole } from "@/features/auth/usePermissions";
import { useCompanies } from "@/features/companies/hooks";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { role, isLoading: roleLoading } = usePermissions();
  const { data: companies = [] } = useCompanies();

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [changing, setChanging] = React.useState(false);
  const [sendingReset, setSendingReset] = React.useState(false);

  async function handleChangePassword(e: React.SyntheticEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Senha deve ter ao menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChanging(false);
    if (error) {
      toast.error("Erro ao trocar senha", { description: error.message });
      return;
    }
    toast.success("Senha alterada com sucesso");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSendResetEmail() {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast.error("Erro ao enviar email", { description: error.message });
      return;
    }
    toast.success("Email enviado", {
      description: `Verifique a caixa de entrada de ${user.email}.`,
    });
  }

  if (roleLoading || !user) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  const userRole: UserRole = role ?? "viewer";

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 lg:p-8">
      <div>
        <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
          <User className="size-3 text-accent" />
          Minha conta
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Perfil</h1>
        <p className="mt-1 text-sm text-text-muted">
          Suas informações de acesso e configurações de segurança.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
              <User className="size-5" />
            </div>
            <div className="flex-1">
              <div className="font-medium">{user.user_metadata?.full_name ?? "—"}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                <Mail className="size-3" />
                {user.email}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                Nível de permissão
              </div>
              <Badge tone={userRole === "super_admin" ? "accent" : "info"} className="mt-1">
                {userRole === "super_admin" && <ShieldCheck className="size-3" />}
                {roleLabel(userRole)}
              </Badge>
            </div>
            <div>
              <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                Empresas acessíveis
              </div>
              <div className="mt-1 text-sm">
                {userRole === "super_admin"
                  ? "Todas (super admin)"
                  : companies.length === 0
                    ? "—"
                    : `${companies.length} empresa(s)`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-base font-semibold">Trocar senha</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Defina uma nova senha diretamente ou receba um link de redefinição por email.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={changing || !newPassword}>
                {changing ? "Salvando…" : "Salvar nova senha"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendResetEmail}
                disabled={sendingReset}
              >
                <Mail className="size-4" />
                {sendingReset ? "Enviando…" : "Receber link por email"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <h2 className="font-display text-base font-semibold">Encerrar sessão</h2>
            <p className="mt-0.5 text-xs text-text-muted">Sai da conta atual neste navegador.</p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
            }}
            className="text-expense hover:bg-expense-soft hover:text-expense"
          >
            <LogOut className="size-4" /> Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
