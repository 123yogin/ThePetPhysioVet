import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import { usePets } from "../api/pets";
import { useCreateAppointment } from "../api/appointments";
import { ApiError } from "../lib/http";

// Mirrors create.html + AppointmentForm order: pet, visit_type, date, time,
// reason_notes. pet/visit_type/reason_notes carry .full. visit_type is a radio
// group with a .field-hint help line above it, rendered as Django's actual
// RadioSelect DOM (<div id="id_visit_type"><div><label>…).
const VISIT_HELP =
  "Initial = first visit · Follow-up = ongoing rehab · Review = re-assessment · Emergency = urgent.";

export default function CreateScreen() {
  useTitle("Create appointment — ThePetPhysioVet");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: pets, isLoading: petsLoading, isError: petsError } = usePets();
  const create = useCreateAppointment();

  const errData = create.error instanceof ApiError ? (create.error.data as Record<string, string[]>) : null;
  const nonFieldErrors: string[] = errData?.non_field_errors ?? [];
  const fieldErr = (name: string): string[] | undefined => errData?.[name];

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate(
      {
        pet: Number(fd.get("pet")),
        visit_type: String(fd.get("visit_type") ?? ""),
        date: String(fd.get("date") ?? ""),
        time: String(fd.get("time") ?? ""),
        reason_notes: String(fd.get("reason_notes") ?? ""),
      },
      {
        onSuccess: (appt) => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          navigate(`/appointments/${appt.id}/share`);
        },
      },
    );
  }

  return (
    <>
      <h1 className="page-title">Create appointment</h1>
      <p className="page-sub">
        Pick a patient and a time. You can share WhatsApp / SMS right after saving.
      </p>
      <div className="panel">
        {nonFieldErrors.length > 0 ? (
          <div className="alert alert-danger">{nonFieldErrors.join(" ")}</div>
        ) : null}
        <form method="post" className="form-grid" onSubmit={onSubmit}>
          <Field label="Patient" htmlFor="id_pet" extra="full" errors={fieldErr("pet")}>
            <select name="pet" className="input-glass" required id="id_pet" defaultValue="">
              <option value="">
                {petsLoading ? "Loading patients…" : petsError ? "Could not load patients" : "---------"}
              </option>
              {(pets ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.name} (${p.owner_name})`}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Visit type" htmlFor="id_visit_type" extra="full" help={VISIT_HELP} errors={fieldErr("visit_type")}>
            <div id="id_visit_type">
              {["Initial", "Follow-up", "Review", "Emergency"].map((v, i) => (
                <div key={v}>
                  <label htmlFor={`id_visit_type_${i}`}>
                    <input type="radio" name="visit_type" value={v} required
                      id={`id_visit_type_${i}`} defaultChecked={v === "Follow-up"} />{" "}
                    {v}
                  </label>
                </div>
              ))}
            </div>
          </Field>

          <Field label="Date" htmlFor="id_date" errors={fieldErr("date")}>
            <input type="date" name="date" className="input-glass" required id="id_date" />
          </Field>

          <Field label="Time" htmlFor="id_time" errors={fieldErr("time")}>
            <input type="time" name="time" className="input-glass" required id="id_time" />
          </Field>

          <Field label="Reason notes" htmlFor="id_reason_notes" extra="full" errors={fieldErr("reason_notes")}>
            <textarea name="reason_notes" className="input-glass" rows={3}
              placeholder="Reason / notes" id="id_reason_notes" />
          </Field>

          <div className="form-actions full">
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              Save &amp; open share
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
