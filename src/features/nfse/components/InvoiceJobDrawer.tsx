import * as React from "react";
import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/features/auth/AuthProvider";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import { nfseFileUrl, type InvoiceJob } from "../api";
import { DOCUMENT_TYPE_META, JOB_STATUS_META } from "../constants";
import { useApproveInvoiceJob, useRequeueInvoiceJob } from "../hooks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: InvoiceJob | null;
}

export function InvoiceJobDrawer({ open, onOpenChange, job }: Props) {
  const { user } = useAuth();
  const approve = useApproveInvoiceJob();
  const requeue = useRequeueInvoiceJob();

  if (!job) return null;

  const status = JOB_STATUS_META[job.status] ?? { label: job.status, tone: "default" as const };
  const docType = job.document_type ?? "nfse";
  const docMeta = DOCUMENT_TYPE_META[docType];
  const isNfe = docType === "nfe";
  const params = (job.parametros ?? {}) as Record<string, unknown>;
  const metadata = (job.metadata ?? {}) as Record<string, unknown>;
  const splitSource = metadata.splitSource as string | undefined;
  const payablesDivergence = metadata.payablesDivergence === true;
  const canApprove = job.status === "pending_review";
  const canRequeue = job.status === "rejected" || job.status === "failed";
  const endereco = job.tomador_endereco as Record<string, unknown> | null;
  const hasFocusResult =
    job.numero_nfse != null ||
    job.chave_nfse != null ||
    job.mensagem_sefaz != null ||
    job.erros != null;
  const xmlPath = job.xml_path;
  const danfsePath = job.danfse_path;
  const hasFiles = xmlPath != null || danfsePath != null;

  const download = async (path: string, label: string) => {
    try {
      const url = await nfseFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(`Erro ao baixar ${label}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Nota <Badge tone={docMeta.tone}>{docMeta.label}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
          </SheetTitle>
          <SheetDescription>
            {job.account?.label ?? "—"} · {formatDate(job.created_at)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <Section title="Resumo">
            <Row
              label="Empresa"
              value={job.company?.trade_name ?? job.company?.legal_name ?? "—"}
            />
            <Row label="Valor" value={formatBRL(job.valor_servicos)} mono />
            <Row label="Ambiente" value={job.ambiente} />
            <Row label="Cobrança" value={job.pagarme_charge_id ?? "—"} mono />
            <Row label="Recebedor" value={job.pagarme_recipient_id ?? "(sem split)"} mono />
            {splitSource && (
              <Row
                label="Origem do split"
                value={splitSource === "payables" ? "payables (validado)" : "webhook"}
              />
            )}
          </Section>

          {payablesDivergence && (
            <p className="text-2xs rounded-[var(--radius-sm)] bg-warning-soft p-2 text-warning">
              Divergência entre o split do webhook e os payables — enviado para revisão. Confira o
              valor antes de aprovar.
            </p>
          )}

          <Section title="Tomador">
            <Row label="Nome" value={job.tomador_nome ?? "—"} />
            <Row label="Documento" value={job.tomador_documento ?? "—"} mono />
            <Row label="E-mail" value={job.tomador_email ?? "—"} />
            {endereco && (
              <Row
                label="Endereço"
                value={
                  [endereco.line_1, endereco.city, endereco.state].filter(Boolean).join(", ") || "—"
                }
              />
            )}
          </Section>

          <Section title="Classificação fiscal">
            {isNfe ? (
              <>
                <Row label="Produto" value={(params.descricao as string) ?? "—"} />
                <Row label="NCM" value={(params.ncm as string) ?? "—"} mono />
                <Row
                  label="CFOP"
                  value={
                    [params.cfopInterno, params.cfopInterestadual].filter(Boolean).join(" / ") ||
                    "—"
                  }
                  mono
                />
                <Row label="CST ICMS" value={(params.cstIcms as string) ?? "—"} mono />
                <Row label="cBenef" value={(params.codigoBeneficioFiscal as string) ?? "—"} mono />
                <Row
                  label="PIS / COFINS"
                  value={pisCofinsLabel(params.pisAliquota, params.cofinsAliquota)}
                  mono
                />
              </>
            ) : (
              <>
                <Row label="Item LC116" value={job.item_lista_servico ?? "—"} mono />
                <Row label="Cód. tributário" value={job.codigo_tributario_municipio ?? "—"} mono />
                <Row
                  label="ISS"
                  value={job.aliquota_iss == null ? "—" : `${(job.aliquota_iss * 100).toFixed(2)}%`}
                  mono
                />
              </>
            )}
          </Section>

          {hasFocusResult && (
            <Section title="Resultado Focus">
              {job.numero_nfse && <Row label="Número" value={job.numero_nfse} mono />}
              {job.chave_nfse && <Row label="Chave" value={job.chave_nfse} mono />}
              {job.mensagem_sefaz && (
                <p className="text-2xs rounded-[var(--radius-sm)] bg-expense-soft p-2 text-expense">
                  {job.mensagem_sefaz}
                </p>
              )}
              {job.erros != null && (
                <pre className="text-2xs overflow-x-auto rounded-[var(--radius-sm)] bg-surface-2 p-2">
                  {JSON.stringify(job.erros, null, 2)}
                </pre>
              )}
            </Section>
          )}

          {job.attempts > 0 && (
            <p className="text-2xs text-text-subtle">
              {job.attempts} tentativa(s)
              {job.last_attempt_at ? ` · última em ${formatDate(job.last_attempt_at)}` : ""}
            </p>
          )}

          {hasFiles && (
            <div className="flex gap-2">
              {xmlPath && (
                <Button size="sm" variant="outline" onClick={() => void download(xmlPath, "XML")}>
                  <Download className="size-3.5" /> XML
                </Button>
              )}
              {danfsePath && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void download(danfsePath, "DANFSe")}
                >
                  <Download className="size-3.5" /> DANFSe
                </Button>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {canApprove && (
            <Button
              disabled={approve.isPending || !user}
              onClick={() => {
                if (!user) return;
                approve.mutate(
                  { id: job.id, userId: user.id },
                  {
                    onSuccess: () => {
                      toast.success("Nota aprovada — enviada para a fila");
                      onOpenChange(false);
                    },
                    onError: (err) => toast.error("Erro ao aprovar", { description: err.message }),
                  },
                );
              }}
            >
              {approve.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Aprovar
            </Button>
          )}
          {canRequeue && (
            <Button
              disabled={requeue.isPending}
              onClick={() => {
                requeue.mutate(job.id, {
                  onSuccess: () => {
                    toast.success("Nota recolocada na fila");
                    onOpenChange(false);
                  },
                  onError: (err) => toast.error("Erro ao reemitir", { description: err.message }),
                });
              }}
            >
              {requeue.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Reemitir
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function pisCofinsLabel(pis: unknown, cofins: unknown): string {
  const fmt = (v: unknown) => (typeof v === "number" ? `${v}%` : "—");
  if (pis == null && cofins == null) return "—";
  return `${fmt(pis)} / ${fmt(cofins)}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">{title}</div>
      <div className="space-y-1 rounded-[var(--radius-md)] border border-border bg-surface p-3">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-text-subtle">{label}</span>
      <span className={mono ? "truncate text-right font-mono text-xs" : "truncate text-right"}>
        {value}
      </span>
    </div>
  );
}
