import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DATA_MODULES,
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
  type DataModule,
} from "@/features/auth/modules";
import { useAllCompanies } from "@/features/companies/hooks";

import type { UserWithAccess } from "../api";
import { useCreateUser, useUpdateUser } from "../hooks";
import { emptyUserForm, USER_ROLES, userFormSchema, type UserFormValues } from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithAccess | null;
}

export function UserDrawer({ open, onOpenChange, user }: Props) {
  const isEditing = Boolean(user);
  const create = useCreateUser();
  const update = useUpdateUser();
  const { data: companies = [] } = useAllCompanies();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<UserFormValues>(() => {
    if (user) {
      return {
        fullName: user.full_name ?? "",
        email: user.email ?? "",
        role: user.role ?? "viewer",
        password: "",
        companyIds: user.company_ids,
        visibleModules: user.visible_modules ?? [],
      };
    }
    return emptyUserForm();
  }, [user]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const watchedRole = watch("role");
  const watchedCompanyIds = watch("companyIds");
  const watchedModules = watch("visibleModules");

  function toggleCompany(id: string) {
    const set = new Set(watchedCompanyIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    reset({ ...watch(), companyIds: Array.from(set) }, { keepDirty: true });
  }

  function toggleModule(mod: DataModule) {
    const set = new Set(watchedModules);
    if (set.has(mod)) set.delete(mod);
    else set.add(mod);
    reset({ ...watch(), visibleModules: Array.from(set) }, { keepDirty: true });
  }

  const onSubmit = handleSubmit((values) => {
    // Lista vazia = sem restrição de módulo (NULL no banco = enxerga tudo).
    const visibleModules = values.visibleModules.length > 0 ? values.visibleModules : null;
    if (isEditing && user) {
      update.mutate(
        {
          user_id: user.id,
          full_name: values.fullName,
          role: values.role,
          company_ids: values.companyIds,
          new_password: values.password ?? undefined,
          visible_modules: visibleModules,
        },
        {
          onSuccess: () => {
            toast.success("Usuário atualizado");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
    } else {
      if (!values.password) {
        toast.error("Senha obrigatória para criar usuário");
        return;
      }
      create.mutate(
        {
          email: values.email,
          password: values.password,
          full_name: values.fullName,
          role: values.role,
          company_ids: values.companyIds,
          visible_modules: visibleModules,
        },
        {
          onSuccess: () => {
            toast.success("Usuário criado", {
              description: "Senha temporária enviada — peça para o usuário fazer login.",
            });
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao criar", { description: err.message }),
        },
      );
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar usuário" : "Novo usuário"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Atualize nome, role, empresas ou redefina a senha."
              : "Defina email, senha temporária, role e empresas que o usuário poderá acessar."}
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={user?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input id="fullName" {...register("fullName")} />
              {errors.fullName && (
                <p className="text-2xs text-expense">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" disabled={isEditing} {...register("email")} />
              {errors.email && <p className="text-2xs text-expense">{errors.email.message}</p>}
              {isEditing && (
                <p className="text-2xs text-text-subtle">Email não pode ser alterado.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">
                {isEditing ? (
                  <>
                    Nova senha <span className="text-text-subtle">(opcional)</span>
                  </>
                ) : (
                  "Senha temporária"
                )}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={isEditing ? "Deixe em branco para manter" : "Mínimo 8 caracteres"}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-2xs text-expense">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Nível de permissão</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-2xs text-text-subtle">
                {USER_ROLES.find((r) => r.value === watchedRole)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Empresas que pode acessar</Label>
                {watchedRole === "super_admin" && (
                  <span className="text-2xs text-text-subtle">
                    Super admin vê tudo independentemente
                  </span>
                )}
              </div>
              <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-surface-2/30 p-3">
                {companies.length === 0 ? (
                  <p className="text-xs text-text-subtle">Nenhuma empresa cadastrada.</p>
                ) : (
                  companies.map((c) => {
                    const checked = watchedCompanyIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCompany(c.id)}
                          className="size-4 cursor-pointer accent-accent"
                        />
                        <span className="flex-1">{c.trade_name ?? c.legal_name}</span>
                        {!c.is_active && (
                          <span className="text-2xs text-text-subtle">(inativa)</span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
              {errors.companyIds && (
                <p className="text-2xs text-expense">{errors.companyIds.message}</p>
              )}
            </div>

            {watchedRole !== "super_admin" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Módulos que pode visualizar</Label>
                  {watchedModules.length === 0 && (
                    <span className="text-2xs text-text-subtle">Vazio = todos os módulos</span>
                  )}
                </div>
                <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-surface-2/30 p-3">
                  {DATA_MODULES.map((mod) => {
                    const checked = watchedModules.includes(mod);
                    return (
                      <label
                        key={mod}
                        className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModule(mod)}
                          className="mt-0.5 size-4 cursor-pointer accent-accent"
                        />
                        <span className="flex-1">
                          <span className="block font-medium">{MODULE_LABELS[mod]}</span>
                          <span className="text-2xs text-text-subtle">
                            {MODULE_DESCRIPTIONS[mod]}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {watchedRole === "viewer" && (
                  <p className="text-2xs text-text-subtle">
                    Visualizador é somente leitura — ideal para contabilidades. Marque apenas os
                    módulos que este usuário deve enxergar.
                  </p>
                )}
              </div>
            )}
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (isEditing && !isDirty)}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar usuário"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
