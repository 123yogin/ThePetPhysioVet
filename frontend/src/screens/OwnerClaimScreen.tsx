import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import Field from "../components/Field";
import { useTitle } from "../lib/useTitle";
import { useOwnerSetPassword } from "../api/owner";
import { ApiError } from "../lib/http";

// Owner account activation (SRS §3.1). The clinic creates the account when they
// add your pet; here you set a password by entering the email the clinic has on
// file. On success -> /login.
export default function OwnerClaimScreen() {
  useTitle("Activate account — ThePetPhysioVet");
  const navigate = useNavigate();
  const claim = useOwnerSetPassword();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const errData = claim.error instanceof ApiError ? (claim.error.data as Record<string, string[]>) : null;
  const nonFieldErrors: string[] = errData?.non_field_errors ?? [];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    claim.mutate(
      { email: email.trim().toLowerCase(), password },
      { onSuccess: () => navigate("/login") },
    );
  }

  return (
    <AuthShell>
      <form noValidate onSubmit={onSubmit}>
        <p className="page-sub" style={{ marginTop: 0 }}>
          Set a password for the account your clinic created for you.
        </p>
        {nonFieldErrors.length > 0 ? (
          <div className="alert alert-danger">{nonFieldErrors.join(" ")}</div>
        ) : null}
        <Field label="Email (as given to your clinic)" htmlFor="id_email">
          <input type="email" id="id_email" className="input-glass" autoComplete="username"
            required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="New password (min 8 characters)" htmlFor="id_password">
          <input type="password" id="id_password" className="input-glass" autoComplete="new-password"
            minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}
          disabled={claim.isPending}>
          {claim.isPending ? "Activating…" : "Activate & continue"}
        </button>
      </form>
      <p className="auth-footer">
        Already activated? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
