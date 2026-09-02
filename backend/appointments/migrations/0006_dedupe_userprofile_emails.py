from django.db import migrations


def dedupe_emails(apps, schema_editor):
    """Known-issue #8: email uniqueness was never enforced, so two accounts
    could already share an email. Handle any pre-existing duplicates safely
    before the unique constraint lands in the next migration: the oldest
    account (lowest id) keeps its email, later duplicates are blanked out
    (never deleted) so the account still exists and can be fixed up by an
    admin, but no longer collides.
    """
    UserProfile = apps.get_model("appointments", "UserProfile")
    seen = set()
    for user in UserProfile.objects.order_by("id"):
        email = (user.email or "").strip().lower()
        if not email:
            continue
        if email in seen:
            UserProfile.objects.filter(pk=user.pk).update(email="")
        else:
            seen.add(email)


def noop_reverse(apps, schema_editor):
    # Which accounts got blanked isn't meaningful to "undo" — leaving this a
    # no-op is safe and standard practice for data migrations.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0005_align_invoice_field_defs"),
    ]

    operations = [
        migrations.RunPython(dedupe_emails, noop_reverse),
    ]
