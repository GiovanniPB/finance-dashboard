/**
 * Chave estável de um recorte de empresas, para o cache do TanStack Query.
 *
 * Dois cuidados que justificam o helper em vez de repetir a expressão:
 *  · `null` (consolidado, sem recorte) e uma lista são escopos DIFERENTES e não podem
 *    colidir na mesma entrada de cache;
 *  · a ordem da lista não pode gerar duas entradas para o mesmo conjunto de empresas,
 *    então ordena antes de juntar.
 */
export function scopeQueryKey(companyIds: string[] | null): string {
  return companyIds ? [...companyIds].sort().join(",") : "all";
}
