// Shared API/domain types. Field names mirror the Django JSON payloads so
// display formatting can be centralised in lib/format.ts.

// SRS §3.6 visit types (+ legacy Clinic/Home for existing rows).
export type VisitType = "Initial" | "Follow-up" | "Review" | "Emergency" | "Clinic" | "Home";
// SRS §3.6 status lifecycle (+ legacy "Rescheduled").
export type Status =
  | "Pending" | "Confirmed" | "Completed" | "Cancelled" | "Reschedule Requested" | "Rescheduled";

export type Role = "DOCTOR" | "OWNER";
export interface Me {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  clinic_name?: string;
  role?: Role; // DOCTOR or OWNER — drives role-based routing
}

// Account/profile page shape (GET/PATCH /auth/profile). Role-aware: clinic_*
// fields are meaningful for a DOCTOR, `phone` for an OWNER (all present but
// empty when not applicable, so the form always binds defined strings).
export interface Profile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string;
  phone: string;
}

export interface DashboardAppointment {
  id: number;
  pet_name: string;
  owner_name: string;
  time: string;
  pet_type: string;
  visit_type: VisitType;
  visit_type_display: string;
  status: Status;
}

export interface DashboardStats {
  today: string;
  today_display: string;
  today_appointments: DashboardAppointment[];
  completed_count: number;
  // ----- Sprint 7 (A): dashboard completeness (SRS §3.2) -----
  // Real stat-tile figures wired now that billing/treatment exist. Monetary
  // fields arrive as decimal strings ("2dp") straight from DRF so display never
  // re-derives them; `currency` is the ISO code ("INR") the tiles format with.
  active_treatments: number; // count of ACTIVE treatment plans
  pending_payments: string; // sum of outstanding invoice balances, 2dp
  today_revenue: string; // settled revenue for 'today', 2dp
  monthly_revenue: string; // settled revenue for the current month, 2dp
  currency: string; // ISO currency code, e.g. "INR"
}

export interface Appointment {
  id: number;
  pet_name: string;
  owner_name: string;
  date: string;
  time: string;
  visit_type: VisitType;
  visit_type_display: string;
  status: Status;
  // SRS §3.6 owner reschedule-request (present when status = Reschedule Requested)
  requested_date?: string | null;
  requested_time?: string | null;
  reschedule_reason?: string;
}

export interface AppointmentDetail extends Appointment {
  owner_phone?: string;
  // Raw values for form input defaults (mirror RescheduleForm(instance=appt)):
  //   date_iso  -> <input type="date"> value, ISO "YYYY-MM-DD" (e.g. 2026-07-22)
  //   time_24h  -> <input type="time"> value, 24h "HH:MM"      (e.g. 09:30)
  date_iso?: string;
  time_24h?: string;
}

// SRS §3.3 clinical fields — all optional (added additively in the backend).
export interface Pet {
  id: number;
  name: string;
  species?: string;
  pet_type: string;
  breed?: string;
  age?: string;
  sex?: string;
  weight?: string | null; // DRF DecimalField → string, or null
  photo?: string | null; // /media URL, or null
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  medical_history?: string;
  complaint?: string;
  complaint_started?: string | null; // ISO date or null
  referred_by?: string;
  notes?: string;
}

export interface SharePayload {
  whatsapp_url: string;
  sms_url: string;
  pet_name: string;
  owner_name: string;
  owner_phone: string;
}

// ----- Sprint 3: clinical record (Diagnosis / Treatment) -----

// Pet detail header for the clinical-record hub (GET /pets/<pk>). Same shape
// as Pet now that §3.3 fields are on the model.
export type PetDetail = Pet;

export type ReportType = "XRAY" | "MRI" | "CT" | "BLOOD" | "OTHER";

// Diagnostic report (SRS §3.4). `notes` is server-sanitised rich-text HTML,
// `file_url` an absolute /media URL, `is_dicom` drives the open-in-tab action.
export interface Diagnosis {
  id: number;
  report_type: ReportType;
  report_type_display: string;
  original_filename: string;
  size: number; // bytes
  mime: string;
  uploaded_at: string; // ISO datetime
  notes: string; // sanitized HTML
  file_url: string;
  is_dicom: boolean;
}

export type Therapy = "LASER" | "HYDROTHERAPY" | "STRETCHING" | "HOME_EXERCISE" | "OTHER";
export type Frequency = "DAILY" | "ALTERNATE" | "WEEKLY" | "CUSTOM";
export type Duration = "4WK" | "8WK" | "CUSTOM";
export type PlanStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED";

// Per-session progress note (SRS §3.5). `notes` is sanitized rich-text HTML.
export interface ProgressNote {
  id: number;
  session_no: number;
  notes: string;
  created_at: string; // ISO datetime
}

// Structured rehab plan (SRS §3.5).
export interface TreatmentPlan {
  id: number;
  therapies: Therapy[];
  frequency: Frequency;
  frequency_custom: string;
  duration: Duration;
  duration_custom: string;
  start_date: string; // ISO date
  end_date: string | null; // ISO date (derived for 4WK/8WK, captured for CUSTOM)
  status: PlanStatus;
  completed_at: string | null; // ISO datetime once COMPLETED (archived)
  created_at: string;
  updated_at: string;
}

// Plan detail carries the nested chronological progress notes.
export interface TreatmentPlanDetail extends TreatmentPlan {
  progress_notes: ProgressNote[];
}

// ----- Sprint 4: payments & billing (SRS §3.8) -----

// Invoice.payment_mode — how the money is collected (PRODUCT_PLAN §3):
//   advance         — paid up front, before treatment
//   post_treatment  — billed after the session(s)
//   package         — prepaid bundle of sessions (see Package)
//   partial         — instalments; multiple Payment rows against one Invoice
export type PaymentMode = "advance" | "post_treatment" | "package" | "partial";

// Invoice.payment_status — lifecycle driven by recorded Payments / the webhook.
export type PaymentStatus = "PENDING" | "PAID" | "PARTIALLY_PAID" | "FAILED";

// One itemised row of an invoice (Invoice.line_items jsonb). `amount` is the
// server-computed line total (quantity * unit_price) so display never re-derives it.
export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

// Invoice list row (GET /invoices). Monetary fields are decimals; formatCurrency
// in lib/money.ts accepts number|string so either DRF serialisation works.
export interface Invoice {
  id: number;
  invoice_no: string; // auto sequential (e.g. "INV-000042")
  pet_id: number;
  pet_name: string;
  subtotal: number;
  tax: number;
  total: number;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode;
  created_at: string; // ISO datetime
}

// A single Payment against an invoice (Payment entity).
export interface Payment {
  id: number;
  invoice_id: number;
  amount_paid: number;
  gateway_ref: string | null; // Razorpay payment id, or null for manual/cash
  status: PaymentStatus;
  paid_at: string | null; // ISO datetime once settled
}

// Prepaid session bundle tied to a package-mode invoice (Package entity). The
// counter decrements when a linked appointment is marked Completed.
export interface Package {
  id: number;
  invoice_id: number;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number; // server-computed convenience (total - used)
}

// Invoice detail (GET /invoices/:id): line items + payment history, plus the
// running settlement figures and the optional package for package-mode invoices.
export interface InvoiceDetail extends Invoice {
  line_items: LineItem[];
  payments: Payment[];
  package: Package | null;
  amount_paid: number; // sum of settled payments
  balance_due: number; // total - amount_paid
}

// Revenue dashboard window (GET /revenue?range=...).
export type RevenueRange = "day" | "week" | "month";

// Aggregated revenue for a window (off the read replica). `total` is settled
// revenue; `pending_total` is outstanding balance across the same window.
export interface RevenueSummary {
  range: RevenueRange;
  start: string; // ISO date (window start, inclusive)
  end: string; // ISO date (window end, inclusive)
  total: number; // collected/settled revenue
  pending_total: number; // outstanding (unpaid/partial) in the window
  invoice_count: number;
  paid_count: number;
}

// ----- Sprint 5: notifications & reminders (SRS §3.7 + §7) -----

// The §7 event catalogue that produces a doctor notification, plus the
// time-based appointment reminders (24h/1h/30min) fired by the scheduler. The
// `(string & {})` tail keeps literal autocompletion while staying
// forward-compatible if the backend introduces a type the UI doesn't yet know
// (display then falls back to `type_display`).
export type NotificationType =
  | "appointment_created"
  | "appointment_accepted"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "invoice_generated"
  | "payment_received"
  | "diagnosis_uploaded"
  | "treatment_added"
  | "reminder"
  | (string & {});

// A single in-app notification (Notification entity: id, user_id, type,
// message, is_read, created_at). `type_display` is the server's human label for
// the type; `link` is an optional in-app route the feed row can deep-link to.
export interface Notification {
  id: number;
  type: NotificationType;
  type_display?: string;
  message: string;
  is_read: boolean;
  created_at: string; // ISO datetime
  link?: string | null;
}

// GET /notifications — the latest-N feed plus the live unread tally, so the
// dashboard dropdown and the sidebar badge can hydrate from one response.
export interface NotificationFeed {
  // Matches the backend feed payload key exactly: NotificationListView returns
  // {"results": [...], "unread_count": n} (appointments/api_notifications.py).
  results: Notification[];
  unread_count: number;
}

// GET /notifications/unread-count — the badge-only payload (no list), kept
// separate so the sidebar badge can poll cheaply without pulling the feed.
export interface UnreadCount {
  unread_count: number;
}

// Owner SMS opt-out preference (NotificationPref, SRS §3.7 AC-03). Keyed by the
// owner phone the SMS channel would target; `sms_opt_out=true` suppresses SMS
// to that number while leaving in-app / push notifications untouched.
export interface NotificationPref {
  owner_phone: string;
  sms_opt_out: boolean;
}

// ----- Sprint 7 (B): Owner↔Doctor queries (SRS §3.9) -----
// Append-only message threads per pet (audit trail — no deletes). Doctor-side
// only for now (owner-side deferred). Field names mirror the DRF payloads.

// Pet header carried by both the inbox row and the thread view
// (GET /queries/inbox results[].pet and GET /pets/{id}/queries pet).
export interface QueryPet {
  id: number;
  name: string;
  pet_type: string;
  owner_name: string;
}

// One image attachment on a query message. `url` is an absolute /media URL;
// `size` is bytes; `mime` is the JPEG/PNG content type.
export interface QueryAttachment {
  id: number;
  url: string;
  original_filename: string;
  mime: string;
  size: number;
}

// A single message in a pet's query thread, oldest→newest. `sender_role` /
// `sender_name` are server-set (DOCTOR for replies, OWNER for owner messages).
export interface ThreadMessage {
  id: number;
  sender_role: "DOCTOR" | "OWNER";
  sender_name: string;
  message: string;
  attachments: QueryAttachment[];
  sent_at: string; // ISO datetime
}

// Full thread for one pet (GET /pets/{id}/queries) — the pet-history view.
export interface QueryThread {
  pet: QueryPet;
  messages: ThreadMessage[];
}

// Compact preview of the most recent message on an inbox row, or null when the
// thread has no messages yet.
export interface InboxLastMessage {
  snippet: string;
  sent_at: string; // ISO datetime
  sender_role: "DOCTOR" | "OWNER";
}

// One row of the doctor's query inbox (GET /queries/inbox results[]). Ordered
// by last_message_at desc server-side; `awaiting_reply` is true when the last
// message came from the OWNER (i.e. the doctor still owes a reply).
export interface InboxItem {
  pet: QueryPet;
  last_message: InboxLastMessage | null;
  awaiting_reply: boolean;
  message_count: number;
}
