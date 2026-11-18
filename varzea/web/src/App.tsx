import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "./components/Shell";
import { Loading } from "./components/ui";
import { useAuth } from "./lib/auth";
import type { Permission } from "./lib/types";
import {
  InvitePage,
  LoginPage,
  NewClubPage,
  RecoverPage,
  RegisterPage,
  ResetPasswordPage,
  WelcomePage,
} from "./pages/Auth";
import { BotPage } from "./pages/Bot";
import { ClubPage, ClubSettingsPage, FinancePage } from "./pages/Club";
import { HomePage } from "./pages/Home";
import { LivePage } from "./pages/Live";
import { MatchDetailPage } from "./pages/MatchDetail";
import { MatchesPage, MatchFormPage } from "./pages/Matches";
import { ProfilePage } from "./pages/Profile";

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") {
    return (
      <main className="app-stage auth-stage">
        <Loading />
      </main>
    );
  }
  if (status === "anonymous") return <Navigate to="/entrar" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Bloqueia telas administrativas para quem não tem permissão (RF15). */
function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <Navigate to="/" replace />;
}

/** Telas que só fazem sentido dentro de um clube (ex.: link direto de partida). */
function RequireClub() {
  const { club } = useAuth();
  return club ? <Outlet /> : <Navigate to="/" replace />;
}

function MatchesWithDetail() {
  return (
    <>
      <MatchesPage />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/recuperar" element={<RecoverPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/convite/:code" element={<InvitePage />} />

      <Route element={<RequireAuth />}>
        <Route path="/bem-vindo" element={<WelcomePage />} />
        <Route path="/clubes/novo" element={<NewClubPage />} />
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="/partidas" element={<MatchesWithDetail />}>
            <Route element={<RequireClub />}>
              <Route path=":id" element={<MatchDetailPage />} />
            </Route>
          </Route>
          <Route path="/clube" element={<ClubPage />} />
          <Route element={<RequireClub />}>
            <Route
              path="/partidas/nova"
              element={
                <RequirePermission permission="matches.manage">
                  <MatchFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="/partidas/:id/editar"
              element={
                <RequirePermission permission="matches.manage">
                  <MatchFormPage />
                </RequirePermission>
              }
            />
            <Route path="/partidas/:id/ao-vivo" element={<LivePage />} />
            <Route
              path="/clube/configuracoes"
              element={
                <RequirePermission permission="club.update">
                  <ClubSettingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/clube/financeiro"
              element={
                <RequirePermission permission="payments.manage">
                  <FinancePage />
                </RequirePermission>
              }
            />
            <Route path="/clube/bot" element={<BotPage />} />
          </Route>
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
