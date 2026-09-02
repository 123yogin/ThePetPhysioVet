from django.db import migrations


def backfill_pet_owner_by_phone(apps, schema_editor):
    """B4 fix: doctor-created pets (`POST /pets`) never set `Pet.owner`, so a
    pet entered with a pet owner's exact phone number never showed up in that
    owner's portal (`GET /owner/pets`). The view now links a newly-created
    pet at creation time; this migration backfills existing rows the same
    way: match `Pet.owner_phone` against `UserProfile.phone` (role=OWNER) and
    link only when there is EXACTLY ONE such account. `UserProfile.phone` is
    not unique, so an ambiguous (0 or >1) match is left NULL rather than
    guessed — matching the existing 0003 ownership-backfill posture.
    """
    UserProfile = apps.get_model("appointments", "UserProfile")
    Pet = apps.get_model("appointments", "Pet")

    owners_by_phone = {}
    ambiguous_phones = set()
    for owner in UserProfile.objects.filter(role="OWNER").exclude(phone="").exclude(phone__isnull=True):
        if owner.phone in owners_by_phone:
            ambiguous_phones.add(owner.phone)
        else:
            owners_by_phone[owner.phone] = owner

    for pet in Pet.objects.filter(owner__isnull=True).exclude(owner_phone="").exclude(owner_phone__isnull=True):
        if pet.owner_phone in ambiguous_phones:
            continue
        matched = owners_by_phone.get(pet.owner_phone)
        if matched is not None:
            pet.owner = matched
            pet.save(update_fields=["owner"])


def noop_reverse(apps, schema_editor):
    # Backfilled ownership data is not meaningful to "unbackfill".
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0009_backfill_visit_type_display"),
    ]

    operations = [
        migrations.RunPython(backfill_pet_owner_by_phone, noop_reverse),
    ]
