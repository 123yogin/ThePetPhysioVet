import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import { useCreatePet } from "../api/pets";
import { ApiError } from "../lib/http";

// Mirrors pet_form.html + PetForm order: name, pet_type, owner_name,
// owner_phone, notes(.full). Actions: Cancel (ghost -> /patients), Save patient.
export default function PetFormScreen() {
  useTitle("Add patient — ThePetPhysioVet");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useCreatePet();

  const errData = create.error instanceof ApiError ? (create.error.data as Record<string, string[]>) : null;
  const nonFieldErrors: string[] = errData?.non_field_errors ?? [];
  const fieldErr = (name: string): string[] | undefined => errData?.[name];

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const species = String(fd.get("species") ?? "");
    // Empty file inputs still yield a zero-size File; only forward a real upload
    // so a no-photo submit sends no 'photo' key (photo stays optional — AC-02).
    const photoEntry = fd.get("photo");
    const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
    create.mutate(
      {
        name: String(fd.get("name") ?? ""),
        species,
        pet_type: species, // mirror species into legacy pet_type for back-compat
        breed: String(fd.get("breed") ?? ""),
        age: String(fd.get("age") ?? ""),
        sex: String(fd.get("sex") ?? ""),
        ...(fd.get("weight") ? { weight: String(fd.get("weight")) } : {}),
        photo,
        owner_name: String(fd.get("owner_name") ?? ""),
        owner_phone: String(fd.get("owner_phone") ?? ""),
        owner_email: String(fd.get("owner_email") ?? ""),
        complaint: String(fd.get("complaint") ?? ""),
        ...(fd.get("complaint_started")
          ? { complaint_started: String(fd.get("complaint_started")) }
          : {}),
        referred_by: String(fd.get("referred_by") ?? ""),
        medical_history: String(fd.get("medical_history") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["pets"] });
          navigate("/patients");
        },
      },
    );
  }

  return (
    <>
      <h1 className="page-title">Add patient</h1>
      <p className="page-sub">
        Save the pet &amp; owner once. You can reuse it for every future appointment.
      </p>
      <div className="panel">
        {nonFieldErrors.length > 0 ? (
          <div className="alert alert-danger">{nonFieldErrors.join(" ")}</div>
        ) : null}
        <form method="post" className="form-grid" onSubmit={onSubmit}>
          <Field label="Pet name" htmlFor="id_name" errors={fieldErr("name")}>
            <input type="text" name="name" className="input-glass" maxLength={120} required id="id_name" />
          </Field>
          <Field label="Species" htmlFor="id_species" errors={fieldErr("species")}>
            <select name="species" className="input-glass" id="id_species" defaultValue="" required>
              <option value="">Select…</option>
              <option>Dog</option>
              <option>Cat</option>
              <option>Bird</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Breed" htmlFor="id_breed" errors={fieldErr("breed")}>
            <input type="text" name="breed" className="input-glass" maxLength={120} id="id_breed" />
          </Field>
          <Field label="Age" htmlFor="id_age" errors={fieldErr("age")}>
            <input type="text" name="age" className="input-glass" maxLength={40}
              placeholder="e.g. 4 years / 6 months" id="id_age" />
          </Field>
          <Field label="Sex" htmlFor="id_sex" errors={fieldErr("sex")}>
            <select name="sex" className="input-glass" id="id_sex" defaultValue="">
              <option value="">—</option>
              <option>Male</option>
              <option>Female</option>
              <option>Unknown</option>
            </select>
          </Field>
          <Field label="Weight (kg)" htmlFor="id_weight" errors={fieldErr("weight")}>
            <input type="number" step="0.01" min="0" name="weight" className="input-glass" id="id_weight" />
          </Field>
          <Field label="Photo" htmlFor="id_photo" extra="full" errors={fieldErr("photo")}>
            <input type="file" name="photo" accept=".jpg,.jpeg,.png" className="input-glass" id="id_photo" />
          </Field>
          <Field label="Owner name" htmlFor="id_owner_name" errors={fieldErr("owner_name")}>
            <input type="text" name="owner_name" className="input-glass" maxLength={120} required
              id="id_owner_name" />
          </Field>
          <Field label="Owner phone" htmlFor="id_owner_phone" errors={fieldErr("owner_phone")}>
            <input type="text" name="owner_phone" className="input-glass" maxLength={30} required
              id="id_owner_phone" />
          </Field>
          <Field label="Owner email" htmlFor="id_owner_email" errors={fieldErr("owner_email")}>
            <input type="email" name="owner_email" className="input-glass" id="id_owner_email" />
          </Field>
          <Field label="Complaint" htmlFor="id_complaint" extra="full" errors={fieldErr("complaint")}>
            <textarea name="complaint" className="input-glass" rows={2}
              placeholder="Presenting complaint (first visit)" id="id_complaint" />
          </Field>
          <Field label="Complaint started" htmlFor="id_complaint_started" errors={fieldErr("complaint_started")}>
            <input type="date" name="complaint_started" className="input-glass" id="id_complaint_started" />
          </Field>
          <Field label="Referred by" htmlFor="id_referred_by" errors={fieldErr("referred_by")}>
            <input type="text" name="referred_by" className="input-glass" maxLength={120} id="id_referred_by" />
          </Field>
          <Field label="Medical history" htmlFor="id_medical_history" extra="full" errors={fieldErr("medical_history")}>
            <textarea name="medical_history" className="input-glass" rows={3} id="id_medical_history" />
          </Field>
          <Field label="Notes" htmlFor="id_notes" extra="full" errors={fieldErr("notes")}>
            <textarea name="notes" className="input-glass" rows={2}
              placeholder="General notes (optional)" id="id_notes" />
          </Field>
          <div className="form-actions full">
            <Link className="btn btn-ghost" to="/patients">Cancel</Link>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>Save patient</button>
          </div>
        </form>
      </div>
    </>
  );
}
