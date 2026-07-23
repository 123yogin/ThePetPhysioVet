import { NavLink, useNavigate } from "react-router-dom";
import { useLogout } from "../api/auth";
import { queryClient } from "../api/queryClient";

// Mirrors the <aside class="sidebar"> block of app_base.html EXACTLY. The
// Django golden shell has no Notifications nav item, so this shared sidebar must
// not add one — the shell is chrome reused by every authenticated screen and
// any extra row breaks the byte-identical parity gate on all of them. The
// doctor reaches the in-app notification feed on the dashboard, and the SMS
// opt-out screen (/notifications) is linked from that feed's header — neither is
// a Django-golden shell surface, so parity is preserved.
// Icons are the exact HTML entities from the template.
function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-item active" : "nav-item";
}

export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const logout = useLogout();

  function onLogout() {
    onNavigate();
    // Sprint 6 (Auth Hardening): useLogout's mutationFn reads the refresh token
    // (getRefresh) and POSTs {refresh} so the server BLACKLISTS it, then clears the
    // local token store. We MUST fire that mutation FIRST and only clear the query
    // cache + navigate from its onSuccess — never before — so the refresh token is
    // still present in the store to be sent for server-side revocation. Order:
    //   mutate -> server revokes refresh + clears session -> onSuccess -> clear() -> /login.
    logout.mutate(undefined, {
      onSuccess: () => {
        // 204 -> drop all cached server state so the next screen re-fetches
        // as the (now) anonymous session, then return to the login screen.
        queryClient.clear();
        navigate("/login");
      },
    });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">ThePetPhysioVet</div>
      <NavLink className={navClass} to="/dashboard" end onClick={onNavigate}>
        <span className="icon">&#128197;</span> Dashboard
      </NavLink>
      {/* Patients active on both /patients and /patients/add (no `end`). */}
      <NavLink className={navClass} to="/patients" onClick={onNavigate}>
        <span className="icon">&#128054;</span> Patients
      </NavLink>
      <NavLink className={navClass} to="/appointments/create" onClick={onNavigate}>
        <span className="icon">&#10133;</span> Create appointment
      </NavLink>
      {/* `end` so it stays inactive on create / reschedule sub-routes. */}
      <NavLink className={navClass} to="/appointments" end onClick={onNavigate}>
        <span className="icon">&#128203;</span> View appointments
      </NavLink>
      {/* Billing + Revenue: intentional divergence from the Django golden shell.
          Django's UI is being retired and these are React-only features (SRS §3.8),
          so the shell is now baselined against React, not the Django template. */}
      <NavLink className={navClass} to="/billing" end onClick={onNavigate}>
        <span className="icon">&#8377;</span> Billing
      </NavLink>
      <NavLink className={navClass} to="/billing/revenue" onClick={onNavigate}>
        <span className="icon">&#128200;</span> Revenue
      </NavLink>
      <div className="sidebar-spacer"></div>
      <NavLink className={navClass} to="/profile" onClick={onNavigate}>
        <span className="icon">&#128100;</span> Profile
      </NavLink>
      <a
        className="nav-item"
        href="/login"
        onClick={(e) => {
          e.preventDefault();
          onLogout();
        }}
      >
        <span className="icon">&#8594;</span> Logout
      </a>
    </aside>
  );
}
