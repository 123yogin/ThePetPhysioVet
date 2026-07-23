import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import {
  useCreatePlan,
  useTreatmentPlan,
  useUpdatePlan,
  type PlanPayload,
} from "../api/treatment";
import { ApiError } from "../lib/http";
import {
  DURATIONS,
  FREQUENCIES,
  PLAN_STATUSES,
  THERAPIES,
} from "../lib/clinical";
import type { Duration, Frequency, PlanStatus, Therapy } from "../lib/types";

// Create (/patients/:id/plans/new) or edit (/patients/:id/plans/:pid/edit) a
// structured treatment plan. Therapy checkbox group (5 types), frequency +
// duration selects with conditional custom fields, status select. Inline
// required-field validation before the request; server field errors surfaced
// under each field.
export default function TreatmentPlanFormScreen() {
  const { id, pid } = useParams();
  const petId = Number(id);
  const planId = pid ? Number(pid) : undefined;
  const isEdit = planId !== undefined;
  useTitle(`${isEdit ? "Edit" : "New"} treatment plan — ThePetPhysioVet`);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useTreatmentPlan(isEdit ? planId! : NaN);
  const create = useCreatePlan(petId);
  const update = useUpdatePlan(planId ?? NaN);
  const saving = create.isPending || update.isPending;

  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [frequency, setFrequency] = useState<Frequency>("DAILY");
  const [frequencyCustom, setFrequencyCustom] = useState("");
  const [duration, setDuration] = useState<Duration>("4WK");
  const [durationCustom, setDurationCustom] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<PlanStatus>("ACTIVE");
  const [clientError, setClientError] = useState<string | null>(null);

  // Prefill on edit once the plan loads.
  const plan = existing.data;
  useEffect(() => {
    if (!plan) return;
    setTherapies(plan.therapies);
    setFrequency(plan.frequency);
    setFrequencyCustom(plan.frequency_custom ?? "");
    setDuration(plan.duration);
    setDurationCustom(plan.duration_custom ?? "");
    setStartDate(plan.start_date ?? "");
    setEndDate(plan.end_date ?? "");
    setStatus(plan.status);
  }, [plan]);

  const serverErr =
    (create.error instanceof ApiError ? (create.error.data as Record<string, string[]>) : null) ??
    (update.error instanceof ApiError ? (update.error.data as Record<string, string[]>) : null);
  const fieldErr = (name: string): string[] | undefined => serverErr?.[name];
  const nonFieldErrors: string[] = serverErr?.non_field_errors ?? [];

  const completed = isEdit && plan?.status === "COMPLETED";

  function toggleTherapy(value: Therapy) {
    setTherapies((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  }

  function validate(): string | null {
    if (therapies.length < 1) return "Select at least one therapy type.";
    if (!frequency) return "Choose a frequency.";
    if (frequency === "CUSTOM" && !frequencyCustom.trim()) return "Describe the custom frequency.";
    if (!duration) return "Choose a duration.";
    if (duration === "CUSTOM" && !durationCustom.trim()) return "Describe the custom duration.";
    if (duration === "CUSTOM" && !endDate) return "Set an end date for the custom duration.";
    if (!startDate) return "Choose a start date.";
    if (!status) return "Choose a status.";
    return null;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setClientError(err);
      return;
    }
    setClientError(null);

    const payload: PlanPayload = {
      therapies,
      frequency,
      frequency_custom: frequency === "CUSTOM" ? frequencyCustom.trim() : "",
      duration,
      duration_custom: duration === "CUSTOM" ? durationCustom.trim() : "",
      start_date: startDate,
      // end_date is derived server-side for 4WK/8WK; captured for CUSTOM.
      end_date: duration === "CUSTOM" ? endDate : null,
      status,
    };

    if (isEdit) {
      update.mutate(payload, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["treatment-plan", planId] });
          queryClient.invalidateQueries({ queryKey: ["treatment-plans", petId] });
          navigate(`/patients/${petId}/plans/${planId}`);
        },
      });
    } else {
      create.mutate(payload, {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: ["treatment-plans", petId] });
          navigate(`/patients/${petId}/plans/${created.id}`);
        },
      });
    }
  }

  if (isEdit && existing.isLoading) {
    return (
      <>
        <h1 className="page-title">Edit treatment plan</h1>
        <div className="panel"><p style={{ margin: 0 }}>Loading plan…</p></div>
      </>
    );
  }

  if (completed) {
    return (
      <>
        <h1 className="page-title">Edit treatment plan</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>
            This plan is completed and archived (read-only).{" "}
            <Link to={`/patients/${petId}/plans/${planId}`}>View plan</Link>.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">{isEdit ? "Edit treatment plan" : "New treatment plan"}</h1>
      <p className="page-sub">
        Structured rehab plan: therapy types, frequency, duration and status.
      </p>

      <div className="panel">
        <form className="form-grid" onSubmit={onSubmit}>
          {nonFieldErrors.length > 0 ? (
            <div className="alert alert-danger full">{nonFieldErrors.join(" ")}</div>
          ) : null}

          {/* Therapies — checkbox group */}
          <div className="field full">
            <label>Therapies:</label>
            <div id="id_visit_type">
              {THERAPIES.map((t) => (
                <div key={t.value}>
                  <label htmlFor={`therapy_${t.value}`}>
                    <input
                      type="checkbox"
                      id={`therapy_${t.value}`}
                      value={t.value}
                      checked={therapies.includes(t.value)}
                      onChange={() => toggleTherapy(t.value)}
                    />{" "}
                    {t.label}
                  </label>
                </div>
              ))}
            </div>
            {fieldErr("therapies") ? (
              <ul className="errorlist">{fieldErr("therapies")!.map((e, i) => <li key={i}>{e}</li>)}</ul>
            ) : null}
          </div>

          {/* Frequency */}
          <Field label="Frequency" htmlFor="id_frequency" errors={fieldErr("frequency")}>
            <select id="id_frequency" className="input-glass" value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          {frequency === "CUSTOM" ? (
            <Field label="Custom frequency" htmlFor="id_frequency_custom" errors={fieldErr("frequency_custom")}>
              <input id="id_frequency_custom" className="input-glass" type="text" maxLength={120}
                placeholder="e.g. 3× per week" value={frequencyCustom}
                onChange={(e) => setFrequencyCustom(e.target.value)} />
            </Field>
          ) : (
            <div className="field" aria-hidden="true" />
          )}

          {/* Duration */}
          <Field label="Duration" htmlFor="id_duration" errors={fieldErr("duration")}>
            <select id="id_duration" className="input-glass" value={duration}
              onChange={(e) => setDuration(e.target.value as Duration)}>
              {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          {duration === "CUSTOM" ? (
            <Field label="Custom duration" htmlFor="id_duration_custom" errors={fieldErr("duration_custom")}>
              <input id="id_duration_custom" className="input-glass" type="text" maxLength={120}
                placeholder="e.g. 6 weeks" value={durationCustom}
                onChange={(e) => setDurationCustom(e.target.value)} />
            </Field>
          ) : (
            <div className="field" aria-hidden="true" />
          )}

          {/* Start / end dates */}
          <Field label="Start date" htmlFor="id_start_date" errors={fieldErr("start_date")}>
            <input id="id_start_date" className="input-glass" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          {duration === "CUSTOM" ? (
            <Field label="End date" htmlFor="id_end_date" errors={fieldErr("end_date")}>
              <input id="id_end_date" className="input-glass" type="date" value={endDate}
                onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          ) : (
            <div className="field" aria-hidden="true" />
          )}

          {/* Status */}
          <Field label="Status" htmlFor="id_status" errors={fieldErr("status")}>
            <select id="id_status" className="input-glass" value={status}
              onChange={(e) => setStatus(e.target.value as PlanStatus)}>
              {PLAN_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          {clientError ? <div className="alert alert-danger full">{clientError}</div> : null}

          <div className="form-actions full">
            <Link className="btn btn-ghost" to={isEdit ? `/patients/${petId}/plans/${planId}` : `/patients/${petId}`}>
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create plan"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
