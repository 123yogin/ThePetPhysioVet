from django.db import migrations


def backfill_ownership(apps, schema_editor):
    """API_CONTRACT.md ownership backfill:
    - Pet.owner <- match Pet.owner_phone against UserProfile.phone.
    - Appointment.doctor <- the single existing DOCTOR user.
    - Invoice.pet <- best-effort match on (pet_name, owner_phone); then
      Invoice.owner <- that pet's owner. Legacy invoice_number is copied to
      the new invoice_no field.
    Unmatched rows are left NULL — doctor-visible only, never owner-visible.
    """
    UserProfile = apps.get_model("appointments", "UserProfile")
    Pet = apps.get_model("appointments", "Pet")
    Appointment = apps.get_model("appointments", "Appointment")
    Invoice = apps.get_model("appointments", "Invoice")

    # --- Pet.owner ---------------------------------------------------
    phone_to_user = {}
    for user in UserProfile.objects.exclude(phone="").exclude(phone__isnull=True):
        phone_to_user.setdefault(user.phone, user)

    for pet in Pet.objects.all():
        matched = phone_to_user.get(pet.owner_phone)
        if matched is not None:
            pet.owner = matched
            pet.save(update_fields=["owner"])

    # --- Appointment.doctor -------------------------------------------
    doctor = UserProfile.objects.filter(role="DOCTOR").order_by("id").first()
    if doctor is not None:
        Appointment.objects.update(doctor=doctor)

    # --- Invoice.invoice_no / Invoice.pet / Invoice.owner --------------
    pets = list(Pet.objects.all())
    pets_by_name_and_phone = {(p.name, p.owner_phone): p for p in pets}
    pets_by_name = {}
    for p in pets:
        pets_by_name.setdefault(p.name, []).append(p)

    for invoice in Invoice.objects.all():
        if not invoice.invoice_no:
            invoice.invoice_no = invoice.invoice_number

        matched_pet = pets_by_name_and_phone.get((invoice.pet_name, invoice.owner_phone))
        if matched_pet is None:
            candidates = pets_by_name.get(invoice.pet_name, [])
            if len(candidates) == 1:
                matched_pet = candidates[0]

        if matched_pet is not None:
            invoice.pet = matched_pet
            invoice.owner_id = matched_pet.owner_id

        invoice.save(update_fields=["invoice_no", "pet", "owner"])


def noop_reverse(apps, schema_editor):
    # Backfilled ownership data is not meaningful to "unbackfill" — leaving
    # this a no-op is safe and standard practice for data migrations.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0002_reshape_data_model"),
    ]

    operations = [
        migrations.RunPython(backfill_ownership, noop_reverse),
    ]
