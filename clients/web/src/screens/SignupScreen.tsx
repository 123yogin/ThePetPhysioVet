import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AuthShell from "../components/AuthShell";
import Field from "../components/Field";
import { useTitle } from "../lib/useTitle";
import { useSignup, type SignupPayload } from "../api/auth";
import { ApiError } from "../lib/http";
import type { Me } from "../lib/types";

// Mirrors signup.html + DoctorSignupForm field order:
// username, email, first_name, last_name, password1, password2,
// clinic_name, clinic_address. Help text is NOT rendered (template omits it).
export default function SignupScreen() {
  useTitle("Sign up — ThePetPhysioVet");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signup = useSignup();
  const [values, setValues] = useState<Record<string, string>>({});

  // Errors are per-field arrays + non_field_errors (form_errors() shape).
  // A duplicate email is a conflict -> 409 {email:[...]} (auth-hardening changed
  // this from 400 -> 409); every other validation failure stays 400. Both carry
  // the same body shape, so fieldErr("email") renders the duplicate-email message
  // on the email Field exactly as any other field error, regardless of status.
  const errData = signup.error instanceof ApiError ? (signup.error.data as Record<string, string[]>) : null;
  const nonFieldErrors: string[] = errData?.non_field_errors ?? [];
  const fieldErr = (name: string): string[] | undefined => errData?.[name];

  const set = (name: string) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: SignupPayload = {
      username: values.username ?? "",
      email: values.email ?? "",
      first_name: values.first_name ?? "",
      last_name: values.last_name ?? "",
      clinic_name: values.clinic_name ?? "",
      clinic_address: values.clinic_address ?? "",
      password1: values.password1 ?? "",
      password2: values.password2 ?? "",
    };
    signup.mutate(payload, {
      onSuccess: (me: Me) => {
        queryClient.setQueryData(["me"], me);
        navigate("/dashboard");
      },
    });
  }

  return (
    <AuthShell>
      <form method="post" noValidate onSubmit={onSubmit}>
        {nonFieldErrors.length > 0 ? (
          <div className="alert alert-danger">{nonFieldErrors.join(" ")}</div>
        ) : null}
        <Field label="Username" htmlFor="id_username" errors={fieldErr("username")}>
          <input type="text" name="username" className="input-glass" maxLength={150} required
            id="id_username" value={values.username ?? ""} onChange={set("username")} />
        </Field>
        <Field label="Email" htmlFor="id_email" errors={fieldErr("email")}>
          <input type="email" name="email" className="input-glass" required
            id="id_email" value={values.email ?? ""} onChange={set("email")} />
        </Field>
        <Field label="First name" htmlFor="id_first_name" errors={fieldErr("first_name")}>
          <input type="text" name="first_name" className="input-glass" maxLength={150} required
            id="id_first_name" value={values.first_name ?? ""} onChange={set("first_name")} />
        </Field>
        <Field label="Last name" htmlFor="id_last_name" errors={fieldErr("last_name")}>
          <input type="text" name="last_name" className="input-glass" maxLength={150}
            id="id_last_name" value={values.last_name ?? ""} onChange={set("last_name")} />
        </Field>
        <Field label="Password" htmlFor="id_password1" errors={fieldErr("password1")}>
          <input type="password" name="password1" autoComplete="new-password" className="input-glass"
            required id="id_password1" value={values.password1 ?? ""} onChange={set("password1")} />
        </Field>
        <Field label="Password confirmation" htmlFor="id_password2" errors={fieldErr("password2")}>
          <input type="password" name="password2" autoComplete="new-password" className="input-glass"
            required id="id_password2" value={values.password2 ?? ""} onChange={set("password2")} />
        </Field>
        <Field label="Clinic name" htmlFor="id_clinic_name" errors={fieldErr("clinic_name")}>
          <input type="text" name="clinic_name" className="input-glass" maxLength={200}
            placeholder="Clinic name" id="id_clinic_name"
            value={values.clinic_name ?? ""} onChange={set("clinic_name")} />
        </Field>
        <Field label="Clinic address" htmlFor="id_clinic_address" errors={fieldErr("clinic_address")}>
          <textarea name="clinic_address" className="input-glass" rows={2}
            placeholder="Clinic address" id="id_clinic_address"
            value={values.clinic_address ?? ""} onChange={set("clinic_address")} />
        </Field>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={signup.isPending}
        >
          Create account
        </button>
      </form>
      <p className="auth-footer">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
