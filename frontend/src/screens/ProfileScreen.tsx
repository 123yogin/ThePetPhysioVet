import { useEffect, useState, type FormEvent } from "react";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import { useProfile, useUpdateProfile, type ProfilePatch } from "../api/profile";
import { ApiError } from "../lib/http";

// Account / profile page (view + edit). Role-aware: a DOCTOR edits clinic
// name/address/phone; an OWNER edits a contact phone. Both edit name + email.
export default function ProfileScreen() {
  useTitle("Profile — ThePetPhysioVet");
  const { data, isLoading, isError } = useProfile();
  const update = useUpdateProfile();

  const [form, setForm] = useState<ProfilePatch>({});
  const [saved, setSaved] = useState(false);

  // Seed the form once the profile loads.
  useEffect(() => {
    if (data) {
      setForm({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        clinic_name: data.clinic_name,
        clinic_address: data.clinic_address,
        clinic_phone: data.clinic_phone,
        phone: data.phone,
      });
    }
  }, [data]);

  const errData = update.error instanceof ApiError ? (update.error.data as Record<string, string[]>) : null;
  const fieldErr = (name: string) => errData?.[name];

  function set<K extends keyof ProfilePatch>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const isDoctor = data?.role === "DOCTOR";
    // Send only the fields relevant to this role.
    const patch: ProfilePatch = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      ...(isDoctor
        ? { clinic_name: form.clinic_name, clinic_address: form.clinic_address, clinic_phone: form.clinic_phone }
        : { phone: form.phone }),
    };
    update.mutate(patch, { onSuccess: () => setSaved(true) });
  }

  if (isLoading) return <div className="panel">Loading…</div>;
  if (isError || !data) return <div className="panel">Could not load your profile.</div>;

  const isDoctor = data.role === "DOCTOR";

  return (
    <>
      <h1 className="page-title">Profile</h1>
      <p className="page-sub">{isDoctor ? "Your clinic and account details." : "Your account and contact details."}</p>
      <div className="panel">
        <form className="form-grid" onSubmit={onSubmit}>
          {saved ? <div className="alert alert-success full">Profile saved.</div> : null}
          {update.isError && !errData?.email ? (
            <div className="alert alert-danger full">Could not save. Please try again.</div>
          ) : null}

          <Field label="First name" htmlFor="id_first_name">
            <input id="id_first_name" className="input-glass" value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="id_last_name">
            <input id="id_last_name" className="input-glass" value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="id_email" errors={fieldErr("email")}>
            <input id="id_email" type="email" className="input-glass" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>

          {isDoctor ? (
            <>
              <Field label="Clinic name" htmlFor="id_clinic_name">
                <input id="id_clinic_name" className="input-glass" value={form.clinic_name ?? ""} onChange={(e) => set("clinic_name", e.target.value)} />
              </Field>
              <Field label="Clinic phone" htmlFor="id_clinic_phone">
                <input id="id_clinic_phone" className="input-glass" value={form.clinic_phone ?? ""} onChange={(e) => set("clinic_phone", e.target.value)} />
              </Field>
              <Field label="Clinic address" htmlFor="id_clinic_address">
                <textarea id="id_clinic_address" className="input-glass" rows={2} value={form.clinic_address ?? ""} onChange={(e) => set("clinic_address", e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="Phone" htmlFor="id_phone">
              <input id="id_phone" className="input-glass" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          )}

          <div className="form-actions full">
            <button type="submit" className="btn btn-primary" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
