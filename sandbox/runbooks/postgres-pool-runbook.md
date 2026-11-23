updated: 2026-06-15
status: active

## Symptoms
ConnectionPoolExhaustedError paired with db_pool_used == db_pool_max and a sudden 5xx spike on checkout-api.

## Rollback
Rolling back checkout-api to the prior known-good commit is safe if no Alembic schema migration ran in the culprit commit.
