import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  useDiagnosis,
  useDeleteDiagnosis,
  useReplaceDiagnosisFile,
} from "../api/diagnoses";
import { ApiError } from "../lib/http";
import {
  dateTimeMedium,
  humanSize,
  reportTypeLabel,
  validateUploadFile,
} from "../lib/clinical";

// Single diagnostic report (/patients/:id/diagnoses/:did). Shows the sanitized
// rich-text notes, open/download (or DICOM "open in new tab"), plus delete and
// replace controls. Delete uses a styled confirm dialog, not window.confirm.
export default function DiagnosisDetailScreen() {
  useTitle("Diagnostic report — ThePetPhysioVet");
  const { id, did } = useParams();
  const petId = Number(id);
  const diagId = Number(did);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: diag, isLoading, error } = useDiagnosis(diagId);
  const notFound = error instanceof ApiError && error.status === 404;

  const del = useDeleteDiagnosis();
  const replace = useReplaceDiagnosisFile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<number | null>(null);

  const replaceServerErr =
    replace.error instanceof ApiError ? (replace.error.data as Record<string, string[]>) : null;
  const replaceFieldError = replaceServerErr?.file?.join(" ") ?? replaceServerErr?.non_field_errors?.join(" ");

  function onDelete() {
    del.mutate(diagId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["diagnoses", petId] });
        queryClient.removeQueries({ queryKey: ["diagnosis", diagId] });
        navigate(`/patients/${petId}`);
      },
    });
  }

  function onReplacePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const pre = validateUploadFile(f);
    if (pre) {
      setReplaceError(pre);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setReplaceError(null);
    setReplaceProgress(0);
    replace.mutate(
      { id: diagId, file: f, onProgress: setReplaceProgress },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(["diagnosis", diagId], updated);
          queryClient.invalidateQueries({ queryKey: ["diagnoses", petId] });
          setReplaceProgress(null);
          if (fileRef.current) fileRef.current.value = "";
        },
        onError: () => {
          setReplaceProgress(null);
          if (fileRef.current) fileRef.current.value = "";
        },
      },
    );
  }

  return (
    <>
      <h1 className="page-title">Diagnostic report</h1>
      <p className="page-sub">
        <Link to={`/patients/${petId}`}>&larr; Back to patient record</Link>
      </p>

      <div className="panel">
        {isLoading ? (
          <p style={{ margin: 0 }}>Loading report…</p>
        ) : notFound ? (
          <p style={{ margin: 0 }}>Report not found.</p>
        ) : !diag ? (
          <p style={{ margin: 0 }}>Could not load report. Please try again.</p>
        ) : (
          <>
            <p className="meta-row">
              <strong>Type:</strong>{" "}
              <span className="chip">{diag.report_type_display || reportTypeLabel(diag.report_type)}</span>
            </p>
            <p className="meta-row"><strong>File:</strong> {diag.original_filename}</p>
            <p className="meta-row"><strong>Size:</strong> {humanSize(diag.size)}</p>
            <p className="meta-row"><strong>Uploaded:</strong> {dateTimeMedium(diag.uploaded_at)}</p>

            <div className="share-actions">
              {diag.is_dicom ? (
                // DICOM: no in-app viewer in v1 — open the file in a new browser tab.
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => window.open(diag.file_url, "_blank", "noopener")}
                >
                  Open DICOM in new tab
                </button>
              ) : (
                <a className="btn btn-primary" href={diag.file_url} target="_blank" rel="noopener noreferrer">
                  Open / view
                </a>
              )}
              <a className="btn btn-ghost" href={diag.file_url} download={diag.original_filename}>
                Download
              </a>
            </div>

            {/* Notes (server-sanitized HTML) */}
            <h3 style={{ margin: "20px 0 8px", fontSize: "1rem" }}>Notes</h3>
            {diag.notes ? (
              <div className="rt-content" dangerouslySetInnerHTML={{ __html: diag.notes }} />
            ) : (
              <p className="meta-row">No notes.</p>
            )}

            {/* Replace */}
            <h3 style={{ margin: "20px 0 8px", fontSize: "1rem" }}>Replace file</h3>
            <p className="field-hint" style={{ marginBottom: 8 }}>
              Uploads a new file in place of this one (same type &amp; 20MB rules apply). The
              report entry keeps its place in the list.
            </p>
            <input
              ref={fileRef}
              type="file"
              className="input-glass"
              accept=".jpg,.jpeg,.png,.pdf,.dcm,.dicom"
              onChange={onReplacePick}
              disabled={replace.isPending}
              aria-label="Replace file"
            />
            {replaceError ? <div className="alert alert-danger" style={{ marginTop: 10 }}>{replaceError}</div> : null}
            {replaceFieldError ? <div className="alert alert-danger" style={{ marginTop: 10 }}>{replaceFieldError}</div> : null}
            {replaceProgress !== null ? (
              <div className="upload-progress" aria-hidden="true">
                <span style={{ width: `${replaceProgress}%` }} />
              </div>
            ) : null}

            {/* Delete */}
            <div className="form-actions" style={{ marginTop: 22 }}>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete report
              </button>
            </div>
          </>
        )}
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete diagnostic report?"
          message="This permanently removes the report and its file. This cannot be undone."
          confirmLabel="Delete"
          danger
          busy={del.isPending}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
