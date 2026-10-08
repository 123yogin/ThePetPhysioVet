"""Free stored bytes when the record that owns them is deleted.

Django never deletes a FileField's file on model delete. With uploads in
Postgres (appointments/storage.py) every orphan counts against Neon's storage
quota, so the owning rows clean up after themselves -- including cascades
(deleting a Pet removes its reports and their files). Deletion runs on
commit, so a rolled-back delete never loses the file.
"""
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import DiagnosticReport, Pet, QueryAttachment
from .storage import delete_on_commit


def _delete_file(field_file):
    # Deferred to commit: a delete that rolls back must keep its file.
    if field_file and field_file.name:
        delete_on_commit(field_file.storage, field_file.name)


@receiver(post_delete, sender=DiagnosticReport)
def _report_deleted(sender, instance, **kwargs):
    _delete_file(instance.file)


@receiver(post_delete, sender=QueryAttachment)
def _attachment_deleted(sender, instance, **kwargs):
    _delete_file(instance.file)


@receiver(post_delete, sender=Pet)
def _pet_deleted(sender, instance, **kwargs):
    _delete_file(instance.photo)
