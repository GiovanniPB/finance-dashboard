import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { Counterparty } from "../api";
import { useCreateCounterparty, useUpdateCounterparty } from "../hooks";
import {
  COUNTERPARTY_KINDS,
  counterpartyFormSchema,
  emptyCounterpartyForm,
  type CounterpartyFormValues,
} from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterparty: Counterparty | null;
  organizationId: string;
}

export function CounterpartyDrawer({ open, onOpenChange, counterparty, organizationId }: Props) {
  const isEditing = Boolean(counterparty);
  const create = useCreateCounterparty();
  const update = useUpdateCounterparty();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<CounterpartyFormValues>(() => {
    if (counterparty) {
      return {
        organizationId: counterparty.organization_id,
        name: counterparty.name,
        document: counterparty.document,
        kind: (counterparty.kind ?? "supplier") as CounterpartyFormValues["kind"],
        email: counterparty.email,
        phone: counterparty.phone,
        isActive: counterparty.is_active,
      };
    }
    return emptyCounterpartyForm(organizationId);
  }, [counterparty, organizationId]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CounterpartyFormValues>({
    resolver: zodResolver(counterpartyFormSchema),
    defaultValues: initialValues,
  });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      organization_id: values.organizationId,
      name: values.name,
      document: values.document,
      kind: values.kind,
      email: values.email === "" ? null : values.email,
      phone: values.phone,
      is_active: values.isActive,
    };
    if (isEditing && counterparty) {
      update.mutate(
        { id: counterparty.id, payload },
        {
          onSuccess: () => {
            toast.success("Contraparte atualizada");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Contraparte criada");
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
          <SheetTitle>{isEditing ? "Editar contraparte" : "Nova contraparte"}</SheetTitle>
          <SheetDescription>
            Clientes, fornecedores e demais parceiros vinculados aos lançamentos.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          key={counterparty?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome / Razão social</Label>
              <Input
                id="name"
                placeholder="OTM Distribuidora Ltda"
                {...register("name")}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-2xs text-expense">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kind">Tipo</Label>
                <Controller
                  name="kind"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="kind"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                      }}
                      className="w-full"
                    >
                      {COUNTERPARTY_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document">
                  CPF/CNPJ <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="document"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="document"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">
                  E-mail <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="email"
                      type="email"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
                {errors.email && <p className="text-2xs text-expense">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  Telefone <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="phone"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ? "active" : "inactive"}
                    onChange={(e) => {
                      field.onChange(e.target.value === "active");
                    }}
                    className="w-full"
                  >
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </Select>
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
