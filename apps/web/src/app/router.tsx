import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AppShell } from "./AppShell";
import { LoginPage } from "../features/auth/LoginPage";
import { useAuth } from "../features/auth/useAuth";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { AgendaPage } from "../features/agenda/AgendaPage";
import { PatientsPage } from "../features/patients/PatientsPage";
import { PatientProfilePage } from "../features/patients/PatientProfilePage";
import { FinancialPage } from "../features/financial/FinancialPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { PublicAnamnesisPage } from "../features/patients/PublicAnamnesisPage";
import { PrivacyPage } from "../features/legal/PrivacyPage";

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-state">Carregando sistema...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/anamnesis/:shareToken" element={<PublicAnamnesisPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/pacientes" element={<PatientsPage />} />
        <Route path="/pacientes/:patientId" element={<PatientProfilePage />} />
        <Route path="/financeiro" element={<FinancialPage />} />
        <Route path="/relatorios" element={<ReportsPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
