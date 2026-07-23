import { useParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { useShare } from "../api/appointments";
import { ApiError } from "../lib/http";

// Mirrors share.html: post-create/reschedule landing with WhatsApp / SMS links
// built server-side.
export default function ShareScreen() {
  useTitle("Share — ThePetPhysioVet");
  const { id } = useParams();
  const { data, isLoading, isError, error } = useShare(Number(id));

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <>
      <h1 className="page-title">Share appointment</h1>
      <p className="page-sub">
        {data?.pet_name} · {data?.owner_name} · {data?.owner_phone}
      </p>
      <div className="panel">
        {isLoading ? (
          <p style={{ marginTop: 0 }}>Loading share details…</p>
        ) : notFound ? (
          <p style={{ marginTop: 0 }}>Appointment not found.</p>
        ) : isError ? (
          <p style={{ marginTop: 0 }}>Could not load share details. Please try again.</p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Send the owner the details by WhatsApp or text message.
            </p>
            <div className="share-actions">
              <a className="btn btn-primary share-btn" href={data?.whatsapp_url}
                target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <a className="btn btn-ghost share-btn" href={data?.sms_url}>
                SMS / Text
              </a>
            </div>
            <p style={{ marginTop: 18, fontSize: 13, color: "var(--brown-500)" }}>
              Message includes pet, date &amp; time, your name, and clinic details from your
              profile.
            </p>
          </>
        )}
      </div>
    </>
  );
}
