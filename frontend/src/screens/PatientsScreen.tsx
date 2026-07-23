import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { usePets } from "../api/pets";

// Mirrors patients.html: space-between filter-bar (left search form, right
// "Add patient") + patients table with a per-row Book action.
export default function PatientsScreen() {
  useTitle("Patients — ThePetPhysioVet");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filterQ = params.get("q") ?? "";
  const [q, setQ] = useState(filterQ);

  const { data, isLoading, isError } = usePets(filterQ);
  const patients = data ?? [];

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setParams(q ? { q } : {});
  }

  return (
    <>
      <h1 className="page-title">Patients</h1>
      <p className="page-sub">
        Your saved pets. Add one here, then book appointments for it without re-typing
        details.
      </p>
      <div className="panel">
        <div className="filter-bar" style={{ justifyContent: "space-between" }}>
          <form method="get" className="filter-bar" style={{ margin: 0, padding: 0, border: 0 }}
            onSubmit={onSearch}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="fq">Search</label>
              <input className="input-glass" id="fq" type="text" name="q"
                placeholder="Pet or owner name" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-sm btn-primary">Search</button>
          </form>
          <Link className="btn btn-sm btn-primary" to="/patients/add">
            &#10133; Add patient
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pet</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>Loading patients…</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5}>Could not load patients. Please try again.</td>
                </tr>
              ) : patients.length > 0 ? (
                patients.map((p) => (
                  // Sprint 3: the row opens the pet's clinical record hub
                  // (/patients/:id). This is a pixel-safe enhancement — it adds
                  // NO visible element, so the golden screenshot is byte-identical;
                  // only behaviour (row click / keyboard) is added. Keyboard users
                  // activate with Enter/Space; the inner "Book" link keeps its own
                  // action via stopPropagation. See UI_PARITY note in the report.
                  <tr
                    key={p.id}
                    role="link"
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    aria-label={`Open clinical record for ${p.name}`}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
                      }
                    }}
                  >
                    <td>{p.name}</td>
                    <td>{p.pet_type}</td>
                    <td>{p.owner_name}</td>
                    <td>{p.owner_phone}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link
                        className="btn btn-sm btn-primary"
                        to="/appointments/create"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Book
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    No patients yet. <Link to="/patients/add">Add your first patient</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
