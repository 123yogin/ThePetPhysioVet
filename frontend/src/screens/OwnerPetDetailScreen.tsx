import { Link, useParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { useOwnerPetDetail } from "../api/owner";
import OwnerQueryPanel from "../components/OwnerQueryPanel";

const muted = { color: "var(--brown-500)" };

// Owner's read-only view of one pet + its clinical record (§3.3/§3.4/§3.5 owner side).
export default function OwnerPetDetailScreen() {
  const { id } = useParams();
  const { data, isLoading, isError } = useOwnerPetDetail(Number(id));
  useTitle(`${data?.name ?? "Pet"} — ThePetPhysioVet`);

  if (isLoading) return <div className="panel">Loading…</div>;
  if (isError || !data) return <div className="panel">Could not load this pet.</div>;

  const header = [data.species || data.pet_type, data.breed, data.age, data.sex, data.weight ? `${data.weight} kg` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to="/owner">&larr; My pets</Link>
      </p>
      <h1 className="page-title">{data.name}</h1>
      <p className="page-sub">{header}</p>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Details</h3>
        {data.complaint ? <p><strong>Complaint:</strong> {data.complaint}</p> : null}
        {data.medical_history ? <p><strong>Medical history:</strong> {data.medical_history}</p> : null}
        <p style={muted}>Cared for by your clinic.</p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Diagnoses</h3>
        {data.diagnoses && data.diagnoses.length > 0 ? (
          <ul>
            {data.diagnoses.map((d) => (
              <li key={d.id}>
                {d.report_type_display || d.report_type}
                {d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ""}
                {d.file_url ? (
                  <> · <a href={d.file_url} target="_blank" rel="noopener noreferrer">view report</a></>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ ...muted, marginTop: 0 }}>No reports yet.</p>
        )}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Treatment plans</h3>
        {data.treatment_plans && data.treatment_plans.length > 0 ? (
          <ul>
            {data.treatment_plans.map((t) => (
              <li key={t.id}>
                {(t.therapies || []).join(", ")} · {t.frequency} · <strong>{t.status}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ ...muted, marginTop: 0 }}>No treatment plans yet.</p>
        )}
      </div>

      <OwnerQueryPanel petId={data.id} />
    </>
  );
}
