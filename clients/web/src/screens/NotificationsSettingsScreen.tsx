import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import { useNotificationPref, useSetNotificationPref } from "../api/notifications";

// Sprint 5 — Notification settings / SMS opt-out (SRS §3.7 AC-03). Route
// /notifications. Doctor-facing control to read and toggle a given owner's SMS
// opt-out preference (looked up by phone). All chrome reuses vet.css classes
// verbatim (.page-title/.page-sub/.panel/.field/.input-glass/.btn/.alert); the
// only extras are the notification classes foundation added to clinical.css
// (.pref-toggle*, .notif-empty). This screen adds NO CSS and touches no
// existing parity screen.
//
// The looked-up phone lives in the URL query string (?owner_phone=…) rather
// than component state, so a page reload re-reads it and the saved opt-out
// value re-hydrates — i.e. the toggle persists across reload.
export default function NotificationsSettingsScreen() {
  useTitle("Notification settings — ThePetPhysioVet");

  const [params, setParams] = useSearchParams();
  const phone = (params.get("owner_phone") ?? "").trim();

  // Input buffer, separate from the committed (URL) phone so the pref query key
  // stays stable while the user is still typing. Seeded from the URL so a
  // reloaded / shared link shows the phone it was looking up.
  const [phoneInput, setPhoneInput] = useState(phone);

  const pref = useNotificationPref(phone);
  const setPref = useSetNotificationPref();

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const next = phoneInput.trim();
    // Reset any lingering save state when switching owners.
    setPref.reset();
    if (next) setParams({ owner_phone: next });
    else setParams({});
  }

  // Reflect the server value; default to "not opted out" until it loads.
  const optOut = pref.data?.sms_opt_out ?? false;

  function onToggle() {
    if (!phone || pref.isLoading || pref.isError) return;
    setPref.mutate({ owner_phone: phone, sms_opt_out: !optOut });
  }

  return (
    <>
      <h1 className="page-title">Notification settings</h1>
      <p className="page-sub">
        Manage whether SMS reminders and alerts are sent to an owner&rsquo;s phone.
        In-app and push notifications are unaffected.
      </p>

      {/* ----- Owner lookup ----- */}
      <div className="panel">
        <form onSubmit={onLookup} noValidate>
          <Field
            label="Owner phone"
            htmlFor="owner-phone"
            help="Enter the phone number the SMS channel would message."
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                id="owner-phone"
                className="input-glass"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. +919876543210"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!phoneInput.trim()}
              >
                Look up
              </button>
            </div>
          </Field>
        </form>
      </div>

      {/* ----- Preference for the looked-up owner ----- */}
      {phone ? (
        <div className="panel" aria-live="polite">
          {pref.isLoading ? (
            <p className="notif-empty">Loading preference for {phone}…</p>
          ) : pref.isError ? (
            <div className="alert alert-danger">
              Could not load the SMS preference for {phone}.{" "}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => pref.refetch()}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <label className="pref-toggle">
                <input
                  type="checkbox"
                  className="pref-toggle-input"
                  checked={optOut}
                  disabled={setPref.isPending}
                  onChange={onToggle}
                  data-testid="sms-opt-out"
                />
                <span className="pref-toggle-track" aria-hidden="true">
                  <span className="pref-toggle-thumb" />
                </span>
                <span className="pref-toggle-label">
                  Opt <strong>{phone}</strong> out of SMS notifications
                </span>
              </label>

              <p className="page-sub" style={{ margin: "12px 0 0" }}>
                {optOut
                  ? "SMS to this number is currently suppressed."
                  : "This number currently receives SMS notifications."}
              </p>

              {setPref.isError ? (
                <div className="alert alert-danger" style={{ marginTop: 12 }}>
                  Could not save the preference. Please try again.
                </div>
              ) : setPref.isSuccess ? (
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  Preference saved.
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
