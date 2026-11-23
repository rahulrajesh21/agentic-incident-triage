updated: 2026-06-15
status: active
owner: platform-sre

## Symptoms
ConnectionPoolExhaustedError or sqlalchemy.exc.TimeoutError paired with db_pool_used == db_pool_max and a sudden 5xx spike on checkout-api.

## Verification
1. Confirm db_pool_max dropped in recent metrics compared to baseline (production expects DB_POOL_MAX >= 50).
2. Inspect recent commits in checkout-api/config.py and confirm no Alembic schema migration was bundled.

## Rollback
Rolling back checkout-api to the prior known-good commit is safe if no Alembic schema migration ran in the culprit commit. Do NOT restart primary Postgres.

## Escalation
If error rates remain above 2% five minutes after rollback, page #oncall-database.
