import { Link } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { useOwnerPets } from "../api/owner";

const muted = { color: "var(--brown-500)" };

// Owner home — the owner's own pets (SRS §3.1 AC-04). Read-only.
export default function OwnerHomeScreen() {
  useTitle("My pets — ThePetPhysioVet");
  const { data, isLoading, isError } = useOwnerPets();
  return (
    <>
      <h1 className="page-title">My pets</h1>
      <p className="page-sub">Your pets and their care records.</p>
      <div className="panel">
        {isLoading ? (
          <p style={{ marginTop: 0 }}>Loading your pets…</p>
        ) : isError ? (
          <p style={{ marginTop: 0 }}>Could not load your pets. Please try again.</p>
        ) : data && data.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>
                  <strong>{p.name}</strong>{" "}
                  <span style={muted}>
                    · {p.species || p.pet_type}
                    {p.breed ? ` · ${p.breed}` : ""}
                  </span>
                </span>
                <Link className="btn btn-ghost" to={`/owner/pets/${p.id}`}>View</Link>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ ...muted, marginTop: 0 }}>No pets on file yet — your clinic will add them.</p>
        )}
      </div>
    </>
  );
}
