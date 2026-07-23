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

      {/* ----- Clinical profile (SRS §3.3) ----- */}
      <div className="panel">
        {petLoading ? (
          <p style={{ margin: 0 }}>Loading patient…</p>
        ) : pet ? (
          <>
            {hasVal(pet.photo) ? (
              <img
                src={pet.photo as string}
                alt={`${pet.name} photo`}
                style={{ maxWidth: "100%", borderRadius: "var(--radius)", marginBottom: 12 }}
              />
            ) : null}
            <MetaRow label="Name" value={pet.name} />
            <MetaRow label="Species" value={pet.species} />
            <MetaRow label="Breed" value={pet.breed} />
            <MetaRow label="Age" value={pet.age} />
            <MetaRow label="Sex" value={pet.sex} />
            {hasVal(pet.weight) ? (
              <p className="meta-row"><strong>Weight:</strong> {pet.weight} kg</p>
            ) : null}
            <MetaRow label="Owner" value={pet.owner_name} />
            <MetaRow label="Phone" value={pet.owner_phone} />
            <MetaRow label="Email" value={pet.owner_email} />
            <MetaRow label="Complaint" value={pet.complaint} />
            {hasVal(pet.complaint_started) ? (
              <p className="meta-row">
                <strong>Complaint started:</strong> {dateMedium(pet.complaint_started as string)}
              </p>
            ) : null}
            <MetaRow label="Referred by" value={pet.referred_by} />
            <MetaRow label="Notes" value={pet.notes} />
            {/* US-PET-03: medical history — pre-wrap preserves line breaks. */}
            <p className="meta-row" style={{ whiteSpace: "pre-wrap" }}>
              <strong>Medical history:</strong>{" "}
              {hasVal(pet.medical_history) ? pet.medical_history : "No medical history recorded"}
            </p>
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

// True only for a meaningful, printable value. Guards against the literal
// strings "null"/"None"/"undefined" ever reaching the DOM, and treats
// null/undefined/blank as empty (weight & complaint_started are null-able).
function hasVal(v: unknown): v is string {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && s !== "null" && s !== "None" && s !== "undefined";
}

// One §3.3 profile field as a .meta-row; renders nothing when the value is empty.
function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!hasVal(value)) return null;
  return (
    <p className="meta-row">
      <strong>{label}:</strong> {value}
    </p>
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
