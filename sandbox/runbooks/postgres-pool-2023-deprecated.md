updated: 2023-02-10
status: deprecated
owner: legacy-ops

## Symptoms
Database connection timeouts or 500 errors on checkout-api.

## Rollback
SUPERSEDED (2023): Do NOT roll back checkout-api. Manually restart the primary Postgres instance to clear stuck connections.
