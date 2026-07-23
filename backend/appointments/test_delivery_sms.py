"""Tests for the real SMS channel adapter (US-NOTIF-06a, SRS §3.7 / §7).

Run with:  ./.venv/bin/python manage.py test appointments.test_delivery_sms

Everything here runs with ZERO external calls:

  * The default (``NOTIFY_MOCK=True``) path resolves to the foundation
    :class:`MockSmsProvider`, so a catalogue event and a due reminder each write
    a ``DeliveryLog`` channel=SMS to the owner phone with status ``MOCK`` (AC-05).
    These drive ``notify()`` directly rather than the §7 signals / the
    ``send_due_reminders`` command, which are separate fan-out tasks.
  * The real adapters are exercised without any network: their credential gate
    is checked, their non-instantiation when unconfigured is verified through the
    dispatcher's fail-safe resolver, and their "never raise on failure" contract
    is verified (Twilio via the un-installed SDK's ImportError, MSG91 via a
    patched ``requests.post``).
"""

from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings

from .delivery.dispatch import _sms_provider
from .delivery.mock import MockSmsProvider
from .delivery.sms import Msg91SmsProvider, SmsProvider, TwilioSmsProvider
from .models import DeliveryLog, Notification
from .notifications import notify
from .tests import make_doctor

OWNER_PHONE = "+919876543210"

# Credential bundles for the real providers (fake values — never real secrets).
TWILIO_CREDS = dict(
    NOTIFY_MOCK=False,
    NOTIFY_SMS_PROVIDER="appointments.delivery.sms.TwilioSmsProvider",
    TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    TWILIO_AUTH_TOKEN="fake-token",
    TWILIO_FROM_NUMBER="+15005550006",
)
MSG91_CREDS = dict(
    NOTIFY_MOCK=False,
    NOTIFY_SMS_PROVIDER="appointments.delivery.sms.Msg91SmsProvider",
    MSG91_AUTH_KEY="fake-authkey",
    MSG91_SENDER_ID="PETPHY",
)


class SmsMockDeliveryTests(TestCase):
    """AC-05: catalogue event + reminder each -> DeliveryLog SMS / MOCK to owner."""

    def setUp(self):
        self.doctor = make_doctor("smsdoc")

    @override_settings(NOTIFY_MOCK=True)
    def test_catalogue_event_writes_sms_mock_log_to_owner(self):
        notify(
            self.doctor,
            Notification.APPOINTMENT_CREATED,
            "New appointment for Bruno (owner Asha).",
            dedup_key="appt-created:1",
            sms_to=OWNER_PHONE,
        )
        logs = DeliveryLog.objects.filter(channel=DeliveryLog.SMS)
        self.assertEqual(logs.count(), 1)
        log = logs.get()
        self.assertEqual(log.recipient, OWNER_PHONE)
        self.assertEqual(log.status, DeliveryLog.MOCK)
        self.assertEqual(log.notif_type, Notification.APPOINTMENT_CREATED)

    @override_settings(NOTIFY_MOCK=True)
    def test_reminder_writes_sms_mock_log_to_owner(self):
        notify(
            self.doctor,
            Notification.REMINDER,
            "Reminder: Bruno's appointment is in 1 hour.",
            dedup_key="reminder:1:1h",
            sms_to=OWNER_PHONE,
            push=False,
        )
        logs = DeliveryLog.objects.filter(channel=DeliveryLog.SMS)
        self.assertEqual(logs.count(), 1)
        log = logs.get()
        self.assertEqual(log.recipient, OWNER_PHONE)
        self.assertEqual(log.status, DeliveryLog.MOCK)
        self.assertEqual(log.notif_type, Notification.REMINDER)

    @override_settings(NOTIFY_MOCK=True)
    def test_default_resolved_provider_is_the_mock(self):
        # In the dev/CI default the real adapter is never instantiated.
        self.assertIsInstance(_sms_provider(), MockSmsProvider)


class RealProviderCredentialGateTests(TestCase):
    """Creds absent / NOTIFY_MOCK -> real provider is never a working instance."""

    def test_twilio_requires_credentials(self):
        with override_settings(
            TWILIO_ACCOUNT_SID="", TWILIO_AUTH_TOKEN="", TWILIO_FROM_NUMBER=""
        ):
            with self.assertRaises(ImproperlyConfigured):
                TwilioSmsProvider()

    def test_msg91_requires_credentials(self):
        with override_settings(MSG91_AUTH_KEY="", MSG91_SENDER_ID=""):
            with self.assertRaises(ImproperlyConfigured):
                Msg91SmsProvider()

    @override_settings(
        NOTIFY_MOCK=False,
        NOTIFY_SMS_PROVIDER="appointments.delivery.sms.TwilioSmsProvider",
        TWILIO_ACCOUNT_SID="",
        TWILIO_AUTH_TOKEN="",
        TWILIO_FROM_NUMBER="",
    )
    def test_dispatcher_falls_back_to_mock_when_creds_absent(self):
        # Even with NOTIFY_MOCK off and the real provider selected, missing creds
        # make __init__ raise -> the resolver falls back to the mock.
        self.assertIsInstance(_sms_provider(), MockSmsProvider)

    @override_settings(**TWILIO_CREDS)
    def test_dispatcher_instantiates_real_provider_when_configured(self):
        self.assertIsInstance(_sms_provider(), TwilioSmsProvider)

    @override_settings(**MSG91_CREDS)
    def test_msg91_selectable_by_dotted_path(self):
        self.assertIsInstance(_sms_provider(), Msg91SmsProvider)


class RealProviderSendContractTests(TestCase):
    """The real send() never raises for a delivery failure; it reports it."""

    def test_send_rejects_empty_recipient(self):
        with override_settings(**TWILIO_CREDS):
            result = TwilioSmsProvider().send("", "hi", None)
        self.assertEqual(result.status, DeliveryLog.FAILED)

    @override_settings(**TWILIO_CREDS)
    def test_twilio_send_failure_is_reported_not_raised(self):
        # The twilio SDK is not installed, so the lazy import raises ImportError
        # inside _send; send() must catch it and return FAILED (no network call).
        result = TwilioSmsProvider().send(OWNER_PHONE, "hi", None)
        self.assertEqual(result.status, DeliveryLog.FAILED)
        self.assertTrue(result.detail)

    @override_settings(**MSG91_CREDS)
    def test_msg91_send_success_via_patched_http(self):
        fake_resp = mock.Mock()
        fake_resp.text = "req-12345"
        fake_resp.raise_for_status = mock.Mock()
        with mock.patch("requests.post", return_value=fake_resp) as post:
            result = Msg91SmsProvider().send(OWNER_PHONE, "hi Asha", None)
        self.assertEqual(result.status, DeliveryLog.SENT)
        self.assertEqual(result.detail, "msg91:req-12345")
        # Bare number (no '+') is sent to MSG91; auth key sourced from settings.
        _, kwargs = post.call_args
        self.assertEqual(kwargs["data"]["mobiles"], "919876543210")
        self.assertEqual(kwargs["data"]["authkey"], "fake-authkey")

    @override_settings(**MSG91_CREDS)
    def test_msg91_send_http_error_is_reported_not_raised(self):
        with mock.patch("requests.post", side_effect=RuntimeError("boom")):
            result = Msg91SmsProvider().send(OWNER_PHONE, "hi", None)
        self.assertEqual(result.status, DeliveryLog.FAILED)
        self.assertIn("boom", result.detail)

    def test_base_send_is_abstract(self):
        # The base declares the contract (no creds required) but leaves the
        # actual vendor call, _send, to the concrete subclasses.
        with self.assertRaises(NotImplementedError):
            SmsProvider()._send(OWNER_PHONE, "hi")
