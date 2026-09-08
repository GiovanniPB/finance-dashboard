import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import { formatBRL } from "@/lib/format";

import type {
  TaxObligationKind,
  TaxPeriodKind,
  TaxPresumptionClass,
  TaxRuleWithTiers,
} from "../api";
import type { AllowanceMode, BaseDateBasis } from "../apuracao";
import {
  APURAVEIS,
  DATE_BASIS_META,
  KIND_META,
  PERIOD_KIND_META,
  PRESUMPTION_CLASS_META,
} from "../constants";
import { useUpsertTaxRule } from "../hooks";

/**
 * A regra do tributo — o que nas planilhas eram as células de parâmetro (alíquota,
 * presunção, limite de majoração, vencimento) espalhadas por dezenas de abas.
 *
 * Cadastrar aqui é o que torna a apuração reprodutível: a alíquota não é digitada por
 * período, e mudança de alíquota cria uma vigência nova em vez de reescrever o
 * passado.
 */

interface TierDraft {
  presumption_class: TaxPresumptionClass;
  threshold_from: number;
  threshold_to: number | null;
  rate: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  rule: TaxRuleWithTiers | null;
}

const PERCENT_STEP = 0.0001;

export function TaxRuleSheet({ open, onOpenChange, companyId, companyName, rule }: Props) {
  const mutation = useUpsertTaxRule();

  const [kind, setKind] = React.useState<TaxObligationKind>("iss");
  const [periodKind, setPeriodKind] = React.useState<TaxPeriodKind>("monthly");
  const [dateBasis, setDateBasis] = React.useState<BaseDateBasis>("accrual");
  const [basisConfirmed, setBasisConfirmed] = React.useState(false);
  const [ratePct, setRatePct] = React.useState(2);
  const [usesPresumption, setUsesPresumption] = React.useState(false);
  const [defaultClass, setDefaultClass] = React.useState<TaxPresumptionClass>("servico_geral");
  const [tiers, setTiers] = React.useState<TierDraft[]>([]);
  const [hasSurtax, setHasSurtax] = React.useState(false);
  const [surtaxPct, setSurtaxPct] = React.useState(10);
  const [surtaxAllowance, setSurtaxAllowance] = React.useState(20_000);
  const [hasAllowance, setHasAllowance] = React.useState(false);
  const [allowance, setAllowance] = React.useState(49_999.99);
  const [allowancePerPayee, setAllowancePerPayee] = React.useState(true);
  const [allowanceMode, setAllowanceMode] = React.useState<AllowanceMode>("excess");
  const [deductsRetentions, setDeductsRetentions] = React.useState(false);
  const [dueDay, setDueDay] = React.useState(20);
  const [dueOffset, setDueOffset] = React.useState(1);
  const [adjust, setAdjust] = React.useState("previous_business_day");
  const [payee, setPayee] = React.useState("");
  const [validFrom, setValidFrom] = React.useState(`${new Date().getFullYear()}-01-01`);
  const [dividendAccounts, setDividendAccounts] = React.useState<string[]>([]);

  // Carrega a regra em edição uma vez por abertura.
  const loadedId = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (!open) {
      loadedId.current = undefined;
      return;
    }
    if (loadedId.current === (rule?.id ?? null)) return;
    loadedId.current = rule?.id ?? null;

    if (!rule) return;
    setKind(rule.kind);
    setPeriodKind(rule.period_kind);
    setDateBasis(rule.base_date_basis);
    setBasisConfirmed(rule.base_date_basis_confirmed);
    setRatePct(rule.rate * 100);
    setUsesPresumption(rule.uses_presumption);
    setDefaultClass(rule.default_presumption_class ?? "servico_geral");
    setTiers(
      rule.tax_rule_presumptions.map((t) => ({
        presumption_class: t.presumption_class,
        threshold_from: t.threshold_from,
        threshold_to: t.threshold_to,
        rate: t.rate,
      })),
    );
    setHasSurtax(rule.surtax_rate != null);
    setSurtaxPct((rule.surtax_rate ?? 0.1) * 100);
    setSurtaxAllowance(rule.surtax_monthly_allowance ?? 20_000);
    setHasAllowance(rule.base_allowance != null);
    setAllowance(rule.base_allowance ?? 49_999.99);
    setAllowancePerPayee(rule.base_allowance_per_payee);
    setAllowanceMode(rule.base_allowance_mode);
    setDeductsRetentions(rule.deducts_retentions);
    setDueDay(rule.due_day);
    setDueOffset(rule.due_month_offset);
    setAdjust(rule.due_date_adjust);
    setPayee(rule.payee ?? "");
    setValidFrom(rule.valid_from);
    setDividendAccounts(rule.base_account_ids ?? []);
  }, [open, rule]);

  const isDividends = kind === "irrf_dividendos";
  const baseSource = isDividends ? "dividends" : "revenue_accounts";
  const canSave =
    (!usesPresumption || tiers.length > 0) && (!isDividends || dividendAccounts.length > 0);

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!canSave) return;

    mutation.mutate(
      {
        rule: {
          ...(rule?.id ? { id: rule.id } : {}),
          company_id: companyId,
          kind,
          period_kind: periodKind,
          base_date_basis: dateBasis,
          base_date_basis_confirmed: basisConfirmed,
          base_source: baseSource,
          base_account_ids: isDividends ? dividendAccounts : null,
          rate: Number((ratePct / 100).toFixed(6)),
          uses_presumption: usesPresumption,
          default_presumption_class: usesPresumption ? defaultClass : null,
          surtax_rate: hasSurtax ? Number((surtaxPct / 100).toFixed(6)) : null,
          surtax_monthly_allowance: hasSurtax ? surtaxAllowance : null,
          base_allowance: hasAllowance ? allowance : null,
          base_allowance_per_payee: hasAllowance && allowancePerPayee,
          base_allowance_mode: allowanceMode,
          deducts_retentions: deductsRetentions,
          due_day: dueDay,
          due_month_offset: dueOffset,
          due_date_adjust: adjust as "none" | "previous_business_day" | "next_business_day",
          payee: payee.trim() || null,
          valid_from: validFrom,
        },
        tiers: usesPresumption
          ? tiers.map((t) => ({
              presumption_class: t.presumption_class,
              threshold_from: t.threshold_from,
              threshold_to: t.threshold_to,
              rate: t.rate,
            }))
          : [],
      },
      {
        onSuccess: () => {
          toast.success(rule ? "Regra atualizada" : "Regra cadastrada");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao salvar a regra", { description: err.message }),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{rule ? "Editar regra" : "Nova regra de tributo"}</SheetTitle>
          <p className="text-xs text-text-muted">{companyName}</p>
        </SheetHeader>

        <form id="tax-rule-form" onSubmit={submit} className="contents">
          <SheetBody className="space-y-5">
            <Fieldset legend="Tributo">
              <Field label="Imposto" htmlFor="rule-kind">
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as TaxObligationKind)}
                  disabled={Boolean(rule)}
                >
                  <SelectTrigger id="rule-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APURAVEIS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_META[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Periodicidade" htmlFor="rule-period">
                <Select value={periodKind} onValueChange={(v) => setPeriodKind(v as TaxPeriodKind)}>
                  <SelectTrigger id="rule-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["monthly", "quarterly", "annual"] as TaxPeriodKind[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PERIOD_KIND_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Data que delimita o período" htmlFor="rule-basis">
                <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as BaseDateBasis)}>
                  <SelectTrigger id="rule-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["accrual", "cash"] as BaseDateBasis[]).map((b) => (
                      <SelectItem key={b} value={b}>
                        {DATE_BASIS_META[b].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-2xs mt-1 text-text-subtle">
                  {DATE_BASIS_META[dateBasis].hint} Errar aqui desloca a base em um mês inteiro — a
                  apuração avisa quando a outra data daria número bem diferente.
                </p>
              </Field>

              <Toggle
                checked={basisConfirmed}
                onChange={setBasisConfirmed}
                label="Data-base conferida contra o demonstrativo da contabilidade"
                hint="Marque depois de bater a base de um período com o demonstrativo. Enquanto não estiver marcado, a apuração avisa a cada vez que a outra data daria número diferente — o aviso é de uma vez só, não estado permanente."
              />

              <Field label="Alíquota (%)" htmlFor="rule-rate">
                <Input
                  id="rule-rate"
                  type="number"
                  step={PERCENT_STEP}
                  min={0}
                  max={100}
                  value={ratePct}
                  onChange={(e) => setRatePct(Number(e.target.value))}
                />
              </Field>

              <Field label="Recebedor" htmlFor="rule-payee">
                <Input
                  id="rule-payee"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="ex.: PREFEITURA DE BARUERI"
                />
              </Field>

              <Field label="Vigente a partir de" htmlFor="rule-valid">
                <Input
                  id="rule-valid"
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </Field>

              <Toggle
                checked={deductsRetentions}
                onChange={setDeductsRetentions}
                label="Retenção sofrida na fonte é dedutível deste tributo"
                hint="IRPJ, PIS e COFINS: sim. IRRF de dividendos: não — ali a empresa é a fonte pagadora."
              />
            </Fieldset>

            {isDividends && (
              <Fieldset legend="Contas de origem">
                <p className="text-xs text-text-muted">
                  A distribuição de lucros não é receita, então não há como inferir as contas.
                  Escolha a(s) conta(s) onde o lançamento é feito.
                </p>
                {dividendAccounts.map((accountId, i) => (
                  <div key={`${accountId}-${i}`} className="flex items-end gap-2">
                    <div className="flex-1">
                      <AccountCombobox
                        companyId={companyId}
                        value={accountId}
                        onChange={(id) =>
                          setDividendAccounts((prev) => prev.map((a, idx) => (idx === i ? id : a)))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remover conta"
                      className="text-expense hover:bg-expense-soft hover:text-expense"
                      onClick={() =>
                        setDividendAccounts((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex-1">
                  <AccountCombobox
                    companyId={companyId}
                    value={null}
                    onChange={(id) => setDividendAccounts((prev) => [...prev, id])}
                    placeholder="Adicionar conta…"
                  />
                </div>
              </Fieldset>
            )}

            <Fieldset legend="Presunção (Lucro Presumido)">
              <Toggle
                checked={usesPresumption}
                onChange={(v) => {
                  setUsesPresumption(v);
                  if (v && tiers.length === 0) {
                    setTiers([
                      {
                        presumption_class: "servico_geral",
                        threshold_from: 0,
                        threshold_to: null,
                        rate: 0.32,
                      },
                    ]);
                  }
                }}
                label="A base é lucro presumido sobre a receita"
                hint="IRPJ e CSLL: sim. ISS, PIS, COFINS e IRRF: não — a base é a própria receita."
              />

              {usesPresumption && (
                <>
                  <Field label="Classe padrão" htmlFor="rule-default-class">
                    <Select
                      value={defaultClass}
                      onValueChange={(v) => setDefaultClass(v as TaxPresumptionClass)}
                    >
                      <SelectTrigger id="rule-default-class">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRESUMPTION_CLASS_META).map(([k, m]) => (
                          <SelectItem key={k} value={k}>
                            {m.label} · {m.hint}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-2xs mt-1 text-text-subtle">
                      Usada quando a conta de receita não tem classe fiscal — para que receita nova
                      não fique fora da base.
                    </p>
                  </Field>

                  <TierEditor tiers={tiers} onChange={setTiers} />
                </>
              )}
            </Fieldset>

            <Fieldset legend="Adicional">
              <Toggle
                checked={hasSurtax}
                onChange={setHasSurtax}
                label="Tem adicional sobre o excesso da base"
                hint="IRPJ: 10% sobre o que passar de R$ 20.000 por mês de período (R$ 60.000 no trimestre)."
              />
              {hasSurtax && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Alíquota do adicional (%)" htmlFor="rule-surtax">
                    <Input
                      id="rule-surtax"
                      type="number"
                      step={PERCENT_STEP}
                      min={0}
                      value={surtaxPct}
                      onChange={(e) => setSurtaxPct(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Franquia por mês de período" htmlFor="rule-surtax-allowance">
                    <CurrencyInput
                      id="rule-surtax-allowance"
                      value={surtaxAllowance}
                      onValueChange={setSurtaxAllowance}
                    />
                  </Field>
                </div>
              )}
            </Fieldset>

            <Fieldset legend="Franquia da base">
              <Toggle
                checked={hasAllowance}
                onChange={setHasAllowance}
                label="A base tem franquia (valor isento)"
                hint="IRRF de dividendos: 10% a partir de R$ 49.999,99 por sócio, por mês."
              />
              {hasAllowance && (
                <div className="space-y-3">
                  <Field label="Franquia" htmlFor="rule-allowance">
                    <CurrencyInput
                      id="rule-allowance"
                      value={allowance}
                      onValueChange={setAllowance}
                    />
                  </Field>
                  <Toggle
                    checked={allowancePerPayee}
                    onChange={setAllowancePerPayee}
                    label="A franquia é por beneficiário"
                    hint="Cada sócio tem o seu limite — não um limite único para a soma."
                  />
                  <Field label="Como a franquia se aplica" htmlFor="rule-allowance-mode">
                    <Select
                      value={allowanceMode}
                      onValueChange={(v) => setAllowanceMode(v as AllowanceMode)}
                    >
                      <SelectTrigger id="rule-allowance-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excess">
                          Tributa só o excedente ({formatBRL(allowance)} isentos)
                        </SelectItem>
                        <SelectItem value="full_when_exceeded">
                          Passando da franquia, tributa o valor todo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-2xs mt-1 text-text-subtle">
                      A planilha atual aplica os 10% sobre o valor inteiro de quem passou do limite
                      — que é a segunda opção. Confirme com a contabilidade: a diferença é grande.
                    </p>
                  </Field>
                </div>
              )}
            </Fieldset>

            <Fieldset legend="Vencimento">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Dia" htmlFor="rule-due-day">
                  <Input
                    id="rule-due-day"
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                  />
                  <p className="text-2xs mt-1 text-text-subtle">
                    31 = último dia do mês (é como se expressa o vencimento do IRPJ/CSLL
                    trimestral).
                  </p>
                </Field>
                <Field label="Meses após o fim do período" htmlFor="rule-due-offset">
                  <Input
                    id="rule-due-offset"
                    type="number"
                    min={0}
                    max={12}
                    value={dueOffset}
                    onChange={(e) => setDueOffset(Number(e.target.value))}
                  />
                </Field>
              </div>
              <Field label="Quando cai em dia não útil" htmlFor="rule-adjust">
                <Select value={adjust} onValueChange={setAdjust}>
                  <SelectTrigger id="rule-adjust">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previous_business_day">
                      Antecipa (DARF, ISS, FGTS, GPS)
                    </SelectItem>
                    <SelectItem value="next_business_day">Posterga (DAS do Simples)</SelectItem>
                    <SelectItem value="none">Não ajusta</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Fieldset>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || !canSave}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {rule ? "Salvar" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Faixas de presunção: é aqui que "32% até 1,25M e 35,2% no excedente" se expressa. */
function TierEditor({
  tiers,
  onChange,
}: {
  tiers: TierDraft[];
  onChange: (tiers: TierDraft[]) => void;
}) {
  function update(i: number, patch: Partial<TierDraft>) {
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-2xs">Faixas de presunção</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([
              ...tiers,
              {
                presumption_class: tiers.at(-1)?.presumption_class ?? "servico_geral",
                threshold_from: 0,
                threshold_to: null,
                rate: 0.32,
              },
            ])
          }
        >
          <Plus className="size-3.5" /> Faixa
        </Button>
      </div>

      {tiers.length === 0 && (
        <p className="text-xs text-warning">
          Sem faixa a base sai zero. Cadastre pelo menos uma começando em R$ 0,00.
        </p>
      )}

      {tiers.map((tier, i) => (
        <div
          key={i}
          className="grid grid-cols-1 items-end gap-2 rounded-[var(--radius-md)] border border-border p-2 sm:grid-cols-[1fr_7rem_7rem_5rem_auto]"
        >
          <Select
            value={tier.presumption_class}
            onValueChange={(v) => update(i, { presumption_class: v as TaxPresumptionClass })}
          >
            <SelectTrigger aria-label="Classe de receita">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESUMPTION_CLASS_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <Label className="text-2xs" htmlFor={`tier-from-${i}`}>
              De
            </Label>
            <CurrencyInput
              id={`tier-from-${i}`}
              value={tier.threshold_from}
              onValueChange={(v) => update(i, { threshold_from: v })}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-2xs" htmlFor={`tier-to-${i}`}>
              Até
            </Label>
            <CurrencyInput
              id={`tier-to-${i}`}
              value={tier.threshold_to ?? 0}
              onValueChange={(v) => update(i, { threshold_to: v === 0 ? null : v })}
              placeholder="sem teto"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-2xs" htmlFor={`tier-rate-${i}`}>
              %
            </Label>
            <Input
              id={`tier-rate-${i}`}
              type="number"
              step={0.01}
              min={0}
              max={100}
              value={Number((tier.rate * 100).toFixed(4))}
              onChange={(e) => update(i, { rate: Number(e.target.value) / 100 })}
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remover faixa"
            className="text-expense hover:bg-expense-soft hover:text-expense"
            onClick={() => onChange(tiers.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {hint && <p className="text-2xs text-text-subtle">{hint}</p>}
      </div>
    </div>
  );
}
