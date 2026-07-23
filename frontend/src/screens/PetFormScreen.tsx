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
    create.mutate(
      {
        name: String(fd.get("name") ?? ""),
        pet_type: String(fd.get("pet_type") ?? ""),
        owner_name: String(fd.get("owner_name") ?? ""),
        owner_phone: String(fd.get("owner_phone") ?? ""),
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
          <Field label="Species / type" htmlFor="id_pet_type" errors={fieldErr("pet_type")}>
            <input type="text" name="pet_type" className="input-glass" maxLength={80}
              placeholder="e.g. Dog, Cat" required id="id_pet_type" />
          </Field>
          <Field label="Owner name" htmlFor="id_owner_name" errors={fieldErr("owner_name")}>
            <input type="text" name="owner_name" className="input-glass" maxLength={120} required
              id="id_owner_name" />
          </Field>
          <Field label="Owner phone" htmlFor="id_owner_phone" errors={fieldErr("owner_phone")}>
            <input type="text" name="owner_phone" className="input-glass" maxLength={30} required
              id="id_owner_phone" />
          </Field>
          <Field label="Notes" htmlFor="id_notes" extra="full" errors={fieldErr("notes")}>
            <textarea name="notes" className="input-glass" rows={3}
              placeholder="Medical history / notes (optional)" id="id_notes" />
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
