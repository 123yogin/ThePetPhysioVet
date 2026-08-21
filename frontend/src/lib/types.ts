export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  clinic_name?: string;
  role: 'DOCTOR' | 'OWNER';
}

export interface Pet {
  id: number;
  name: string;
  species: string;
  pet_type?: string;
  breed?: string;
  age?: string;
  sex?: string;
  weight?: string | number;
  photo?: string | null;
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  /** Read-only, derived server-side from Pet.doctor. null when unassigned. */
  doctor_name?: string | null;
  medical_history?: string;
  complaint?: string;
  complaint_started?: string | null;
  referred_by?: string;
  notes?: string;
}

export interface Appointment {
  id: number;
  pet_id: number;
  pet_name: string;
  owner_name: string;
  owner_phone: string;
  date: string;
  time: string;
  visit_type: 'Initial' | 'Follow-up' | string;
  visit_type_display?: string;
  status: 'Confirmed' | 'Completed' | 'Rescheduled' | 'Cancelled' | 'Reschedule Requested' | string;
  requested_date?: string | null;
  requested_time?: string | null;
  reschedule_reason?: string;
  reason_notes?: string;
  share?: {
    whatsapp_url: string;
    sms_url: string;
    pet_name: string;
    owner_name: string;
    owner_phone: string;
  };
}

export interface Diagnosis {
  id: number;
  pet_id: number;
  report_type: 'XRAY' | 'MRI' | 'CT' | 'ULTRASOUND' | 'BLOOD' | 'OTHER' | string;
  report_type_display?: string;
  original_filename: string;
  size: number;
  mime: string;
  uploaded_at: string;
  notes?: string;
  file_url: string;
  is_dicom?: boolean;
}

export interface ProgressNote {
  id: number;
  session_no: number;
  notes: string;
  created_at: string;
}

export interface TreatmentPlan {
  id: number;
  pet_id: number;
  therapies: string[];
  frequency: string;
  frequency_custom?: string;
  duration: string;
  duration_custom?: string;
  start_date: string;
  end_date?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  progress_notes: ProgressNote[];
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount_paid: number;
  gateway_ref?: string | null;
  status: string;
  paid_at: string;
}

export interface Package {
  id: number;
  invoice_id: number;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  pet_id: number;
  pet_name: string;
  subtotal: number;
  tax: number;
  total: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIALLY_PAID' | string;
  payment_mode: 'post_treatment' | 'pre_payment' | 'package' | string;
  created_at: string;
  line_items: LineItem[];
  payments: Payment[];
  package?: Package | null;
  amount_paid: number;
  balance_due: number;
}

export interface NotificationItem {
  id: number;
  type: string;
  type_display?: string;
  message: string;
  is_read: boolean;
  created_at: string;
  link?: string;
}

export interface QueryAttachment {
  id: number;
  url: string;
  original_filename: string;
  mime: string;
  size: number;
}

export interface QueryMessage {
  id: number;
  sender_role: 'DOCTOR' | 'OWNER';
  sender_name: string;
  message: string;
  attachments: QueryAttachment[];
  sent_at: string;
}

export interface QueryThread {
  pet: {
    id: number;
    name: string;
    pet_type?: string;
    owner_name: string;
  };
  messages: QueryMessage[];
  last_message?: {
    snippet: string;
    sent_at: string;
    sender_role: 'DOCTOR' | 'OWNER';
  } | null;
  awaiting_reply?: boolean;
  message_count?: number;
}

export interface DashboardStats {
  today: string;
  today_display: string;
  today_appointments: {
    id: number;
    pet_name: string;
    owner_name: string;
    time: string;
    pet_type: string;
    visit_type: string;
    visit_type_display?: string;
    status: string;
  }[];
  completed_count: number;
  active_treatments: number;
  pending_payments: string | number;
  today_revenue: string | number;
  monthly_revenue: string | number;
  currency: string;
}
