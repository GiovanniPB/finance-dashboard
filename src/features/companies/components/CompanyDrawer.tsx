import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { useCreateCompany } from "../hooks";
import { companyFormSchema, emptyCompanyForm, type CompanyFormValues } from "../schema";
import { CompanyFormFields, toCompanyPayload } from "./CompanyFormFields";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

/**
 * Criação de empresa.
 *
 * Só CRIA: editar acontece em `/companies/:id`, junto da configuração fiscal —
 * que precisa de uma empresa já existente para ter onde se pendurar.
 */
export function CompanyDrawer({ open, onOpenChange, organizationId }: Props) {
  const create = useCreateCompany();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: emptyCompanyForm(organizationId),
  });

  // reabrir a gaveta depois de criar não pode trazer o texto da empresa anterior
  React.useEffect(() => {
    if (open) reset(emptyCompanyForm(organizationId));
  }, [open, organizationId, reset]);

  const onSubmit = handleSubmit((values) => {
    create.mutate(toCompanyPayload(values), {
      onSuccess: () => {
        toast.success("Empresa criada");
        onOpenChange(false);
      },
      onError: (err) => toast.error("Erro ao criar", { description: err.message }),
    });
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>Nova empresa</SheetTitle>
          <SheetDescription>
            Empresas do grupo. Cada uma tem seu próprio plano de contas e lançamentos.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <SheetBody>
            <CompanyFormFields register={register} control={control} errors={errors} />
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Criar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
