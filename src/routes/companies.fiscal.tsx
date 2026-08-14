import { Navigate, useParams } from "react-router-dom";

/**
 * Redirecionamento de compatibilidade.
 *
 * `/companies/:id/fiscal` foi absorvida por `/companies/:id`, que reúne cadastro e
 * configuração fiscal na mesma página. Mantido para não quebrar link salvo.
 */
export default function CompanyFiscalRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/companies/${id}` : "/companies"} replace />;
}
