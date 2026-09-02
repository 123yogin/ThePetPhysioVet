"""Shared base classes for management commands.

Exists so that "may this command touch a real deployment?" is answered in ONE
place. The alternative — copying an `if not settings.DEBUG: raise` guard into
each command — is exactly the duplication that let three booking forms drift
apart in this codebase, and a guard that is copied is a guard that is
eventually forgotten on the next command someone adds.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

FORCE_FLAG = "--yes-i-am-not-in-production"


class DevOnlyCommand(BaseCommand):
    """A command that must never run against a real deployment.

    `seed_data` creates accounts whose passwords are committed to this
    repository. `DEPLOYMENT.md` used to instruct running it on the server,
    which would have published a DOCTOR login — full read access to every
    patient's clinical record and billing — to anyone who can read the repo.
    Nothing structural prevented that: the command was importable and runnable
    with `DEBUG=False`, verified.

    Subclass this instead of `BaseCommand` for anything that fabricates data,
    fabricates credentials, or is otherwise only meaningful on a developer's
    machine. The escape hatch is deliberately verbose: a CI job restoring a
    fixture can pass it, and nobody types it by accident.
    """

    def create_parser(self, prog_name, subcommand, **kwargs):
        parser = super().create_parser(prog_name, subcommand, **kwargs)
        parser.add_argument(
            FORCE_FLAG,
            action="store_true",
            dest="force_non_production",
            help=(
                "Run even though DEBUG is off. Only for throwaway environments "
                "(CI, a scratch container) — never a live deployment."
            ),
        )
        return parser

    def execute(self, *args, **options):
        # execute(), not handle(), so the guard cannot be bypassed by a
        # subclass that overrides handle() and forgets to call super().
        if not settings.DEBUG and not options.get("force_non_production"):
            raise CommandError(
                f"`{self.__class__.__module__.rsplit('.', 1)[-1]}` is a "
                "development-only command and DEBUG is off.\n\n"
                "It creates demo data and demo accounts whose passwords are "
                "committed to this repository, so running it on a real "
                "deployment publishes working logins to anyone who can read "
                "the source.\n\n"
                "To provision a real clinician account instead:\n"
                "    python manage.py create_doctor <username> <email>\n\n"
                f"If this genuinely is a throwaway environment, pass {FORCE_FLAG}."
            )
        return super().execute(*args, **options)
