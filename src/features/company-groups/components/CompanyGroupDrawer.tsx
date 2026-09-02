import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { Company } from "@/features/companies/api";

import type { CompanyGroup } from "../api";
import { useCreateCompanyGroup, useUpdateCompanyGroup } from "../hooks";
import { companyGroupSchema, type CompanyGroupFormValues } from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CompanyGroup | null;
  organizationId: string;
  companies: Company[];
}

export function CompanyGroupDrawer({
  open,
  onOpenChange,
  group,
  organizationId,
  companies,
}: Props) {
  const isEditing = Boolean(group);
  const create = useCreateCompanyGroup();
  const update = useUpdateCompanyGroup();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<CompanyGroupFormValues>(
    () => ({
      name: group?.name ?? "",
      description: group?.description ?? "",
      companyIds: group?.companyIds ?? [],
    }),
    [group],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyGroupFormValues>({
    resolver: zodResolver(companyGroupSchema),
    values: initialValues,
  });

  function onSubmit(values: CompanyGroupFormValues) {
    const input = {
      organizationId,
      name: values.name,
      description: values.description?.trim() ? values.description.trim() : null,
      companyIds: values.companyIds,
    };
    const done = {
      onSuccess: () => {
        toast.success(isEditing ? "Grupo atualizado" : "Grupo criado");
        reset();
        onOpenChange(false);
      },
      onError: (err: Error) =>
        toast.error("Não foi possível salvar o grupo", { description: err.message }),
    };

    if (group) update.mutate({ id: group.id, input }, done);
    else create.mutate(input, done);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar grupo" : "Novo grupo de agregação"}</SheetTitle>
          <SheetDescription>
            Um grupo soma as empresas escolhidas em DRE, KPIs, caixa, títulos e lançamentos — sem
            misturar as demais.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <SheetBody className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="group-name">Nome</Label>
              <Input
                id="group-name"
                placeholder="Ex.: OTM sem Jimmy"
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              {errors.name && <p className="text-2xs text-expense">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="group-description">Descrição (opcional)</Label>
              <Textarea
                id="group-description"
                rows={2}
                placeholder="Para que serve este recorte"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-2xs text-expense">{errors.description.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Empresas do grupo</Label>
              <Controller
                control={control}
                name="companyIds"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    {companies.map((c) => {
                      const checked = field.value.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-border-strong"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              // Lista nova a cada mudança, sem mutar a anterior.
                              field.onChange(
                                next === true
                                  ? [...field.value, c.id]
                                  : field.value.filter((id) => id !== c.id),
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {c.trade_name ?? c.legal_name}
                            </div>
                            <div className="text-2xs truncate text-text-subtle">{c.legal_name}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
              {errors.companyIds && (
                <p className="text-2xs text-expense">{errors.companyIds.message}</p>
              )}
              <p className="text-2xs text-text-subtle">
                Só quem tem acesso a <strong>todas</strong> as empresas escolhidas vai ver este
                grupo — um recorte somado pela metade seria um número errado sem aviso.
              </p>
            </div>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar grupo"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
