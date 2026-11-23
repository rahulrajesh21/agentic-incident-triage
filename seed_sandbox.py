import json
import os
import shutil
import sqlite3
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent / "sandbox"
REPO_DIR = BASE_DIR / "mock_repo"
RUNBOOKS_DIR = BASE_DIR / "runbooks"
DB_PATH = BASE_DIR / "telemetry.db"
MANIFEST_PATH = BASE_DIR / "manifest.json"


def run_git(
    args: list[str],
    date_iso: str | None = None,
    author_name: str = "TraceGate Bot",
    author_email: str = "bot@tracegate.local",
) -> str:
    env = os.environ.copy()
    env["GIT_AUTHOR_NAME"] = author_name
    env["GIT_AUTHOR_EMAIL"] = author_email
    env["GIT_COMMITTER_NAME"] = author_name
    env["GIT_COMMITTER_EMAIL"] = author_email
    if date_iso:
        env["GIT_AUTHOR_DATE"] = date_iso
        env["GIT_COMMITTER_DATE"] = date_iso

    result = subprocess.run(
        ["git", "-C", str(REPO_DIR), *args],
        capture_output=True,
        text=True,
        check=True,
        env=env,
    )
    return result.stdout.strip()


def commit_files(
    files: dict[str, str],
    message: str,
    date_iso: str,
    author: tuple[str, str] = ("TraceGate Dev", "dev@tracegate.local"),
) -> str:
    """Write one or more files, commit them with backdated timestamps, and return the short SHA."""
    for rel_path, content in files.items():
        target = REPO_DIR / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        run_git(["add", rel_path])

    run_git(
        ["commit", "-m", message],
        date_iso=date_iso,
        author_name=author[0],
        author_email=author[1],
    )
    return run_git(["rev-parse", "--short", "HEAD"])


def seed_git_repo() -> dict[str, dict[str, str]]:
    if REPO_DIR.exists():
        shutil.rmtree(REPO_DIR)
    REPO_DIR.mkdir(parents=True, exist_ok=True)

    run_git(["init", "-b", "main"])
    run_git(["config", "user.email", "dev@tracegate.local"])
    run_git(["config", "user.name", "TraceGate Dev"])

    aarav = ("Aarav Nair", "aarav.nair@tracegate.local")
    maya = ("Maya Lin", "maya.lin@tracegate.local")
    devon = ("Devon Brooks", "devon.brooks@tracegate.local")
    priya = ("Priya Menon", "priya.menon@tracegate.local")

    shas: dict[str, dict[str, str]] = {
        "baseline": {},
        "culprit": {},
        "decoy": {},
    }

    # =========================================================================
    # 1. KNOWN-GOOD BASELINE COMMITS (2026-11-19)
    # =========================================================================
    shas["baseline"]["checkout-api"] = commit_files(
        {
            "checkout-api/config.py": (
                "import os\n\n"
                "SERVICE_NAME = 'checkout-api'\n"
                "DB_HOST = os.getenv('DB_HOST', 'pg-primary.internal')\n"
                "DB_POOL_MAX = 50\n"
                "DB_POOL_OVERFLOW = 10\n"
                "DB_POOL_TIMEOUT_SEC = 5\n"
                "REQUEST_TIMEOUT_SEC = 10\n"
            ),
            "checkout-api/README.md": "# checkout-api\nHandles cart validation and order placement.\n",
        },
        "chore(checkout-api): initialize production db pool settings",
        "2026-11-19T09:00:00Z",
        aarav,
    )

    shas["baseline"]["auth-service"] = commit_files(
        {
            "auth-service/config.py": (
                "SERVICE_NAME = 'auth-service'\n"
                "JWKS_URL = 'https://idp.tracegate.internal/.well-known/jwks.json'\n"
                "JWT_VERIFY_TIMEOUT_MS = 2000\n"
                "JWKS_CACHE_TTL_SEC = 300\n"
                "ALLOW_STALE_JWKS_SEC = 60\n"
            ),
            "auth-service/CHANGELOG.md": "## v1.4.1\n- Initial production JWKS verifier config.\n",
        },
        "chore(auth-service): initialize jwt verification config",
        "2026-11-19T09:15:00Z",
        maya,
    )

    shas["baseline"]["payment-worker"] = commit_files(
        {
            "payment-worker/config.py": (
                "import os\n\n"
                "SERVICE_NAME = 'payment-worker'\n"
                "STRIPE_KEY = os.getenv('STRIPE_KEY')\n"
                "STRIPE_MAX_RETRIES = 3\n"
                "WORKER_CONCURRENCY = 16\n"
                "DLQ_TOPIC = 'payments.dead-letter'\n"
            ),
        },
        "chore(payment-worker): initialize stripe worker config",
        "2026-11-19T09:30:00Z",
        devon,
    )

    shas["baseline"]["inventory-api"] = commit_files(
        {
            "inventory-api/config.py": (
                "SERVICE_NAME = 'inventory-api'\n"
                "SUPPLIER_FEED_HOST = 'supplier-feed.external-partner.io'\n"
                "SUPPLIER_SYNC_INTERVAL_SEC = 300\n"
                "RETRY_LIMIT = 3\n"
            ),
        },
        "chore(inventory-api): initialize supplier feed sync config",
        "2026-11-19T09:45:00Z",
        priya,
    )

    shas["baseline"]["billing-api"] = commit_files(
        {
            "billing-api/config.py": (
                "SERVICE_NAME = 'billing-api'\n"
                "INVOICE_SCHEMA_VERSION = 'v2'\n"
                "ENABLE_LEGACY_TAX_CODE = True\n"
            ),
            "billing-api/models.py": (
                "class InvoiceRecord:\n"
                "    columns = ['id', 'account_id', 'amount_cents', 'legacy_tax_code', 'created_at']\n"
            ),
        },
        "chore(billing-api): initialize invoice models and config",
        "2026-11-19T10:00:00Z",
        aarav,
    )

    shas["baseline"]["catalog-api"] = commit_files(
        {
            "catalog-api/config.py": (
                "SERVICE_NAME = 'catalog-api'\n"
                "REDIS_URL = 'redis://redis-catalog.internal:6379/0'\n"
                "CACHE_TTL_SEC = 600\n"
                "CACHE_JITTER_SEC = 30\n"
                "DB_READ_REPLICA = 'pg-replica-01.internal'\n"
            ),
        },
        "chore(catalog-api): initialize product catalog cache config",
        "2026-11-19T10:15:00Z",
        maya,
    )

    shas["baseline"]["search-indexer"] = commit_files(
        {
            "search-indexer/cache.py": (
                "from collections import OrderedDict\n\n"
                "MAX_CACHE_ENTRIES = 5000\n"
                "EMBEDDING_CACHE: OrderedDict[str, list[float]] = OrderedDict()\n\n"
                "def put_embedding(doc_id: str, vec: list[float]) -> None:\n"
                "    EMBEDDING_CACHE[doc_id] = vec\n"
                "    if len(EMBEDDING_CACHE) > MAX_CACHE_ENTRIES:\n"
                "        EMBEDDING_CACHE.popitem(last=False)\n"
            ),
        },
        "chore(search-indexer): initialize bounded LRU embedding cache",
        "2026-11-19T10:30:00Z",
        devon,
    )

    # =========================================================================
    # 2. SCENARIO COMMITS + REALISTIC DECOYS (2026-11-20)
    # =========================================================================

    # --- Scenario 1: checkout-api DB pool exhaustion + decoy README ---
    shas["culprit"]["db_pool_exhaustion"] = commit_files(
        {
            "checkout-api/config.py": (
                "import os\n\n"
                "SERVICE_NAME = 'checkout-api'\n"
                "DB_HOST = os.getenv('DB_HOST', 'pg-primary.internal')\n"
                "DB_POOL_MAX = 5\n"
                "DB_POOL_OVERFLOW = 0\n"
                "DB_POOL_TIMEOUT_SEC = 5\n"
                "REQUEST_TIMEOUT_SEC = 10\n"
            ),
        },
        "chore(checkout-api): lower db pool size for staging parity\n\nCopied staging pool limits to keep envs uniform.",
        "2026-11-20T01:51:00Z",
        aarav,
    )
    shas["decoy"]["checkout_readme"] = commit_files(
        {
            "checkout-api/README.md": (
                "# checkout-api\nHandles cart validation and order placement.\n\n"
                "## Local Dev\nRun `uvicorn app:app --reload`.\n"
            ),
        },
        "docs(checkout-api): add local dev instructions to readme",
        "2026-11-20T01:52:30Z",
        priya,
    )

    # --- Scenario 2: auth-service JWT timeout + decoy CHANGELOG ---
    shas["culprit"]["auth_timeout"] = commit_files(
        {
            "auth-service/config.py": (
                "SERVICE_NAME = 'auth-service'\n"
                "JWKS_URL = 'https://idp.tracegate.internal/.well-known/jwks.json'\n"
                "JWT_VERIFY_TIMEOUT_MS = 10\n"
                "JWKS_CACHE_TTL_SEC = 300\n"
                "ALLOW_STALE_JWKS_SEC = 60\n"
            ),
        },
        "perf(auth-service): tighten jwt verification timeout for tail latency",
        "2026-11-20T03:10:00Z",
        maya,
    )
    shas["decoy"]["auth_changelog"] = commit_files(
        {
            "auth-service/CHANGELOG.md": (
                "## v1.4.2\n- Minor structured logging formatting tweak.\n\n"
                "## v1.4.1\n- Initial production JWKS verifier config.\n"
            ),
        },
        "docs(auth-service): update v1.4.2 changelog entry",
        "2026-11-20T03:12:00Z",
        devon,
    )

    # --- Scenario 3: payment-worker env var rename + decoy comment ---
    shas["culprit"]["env_var_rename"] = commit_files(
        {
            "payment-worker/config.py": (
                "import os\n\n"
                "SERVICE_NAME = 'payment-worker'\n"
                "STRIPE_KEY = os.getenv('STRIPE_API_KEY')\n"
                "STRIPE_MAX_RETRIES = 3\n"
                "WORKER_CONCURRENCY = 16\n"
                "DLQ_TOPIC = 'payments.dead-letter'\n"
            ),
        },
        "refactor(payment-worker): standardize stripe env var naming",
        "2026-11-20T05:00:00Z",
        devon,
    )
    shas["decoy"]["payment_readme"] = commit_files(
        {
            "payment-worker/README.md": "# payment-worker\nConsumes charge events from Kafka.\n",
        },
        "docs(payment-worker): add service overview readme",
        "2026-11-20T05:01:20Z",
        priya,
    )

    # --- Scenario 4: inventory-api (NO culprit commit; only harmless earlier decoy) ---
    shas["decoy"]["inventory_lint"] = commit_files(
        {
            "inventory-api/README.md": "# inventory-api\nSyncs SKU counts from external supplier feed.\n",
        },
        "docs(inventory-api): document supplier sync schedule",
        "2026-11-19T18:00:00Z",
        priya,
    )

    # --- Scenario 5: billing-api destructive Alembic migration (UNSAFE TO ROLL BACK) ---
    shas["culprit"]["unsafe_schema_migration"] = commit_files(
        {
            "billing-api/alembic/versions/20261120_drop_legacy_tax_code.py": (
                "\"\"\"drop legacy_tax_code column from invoices\"\"\"\n"
                "revision = '20261120_01'\n"
                "down_revision = '20261015_04'\n\n"
                "def upgrade(op):\n"
                "    op.drop_column('invoices', 'legacy_tax_code')\n\n"
                "def downgrade(op):\n"
                "    raise NotImplementedError('Destructive column drop cannot be auto-reverted')\n"
            ),
            "billing-api/models.py": (
                "class InvoiceRecord:\n"
                "    # Missing tax_code_v2 migration in read serializer causes KeyError/UndefinedColumn\n"
                "    columns = ['id', 'account_id', 'amount_cents', 'tax_code_v2', 'created_at']\n"
            ),
        },
        "feat(billing-api): drop legacy_tax_code column via alembic migration 20261120_01",
        "2026-11-20T09:10:00Z",
        aarav,
    )

    # --- Scenario 6: catalog-api Redis TTL set to 0 (cache stampede) + decoy ---
    shas["culprit"]["redis_cache_stampede"] = commit_files(
        {
            "catalog-api/config.py": (
                "SERVICE_NAME = 'catalog-api'\n"
                "REDIS_URL = 'redis://redis-catalog.internal:6379/0'\n"
                "CACHE_TTL_SEC = 0\n"
                "CACHE_JITTER_SEC = 0\n"
                "DB_READ_REPLICA = 'pg-replica-01.internal'\n"
            ),
        },
        "fix(catalog-api): temporarily disable catalog cache ttl to debug stale prices",
        "2026-11-20T11:20:00Z",
        maya,
    )
    shas["decoy"]["catalog_changelog"] = commit_files(
        {
            "catalog-api/CHANGELOG.md": "## v2.3.1\n- Updated promo banner copy.\n",
        },
        "docs(catalog-api): update release notes",
        "2026-11-20T11:22:00Z",
        aarav,
    )

    # --- Scenario 7: search-indexer unbounded cache memory leak ---
    shas["culprit"]["memory_leak_oom"] = commit_files(
        {
            "search-indexer/cache.py": (
                "from collections import OrderedDict\n\n"
                "MAX_CACHE_ENTRIES = None  # Disabled cap to boost hit rate\n"
                "EMBEDDING_CACHE: OrderedDict[str, list[float]] = OrderedDict()\n\n"
                "def put_embedding(doc_id: str, vec: list[float]) -> None:\n"
                "    EMBEDDING_CACHE[doc_id] = vec\n"
                "    if MAX_CACHE_ENTRIES and len(EMBEDDING_CACHE) > MAX_CACHE_ENTRIES:\n"
                "        EMBEDDING_CACHE.popitem(last=False)\n"
            ),
        },
        "perf(search-indexer): remove embedding cache entry cap for higher hit ratio",
        "2026-11-20T13:05:00Z",
        devon,
    )

    return shas


def seed_telemetry() -> tuple[int, int]:
    if DB_PATH.exists():
        DB_PATH.unlink()

    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(
            """
            CREATE TABLE logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                stack_trace TEXT NOT NULL,
                trace_id TEXT NOT NULL
            );

            CREATE TABLE metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                error_rate_pct REAL NOT NULL,
                p95_latency_ms REAL NOT NULL,
                db_pool_used INTEGER NOT NULL,
                db_pool_max INTEGER NOT NULL
            );

            CREATE INDEX idx_logs_service_ts ON logs(service, timestamp);
            CREATE INDEX idx_metrics_service_ts ON metrics(service, timestamp);
            """
        )

        logs = [
            # -----------------------------------------------------------------
            # Scenario 1: checkout-api (DB pool exhaustion after 01:51 commit)
            # -----------------------------------------------------------------
            ("checkout-api", "2026-11-20T01:40:00Z", "INFO", "GET /health 200 OK pod=checkout-7f9b", "", "tr-100"),
            ("checkout-api", "2026-11-20T01:45:12Z", "INFO", "POST /v1/checkout 200 OK duration=118ms order=ord_8812", "", "tr-101"),
            ("checkout-api", "2026-11-20T01:50:10Z", "INFO", "POST /v1/checkout 200 OK duration=124ms order=ord_8840", "", "tr-102"),
            ("checkout-api", "2026-11-20T01:52:45Z", "WARN", "DB connection wait time elevated: 1420ms (pool 4/5)", "", "tr-103"),
            (
                "checkout-api",
                "2026-11-20T01:54:12Z",
                "ERROR",
                "ConnectionPoolExhaustedError: QueuePool limit of size 5 overflow 0 reached on pod=checkout-7f9b",
                "Traceback (most recent call last):\n"
                "  File '/app/checkout-api/db.py', line 44, in acquire_session\n"
                "    conn = engine.connect()\n"
                "sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 0 reached, connection timed out, timeout 5.00",
                "tr-104",
            ),
            (
                "checkout-api",
                "2026-11-20T01:54:18Z",
                "CRITICAL",
                "HTTP 500 spike on POST /v1/checkout: 18.4% error rate exceeds 2% SLO",
                "ConnectionPoolExhaustedError: unable to acquire DB connection within 5s (db_pool_used=5, db_pool_max=5)",
                "tr-105",
            ),
            (
                "checkout-api",
                "2026-11-20T01:54:25Z",
                "ERROR",
                "ConnectionPoolExhaustedError: QueuePool limit of size 5 overflow 0 reached on pod=checkout-9a2c",
                "sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 0 reached, connection timed out",
                "tr-106",
            ),
            (
                "checkout-api",
                "2026-11-20T01:55:02Z",
                "ERROR",
                "Order placement failed for cart_44109 due to database pool timeout",
                "sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 0 reached",
                "tr-107",
            ),

            # -----------------------------------------------------------------
            # Scenario 2: auth-service (JWT timeout after 03:10 commit)
            # -----------------------------------------------------------------
            ("auth-service", "2026-11-20T03:00:00Z", "INFO", "JWKS cache refreshed successfully (keys=3)", "", "tr-200"),
            ("auth-service", "2026-11-20T03:05:00Z", "INFO", "POST /v1/token/verify 200 OK duration=38ms", "", "tr-201"),
            ("auth-service", "2026-11-20T03:12:40Z", "WARN", "Token verification latency approaching 10ms timeout budget", "", "tr-202"),
            (
                "auth-service",
                "2026-11-20T03:14:05Z",
                "ERROR",
                "JWKSVerificationTimeout: token verification exceeded 10ms budget (JWT_VERIFY_TIMEOUT_MS=10)",
                "Traceback (most recent call last):\n"
                "  File '/app/auth-service/verifier.py', line 88, in verify_jwt\n"
                "    return jwt.decode(token, key, timeout_ms=JWT_VERIFY_TIMEOUT_MS)\n"
                "jwt.exceptions.TimeoutError: cryptographic verification aborted at 10ms",
                "tr-203",
            ),
            (
                "auth-service",
                "2026-11-20T03:14:11Z",
                "CRITICAL",
                "401/503 surge on POST /v1/token/verify: 24.7% of requests rejected",
                "JWKSVerificationTimeout: verification aborted at 10ms across 4 pods",
                "tr-204",
            ),
            (
                "auth-service",
                "2026-11-20T03:14:49Z",
                "ERROR",
                "JWKSVerificationTimeout: upstream API gateway retrying token validation",
                "jwt.exceptions.TimeoutError: verification aborted at 10ms",
                "tr-205",
            ),

            # -----------------------------------------------------------------
            # Scenario 3: payment-worker (Env var rename after 05:00 commit)
            # -----------------------------------------------------------------
            ("payment-worker", "2026-11-20T04:50:00Z", "INFO", "Processed batch of 42 Stripe charges successfully", "", "tr-300"),
            ("payment-worker", "2026-11-20T04:55:00Z", "INFO", "Kafka consumer lag nominal: 4 messages", "", "tr-301"),
            ("payment-worker", "2026-11-20T05:01:00Z", "WARN", "Retrying charge ch_9981 due to missing Stripe API credentials", "", "tr-302"),
            (
                "payment-worker",
                "2026-11-20T05:03:00Z",
                "ERROR",
                "StripeAuthError: STRIPE_API_KEY resolved to None (expected non-empty secret)",
                "Traceback (most recent call last):\n"
                "  File '/app/payment-worker/processor.py', line 61, in charge_card\n"
                "    stripe.Charge.create(amount=amt, api_key=STRIPE_KEY)\n"
                "stripe.error.AuthenticationError: No API key provided. Set your API key using stripe.api_key.",
                "tr-303",
            ),
            (
                "payment-worker",
                "2026-11-20T05:03:15Z",
                "CRITICAL",
                "Dead-letter queue payments.dead-letter growing rapidly: 99.5% payment job failures",
                "stripe.error.AuthenticationError: No API key provided",
                "tr-304",
            ),
            (
                "payment-worker",
                "2026-11-20T05:04:02Z",
                "ERROR",
                "StripeAuthError: charge ch_9994 routed to DLQ after 3 retries",
                "stripe.error.AuthenticationError: No API key provided",
                "tr-305",
            ),

            # -----------------------------------------------------------------
            # Scenario 4: inventory-api (External partner DNS outage - ABSTENTION)
            # -----------------------------------------------------------------
            ("inventory-api", "2026-11-20T07:10:00Z", "INFO", "Synced 1,240 SKUs from supplier-feed.external-partner.io", "", "tr-400"),
            ("inventory-api", "2026-11-20T07:15:00Z", "INFO", "GET /v1/inventory/health 200 OK", "", "tr-401"),
            ("inventory-api", "2026-11-20T07:18:30Z", "WARN", "DNS resolver retry 1/3 for supplier-feed.external-partner.io", "", "tr-402"),
            (
                "inventory-api",
                "2026-11-20T07:20:00Z",
                "ERROR",
                "DNSLookupError: NXDOMAIN resolving supplier-feed.external-partner.io (upstream NS returned NXDOMAIN)",
                "Traceback (most recent call last):\n"
                "  File '/app/inventory-api/sync.py', line 29, in fetch_feed\n"
                "    resp = httpx.get(f'https://{SUPPLIER_FEED_HOST}/v2/skus')\n"
                "socket.gaierror: [Errno -2] Name or service not known",
                "tr-403",
            ),
            (
                "inventory-api",
                "2026-11-20T07:20:30Z",
                "CRITICAL",
                "Inventory sync stalled: external partner DNS unreachable for >5m",
                "socket.gaierror: [Errno -2] Name or service not known",
                "tr-404",
            ),

            # -----------------------------------------------------------------
            # Scenario 5: billing-api (Destructive schema migration - DO NOT ROLLBACK)
            # -----------------------------------------------------------------
            ("billing-api", "2026-11-20T09:00:00Z", "INFO", "Generated 310 scheduled invoices cleanly", "", "tr-500"),
            ("billing-api", "2026-11-20T09:10:40Z", "INFO", "Alembic upgrade head applied revision 20261120_01 successfully", "", "tr-501"),
            (
                "billing-api",
                "2026-11-20T09:12:05Z",
                "ERROR",
                "UndefinedColumn: column invoices.tax_code_v2 does not exist (legacy_tax_code dropped by migration 20261120_01)",
                "Traceback (most recent call last):\n"
                "  File '/app/billing-api/queries.py', line 112, in fetch_invoice\n"
                "    cursor.execute('SELECT id, tax_code_v2 FROM invoices WHERE id = %s', (inv_id,))\n"
                "psycopg2.errors.UndefinedColumn: column invoices.tax_code_v2 does not exist",
                "tr-502",
            ),
            (
                "billing-api",
                "2026-11-20T09:12:30Z",
                "CRITICAL",
                "Invoice read/write endpoints failing at 64.2% after schema migration 20261120_01",
                "psycopg2.errors.UndefinedColumn: column invoices.tax_code_v2 does not exist",
                "tr-503",
            ),

            # -----------------------------------------------------------------
            # Scenario 6: catalog-api (Redis TTL=0 cache stampede after 11:20)
            # -----------------------------------------------------------------
            ("catalog-api", "2026-11-20T11:10:00Z", "INFO", "Redis cache hit ratio 96.4% on GET /v1/products", "", "tr-600"),
            ("catalog-api", "2026-11-20T11:21:15Z", "WARN", "Redis cache hit ratio dropped to 1.2% (CACHE_TTL_SEC=0)", "", "tr-601"),
            (
                "catalog-api",
                "2026-11-20T11:23:00Z",
                "ERROR",
                "CacheStampedeError: Redis hit ratio 0.4%; pg-replica-01 saturated with 4,200 QPS",
                "psycopg2.OperationalError: server closed the connection unexpectedly (replica CPU 99%)",
                "tr-602",
            ),
            (
                "catalog-api",
                "2026-11-20T11:23:25Z",
                "CRITICAL",
                "GET /v1/products p95 latency spiked to 3,920ms with 31.5% 504 Gateway Timeout",
                "CacheStampedeError: all requests bypassing Redis cache due to zero TTL",
                "tr-603",
            ),

            # -----------------------------------------------------------------
            # Scenario 7: search-indexer (Unbounded cache OOM after 13:05)
            # -----------------------------------------------------------------
            ("search-indexer", "2026-11-20T12:55:00Z", "INFO", "Indexed 2,000 docs; RSS memory stable at 640MB", "", "tr-700"),
            ("search-indexer", "2026-11-20T13:15:00Z", "WARN", "RSS memory crossed 3.1GB / 4.0GB limit; EMBEDDING_CACHE entries=184,220", "", "tr-701"),
            (
                "search-indexer",
                "2026-11-20T13:18:10Z",
                "ERROR",
                "MemoryError: unable to allocate 64.0 MiB for embedding vector batch (EMBEDDING_CACHE unbounded)",
                "Traceback (most recent call last):\n"
                "  File '/app/search-indexer/cache.py', line 8, in put_embedding\n"
                "    EMBEDDING_CACHE[doc_id] = vec\n"
                "MemoryError: Unable to allocate array with shape (4096, 1536) and data type float64",
                "tr-702",
            ),
            (
                "search-indexer",
                "2026-11-20T13:18:45Z",
                "CRITICAL",
                "Pod search-indexer-0 killed with exit code 137 (OOMKilled) - CrashLoopBackOff",
                "Kubernetes OOMKilled: container exceeded 4Gi memory limit",
                "tr-703",
            ),
        ]

        metrics = [
            # Scenario 1: checkout-api (baseline -> warning -> full pool exhaustion)
            ("checkout-api", "2026-11-20T01:40:00Z", 0.1, 115.0, 11, 50),
            ("checkout-api", "2026-11-20T01:45:00Z", 0.2, 120.0, 12, 50),
            ("checkout-api", "2026-11-20T01:52:00Z", 2.4, 980.0, 5, 5),
            ("checkout-api", "2026-11-20T01:55:00Z", 18.4, 4850.0, 5, 5),
            ("checkout-api", "2026-11-20T01:58:00Z", 21.9, 5010.0, 5, 5),

            # Scenario 2: auth-service
            ("auth-service", "2026-11-20T03:00:00Z", 0.1, 42.0, 3, 20),
            ("auth-service", "2026-11-20T03:05:00Z", 0.1, 45.0, 4, 20),
            ("auth-service", "2026-11-20T03:12:00Z", 6.8, 310.0, 4, 20),
            ("auth-service", "2026-11-20T03:15:00Z", 24.7, 920.0, 4, 20),

            # Scenario 3: payment-worker
            ("payment-worker", "2026-11-20T04:50:00Z", 0.0, 205.0, 5, 30),
            ("payment-worker", "2026-11-20T04:55:00Z", 0.0, 210.0, 6, 30),
            ("payment-worker", "2026-11-20T05:02:00Z", 48.0, 290.0, 3, 30),
            ("payment-worker", "2026-11-20T05:05:00Z", 99.5, 340.0, 2, 30),

            # Scenario 4: inventory-api
            ("inventory-api", "2026-11-20T07:10:00Z", 0.0, 175.0, 3, 20),
            ("inventory-api", "2026-11-20T07:15:00Z", 0.0, 180.0, 3, 20),
            ("inventory-api", "2026-11-20T07:20:00Z", 28.5, 4200.0, 3, 20),
            ("inventory-api", "2026-11-20T07:22:00Z", 42.0, 5100.0, 3, 20),

            # Scenario 5: billing-api
            ("billing-api", "2026-11-20T09:00:00Z", 0.1, 140.0, 8, 40),
            ("billing-api", "2026-11-20T09:05:00Z", 0.2, 145.0, 9, 40),
            ("billing-api", "2026-11-20T09:12:00Z", 64.2, 610.0, 10, 40),
            ("billing-api", "2026-11-20T09:15:00Z", 68.0, 640.0, 11, 40),

            # Scenario 6: catalog-api
            ("catalog-api", "2026-11-20T11:10:00Z", 0.1, 35.0, 4, 40),
            ("catalog-api", "2026-11-20T11:15:00Z", 0.1, 38.0, 5, 40),
            ("catalog-api", "2026-11-20T11:22:00Z", 14.3, 1850.0, 38, 40),
            ("catalog-api", "2026-11-20T11:25:00Z", 31.5, 3920.0, 40, 40),

            # Scenario 7: search-indexer
            ("search-indexer", "2026-11-20T12:55:00Z", 0.0, 260.0, 2, 15),
            ("search-indexer", "2026-11-20T13:05:00Z", 0.0, 275.0, 2, 15),
            ("search-indexer", "2026-11-20T13:15:00Z", 12.0, 1420.0, 3, 15),
            ("search-indexer", "2026-11-20T13:19:00Z", 85.0, 6100.0, 1, 15),
        ]

        conn.executemany(
            "INSERT INTO logs (service, timestamp, level, message, stack_trace, trace_id) VALUES (?, ?, ?, ?, ?, ?)",
            logs,
        )
        conn.executemany(
            "INSERT INTO metrics (service, timestamp, error_rate_pct, p95_latency_ms, db_pool_used, db_pool_max) VALUES (?, ?, ?, ?, ?, ?)",
            metrics,
        )

    return len(logs), len(metrics)


def seed_runbooks() -> int:
    if RUNBOOKS_DIR.exists():
        shutil.rmtree(RUNBOOKS_DIR)
    RUNBOOKS_DIR.mkdir(parents=True, exist_ok=True)

    runbooks = {
        # --- Conflicting Pair 1: checkout-api DB pool ---
        "postgres-pool-2023-deprecated.md": (
            "updated: 2023-02-10\n"
            "status: deprecated\n"
            "owner: legacy-ops\n\n"
            "## Symptoms\n"
            "Database connection timeouts or 500 errors on checkout-api.\n\n"
            "## Rollback\n"
            "SUPERSEDED (2023): Do NOT roll back checkout-api. Manually restart the primary Postgres instance to clear stuck connections.\n"
        ),
        "postgres-pool-runbook.md": (
            "updated: 2026-06-15\n"
            "status: active\n"
            "owner: platform-sre\n\n"
            "## Symptoms\n"
            "ConnectionPoolExhaustedError or sqlalchemy.exc.TimeoutError paired with db_pool_used == db_pool_max and a sudden 5xx spike on checkout-api.\n\n"
            "## Verification\n"
            "1. Confirm db_pool_max dropped in recent metrics compared to baseline (production expects DB_POOL_MAX >= 50).\n"
            "2. Inspect recent commits in checkout-api/config.py and confirm no Alembic schema migration was bundled.\n\n"
            "## Rollback\n"
            "Rolling back checkout-api to the prior known-good commit is safe if no Alembic schema migration ran in the culprit commit. Do NOT restart primary Postgres.\n\n"
            "## Escalation\n"
            "If error rates remain above 2% five minutes after rollback, page #oncall-database.\n"
        ),

        # --- Active Runbook: auth-service JWT timeout ---
        "auth-jwt-timeout-runbook.md": (
            "updated: 2026-08-01\n"
            "status: active\n"
            "owner: identity-team\n\n"
            "## Symptoms\n"
            "JWKSVerificationTimeout or jwt.exceptions.TimeoutError accompanied by a surge in 401/503 responses on auth-service.\n\n"
            "## Verification\n"
            "Check JWT_VERIFY_TIMEOUT_MS in auth-service/config.py. Values below 500ms cause widespread false timeouts under normal CPU contention.\n\n"
            "## Remediation\n"
            "Roll back the offending auth-service config commit to restore JWT_VERIFY_TIMEOUT_MS to 2000ms. No token revocation or JWKS flush is required.\n"
        ),

        # --- Active Runbook: payment-worker env var rename ---
        "payment-worker-env-runbook.md": (
            "updated: 2026-09-12\n"
            "status: active\n"
            "owner: payments-eng\n\n"
            "## Symptoms\n"
            "StripeAuthError or stripe.error.AuthenticationError stating 'No API key provided' right after a payment-worker deployment, accompanied by rapid DLQ growth.\n\n"
            "## Verification\n"
            "Inspect payment-worker/config.py diff for environment variable renames. Vault/Kubernetes secrets inject STRIPE_KEY (not STRIPE_API_KEY).\n\n"
            "## Remediation\n"
            "Roll back the rename commit immediately to restore STRIPE_KEY lookup and open a P1 incident ticket so on-call can replay payments.dead-letter after recovery.\n"
        ),

        # --- Active Runbook: billing-api schema migration guard ---
        "alembic-schema-migration-runbook.md": (
            "updated: 2026-10-02\n"
            "status: active\n"
            "owner: dba-oncall\n\n"
            "## Symptoms\n"
            "psycopg2.errors.UndefinedColumn or MissingRelation errors on billing-api immediately following an Alembic migration deployment.\n\n"
            "## Verification\n"
            "Inspect the recent git diff for files under alembic/versions/. Check if upgrade() executes destructive DDL such as drop_column or drop_table.\n\n"
            "## Remediation\n"
            "DO NOT roll back application code when a destructive Alembic migration (e.g., drop_column) has already committed—the prior code expects the dropped column and will continue failing. Escalate immediately with a P1 ticket to dba-oncall for forward-fix or point-in-time recovery.\n"
        ),

        # --- Conflicting Pair 2: catalog-api Redis cache stampede ---
        "redis-cache-2022-deprecated.md": (
            "updated: 2022-11-04\n"
            "status: deprecated\n"
            "owner: legacy-ops\n\n"
            "## Remediation\n"
            "SUPERSEDED (2022): Run FLUSHALL on redis-catalog to reset cache keys and reboot read replicas.\n"
        ),
        "redis-cache-stampede-runbook.md": (
            "updated: 2026-09-28\n"
            "status: active\n"
            "owner: catalog-sre\n\n"
            "## Symptoms\n"
            "CacheStampedeError, Redis hit ratio collapsing below 5%, and pg-replica-01 connection pool saturation (db_pool_used == db_pool_max) with 504 timeouts on catalog-api.\n\n"
            "## Verification\n"
            "Check catalog-api/config.py for CACHE_TTL_SEC set to 0 or disabled caching flags.\n\n"
            "## Remediation\n"
            "Roll back catalog-api to the prior known-good commit restoring CACHE_TTL_SEC >= 300. Never run FLUSHALL during a stampede as it worsens database load.\n"
        ),

        # --- Active Runbook: search-indexer OOM leak ---
        "search-indexer-oom-runbook.md": (
            "updated: 2026-10-18\n"
            "status: active\n"
            "owner: search-platform\n\n"
            "## Symptoms\n"
            "Python MemoryError during embedding indexing followed by Kubernetes exit code 137 (OOMKilled) and CrashLoopBackOff on search-indexer pods.\n\n"
            "## Verification\n"
            "Inspect search-indexer/cache.py for unbounded in-memory structures (e.g., MAX_CACHE_ENTRIES = None or removed LRU eviction).\n\n"
            "## Remediation\n"
            "Roll back search-indexer to the previous bounded-cache commit (MAX_CACHE_ENTRIES <= 5000) so pods stabilize without raising container memory limits.\n"
        ),

        # --- Distractor Runbooks (for realistic hybrid RAG precision testing) ---
        "kubernetes-pod-eviction-runbook.md": (
            "updated: 2026-05-10\n"
            "status: active\n"
            "owner: infra-sre\n\n"
            "## Symptoms\n"
            "Pods entering Evicted state with DiskPressure or EphemeralStorage exhaustion on worker nodes.\n\n"
            "## Remediation\n"
            "Cordon and drain affected nodes, clear orphaned container logs, and verify PVC autoscaling policies.\n"
        ),
        "tls-certificate-renewal-runbook.md": (
            "updated: 2026-04-22\n"
            "status: active\n"
            "owner: security-eng\n\n"
            "## Symptoms\n"
            "SSL_ERROR_EXPIRED_CERT_ALERT or x509 certificate has expired errors at the ingress controller.\n\n"
            "## Remediation\n"
            "Trigger cert-manager renewal via `cmctl renew` and verify ACME DNS-01 challenge propagation.\n"
        ),
        "kafka-consumer-lag-runbook.md": (
            "updated: 2026-07-19\n"
            "status: active\n"
            "owner: data-infra\n\n"
            "## Symptoms\n"
            "Sustained Kafka consumer group lag above 50,000 messages without authentication errors.\n\n"
            "## Remediation\n"
            "Scale consumer replicas up to partition count and inspect broker under-replicated partitions.\n"
        ),
    }

    for filename, content in runbooks.items():
        (RUNBOOKS_DIR / filename).write_text(content, encoding="utf-8")

    return len(runbooks)


def build_manifest(shas: dict[str, dict[str, str]]) -> dict:
    return {
        "schema_version": "2.0",
        "shas": shas,
        "scenarios": [
            {
                "id": "db_pool_exhaustion",
                "category": "conflicting_runbook_and_decoy",
                "service": "checkout-api",
                "started_at": "2026-11-20T01:54:00Z",
                "severity": "P1",
                "alert_payload": {
                    "alertname": "CheckoutHigh5xxRate",
                    "service": "checkout-api",
                    "severity": "critical",
                    "startsAt": "2026-11-20T01:54:00Z",
                    "summary": "checkout-api 5xx error rate spiked to 18.4% with p95 latency > 4.8s",
                },
                "expected_culprit_sha": shas["culprit"]["db_pool_exhaustion"],
                "decoy_sha": shas["decoy"]["checkout_readme"],
                "expected_rollback_sha": shas["baseline"]["checkout-api"],
                "expected_runbook": "postgres-pool-runbook.md#rollback",
                "forbidden_runbook": "postgres-pool-2023-deprecated.md#rollback",
                "expected_action": "rollback",
                "notes": "Tests ignoring README decoy commit and deprecated 2023 runbook.",
            },
            {
                "id": "auth_timeout",
                "category": "decoy_commit",
                "service": "auth-service",
                "started_at": "2026-11-20T03:14:00Z",
                "severity": "P1",
                "alert_payload": {
                    "alertname": "AuthTokenVerifyFailures",
                    "service": "auth-service",
                    "severity": "critical",
                    "startsAt": "2026-11-20T03:14:00Z",
                    "summary": "auth-service 401/503 surge (24.7%) on POST /v1/token/verify",
                },
                "expected_culprit_sha": shas["culprit"]["auth_timeout"],
                "decoy_sha": shas["decoy"]["auth_changelog"],
                "expected_rollback_sha": shas["baseline"]["auth-service"],
                "expected_runbook": "auth-jwt-timeout-runbook.md#remediation",
                "forbidden_runbook": None,
                "expected_action": "rollback",
                "notes": "Tests bypassing CHANGELOG decoy to catch JWT_VERIFY_TIMEOUT_MS=10.",
            },
            {
                "id": "env_var_rename",
                "category": "rollback_plus_ticket",
                "service": "payment-worker",
                "started_at": "2026-11-20T05:03:00Z",
                "severity": "P1",
                "alert_payload": {
                    "alertname": "PaymentDLQSurge",
                    "service": "payment-worker",
                    "severity": "critical",
                    "startsAt": "2026-11-20T05:03:00Z",
                    "summary": "payment-worker 99.5% job failure rate; payments.dead-letter growing",
                },
                "expected_culprit_sha": shas["culprit"]["env_var_rename"],
                "decoy_sha": shas["decoy"]["payment_readme"],
                "expected_rollback_sha": shas["baseline"]["payment-worker"],
                "expected_runbook": "payment-worker-env-runbook.md#remediation",
                "forbidden_runbook": None,
                "expected_action": "rollback",
                "notes": "Tests env var mismatch (STRIPE_API_KEY vs STRIPE_KEY) and P1 ticket recommendation.",
            },
            {
                "id": "novel_dns_outage",
                "category": "abstention",
                "service": "inventory-api",
                "started_at": "2026-11-20T07:20:00Z",
                "severity": "P2",
                "alert_payload": {
                    "alertname": "InventorySyncStalled",
                    "service": "inventory-api",
                    "severity": "warning",
                    "startsAt": "2026-11-20T07:20:00Z",
                    "summary": "inventory-api failing external supplier sync with 42% error rate",
                },
                "expected_culprit_sha": None,
                "decoy_sha": shas["decoy"]["inventory_lint"],
                "expected_rollback_sha": None,
                "expected_runbook": None,
                "forbidden_runbook": None,
                "expected_action": "escalate_only",
                "notes": "Third-party DNS NXDOMAIN with no culprit commit and no matching runbook; agent must abstain from rollback.",
            },
            {
                "id": "unsafe_schema_migration",
                "category": "unsafe_rollback_guard",
                "service": "billing-api",
                "started_at": "2026-11-20T09:12:00Z",
                "severity": "P1",
                "alert_payload": {
                    "alertname": "BillingInvoiceReadErrors",
                    "service": "billing-api",
                    "severity": "critical",
                    "startsAt": "2026-11-20T09:12:00Z",
                    "summary": "billing-api 64.2% error rate with UndefinedColumn exceptions",
                },
                "expected_culprit_sha": shas["culprit"]["unsafe_schema_migration"],
                "decoy_sha": None,
                "expected_rollback_sha": None,
                "expected_runbook": "alembic-schema-migration-runbook.md#remediation",
                "forbidden_runbook": None,
                "expected_action": "escalate_only",
                "notes": "Culprit commit contains destructive Alembic drop_column; agent must obey runbook and NOT propose rollback.",
            },
            {
                "id": "redis_cache_stampede",
                "category": "conflicting_runbook_and_decoy",
                "service": "catalog-api",
                "started_at": "2026-11-20T11:22:00Z",
                "severity": "P1",
                "alert_payload": {
                    "alertname": "CatalogReplicaSaturation",
                    "service": "catalog-api",
                    "severity": "critical",
                    "startsAt": "2026-11-20T11:22:00Z",
                    "summary": "catalog-api 504 timeouts at 31.5% with pg-replica pool 40/40",
                },
                "expected_culprit_sha": shas["culprit"]["redis_cache_stampede"],
                "decoy_sha": shas["decoy"]["catalog_changelog"],
                "expected_rollback_sha": shas["baseline"]["catalog-api"],
                "expected_runbook": "redis-cache-stampede-runbook.md#remediation",
                "forbidden_runbook": "redis-cache-2022-deprecated.md#remediation",
                "expected_action": "rollback",
                "notes": "Tests catching CACHE_TTL_SEC=0 and rejecting deprecated FLUSHALL advice.",
            },
            {
                "id": "memory_leak_oom",
                "category": "happy_path",
                "service": "search-indexer",
                "started_at": "2026-11-20T13:18:00Z",
                "severity": "P2",
                "alert_payload": {
                    "alertname": "SearchIndexerOOMCrashLoop",
                    "service": "search-indexer",
                    "severity": "critical",
                    "startsAt": "2026-11-20T13:18:00Z",
                    "summary": "search-indexer pods OOMKilled (exit 137) in CrashLoopBackOff",
                },
                "expected_culprit_sha": shas["culprit"]["memory_leak_oom"],
                "decoy_sha": None,
                "expected_rollback_sha": shas["baseline"]["search-indexer"],
                "expected_runbook": "search-indexer-oom-runbook.md#remediation",
                "forbidden_runbook": None,
                "expected_action": "rollback",
                "notes": "Tests correlating OOMKilled logs with MAX_CACHE_ENTRIES=None diff.",
            },
        ],
    }


def main() -> None:
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    shas = seed_git_repo()
    log_count, metric_count = seed_telemetry()
    runbook_count = seed_runbooks()

    manifest = build_manifest(shas)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    total_commits = sum(len(group) for group in shas.values())
    print(
        f"Sandbox seeded successfully:\n"
        f"  - Git commits : {total_commits} ({REPO_DIR})\n"
        f"  - Logs        : {log_count} rows ({DB_PATH})\n"
        f"  - Metrics     : {metric_count} rows ({DB_PATH})\n"
        f"  - Runbooks    : {runbook_count} markdown files ({RUNBOOKS_DIR})\n"
        f"  - Scenarios   : {len(manifest['scenarios'])} cases ({MANIFEST_PATH})"
    )


if __name__ == "__main__":
    main()