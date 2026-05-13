import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { Toaster } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { SettingsLayout } from "@/components/layout/SettingsLayout";
import { ThemeProvider } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { CompanyProvider } from "@/features/companies/CompanyContext";
import { queryClient } from "@/lib/queryClient";
import NotFoundPage from "@/routes/not-found";
import { PlaceholderPage } from "@/routes/placeholder";

// Route-level code splitting so the initial bundle stays under budget.
const LoginPage = lazy(() => import("@/routes/login"));
const DashboardPage = lazy(() => import("@/routes/dashboard"));
const TransactionsPage = lazy(() => import("@/routes/transactions"));
const DrePage = lazy(() => import("@/routes/dre"));
const CashflowPage = lazy(() => import("@/routes/cashflow"));
const SettingsBanksPage = lazy(() => import("@/routes/settings.banks"));
const SettingsCostCentersPage = lazy(() => import("@/routes/settings.cost-centers"));
const SettingsCounterpartiesPage = lazy(() => import("@/routes/settings.counterparties"));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-4 p-6 lg:p-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <NuqsAdapter>
            <AuthProvider>
              <Suspense fallback={<RouteFallback />}>
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
                    <Route path="dre" element={<DrePage />} />
                    <Route path="cashflow" element={<CashflowPage />} />
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
                    <Route path="settings" element={<SettingsLayout />}>
                      <Route path="banks" element={<SettingsBanksPage />} />
                      <Route path="cost-centers" element={<SettingsCostCentersPage />} />
                      <Route path="counterparties" element={<SettingsCounterpartiesPage />} />
                    </Route>
                  </Route>

                  <Route path="404" element={<NotFoundPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
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
