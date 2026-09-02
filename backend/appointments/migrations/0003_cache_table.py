"""Create the database cache table as part of migrate.

`createcachetable` is a separate management command, and on the Docker image it
runs in `docker/entrypoint.sh`. Vercel has no entrypoint — its build only
compiles the frontend — so the table was never created there and the first
public enquiry died with:

    ProgrammingError: relation "django_cache" does not exist

Found in production, on the endpoint most exposed to the public. The rate
limiter is the only thing between an unauthenticated write endpoint and a spam
flood, so failing closed with a 500 was the good outcome; failing open would
have been worse.

As a migration it exists wherever migrations run, which is every environment by
definition, instead of depending on a platform-specific start-up script.
`createcachetable` is idempotent, so this is safe where the table already exists.
"""

from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    call_command("createcachetable", database=schema_editor.connection.alias, verbosity=0)


def drop_cache_table(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("DROP TABLE IF EXISTS django_cache")


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0002_enquiry"),
    ]

    operations = [
        migrations.RunPython(create_cache_table, drop_cache_table),
    ]
