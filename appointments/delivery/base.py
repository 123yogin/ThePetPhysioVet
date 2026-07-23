"""Delivery channel contract (SRS §3.7).

A :class:`Channel` turns a resolved recipient + message into exactly one
:class:`DeliveryResult`. The dispatcher (``dispatch.py``) is responsible for
recipient resolution, the SMS opt-out check, and writing the DeliveryLog audit
row — a channel implementation only performs the send and reports the outcome.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DeliveryResult:
    """Outcome of a single send attempt.

    ``status`` is one of the ``DeliveryLog`` status constants (SENT / FAILED /
    MOCK / QUEUED). ``detail`` carries a provider reference or an error string
    and is persisted verbatim onto the DeliveryLog for audit.
    """

    status: str
    detail: str = ""


class Channel(ABC):
    """Abstract delivery channel. Concrete providers implement :meth:`send`.

    ``name`` mirrors a ``DeliveryLog`` channel constant (``SMS`` / ``FCM``).
    """

    name: str = ""

    @abstractmethod
    def send(self, recipient, message, notif) -> DeliveryResult:
        """Send ``message`` to ``recipient`` for ``notif``; return a result.

        Implementations MUST NOT raise for an ordinary delivery failure — return
        a ``DeliveryResult`` with ``status=DeliveryLog.FAILED`` and a ``detail``
        instead, so the dispatcher can always record an audit row.
        """
        raise NotImplementedError
