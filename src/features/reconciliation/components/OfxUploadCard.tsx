import * as React from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { cn } from "@/lib/cn";

import { useImportOfx } from "../hooks";
import { parseOfx } from "../ofxParser";

interface Props {
  companyId: string;
}

export function OfxUploadCard({ companyId }: Props) {
  const { data: bankAccounts = [] } = useBankAccounts(companyId);
  const [bankId, setBankId] = React.useState<string>("");
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const importMutation = useImportOfx();

  const handleFile = React.useCallback(
    async (file: File) => {
      if (!bankId) {
        toast.error("Selecione a conta bancária antes de enviar o arquivo");
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseOfx(text);
        if (parsed.transactions.length === 0) {
          toast.error("Nenhuma transação encontrada no arquivo OFX");
          return;
        }
        const result = await importMutation.mutateAsync({
          companyId,
          bankAccountId: bankId,
          fileName: file.name,
          transactions: parsed.transactions,
        });
        toast.success(
          `${result.inserted} linha(s) importada(s)` +
            (result.duplicates > 0 ? ` · ${result.duplicates} duplicada(s) ignorada(s)` : ""),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao processar arquivo";
        toast.error("Falha na importação", { description: msg });
      }
    },
    [bankId, companyId, importMutation],
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="bank">Conta bancária</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger id="bank">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nickname} · {b.bank_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!bankId || importMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {importMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Importar OFX
          </Button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "rounded-[var(--radius-md)] border border-dashed p-4 text-center text-xs transition-colors",
            dragOver
              ? "border-accent bg-accent-soft text-accent"
              : "border-border bg-surface-2 text-text-muted",
          )}
        >
          <Upload className="mx-auto mb-1 size-4" />
          Arraste um arquivo OFX aqui ou clique no botão acima. Linhas duplicadas (mesmo FITID) são
          ignoradas automaticamente.
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.OFX,application/x-ofx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
