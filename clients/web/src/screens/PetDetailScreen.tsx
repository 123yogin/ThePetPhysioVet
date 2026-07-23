import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import RichText from "../components/RichText";
import {
  usePetDetail,
  useDiagnoses,
  useUploadDiagnosis,
} from "../api/diagnoses";
import { useTreatmentPlans } from "../api/treatment";
import { ApiError } from "../lib/http";
import {
  REPORT_TYPES,
  dateTimeMedium,
  humanSize,
  planStatusBadge,
  planStatusLabel,
  reportTypeLabel,
  therapyLabel,
  validateUploadFile,
} from "../lib/clinical";
import { dateMedium } from "../lib/format";
import type { TreatmentPlan } from "../lib/types";

// Clinical-record hub (/patients/:id). Header + pet info, then two sections:
// Diagnostic reports (inline upload + list) and Treatment plans (active +
// archived). All markup reuses vet.css classes; the few extras come from
// clinical.css.
export default function PetDetailScreen() {
  const { id } = useParams();
  const petId = Number(id);
  const queryClient = useQueryClient();

  const { data: pet, isLoading: petLoading, error: petError } = usePetDetail(petId);
  const petNotFound = petError instanceof ApiError && petError.status === 404;
  useTitle(`${pet?.name ?? "Patient"} — ThePetPhysioVet`);

  const { data: diagnoses, isLoading: diagLoading, isError: diagError } = useDiagnoses(petId);
  const { data: plans, isLoading: plansLoading, isError: plansError } = useTreatmentPlans(petId);

  const upload = useUploadDiagnosis(petId);

  // Controlled upload-form state.
  const [reportType, setReportType] = useState<string>("XRAY");
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // key forces the RichText + file <input> to remount (reset) after a success.
  const [formKey, setFormKey] = useState(0);

  const serverErr =
    upload.error instanceof ApiError ? (upload.error.data as Record<string, string[]>) : null;
  const fieldErr = (name: string): string[] | undefined => serverErr?.[name];
  const nonFieldErrors: string[] = serverErr?.non_field_errors ?? [];

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setClientError(f ? validateUploadFile(f) : null);
  }

  function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setClientError("Choose a file to upload.");
      return;
    }
    const pre = validateUploadFile(file);
    if (pre) {
      setClientError(pre);
      return;
    }
    setClientError(null);
    setProgress(0);
    upload.mutate(
      { file, report_type: reportType, notes, onProgress: setProgress },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["diagnoses", petId] });
          // Reset the form for the next upload without a full reload.
          setReportType("XRAY");
          setNotes("");
          setFile(null);
          setProgress(null);
          setFormKey((k) => k + 1);
        },
        onError: () => setProgress(null),
      },
    );
  }

  const rows = diagnoses ?? [];
  const activePlans = (plans ?? []).filter((p) => p.status !== "COMPLETED");
  const archivedPlans = (plans ?? []).filter((p) => p.status === "COMPLETED");

  if (petNotFound) {
    return (
      <>
        <h1 className="page-title">Patient</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>
            Patient not found. <Link to="/patients">Back to patients</Link>.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">{pet?.name ?? "Patient"}</h1>
      <p className="page-sub">
        Clinical record — diagnostic reports and treatment plans for this patient.
      </p>

      {/* ----- Pet info ----- */}
      <div className="panel">
        {petLoading ? (
          <p style={{ margin: 0 }}>Loading patient…</p>
        ) : pet ? (
          <>
            <p className="meta-row"><strong>Type:</strong> {pet.pet_type}</p>
            <p className="meta-row"><strong>Owner:</strong> {pet.owner_name}</p>
            <p className="meta-row"><strong>Phone:</strong> {pet.owner_phone}</p>
            {pet.notes ? <p className="meta-row"><strong>Notes:</strong> {pet.notes}</p> : null}
          </>
        ) : (
          <p style={{ margin: 0 }}>Could not load patient.</p>
        )}
      </div>

      {/* ----- Billing (Sprint 4 nav entry — no golden sidebar item exists) ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Billing &amp; invoices</h2>
          <Link className="btn btn-sm btn-primary" to={`/billing/invoices/new?pet=${petId}`}>
            &#10133; New invoice
          </Link>
        </div>
        <p className="meta-row" style={{ margin: 0 }}>
          <Link to={`/billing?pet=${petId}`}>Invoices &amp; payments for this patient</Link>
          {" · "}
          <Link to="/billing/revenue">Revenue dashboard</Link>
        </p>
      </div>

      {/* ----- Owner↔Doctor queries (Sprint 7 B — SRS §3.9) ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Owner queries</h2>
          <Link className="btn btn-sm btn-primary" to={`/queries/${petId}`}>
            Open query thread
          </Link>
        </div>
        <p className="meta-row" style={{ margin: 0 }}>
          <Link to={`/queries/${petId}`}>Messages between this owner and you</Link>{" "}
          (append-only history).
        </p>
      </div>

      {/* ----- Diagnostic reports ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Diagnostic reports</h2>
        </div>

        {/* Upload form */}
        <form className="form-grid" onSubmit={onUpload} key={`up-${formKey}`}>
          {nonFieldErrors.length > 0 ? (
            <div className="alert alert-danger full">{nonFieldErrors.join(" ")}</div>
          ) : null}
          <Field label="Report type" htmlFor="id_report_type" errors={fieldErr("report_type")}>
            <select
              id="id_report_type"
              name="report_type"
              className="input-glass"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
          <Field label="File" htmlFor="id_file" errors={fieldErr("file")}>
            <input
              id="id_file"
              name="file"
              type="file"
              className="input-glass"
              accept=".jpg,.jpeg,.png,.pdf,.dcm,.dicom"
              onChange={onFileChange}
            />
          </Field>
          <Field label="Notes" htmlFor="id_diag_notes" extra="full">
            <RichText
              id="id_diag_notes"
              value={notes}
              onChange={setNotes}
              ariaLabel="Diagnosis notes"
              placeholder="Findings / notes (optional)…"
            />
          </Field>
          {clientError ? (
            <div className="alert alert-danger full">{clientError}</div>
          ) : null}
          {progress !== null ? (
            <div className="upload-progress full" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          <div className="form-actions full">
            <button type="submit" className="btn btn-primary" disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload report"}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {diagLoading ? (
                <tr><td colSpan={5}>Loading reports…</td></tr>
              ) : diagError ? (
                <tr><td colSpan={5}>Could not load reports. Please try again.</td></tr>
              ) : rows.length > 0 ? (
                rows.map((d) => (
                  <tr key={d.id}>
                    <td><span className="chip">{d.report_type_display || reportTypeLabel(d.report_type)}</span></td>
                    <td>{d.original_filename}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{humanSize(d.size)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateTimeMedium(d.uploaded_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link className="btn btn-sm btn-ghost" to={`/patients/${petId}/diagnoses/${d.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5}>No diagnostic reports yet. Upload one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----- Treatment plans ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Treatment plans</h2>
          <Link className="btn btn-sm btn-primary" to={`/patients/${petId}/plans/new`}>
            &#10133; New plan
          </Link>
        </div>

        {plansLoading ? (
          <p style={{ margin: 0 }}>Loading treatment plans…</p>
        ) : plansError ? (
          <p style={{ margin: 0 }}>Could not load treatment plans. Please try again.</p>
        ) : (plans ?? []).length === 0 ? (
          <p style={{ margin: 0 }}>No treatment plans yet. Create the first one.</p>
        ) : (
          <>
            <PlanTable petId={petId} title="Active" plans={activePlans} emptyText="No active plans." />
            {archivedPlans.length > 0 ? (
              <PlanTable petId={petId} title="Archived / Completed" plans={archivedPlans} emptyText="" />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function PlanTable({
  petId,
  title,
  plans,
  emptyText,
}: {
  petId: number;
  title: string;
  plans: TreatmentPlan[];
  emptyText: string;
}) {
  return (
    <div style={{ marginBottom: title === "Active" ? 18 : 0 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>{title}</h3>
      {plans.length === 0 ? (
        emptyText ? <p className="meta-row">{emptyText}</p> : null
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Therapies</th>
                <th>Start</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.therapies.map(therapyLabel).join(", ")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{dateMedium(p.start_date)}</td>
                  <td>
                    <span className={`badge ${planStatusBadge(p.status)}`}>
                      {planStatusLabel(p.status)}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link className="btn btn-sm btn-ghost" to={`/patients/${petId}/plans/${p.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
