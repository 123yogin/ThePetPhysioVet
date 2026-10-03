"""Email the clinic when new work arrives (enquiry / facility booking / boarding),
so leads are seen without anyone opening the portal.

Hard rule: this must NEVER break the thing it is reacting to. Every send is
wrapped — any failure (SMTP down, bad config, timeout) is logged and swallowed,
so a booking still succeeds. Does nothing unless settings.NOTIFY_DOCTOR is true
and settings.DOCTOR_EMAIL is set.

HTML is table-based with inline styles on purpose: that is what renders
reliably across Gmail, Outlook and Apple Mail. A plain-text alternative is
always attached for text-only clients and deliverability.
"""
import html
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# Eyebrow colour per kind (matches the clinic's warm palette).
_EYEBROW = {
    "enquiry": ("#4a3528", "#f6ddc4", "New enquiry"),      # ink on peach
    "booking": ("#ffffff", "#c25b3a", "New booking"),       # white on coral
    "boarding": ("#ffffff", "#2f7a57", "New boarding"),     # white on green
}


# Which portal screen each kind opens. FRONTEND_BASE_URL already points at the
# portal root (e.g. https://…/app), so the "Open in portal" button lands the
# clinic straight on the matching inbox/tab (see frontend/src/routes.tsx) rather
# than the generic dashboard.
_PORTAL_PATH = {
    "enquiry": "/enquiries",
    "booking": "/facility",
    "boarding": "/boarding",
}


def _portal_url(kind="") -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/") or "/app"
    return base + _PORTAL_PATH.get(kind, "")


def _esc(v) -> str:
    return html.escape("" if v is None else str(v))


def _render_html(eyebrow_fg, eyebrow_bg, eyebrow_text, headline, subhead, lead, rows, portal_url, owner_phone) -> str:
    row_html = "".join(
        f'<tr><td style="padding:9px 0;border-bottom:1px solid #efe6d8;color:#8a7260;font-size:14px;">{_esc(k)}</td>'
        f'<td style="padding:9px 0;border-bottom:1px solid #efe6d8;color:#2e2018;font-size:14px;font-weight:600;text-align:right;">{_esc(v)}</td></tr>'
        for k, v in rows
    )
    tel = "".join(ch for ch in (owner_phone or "") if ch.isdigit() or ch == "+")
    call_btn = (
        f'<a href="tel:{_esc(tel)}" style="display:inline-block;background:#2f7a57;color:#fff;text-decoration:none;'
        f'font-size:13px;font-weight:700;padding:12px 18px;border-radius:10px;margin-right:8px;">Call owner</a>'
        if tel else ""
    )
    sub = (
        f'<span style="font-weight:400;color:#8a7260;font-size:16px;"> {_esc(subhead)}</span>'
        if subhead else ""
    )
    return f"""\
<div style="background:#f1e8db;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e7dccd;border-radius:14px;overflow:hidden;">
    <div style="background:#f6ddc4;padding:16px 24px;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:17px;color:#4a3528;">The Pet Physio Vet</span>
      <span style="float:right;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a6a52;font-weight:700;padding-top:4px;">Clinic notification</span>
    </div>
    <div style="padding:26px 24px 28px;">
      <span style="display:inline-block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;padding:4px 10px;border-radius:999px;color:{eyebrow_fg};background:{eyebrow_bg};">{_esc(eyebrow_text)}</span>
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:23px;line-height:1.2;margin:14px 0 6px;color:#2e2018;">{_esc(headline)}{sub}</h2>
      <p style="font-size:14px;color:#6b5445;line-height:1.6;margin:0 0 20px;">{_esc(lead)}</p>
      <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">{row_html}</table>
      <div style="margin-top:22px;">
        {call_btn}<a href="{_esc(portal_url)}" style="display:inline-block;background:#35251b;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 18px;border-radius:10px;">Open in portal</a>
      </div>
    </div>
    <div style="padding:16px 24px 22px;border-top:1px solid #efe6d8;font-size:12px;color:#9a8471;line-height:1.6;">
      You're receiving this because you manage The Pet Physio Vet. This inbox isn't monitored — reply via the portal or call the owner directly.
    </div>
  </div>
</div>"""


def _render_text(eyebrow_text, headline, subhead, lead, rows, portal_url) -> str:
    lines = [f"{eyebrow_text.upper()} — {headline}{(' ' + subhead) if subhead else ''}", "", lead, ""]
    lines += [f"{k}: {v}" for k, v in rows]
    lines += ["", f"Open in portal: {portal_url}"]
    return "\n".join(lines)


def notify_doctor(*, kind, subject, headline, lead, rows, subhead="", owner_phone=None):
    """Send one clinic-notification email. Safe to call from any create path:
    returns silently if disabled/misconfigured and never raises."""
    if not getattr(settings, "NOTIFY_DOCTOR", False):
        return
    to = (getattr(settings, "DOCTOR_EMAIL", "") or "").strip()
    if not to:
        logger.warning("NOTIFY_DOCTOR is on but DOCTOR_EMAIL is empty; skipping %s notification.", kind)
        return
    try:
        fg, bg, eyebrow_text = _EYEBROW.get(kind, ("#ffffff", "#35251b", "New activity"))
        portal_url = _portal_url(kind)
        html_body = _render_html(fg, bg, eyebrow_text, headline, subhead, lead, rows, portal_url, owner_phone)
        text_body = _render_text(eyebrow_text, headline, subhead, lead, rows, portal_url)
        msg = EmailMultiAlternatives(subject=subject, body=text_body, to=[to])
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
    except Exception:
        logger.exception("Doctor notification email failed (kind=%s) — the booking is unaffected.", kind)
