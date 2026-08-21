import { http } from '../lib/http';
import { Invoice, Payment } from '../lib/types';

export async function fetchInvoices(petId?: number): Promise<Invoice[]> {
  const query = petId ? `?pet=${petId}` : '';
  return http<Invoice[]>(`/invoices${query}`);
}

export async function createInvoice(data: {
  pet_id: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  tax?: number;
  payment_mode?: string;
  total_sessions?: number;
}): Promise<Invoice> {
  return http<Invoice>('/invoices', {
    method: 'POST',
    data,
  });
}

export async function fetchInvoiceDetail(id: number): Promise<Invoice> {
  return http<Invoice>(`/invoices/${id}`);
}

export async function addPayment(
  invoiceId: number,
  data: { amount_paid: number; gateway_ref?: string; idempotency_key?: string },
): Promise<Payment> {
  return http<Payment>(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    // The server implements the idempotency guard required by CLAUDE.md rule 6,
    // keyed on `idempotency_key` — but this client never sent one, so a
    // double-click or a retried request could double-credit a payment. Generate
    // one per call unless the caller supplies its own.
    data: { idempotency_key: crypto.randomUUID(), ...data },
  });
}

export async function fetchRevenueStats(range = 'month'): Promise<any> {
  return http(`/revenue?range=${range}`);
}
