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

import type { Company } from "../api";
import { useCreateCompany, useUpdateCompany } from "../hooks";
import {
  companyFormSchema,
  emptyCompanyForm,
  TAX_REGIMES,
  type CompanyFormValues,
} from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  organizationId: string;
}

export function CompanyDrawer({ open, onOpenChange, company, organizationId }: Props) {
  const isEditing = Boolean(company);
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<CompanyFormValues>(() => {
    if (company) {
      return {
        organizationId: company.organization_id,
        legalName: company.legal_name,
        tradeName: company.trade_name,
        cnpj: company.cnpj,
        taxRegime: company.tax_regime,
        isHolding: company.is_holding,
        isActive: company.is_active,
        sortOrder: company.sort_order,
        brandColor: company.brand_color,
      };
    }
    return emptyCompanyForm(organizationId);
  }, [company, organizationId]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: initialValues,
  });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      organization_id: values.organizationId,
      legal_name: values.legalName,
      trade_name: values.tradeName,
      cnpj: values.cnpj,
      tax_regime: values.taxRegime,
      is_holding: values.isHolding,
      is_active: values.isActive,
      sort_order: values.sortOrder,
      brand_color: values.brandColor,
    };
    if (isEditing && company) {
      update.mutate(
        { id: company.id, payload },
        {
          onSuccess: () => {
            toast.success("Empresa atualizada");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Empresa criada");
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
          <SheetTitle>{isEditing ? "Editar empresa" : "Nova empresa"}</SheetTitle>
          <SheetDescription>
            Empresas do grupo. Cada uma tem seu próprio plano de contas e lançamentos.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={company?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="legalName">Razão social</Label>
              <Input
                id="legalName"
                placeholder="OTM Assessoria Empresarial Ltda."
                {...register("legalName")}
                aria-invalid={Boolean(errors.legalName)}
              />
              {errors.legalName && (
                <p className="text-2xs text-expense">{errors.legalName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tradeName">Nome fantasia</Label>
              <Controller
                name="tradeName"
                control={control}
                render={({ field }) => (
                  <Input
                    id="tradeName"
                    placeholder="OTM Assessoria"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                    aria-invalid={Boolean(errors.tradeName)}
                  />
                )}
              />
              {errors.tradeName && (
                <p className="text-2xs text-expense">{errors.tradeName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">
                  CNPJ <span className="text-text-subtle">(só números)</span>
                </Label>
                <Controller
                  name="cnpj"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="cnpj"
                      placeholder="00000000000000"
                      maxLength={14}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : e.target.value)
                      }
                      aria-invalid={Boolean(errors.cnpj)}
                    />
                  )}
                />
                {errors.cnpj && <p className="text-2xs text-expense">{errors.cnpj.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxRegime">Regime tributário</Label>
                <Controller
                  name="taxRegime"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="taxRegime">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_REGIMES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
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
                <Label htmlFor="sortOrder">Ordem</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min={0}
                  {...register("sortOrder", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brandColor">
                  Cor <span className="text-text-subtle">(#hex)</span>
                </Label>
                <Controller
                  name="brandColor"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Input
                        id="brandColor"
                        type="color"
                        value={field.value ?? "#7c3aed"}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="h-9 w-12 cursor-pointer p-1"
                      />
                      <Input
                        placeholder="#7c3aed"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? null : e.target.value)
                        }
                        className="flex-1 font-mono"
                      />
                    </div>
                  )}
                />
                {errors.brandColor && (
                  <p className="text-2xs text-expense">{errors.brandColor.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <Controller
                  name="isHolding"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "holding" : "operational"}
                      onValueChange={(v) => field.onChange(v === "holding")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operational">Operacional</SelectItem>
                        <SelectItem value="holding">Holding</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
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
