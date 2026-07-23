// US-PAY-03 — Razorpay web checkout (SRS §3.8). Self-contained: give it an
// `invoice` and on click it creates a Razorpay order via useCheckoutOrder, then
// opens the hosted web checkout. Final invoice status is NOT set here — it is
// driven asynchronously by the idempotent server webhook, so on completion we
// only invalidate ['invoice', id] to refetch the webhook-updated status.
//
// Dev/mock: when the order response carries `mock: true` (backend running with
// no real Razorpay keys) we simulate a successful settlement without loading the
// external checkout.js script, so the flow is exercisable offline.
//
// Styling reuses vet.css only (.btn + .alert-success/-error/-info) — no new CSS.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCheckoutOrder, useRecordPayment } from "../api/billing";
import type { CheckoutOrder } from "../api/billing";
import { ApiError } from "../lib/http";
import { formatCurrency } from "../lib/money";
import type { Invoice } from "../lib/types";

// The dev/mock backend adds `mock: true` to the order; the shared CheckoutOrder
// type doesn't model it, so we widen locally rather than edit the shared file.
type OrderResponse = CheckoutOrder & { mock?: boolean };

// Minimal shape of the Razorpay web-checkout constructor we rely on. Loaded at
// runtime from checkout.js; declared here so we never pull an external @types.
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  order_id: string;
  description?: string;
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}
interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (payload: unknown) => void) => void;
}
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Inject checkout.js once and resolve when the Razorpay global is ready. A
// second call reuses the in-flight / resolved promise so we never double-load.
let checkoutScript: Promise<RazorpayConstructor> | null = null;
function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay checkout failed to initialise"));
    };
    const onError = () => {
      checkoutScript = null; // allow a later retry
      reject(new Error("Could not load the Razorpay checkout script"));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    } else if (window.Razorpay) {
      onLoad();
    }
  });
  return checkoutScript;
}

type Feedback = { kind: "success" | "error" | "info"; text: string } | null;

interface CheckoutButtonProps {
  invoice: Invoice;
  className?: string;
  label?: string;
}

export default function CheckoutButton({ invoice, className, label }: CheckoutButtonProps) {
  const qc = useQueryClient();
  const checkout = useCheckoutOrder(invoice.id);
  const recordPayment = useRecordPayment(invoice.id);
  // `busy` covers the whole open→settle window (order create + modal lifetime),
  // which extends past the mutation's own isPending once the widget is open.
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Payment settled — the webhook is what actually flips the invoice status, so
  // refetch it. Kept mount-safe because the modal can outlive the component.
  const onSettled = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["invoice", invoice.id] });
    if (!mounted.current) return;
    setBusy(false);
    setFeedback({
      kind: "success",
      text: "Payment received — updating the invoice…",
    });
  }, [qc, invoice.id]);

  const onCancelled = useCallback(() => {
    if (!mounted.current) return;
    setBusy(false);
    setFeedback({ kind: "info", text: "Payment cancelled. You can try again." });
  }, []);

  const onError = useCallback((message: string) => {
    if (!mounted.current) return;
    setBusy(false);
    setFeedback({ kind: "error", text: message });
  }, []);

  const handleClick = useCallback(async () => {
    if (busy) return;
    if (invoice.payment_status === "PAID") {
      setFeedback({ kind: "info", text: "This invoice is already paid." });
      return;
    }
    setBusy(true);
    setFeedback(null);

    let order: OrderResponse;
    try {
      order = (await checkout.mutateAsync()) as OrderResponse;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `Could not start checkout (error ${err.status}). Please try again.`
          : "Could not start checkout. Please try again.";
      onError(message);
      return;
    }

    // Dev/offline path: no real gateway AND no webhook to flip the status, so
    // settle the invoice directly by recording a full payment (mock ref). This
    // is what makes the mock "Pay" actually mark the invoice PAID instead of
    // hanging on "updating…".
    if (order.mock) {
      try {
        await recordPayment.mutateAsync({
          amount_paid: invoice.total,
          gateway_ref: `mock_${order.order_id}`,
          status: "PAID",
        });
      } catch {
        onError("Mock payment could not be recorded. Please try again.");
        return;
      }
      if (!mounted.current) return;
      setBusy(false);
      setFeedback({ kind: "success", text: "Payment received — invoice marked paid." });
      return;
    }

    let Razorpay: RazorpayConstructor;
    try {
      Razorpay = await loadRazorpay();
    } catch {
      onError("Could not load the payment window. Check your connection and retry.");
      return;
    }

    try {
      const rzp = new Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        order_id: order.order_id,
        description: `Invoice ${order.invoice_no}`,
        handler: () => onSettled(),
        modal: { ondismiss: () => onCancelled() },
      });
      rzp.on("payment.failed", () =>
        onError("The payment could not be completed. Please try again."),
      );
      rzp.open();
    } catch {
      onError("Could not open the payment window. Please try again.");
    }
  }, [busy, invoice.payment_status, invoice.total, checkout, recordPayment, onSettled, onCancelled, onError]);

  const amountLabel = formatCurrency(invoice.total);
  const buttonText = busy ? "Opening checkout…" : label ?? `Pay ${amountLabel}`;

  return (
    <div className="checkout-button">
      <button
        type="button"
        className={className ?? "btn btn-primary"}
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        aria-label={`Pay ${amountLabel} for invoice ${invoice.invoice_no} with Razorpay`}
      >
        {buttonText}
      </button>
      {feedback && (
        <div
          className={`alert alert-${feedback.kind === "error" ? "error" : feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
          aria-live={feedback.kind === "error" ? "assertive" : "polite"}
          style={{ marginTop: 12 }}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
