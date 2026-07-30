import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { Toaster } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PayrollLayout } from "@/components/layout/PayrollLayout";
import { SettingsLayout } from "@/components/layout/SettingsLayout";
import { ThemeProvider } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { CompanyProvider } from "@/features/companies/CompanyContext";
import { queryClient } from "@/lib/queryClient";
import NotFoundPage from "@/routes/not-found";

// Route-level code splitting so the initial bundle stays under budget.
const LoginPage = lazy(() => import("@/routes/login"));
const DashboardPage = lazy(() => import("@/routes/dashboard"));
const TransactionsPage = lazy(() => import("@/routes/transactions"));
const DrePage = lazy(() => import("@/routes/dre"));
const BillsPage = lazy(() => import("@/routes/bills"));
const ReconciliationPage = lazy(() => import("@/routes/reconciliation"));
const ForecastPage = lazy(() => import("@/routes/forecast"));
const ReportsPage = lazy(() => import("@/routes/reports"));
const TaxesPage = lazy(() => import("@/routes/taxes"));
const NfsePage = lazy(() => import("@/routes/nfse"));
const CashflowPage = lazy(() => import("@/routes/cashflow"));
const AccountsPage = lazy(() => import("@/routes/accounts"));
const AccountDetailPage = lazy(() => import("@/routes/accounts.detail"));
const ImportPage = lazy(() => import("@/routes/import"));
const PayrollEmployeesPage = lazy(() => import("@/routes/payroll.employees"));
const PayrollRunsPage = lazy(() => import("@/routes/payroll.runs"));
const PayrollRunDetailPage = lazy(() => import("@/routes/payroll.run-detail"));
const AuditPage = lazy(() => import("@/routes/audit"));
const RecurringPage = lazy(() => import("@/routes/recurring"));
const SettingsBanksPage = lazy(() => import("@/routes/settings.banks"));
const SettingsCostCentersPage = lazy(() => import("@/routes/settings.cost-centers"));
const SettingsCounterpartiesPage = lazy(() => import("@/routes/settings.counterparties"));
const SettingsPayrollPage = lazy(() => import("@/routes/settings.payroll"));
const CompaniesPage = lazy(() => import("@/routes/companies"));
const UsersPage = lazy(() => import("@/routes/users"));
const ProfilePage = lazy(() => import("@/routes/profile"));
const ResetPasswordPage = lazy(() => import("@/routes/reset-password"));

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
                  <Route path="/reset-password" element={<ResetPasswordPage />} />

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
                    <Route path="bills" element={<BillsPage />} />
                    <Route path="reconciliation" element={<ReconciliationPage />} />
                    <Route path="forecast" element={<ForecastPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="taxes" element={<TaxesPage />} />
                    <Route path="nfse" element={<NfsePage />} />
                    <Route path="cashflow" element={<CashflowPage />} />
                    <Route path="contas" element={<AccountsPage />} />
                    <Route path="contas/:id" element={<AccountDetailPage />} />
                    <Route path="payroll" element={<PayrollLayout />}>
                      <Route index element={<Navigate to="runs" replace />} />
                      <Route path="employees" element={<PayrollEmployeesPage />} />
                      <Route path="runs" element={<PayrollRunsPage />} />
                      <Route path="runs/:id" element={<PayrollRunDetailPage />} />
                    </Route>
                    <Route path="recurring" element={<RecurringPage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="import" element={<ImportPage />} />
                    <Route path="companies" element={<CompaniesPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="settings" element={<SettingsLayout />}>
                      <Route path="banks" element={<SettingsBanksPage />} />
                      <Route path="cost-centers" element={<SettingsCostCentersPage />} />
                      <Route path="counterparties" element={<SettingsCounterpartiesPage />} />
                      <Route path="payroll" element={<SettingsPayrollPage />} />
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
