"""Event receivers that turn domain events into notifications (SRS §7).

``AppointmentsConfig.ready()`` imports this module so the receivers below connect
at startup. This is the Sprint 5 fan-out task (b): event-driven creation of the
§7 catalogue notifications. Each receiver routes to
:func:`appointments.notifications.notify` with:

  * a distinct :class:`~appointments.models.Notification` ``type``,
  * a human-readable ``message`` naming the pet / owner / subject,
  * a stable ``dedup_key`` of the form ``evt:<domain>:<pk>:<type>`` so an event
    redelivered under at-least-once semantics (CLAUDE.md rule 6) de-dupes via the
    ``get_or_create`` inside ``notify`` — no duplicate row, no re-delivery,
  * ``sms_to`` = the owner's phone (SMS, subject to opt-out) and ``push=True`` for
    the doctor's FCM web-push.

Everything runs off the request path (as a signal receiver) and ``notify`` itself
swallows every error, so a notification/delivery failure can NEVER roll back the
business mutation that emitted it (AC-03 / AC-04).

Importing this module has no side effects beyond connecting the receivers.
"""

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import (
    Appointment,
    Diagnosis,
    Invoice,
    Notification,
    Payment,
    TreatmentPlan,
)
from .services.notifications import notify

logger = logging.getLogger(__name__)


def _dedup_key(domain, pk, type):
    """Stable idempotency key for a catalogue event: ``evt:<domain>:<pk>:<type>``."""
    return f"evt:{domain}:{pk}:{type}"


def _owner(pet):
    """`(pet_name, owner_name)` pair for message composition."""
    return pet.name, pet.owner_name


# ---------------------------------------------------------------------------
# Appointment — created / rescheduled (+ dormant accepted / cancelled)
# ---------------------------------------------------------------------------
# The Appointment model currently defines only Pending / Completed / Rescheduled.
# ACCEPTED / CANCELLED are wired here but DORMANT: their branches only activate
# once those status values exist on the model, so this receiver is forward
# compatible with the SRS §3.6 lifecycle without hard-coding absent constants.
_APPOINTMENT_STATUS_NOTIFICATIONS = {
    Appointment.STATUS_RESCHEDULED: Notification.APPOINTMENT_RESCHEDULED,
}
for _status_attr, _notif_type in (
    ("STATUS_ACCEPTED", Notification.APPOINTMENT_ACCEPTED),
    ("STATUS_CANCELLED", Notification.APPOINTMENT_CANCELLED),
):
    _status_value = getattr(Appointment, _status_attr, None)
    if _status_value is not None:
        _APPOINTMENT_STATUS_NOTIFICATIONS[_status_value] = _notif_type


@receiver(pre_save, sender=Appointment, dispatch_uid="notif_appointment_track_status")
def track_appointment_status(sender, instance, **kwargs):
    """Stash the prior persisted status so ``post_save`` can detect a transition.

    Read straight from the DB (not from any in-memory copy) so a status change
    is detected even when the caller mutated the same instance in place.
    """
    if instance.pk:
        instance._old_status = (
            sender.objects.filter(pk=instance.pk)
            .values_list("status", flat=True)
            .first()
        )
    else:
        instance._old_status = None


@receiver(post_save, sender=Appointment, dispatch_uid="notif_appointment")
def on_appointment_saved(sender, instance, created, **kwargs):
    appt = instance
    pet_name, owner_name = _owner(appt.pet)

    if created:
        notify(
            user=appt.doctor,
            type=Notification.APPOINTMENT_CREATED,
            message=(
                f"New appointment for {pet_name} (owner {owner_name}) "
                f"on {appt.date} at {appt.time}."
            ),
            dedup_key=_dedup_key("appointment", appt.pk, Notification.APPOINTMENT_CREATED),
            sms_to=appt.pet.owner_phone,
            push=True,
        )
        return

    # Existing appointment: notify only on a real status transition.
    old_status = getattr(appt, "_old_status", None)
    if old_status == appt.status:
        return

    notif_type = _APPOINTMENT_STATUS_NOTIFICATIONS.get(appt.status)
    if notif_type is None:
        return

    verb = {
        Notification.APPOINTMENT_RESCHEDULED: "rescheduled",
        Notification.APPOINTMENT_ACCEPTED: "accepted",
        Notification.APPOINTMENT_CANCELLED: "cancelled",
    }[notif_type]
    notify(
        user=appt.doctor,
        type=notif_type,
        message=(
            f"Appointment for {pet_name} (owner {owner_name}) was {verb} "
            f"— {appt.date} at {appt.time}."
        ),
        dedup_key=_dedup_key("appointment", appt.pk, notif_type),
        sms_to=appt.pet.owner_phone,
        push=True,
    )


# ---------------------------------------------------------------------------
# Invoice generated
# ---------------------------------------------------------------------------
@receiver(post_save, sender=Invoice, dispatch_uid="notif_invoice")
def on_invoice_saved(sender, instance, created, **kwargs):
    if not created:
        return
    invoice = instance
    pet_name, owner_name = _owner(invoice.pet)
    notify(
        user=invoice.doctor,
        type=Notification.INVOICE_GENERATED,
        message=(
            f"Invoice #{invoice.invoice_no} generated for {pet_name} "
            f"(owner {owner_name}) — total {invoice.total}."
        ),
        dedup_key=_dedup_key("invoice", invoice.pk, Notification.INVOICE_GENERATED),
        sms_to=invoice.pet.owner_phone,
        push=True,
    )


# ---------------------------------------------------------------------------
# Payment received (only successful payments)
# ---------------------------------------------------------------------------
@receiver(post_save, sender=Payment, dispatch_uid="notif_payment")
def on_payment_saved(sender, instance, created, **kwargs):
    payment = instance
    if payment.status != Payment.SUCCESS:
        return
    invoice = payment.invoice
    pet_name, owner_name = _owner(invoice.pet)
    # dedup on the Payment pk so a payment created and later re-saved (e.g. a
    # FAILED row flipped to SUCCESS by a webhook) notifies exactly once.
    notify(
        user=invoice.doctor,
        type=Notification.PAYMENT_RECEIVED,
        message=(
            f"Payment of {payment.amount_paid} received for {pet_name} "
            f"(owner {owner_name}) on invoice #{invoice.invoice_no}."
        ),
        dedup_key=_dedup_key("payment", payment.pk, Notification.PAYMENT_RECEIVED),
        sms_to=invoice.pet.owner_phone,
        push=True,
    )


# ---------------------------------------------------------------------------
# Diagnosis uploaded
# ---------------------------------------------------------------------------
@receiver(post_save, sender=Diagnosis, dispatch_uid="notif_diagnosis")
def on_diagnosis_saved(sender, instance, created, **kwargs):
    if not created:
        return
    diag = instance
    pet_name, owner_name = _owner(diag.pet)
    notify(
        user=diag.doctor,
        type=Notification.DIAGNOSIS_UPLOADED,
        message=(
            f"{diag.get_report_type_display()} report uploaded for {pet_name} "
            f"(owner {owner_name})."
        ),
        dedup_key=_dedup_key("diagnosis", diag.pk, Notification.DIAGNOSIS_UPLOADED),
        sms_to=diag.pet.owner_phone,
        push=True,
    )


# ---------------------------------------------------------------------------
# Treatment plan added
# ---------------------------------------------------------------------------
@receiver(post_save, sender=TreatmentPlan, dispatch_uid="notif_treatment")
def on_treatment_plan_saved(sender, instance, created, **kwargs):
    if not created:
        return
    plan = instance
    pet_name, owner_name = _owner(plan.pet)
    notify(
        user=plan.doctor,
        type=Notification.TREATMENT_ADDED,
        message=(
            f"Treatment plan added for {pet_name} (owner {owner_name})."
        ),
        dedup_key=_dedup_key("treatment", plan.pk, Notification.TREATMENT_ADDED),
        sms_to=plan.pet.owner_phone,
        push=True,
    )
