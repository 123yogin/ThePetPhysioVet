import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import FlashStack from "./FlashStack";

// Mirrors app_base.html. Layout: flash-stack (above), then .app-shell with the
// sidebar + .main-panel, then the fixed .sidebar-toggle button. Reproduces
// app.js: the toggle flips body.sidebar-open; nav-item clicks remove it. On
// mount we clear body.className (app pages are not body.auth-page).
export default function AppShell() {
  useEffect(() => {
    document.body.className = "";
    return () => {
      document.body.classList.remove("sidebar-open");
    };
  }, []);

  const closeSidebar = () => document.body.classList.remove("sidebar-open");
  const toggleSidebar = () => document.body.classList.toggle("sidebar-open");

  return (
    <>
      <FlashStack />
      <div className="app-shell">
        <Sidebar onNavigate={closeSidebar} />
        <main className="main-panel">
          <Outlet />
        </main>
      </div>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label="Toggle menu"
        onClick={toggleSidebar}
      >
        &#9776;
      </button>
    </>
  );
}
