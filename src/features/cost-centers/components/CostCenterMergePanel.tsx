import * as React from "react";
import { Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { Company } from "@/features/companies/api";

import type { ConsolidatedCostCenter } from "../api";
import { useConsolidatedCostCenters, useMergeCostCenters, useUnmergeCostCenters } from "../hooks";

interface Props {
  organizationId: string;
  companyIds: string[] | null;
  companies: Company[];
}

/**
 * Fusão de centros de custo.
 *
 * O relatório consolidado casa centros de empresas diferentes pelo NOME normalizado.
 * Quando os nomes divergem — "Capex" numa empresa, "otm corretora - capex" na outra —
 * eles ficam em linhas separadas, e é aqui que se corrige: escolher as duas e dar um
 * nome de consolidação.
 *
 * Fundir NÃO renomeia o centro na empresa nem toca lançamento; é só o nome pelo qual
 * eles somam junto. Por isso a lista mostra sempre a grafia de cada empresa.
 */
export function CostCenterMergePanel({ organizationId, companyIds, companies }: Props) {
  const { data: groups = [], isLoading } = useConsolidatedCostCenters(companyIds);
  const merge = useMergeCostCenters();
  const unmerge = useUnmergeCostCenters();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");

  const companyName = React.useMemo(
    () => new Map(companies.map((c) => [c.id, c.trade_name ?? c.legal_name])),
    [companies],
  );

  const selectedGroups = groups.filter((g) => selected.includes(g.key));
  // Nome sugerido: a grafia mais curta entre as escolhidas costuma ser a "limpa"
  // ("Capex" contra "otm corretora - capex"), mas quem decide é a pessoa.
  const suggested = [...selectedGroups].map((g) => g.name).sort((a, b) => a.length - b.length)[0];

  function toggle(key: string, on: boolean) {
    setSelected((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  function submitMerge() {
    const finalName = (name.trim() || suggested || "").trim();
    if (!finalName || selectedGroups.length < 2) return;

    merge.mutate(
      {
        organizationId,
        name: finalName,
        costCenterIds: selectedGroups.flatMap((g) => g.members.map((m) => m.id)),
      },
      {
        onSuccess: () => {
          toast.success(`Fundidos em "${finalName}"`);
          setSelected([]);
          setName("");
        },
        onError: (err) => toast.error("Não foi possível fundir", { description: err.message }),
      },
    );
  }

  function undoMerge(group: ConsolidatedCostCenter) {
    unmerge.mutate(
      group.members.map((m) => m.id),
      {
        onSuccess: () => toast.success("Fusão desfeita"),
        onError: (err) => toast.error("Não foi possível desfazer", { description: err.message }),
      },
    );
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Consolidação entre empresas</h3>
        <p className="mt-1 text-sm text-text-muted">
          O relatório soma centros de empresas diferentes que têm o mesmo nome. Quando os nomes
          divergem, escolha duas ou mais linhas abaixo e funda sob um nome só. Isso não renomeia o
          centro em nenhuma empresa.
        </p>
      </div>

      <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
        {groups.length === 0 && (
          <p className="text-2xs p-3 text-text-muted">Nenhum centro de custo ativo no escopo.</p>
        )}
        {groups.map((g) => {
          const companiesInGroup = new Set(g.members.map((m) => m.companyId));
          const divergent = [...new Set(g.members.map((m) => m.name))].filter((n) => n !== g.name);
          return (
            <div key={g.key} className="flex items-start gap-3 p-3">
              <Checkbox
                className="mt-0.5"
                checked={selected.includes(g.key)}
                onCheckedChange={(next) => toggle(g.key, next === true)}
                aria-label={`Selecionar ${g.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{g.name}</span>
                  <Badge tone={companiesInGroup.size > 1 ? "accent" : "info"}>
                    {companiesInGroup.size} empresa(s)
                  </Badge>
                  {g.mergeGroupId && <Badge tone="info">fundido</Badge>}
                </div>
                <div className="text-2xs mt-1 text-text-subtle">
                  {g.members
                    .map((m) => `${companyName.get(m.companyId) ?? "—"}: ${m.name}`)
                    .join(" · ")}
                </div>
                {divergent.length > 0 && (
                  <div className="text-2xs mt-0.5 text-text-muted">
                    grafias reunidas: {divergent.join(", ")}
                  </div>
                )}
              </div>
              {g.mergeGroupId && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unmerge.isPending}
                  onClick={() => undoMerge(g)}
                >
                  <Unlink className="size-3.5" /> Desfazer
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-accent bg-accent-soft/30 p-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <Label htmlFor="merge-name">Nome de consolidação</Label>
            <Input
              id="merge-name"
              value={name}
              placeholder={suggested ?? "Ex.: Capex"}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-2xs text-text-subtle">
              {selectedGroups.length} selecionada(s). É por este nome que elas vão somar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelected([]);
                setName("");
              }}
            >
              Cancelar
            </Button>
            <Button disabled={selectedGroups.length < 2 || merge.isPending} onClick={submitMerge}>
              {merge.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Fundir
            </Button>
          </div>
          {selectedGroups.length < 2 && (
            <p className="text-2xs w-full text-text-muted">
              Escolha pelo menos duas linhas — fundir uma sozinha só a renomearia no relatório.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
