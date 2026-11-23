updated: 2026-09-28
status: active
owner: catalog-sre

## Symptoms
CacheStampedeError, Redis hit ratio collapsing below 5%, and pg-replica-01 connection pool saturation (db_pool_used == db_pool_max) with 504 timeouts on catalog-api.

## Verification
Check catalog-api/config.py for CACHE_TTL_SEC set to 0 or disabled caching flags.

## Remediation
Roll back catalog-api to the prior known-good commit restoring CACHE_TTL_SEC >= 300. Never run FLUSHALL during a stampede as it worsens database load.
