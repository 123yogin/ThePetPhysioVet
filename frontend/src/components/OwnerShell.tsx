import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLogout } from "../api/auth";
import { queryClient } from "../api/queryClient";
import FlashStack from "./FlashStack";

// Owner-side shell — same chrome as AppShell but an owner nav (My pets · Logout).
export default function OwnerShell() {
  const navigate = useNavigate();
  const logout = useLogout();
  useEffect(() => {
    document.body.className = "";
    return () => document.body.classList.remove("sidebar-open");
  }, []);
  const close = () => document.body.classList.remove("sidebar-open");
  const toggle = () => document.body.classList.toggle("sidebar-open");
  function onLogout() {
    close();
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        navigate("/login");
      },
    });
  }
  const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-item active" : "nav-item");
  return (
    <>
      <FlashStack />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">ThePetPhysioVet</div>
          <NavLink className={navClass} to="/owner" end onClick={close}>
            <span className="icon">&#128054;</span> My pets
          </NavLink>
          <NavLink className={navClass} to="/owner/appointments" onClick={close}>
            <span className="icon">&#128197;</span> My appointments
          </NavLink>
          <NavLink className={navClass} to="/owner/billing" onClick={close}>
            <span className="icon">&#8377;</span> Billing
          </NavLink>
          <NavLink className={navClass} to="/owner/notifications" onClick={close}>
            <span className="icon">&#128276;</span> Notifications
          </NavLink>
          <div className="sidebar-spacer"></div>
          <NavLink className={navClass} to="/owner/profile" onClick={close}>
            <span className="icon">&#128100;</span> Profile
          </NavLink>
          <a className="nav-item" href="/login" onClick={(e) => { e.preventDefault(); onLogout(); }}>
            <span className="icon">&#8594;</span> Logout
          </a>
        </aside>
        <main className="main-panel">
          <Outlet />
        </main>
      </div>
      <button type="button" className="sidebar-toggle" aria-label="Toggle menu" onClick={toggle}>
        &#9776;
      </button>
    </>
  );
}
