"""Free stored bytes when the record that owns them is deleted.

Django never deletes a FileField's file on model delete. With uploads in
Postgres (appointments/storage.py) every orphan counts against Neon's storage
quota, so the owning rows clean up after themselves -- including cascades
(deleting a Pet removes its reports and their files).
"""
import logging

from django.db import DatabaseError
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import DiagnosticReport, Pet, QueryAttachment

logger = logging.getLogger(__name__)


def _delete_file(field_file):
    if not field_file or not field_file.name:
        return
    try:
        field_file.storage.delete(field_file.name)
    except (OSError, DatabaseError):
        logger.exception("could not delete stored file for a deleted record")


@receiver(post_delete, sender=DiagnosticReport)
def _report_deleted(sender, instance, **kwargs):
    _delete_file(instance.file)


@receiver(post_delete, sender=QueryAttachment)
def _attachment_deleted(sender, instance, **kwargs):
    _delete_file(instance.file)


@receiver(post_delete, sender=Pet)
def _pet_deleted(sender, instance, **kwargs):
    _delete_file(instance.photo)
