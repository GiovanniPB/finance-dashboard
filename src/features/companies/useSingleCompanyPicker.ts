import * as React from "react";

import { useCompanyScope } from "./CompanyContext";

/**
 * Telas que OPERAM numa empresa (cadastro de contas bancárias, centros de custo, folha,
 * importação): não faz sentido agregar, faz sentido escolher — mas só dentro do escopo.
 * Com um grupo de agregação selecionado, o seletor lista as empresas do grupo, não as
 * quatro; com uma empresa selecionada, não há o que escolher.
 *
 * A escolha é estado DERIVADO, não sincronizado por efeito: quando o escopo muda, uma
 * escolha que saiu do escopo é descartada na hora, em vez de sobreviver um render
 * mostrando dados de empresa fora do recorte.
 */
/**
 * Empresa efetiva: a escolha manual só vale enquanto estiver dentro do escopo. Fora
 * dele, cai na empresa única do escopo (se houver) ou na primeira do recorte — nunca
 * numa empresa fora do que a pessoa selecionou no seletor.
 */
export function resolvePickedCompany(
  picked: string | null,
  scopeCompanyIds: string[],
  selectedCompanyId: string | null,
): string | null {
  if (picked !== null && scopeCompanyIds.includes(picked)) return picked;
  return selectedCompanyId ?? scopeCompanyIds[0] ?? null;
}

export function useSingleCompanyPicker() {
  const { scopeCompanies, selectedCompanyId, isMultiCompany } = useCompanyScope();
  const [picked, setPicked] = React.useState<string | null>(null);

  const companyId = resolvePickedCompany(
    picked,
    scopeCompanies.map((c) => c.id),
    selectedCompanyId,
  );

  return {
    companyId,
    setCompanyId: setPicked,
    options: scopeCompanies,
    /** O seletor só aparece quando há mais de uma empresa no escopo. */
    needsPicker: isMultiCompany && scopeCompanies.length > 1,
  };
}
