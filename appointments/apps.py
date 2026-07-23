from django.apps import AppConfig


class AppointmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "appointments"

    def ready(self):
        # Connect the §7 event receivers that turn domain events into
        # notifications. Import is side-effect-only (registers signal handlers).
        from . import signals  # noqa: F401
