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
import { Textarea } from "@/components/ui/textarea";

import type { ChartAccount } from "../api";
import { useCreateChartAccount, useUpdateChartAccount } from "../hooks";
import {
  ACCOUNT_KINDS,
  chartAccountFormSchema,
  DRE_SECTIONS,
  emptyChartAccountForm,
  SIGN_HINTS,
  type ChartAccountFormValues,
} from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ChartAccount | null;
  companyId: string;
  allAccounts: ChartAccount[];
}

function normalizeSignHint(value: string | null): "+" | "-" | "=" | null {
  if (value === "+" || value === "-" || value === "=") return value;
  return null;
}

export function ChartAccountDrawer({ open, onOpenChange, account, companyId, allAccounts }: Props) {
  const isEditing = Boolean(account);
  const isSystem = Boolean(account?.master_account_id);
  const create = useCreateChartAccount();
  const update = useUpdateChartAccount();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<ChartAccountFormValues>(() => {
    if (account) {
      return {
        companyId: account.company_id,
        code: account.code,
        name: account.name,
        kind: account.kind,
        dreSection: account.dre_section,
        parentId: account.parent_id,
        signHint: normalizeSignHint(account.sign_hint),
        sortOrder: account.sort_order,
        isSummary: account.is_summary,
        belowTheLine: account.below_the_line,
        isActive: account.is_active,
        notes: account.notes,
      };
    }
    return emptyChartAccountForm(companyId);
  }, [account, companyId]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ChartAccountFormValues>({
    resolver: zodResolver(chartAccountFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const selectedSection = watch("dreSection");
  const parentCandidates = React.useMemo(
    () =>
      allAccounts.filter(
        (a) =>
          a.id !== account?.id &&
          a.dre_section === selectedSection &&
          (a.is_summary || a.parent_id === null),
      ),
    [allAccounts, account?.id, selectedSection],
  );

  const onSubmit = handleSubmit((values) => {
    const payload = {
      company_id: values.companyId,
      code: values.code.trim(),
      name: values.name.trim(),
      kind: values.kind,
      dre_section: values.dreSection,
      parent_id: values.parentId,
      sign_hint: values.signHint,
      sort_order: values.sortOrder,
      is_summary: values.isSummary,
      below_the_line: values.belowTheLine,
      is_active: values.isActive,
      notes: values.notes,
    };
    if (isEditing && account) {
      update.mutate(
        { id: account.id, payload },
        {
          onSuccess: () => {
            toast.success("Conta atualizada");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Conta criada");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao criar", { description: err.message }),
      });
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar conta" : "Nova conta DRE"}</SheetTitle>
          <SheetDescription>
            {isSystem
              ? "Conta do plano padrão · não pode ser excluída, mas você pode editar nome, ordem e configurações."
              : "Adicione contas customizadas dentro das seções do DRE."}
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={account?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">Código</Label>
                <Input id="code" placeholder="3.1.05" {...register("code")} />
                {errors.code && <p className="text-2xs text-expense">{errors.code.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Nome da conta</Label>
                <Input id="name" placeholder="Marketing digital" {...register("name")} />
                {errors.name && <p className="text-2xs text-expense">{errors.name.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dreSection">Seção DRE</Label>
                <Controller
                  name="dreSection"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(v) => field.onChange(v || null)}
                    >
                      <SelectTrigger id="dreSection">
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DRE_SECTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kind">Tipo</Label>
                <Controller
                  name="kind"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="parentId">
                  Conta pai <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="parentId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                    >
                      <SelectTrigger id="parentId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sem pai (raiz)</SelectItem>
                        {parentCandidates.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signHint">Sinal</Label>
                <Controller
                  name="signHint"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) =>
                        field.onChange(v === "__none__" ? null : (v as "+" | "-" | "="))
                      }
                    >
                      <SelectTrigger id="signHint">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sem sinal</SelectItem>
                        {SIGN_HINTS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sortOrder">Ordem</Label>
                <Input id="sortOrder" type="number" min={0} {...register("sortOrder")} />
              </div>
              <div className="space-y-1.5">
                <Label>Subtotal</Label>
                <Controller
                  name="isSummary"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "yes" : "no"}
                      onValueChange={(v) => field.onChange(v === "yes")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">Não</SelectItem>
                        <SelectItem value="yes">Sim (linha de resumo)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "active" : "inactive"}
                      onValueChange={(v) => field.onChange(v === "active")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="inactive">Inativa</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notas <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="notes"
                    rows={2}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                  />
                )}
              />
            </div>
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
              {isEditing ? "Salvar" : "Criar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
