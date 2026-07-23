import { createBrowserRouter } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import AppShell from "./components/AppShell";
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import DashboardScreen from "./screens/DashboardScreen";
import AppointmentsScreen from "./screens/AppointmentsScreen";
import CreateScreen from "./screens/CreateScreen";
import RescheduleScreen from "./screens/RescheduleScreen";
import PatientsScreen from "./screens/PatientsScreen";
import PetFormScreen from "./screens/PetFormScreen";
import ShareScreen from "./screens/ShareScreen";
import PetDetailScreen from "./screens/PetDetailScreen";
import DiagnosisDetailScreen from "./screens/DiagnosisDetailScreen";
import TreatmentPlanFormScreen from "./screens/TreatmentPlanFormScreen";
import TreatmentPlanDetailScreen from "./screens/TreatmentPlanDetailScreen";
import InvoiceListScreen from "./screens/InvoiceListScreen";
import InvoiceFormScreen from "./screens/InvoiceFormScreen";
import InvoiceDetailScreen from "./screens/InvoiceDetailScreen";
import RevenueScreen from "./screens/RevenueScreen";
import NotificationsSettingsScreen from "./screens/NotificationsSettingsScreen";
import QueryInboxScreen from "./screens/QueryInboxScreen";
import QueryThreadScreen from "./screens/QueryThreadScreen";
import ProfileScreen from "./screens/ProfileScreen";
// Owner portal (SRS §3.1 owner side)
import RoleLanding from "./components/RoleLanding";
import OwnerShell from "./components/OwnerShell";
import OwnerHomeScreen from "./screens/OwnerHomeScreen";
import OwnerPetDetailScreen from "./screens/OwnerPetDetailScreen";
import OwnerAppointmentsScreen from "./screens/OwnerAppointmentsScreen";
import OwnerBillingScreen from "./screens/OwnerBillingScreen";
import OwnerNotificationsScreen from "./screens/OwnerNotificationsScreen";
import OwnerClaimScreen from "./screens/OwnerClaimScreen";

// Auth routes are bare; app routes are wrapped in <RequireAuth><AppShell/>.
export const router = createBrowserRouter([
  { path: "/", element: <RoleLanding /> },
  { path: "/login", element: <LoginScreen /> },
  { path: "/signup", element: <SignupScreen /> },
  { path: "/activate", element: <OwnerClaimScreen /> },
  // Owner portal — role-scoped views (owner sees only their own pets, AC-04).
  {
    element: (
      <RequireAuth>
        <OwnerShell />
      </RequireAuth>
    ),
    children: [
      { path: "/owner", element: <OwnerHomeScreen /> },
      { path: "/owner/appointments", element: <OwnerAppointmentsScreen /> },
      { path: "/owner/billing", element: <OwnerBillingScreen /> },
      { path: "/owner/notifications", element: <OwnerNotificationsScreen /> },
      { path: "/owner/profile", element: <ProfileScreen /> },
      { path: "/owner/pets/:id", element: <OwnerPetDetailScreen /> },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: "/dashboard", element: <DashboardScreen /> },
      { path: "/appointments", element: <AppointmentsScreen /> },
      { path: "/appointments/create", element: <CreateScreen /> },
      { path: "/appointments/:id/reschedule", element: <RescheduleScreen /> },
      { path: "/appointments/:id/share", element: <ShareScreen /> },
      { path: "/patients", element: <PatientsScreen /> },
      { path: "/patients/add", element: <PetFormScreen /> },
      // Sprint 3 — clinical record (Diagnosis §3.4 / Treatment §3.5). These are
      // NEW screens (no Django golden). React Router v6 ranks the static
      // "/patients/add" above the dynamic "/patients/:id", so they don't clash.
      { path: "/patients/:id", element: <PetDetailScreen /> },
      { path: "/patients/:id/diagnoses/:did", element: <DiagnosisDetailScreen /> },
      { path: "/patients/:id/plans/new", element: <TreatmentPlanFormScreen /> },
      { path: "/patients/:id/plans/:pid", element: <TreatmentPlanDetailScreen /> },
      { path: "/patients/:id/plans/:pid/edit", element: <TreatmentPlanFormScreen /> },
      // Sprint 4 — payments & billing (SRS §3.8). NEW screens (no Django
      // golden). All live under the distinct "/billing" prefix, so they do not
      // clash with the "/patients" static-vs-dynamic ranking above. The static
      // "/billing/invoices/new" ranks above the dynamic "/billing/invoices/:id"
      // in React Router v6, so those two never collide either.
      { path: "/billing", element: <InvoiceListScreen /> },
      { path: "/billing/invoices/new", element: <InvoiceFormScreen /> },
      { path: "/billing/invoices/:id", element: <InvoiceDetailScreen /> },
      { path: "/billing/revenue", element: <RevenueScreen /> },
      // Sprint 5 — notification settings (SMS opt-out, SRS §3.7 AC-03). NEW
      // screen (no Django golden). Its own distinct "/notifications" prefix, so
      // it can't clash with the "/patients" or "/billing" static-vs-dynamic
      // ranking above.
      { path: "/notifications", element: <NotificationsSettingsScreen /> },
      // Sprint 7 (B) — Owner↔Doctor queries (SRS §3.9). NEW screens (no Django
      // golden). Their own distinct "/queries" prefix, so the static inbox route
      // and the dynamic thread route can't clash with the "/patients" or
      // "/billing" static-vs-dynamic ranking above.
      { path: "/queries", element: <QueryInboxScreen /> },
      { path: "/queries/:petId", element: <QueryThreadScreen /> },
      // Account / profile (view + edit). Shared screen, role-aware.
      { path: "/profile", element: <ProfileScreen /> },
    ],
  },
  // Parity-only shell route: renders the AppShell chrome (sidebar + empty
  // .main-panel) with NO active nav item — its path matches none of the
  // Sidebar NavLinks — mirroring Django's /__parity__/shell/ for a 1:1 shell
  // diff. Not linked from anywhere; does not affect real app routing/UX.
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [{ path: "/__parity__/shell", element: null }],
  },
]);
