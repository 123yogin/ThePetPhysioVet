#!/usr/bin/env python3
"""
Create PostgreSQL database 'pet' if missing. Django never creates the DB itself.

Run from this folder (where manage.py lives):
    python create_pet_database.py

Uses the same env vars as petphysio/settings.py (optional):
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD,
    POSTGRES_DB (default: pet), POSTGRES_ADMIN_DB (default: postgres).
"""
from __future__ import annotations

import os
import sys

try:
    import psycopg
    from psycopg import sql
except ImportError:
    print("Missing psycopg. Run: pip install -r requirements.txt")
    sys.exit(1)

HOST = os.getenv("POSTGRES_HOST", "localhost")
PORT = os.getenv("POSTGRES_PORT", "5432")
USER = os.getenv("POSTGRES_USER", "postgres")
PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres123")
TARGET_DB = os.getenv("POSTGRES_DB", "pet")
# Connect here first (always exists on a default install)
MAINTENANCE_DB = os.getenv("POSTGRES_ADMIN_DB", "postgres")


def main() -> int:
    conninfo = (
        f"host={HOST} port={PORT} dbname={MAINTENANCE_DB} "
        f"user={USER} password={PASSWORD} connect_timeout=10"
    )
    try:
        conn = psycopg.connect(conninfo, autocommit=True)
    except psycopg.OperationalError as exc:
        print(
            "Cannot connect to PostgreSQL.\n"
            f"  Tried: host={HOST} port={PORT} dbname={MAINTENANCE_DB} user={USER}\n"
            f"  Error: {exc}\n"
            "Fix: start the PostgreSQL service; in pgAdmin use the same host, port, user, password."
        )
        return 1

    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TARGET_DB,))
        if cur.fetchone():
            print(f"Database '{TARGET_DB}' already exists. In pgAdmin: right-click Databases → Refresh.")
            return 0

        cur.execute(
            sql.SQL("CREATE DATABASE {} WITH OWNER {} ENCODING {}").format(
                sql.Identifier(TARGET_DB),
                sql.Identifier(USER),
                sql.Literal("UTF8"),
            )
        )
    print(f"Created database '{TARGET_DB}'.")
    print("Next: python manage.py migrate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
