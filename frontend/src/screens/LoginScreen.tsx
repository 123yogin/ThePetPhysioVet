import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AuthShell from "../components/AuthShell";
import Field from "../components/Field";
import { useTitle } from "../lib/useTitle";
import { useLogin } from "../api/auth";
import { ApiError } from "../lib/http";
import type { Me } from "../lib/types";

// Mirrors login.html: field-per-input form (DoctorLoginForm order:
// username "Email or username", password), full-width Sign in button,
// non_field_errors in .alert.alert-danger, .auth-footer link to /signup.
export default function LoginScreen() {
  useTitle("Sign in — ThePetPhysioVet");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Invalid credentials -> 401 {non_field_errors:[...]} from DoctorLoginForm
  // (auth-hardening changed this from 400 -> 401). http.ts excludes /auth/login
  // from the refresh-on-401 interceptor, so this 401 surfaces here as a normal
  // ApiError (no token refresh, no redirect/loop) and renders inline as before.
  const errData = login.error instanceof ApiError ? (login.error.data as Record<string, string[]>) : null;
  const nonFieldErrors: string[] = errData?.non_field_errors ?? [];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: (me: Me) => {
          queryClient.setQueryData(["me"], me);
          navigate(me.role === "OWNER" ? "/owner" : "/dashboard");
        },
      },
    );
  }

  return (
    <AuthShell>
      <form method="post" noValidate onSubmit={onSubmit}>
        {nonFieldErrors.length > 0 ? (
          <div className="alert alert-danger">{nonFieldErrors.join(" ")}</div>
        ) : null}
        <Field label="Email or username" htmlFor="id_username">
          <input
            type="text"
            name="username"
            autoComplete="username"
            className="input-glass"
            maxLength={150}
            required
            id="id_username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="id_password">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            className="input-glass"
            required
            id="id_password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={login.isPending}
        >
          Sign in
        </button>
      </form>
      <p className="auth-footer">
        New clinic? <Link to="/signup">Create account</Link>
        {" · "}Pet owner? <Link to="/activate">Activate account</Link>
      </p>
    </AuthShell>
  );
}
