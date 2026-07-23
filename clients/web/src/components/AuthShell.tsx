import { useEffect, type ReactNode } from "react";
import { useFlash, alertClass } from "../lib/flash";

// Mirrors base_auth.html. Sets body.auth-page (centres the card via vet.css),
// renders the .auth-shell.glass-card with the .auth-brand, then any flash
// messages inline (as base_auth does), then the screen content.
export default function AuthShell({ children }: { children: ReactNode }) {
  const { messages } = useFlash();

  useEffect(() => {
    document.body.className = "auth-page";
    return () => {
      document.body.className = "";
    };
  }, []);

  return (
    <div className="auth-shell glass-card">
      <div className="auth-brand">
        <h1>ThePetPhysioVet</h1>
        <p>Veterinary appointment desk</p>
      </div>
      {messages.map((m) => (
        <div key={m.id} className={`alert ${alertClass(m.level)}`}>
          {m.text}
        </div>
      ))}
      {children}
    </div>
  );
}
