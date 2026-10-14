"""Password hashing: Argon2id at OWASP's recommended minimum.

OWASP Password Storage Cheat Sheet, first choice: Argon2id with
m=19 MiB, t=2, p=1. Memory-hard, so a GPU or ASIC gets far less advantage than
against bcrypt, and it is ~9x faster per sign-in than bcrypt cost 12 was
(~23 ms vs ~210 ms on a laptop), which matters on a serverless CPU.

Django's own defaults (m=100 MiB, p=8) would cost 100 MiB per concurrent
sign-in inside one Vercel instance; p=1 also fits its single vCPU.

`algorithm` stays "argon2", so Django re-hashes on the next sign-in if these
parameters ever change (`must_update` compares them).
"""

from django.contrib.auth.hashers import Argon2PasswordHasher


class Argon2idPasswordHasher(Argon2PasswordHasher):
    time_cost = 2
    memory_cost = 19456  # KiB = 19 MiB
    parallelism = 1
