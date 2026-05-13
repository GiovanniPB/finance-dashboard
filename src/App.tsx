import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { Toaster } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { CompanyProvider } from "@/features/companies/CompanyContext";
import { queryClient } from "@/lib/queryClient";
import DashboardPage from "@/routes/dashboard";
import LoginPage from "@/routes/login";
import NotFoundPage from "@/routes/not-found";
import { PlaceholderPage } from "@/routes/placeholder";
import TransactionsPage from "@/routes/transactions";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <NuqsAdapter>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route
                  element={
                    <ProtectedRoute>
                      <CompanyProvider>
                        <AppShell />
                      </CompanyProvider>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route
                    path="dre"
                    element={
                      <PlaceholderPage
                        title="DRE"
                        description="Demonstrativo de Resultado por empresa ou consolidado."
                      />
                    }
                  />
                  <Route
                    path="cashflow"
                    element={
                      <PlaceholderPage
                        title="Fluxo de Caixa"
                        description="Entradas e saídas por período, com snapshot mensal."
                      />
                    }
                  />
                  <Route
                    path="payroll"
                    element={
                      <PlaceholderPage
                        title="Folha de Pagamento"
                        description="Cadastro de colaboradores e geração de folha mensal."
                      />
                    }
                  />
                  <Route
                    path="recurring"
                    element={
                      <PlaceholderPage
                        title="Recorrências"
                        description="Templates de lançamentos recorrentes."
                      />
                    }
                  />
                  <Route
                    path="import"
                    element={
                      <PlaceholderPage
                        title="Importar"
                        description="Importação de CSV/XLSX com preview e mapeamento de colunas."
                      />
                    }
                  />
                  <Route
                    path="companies"
                    element={
                      <PlaceholderPage
                        title="Empresas"
                        description="Gerenciar empresas do grupo."
                      />
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <PlaceholderPage
                        title="Configurações"
                        description="Plano de contas, centros de custo, contas bancárias."
                      />
                    }
                  />
                </Route>

                <Route path="404" element={<NotFoundPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthProvider>
          </NuqsAdapter>
        </BrowserRouter>
        <Toaster
          position="bottom-right"
          toastOptions={{ style: { fontFamily: "var(--font-sans)" } }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
