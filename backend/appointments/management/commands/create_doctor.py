"""Out-of-band DOCTOR provisioning (API_CONTRACT.md §3, AMENDED 2026-08-20).

Public signup (POST /auth/signup) always creates an OWNER — a role=DOCTOR in
the request body used to be honoured, letting any unauthenticated caller
mint a clinician account with read access to every patient's PII and
billing. Doctor accounts are now provisioned here, by whoever has shell
access to the deployment (admin / ops), never over the public API.
"""

import getpass

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError
from django.db.utils import DataError

from appointments.models import UserProfile


class Command(BaseCommand):
    help = "Creates a DOCTOR account. Doctor accounts cannot be self-provisioned via the API."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("email")
        parser.add_argument("--password", help="If omitted, you will be prompted interactively.")
        parser.add_argument("--first-name", default="")
        parser.add_argument("--last-name", default="")
        parser.add_argument("--phone", default="")
        parser.add_argument("--clinic-name", default="")
        parser.add_argument("--clinic-address", default="")
        parser.add_argument("--clinic-phone", default="")

    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]

        if UserProfile.objects.filter(username=username).exists():
            raise CommandError(f"A user with username {username!r} already exists.")
        if email and UserProfile.objects.exclude(email="").filter(email=email).exists():
            raise CommandError(f"A user with email {email!r} already exists.")

        password = options.get("password")
        if not password:
            password = getpass.getpass("Password: ")
            confirm = getpass.getpass("Password (again): ")
            if password != confirm:
                raise CommandError("Passwords did not match.")
        if len(password) < 6:
            raise CommandError("Password must be at least 6 characters.")

        try:
            user = UserProfile.objects.create_user(
                username=username,
                email=email,
                password=password,
                role="DOCTOR",
                first_name=options["first_name"],
                last_name=options["last_name"],
                phone=options["phone"],
                clinic_name=options["clinic_name"],
                clinic_address=options["clinic_address"],
                clinic_phone=options["clinic_phone"],
            )
        except (IntegrityError, DataError) as exc:
            raise CommandError(str(exc))

        self.stdout.write(self.style.SUCCESS(
            f"Created DOCTOR account '{user.username}' (id={user.id})."
        ))
