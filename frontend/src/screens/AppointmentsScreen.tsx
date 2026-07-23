import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import { useAppointments, useComplete } from "../api/appointments";
import Badge from "../components/Badge";

// Mirrors appointments.html: GET filter-bar (Pet/Owner/Date prefilled from the
// query string) + results table with an inline complete-checkbox and
// Reschedule/Share actions.
export default function AppointmentsScreen() {
  useTitle("Appointments — ThePetPhysioVet");
  const [params, setParams] = useSearchParams();

  const filterPet = params.get("pet") ?? "";
  const filterOwner = params.get("owner") ?? "";
  const filterDate = params.get("date") ?? "";

  const [pet, setPet] = useState(filterPet);
  const [owner, setOwner] = useState(filterOwner);
  const [date, setDate] = useState(filterDate);

  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAppointments({
    pet: filterPet,
    owner: filterOwner,
    date: filterDate,
  });
  const appointments = data ?? [];
  const complete = useComplete();

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (pet) next.pet = pet;
    if (owner) next.owner = owner;
    if (date) next.date = date;
    setParams(next);
  }

  function onComplete(e: { preventDefault: () => void }, id: number) {
    e.preventDefault();
    complete.mutate(id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      },
    });
  }

  return (
    <>
      <h1 className="page-title">View appointments</h1>
      <p className="page-sub">Search by pet name, owner name, or date.</p>
      <div className="panel">
        <form method="get" className="filter-bar" onSubmit={onSearch}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="fpet">Pet name</label>
            <input className="input-glass" id="fpet" type="text" name="pet" placeholder="Pet"
              value={pet} onChange={(e) => setPet(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="fowner">Owner name</label>
            <input className="input-glass" id="fowner" type="text" name="owner" placeholder="Owner"
              value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="fdate">Date</label>
            <input className="input-glass" id="fdate" type="date" name="date"
              value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-sm btn-primary">Search</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pet</th>
                <th>Owner</th>
                <th>Date &amp; time</th>
                <th>Visit</th>
                <th>Status</th>
                <th>Done</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7}>Loading appointments…</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7}>Could not load appointments. Please try again.</td>
                </tr>
              ) : appointments.length > 0 ? (
                appointments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.pet_name}</td>
                    <td>{a.owner_name}</td>
                    <td>
                      {a.date} <span style={{ color: "var(--brown-500)" }}>{a.time}</span>
                    </td>
                    <td>{a.visit_type_display}</td>
                    <td>
                      <Badge status={a.status} />
                    </td>
                    <td>
                      {a.status !== "Completed" ? (
                        <form
                          method="post"
                          className="inline-form"
                          onSubmit={(e) => onComplete(e, a.id)}
                        >
                          <input type="hidden" name="next" value="list" />
                          <label style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              disabled={complete.isPending && complete.variables === a.id}
                              onChange={(e) => onComplete(e, a.id)}
                            />{" "}
                            Tick
                          </label>
                        </form>
                      ) : (
                        <span style={{ color: "#2e7d32", fontWeight: 700 }}>&#10003;</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link className="btn btn-sm btn-ghost" to={`/appointments/${a.id}/reschedule`}>
                        Reschedule
                      </Link>{" "}
                      <Link className="btn btn-sm btn-primary" to={`/appointments/${a.id}/share`}>
                        Share
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>No appointments match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
