import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import {
  useAppointment,
  useReschedule,
  useRescheduleApprove,
  useRescheduleReject,
} from "../api/appointments";
import { ApiError } from "../lib/http";

// Mirrors reschedule.html: sub-header "<pet> — <owner>", form-grid with exactly
// two .field (Date, Time), then form-actions.full "Save & share update".
export default function RescheduleScreen() {
  useTitle("Reschedule — ThePetPhysioVet");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const apptId = Number(id);
  const { data: appointment, isLoading, isError, error } = useAppointment(apptId);
  const reschedule = useReschedule(apptId);
  const approve = useRescheduleApprove(apptId);
  const reject = useRescheduleReject(apptId);

  const notFound = error instanceof ApiError && error.status === 404;
  // Owner asked for a new slot (SRS §3.6): the doctor approves (applies it) or
  // rejects (keeps the current slot). Shown as a banner above the manual form.
  const ownerRequested = appointment?.status === "Reschedule Requested" && !!appointment?.requested_date;

  const errData = reschedule.error instanceof ApiError ? (reschedule.error.data as Record<string, string[]>) : null;
  const nonFieldErrors: string[] = errData?.non_field_errors ?? [];
  const fieldErr = (name: string): string[] | undefined => errData?.[name];

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    reschedule.mutate(
      { date: String(fd.get("date") ?? ""), time: String(fd.get("time") ?? "") },
      {
        onSuccess: (result) => {
          // Prime the share cache from the inline payload so ShareScreen renders
          // without a refetch, then invalidate the affected reads.
          queryClient.setQueryData(["share", apptId], result.share);
          queryClient.invalidateQueries({ queryKey: ["appointment", apptId] });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          navigate(`/appointments/${apptId}/share`);
        },
      },
    );
  }

  return (
    <>
      <h1 className="page-title">Reschedule visit</h1>
      <p className="page-sub">
        {appointment?.pet_name} — {appointment?.owner_name}
      </p>
      <div className="panel">
        {isLoading ? (
          <p>Loading appointment…</p>
        ) : notFound ? (
          <p>Appointment not found.</p>
        ) : isError ? (
          <p>Could not load appointment. Please try again.</p>
        ) : (
          <>
          {ownerRequested ? (
            <div className="alert alert-info full" style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong>{appointment?.owner_name}</strong> requested a new time:{" "}
                <strong>{appointment?.requested_date} {appointment?.requested_time}</strong>
                {appointment?.reschedule_reason ? ` — ${appointment.reschedule_reason}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() =>
                    approve.mutate(undefined, {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ["appointments"] });
                        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                        navigate("/appointments");
                      },
                    })
                  }
                >
                  Approve requested time
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() =>
                    reject.mutate(undefined, {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ["appointments"] });
                        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                      },
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          ) : null}
          <form method="post" className="form-grid" onSubmit={onSubmit}>
            {nonFieldErrors.length > 0 ? (
              <div className="alert alert-danger full">{nonFieldErrors.join(" ")}</div>
            ) : null}
            <Field label="Date" htmlFor="id_date" errors={fieldErr("date")}>
              <input
                type="date"
                name="date"
                className="input-glass"
                required
                id="id_date"
                key={`d-${appointment?.date_iso ?? ""}`}
                defaultValue={appointment?.date_iso ?? ""}
              />
            </Field>
            <Field label="Time" htmlFor="id_time" errors={fieldErr("time")}>
              <input
                type="time"
                name="time"
                className="input-glass"
                required
                id="id_time"
                key={`t-${appointment?.time_24h ?? ""}`}
                defaultValue={appointment?.time_24h ?? ""}
              />
            </Field>
            <div className="form-actions full">
              <button type="submit" className="btn btn-primary" disabled={reschedule.isPending}>
                Save &amp; share update
              </button>
            </div>
          </form>
          </>
        )}
      </div>
    </>
  );
}
