updated: 2026-10-18
status: active
owner: search-platform

## Symptoms
Python MemoryError during embedding indexing followed by Kubernetes exit code 137 (OOMKilled) and CrashLoopBackOff on search-indexer pods.

## Verification
Inspect search-indexer/cache.py for unbounded in-memory structures (e.g., MAX_CACHE_ENTRIES = None or removed LRU eviction).

## Remediation
Roll back search-indexer to the previous bounded-cache commit (MAX_CACHE_ENTRIES <= 5000) so pods stabilize without raising container memory limits.
