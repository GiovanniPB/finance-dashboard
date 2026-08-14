import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { CompanyInsert } from "../api";
import { TAX_REGIMES, type CompanyFormValues } from "../schema";

interface Props {
  register: UseFormRegister<CompanyFormValues>;
  control: Control<CompanyFormValues>;
  errors: FieldErrors<CompanyFormValues>;
  disabled?: boolean;
}

/**
 * Campos do cadastro da empresa, sem `useForm` próprio.
 *
 * Existem dois donos deste formulário — a gaveta de "Nova empresa" e a página de
 * configurações da empresa — e eles diferem só no invólucro (rodapé de sheet ×
 * rodapé de card) e na mutation (create × update). Os CAMPOS são os mesmos, então
 * ficam aqui; cada dono traz seu `useForm`.
 */
export function CompanyFormFields({ register, control, errors, disabled }: Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="legalName">Razão social</Label>
        <Input
          id="legalName"
          placeholder="OTM Assessoria Empresarial Ltda."
          disabled={disabled}
          {...register("legalName")}
          aria-invalid={Boolean(errors.legalName)}
        />
        {errors.legalName && <p className="text-2xs text-expense">{errors.legalName.message}</p>}
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
              disabled={disabled}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
              aria-invalid={Boolean(errors.tradeName)}
            />
          )}
        />
        {errors.tradeName && <p className="text-2xs text-expense">{errors.tradeName.message}</p>}
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
                disabled={disabled}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
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
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
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
            disabled={disabled}
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
                  disabled={disabled}
                  value={field.value ?? "#7c3aed"}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="h-9 w-12 cursor-pointer p-1"
                />
                <Input
                  placeholder="#7c3aed"
                  disabled={disabled}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
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
                disabled={disabled}
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
                disabled={disabled}
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
    </div>
  );
}

/** Converte os valores do formulário para a linha de `companies`. */
export function toCompanyPayload(values: CompanyFormValues): CompanyInsert {
  return {
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
}

/** Valores do formulário a partir de uma empresa existente. */
export function companyToFormValues(company: {
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  tax_regime: CompanyFormValues["taxRegime"];
  is_holding: boolean;
  is_active: boolean;
  sort_order: number;
  brand_color: string | null;
}): CompanyFormValues {
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
