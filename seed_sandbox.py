import json
import os
import shutil
import sqlite3
import subprocess
from pathlib import Path

BASE_DIR = Path("sandbox")
REPO_DIR = BASE_DIR / "mock_repo"
RUNBOOKS_DIR = BASE_DIR / "runbooks"
DB_PATH = BASE_DIR / "telemetry.db"
MANIFEST_PATH = BASE_DIR / "manifest.json"


def run_git(args: list[str], date_iso: str | None = None) -> str:
    env = os.environ.copy()
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


def commit_file(rel_path: str, content: str, message: str, date_iso: str) -> str:
    target = REPO_DIR / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    run_git(["add", rel_path])
    run_git(["commit", "-m", message], date_iso=date_iso)
    return run_git(["rev-parse", "--short", "HEAD"])


def seed_git_repo() -> dict[str, dict[str, str]]:
    if REPO_DIR.exists():
        shutil.rmtree(REPO_DIR)
    REPO_DIR.mkdir(parents=True, exist_ok=True)

    run_git(["init"])
    run_git(["config", "user.email", "dev@tracegate.local"])
    run_git(["config", "user.name", "TraceGate Dev"])

    shas: dict[str, dict[str, str]] = {
        "baseline": {},
        "culprit": {},
        "decoy": {},
    }

    # --- Known-good baselines ---
    shas["baseline"]["checkout-api"] = commit_file(
        "checkout-api/config.py",
        "DB_POOL_MAX = 50\nDB_POOL_TIMEOUT_SEC = 5\n",
        "chore(checkout-api): initial production db pool config",
        "2026-11-19T10:00:00Z",
    )
    shas["baseline"]["auth-service"] = commit_file(
        "auth-service/config.py",
        "JWT_VERIFY_TIMEOUT_MS = 2000\nJWKS_CACHE_TTL_SEC = 300\n",
        "chore(auth-service): initial jwt verification config",
        "2026-11-19T10:05:00Z",
    )
    shas["baseline"]["payment-worker"] = commit_file(
        "payment-worker/config.py",
        "import os\nSTRIPE_KEY = os.getenv('STRIPE_KEY')\n",
        "chore(payment-worker): initial stripe client config",
        "2026-11-19T10:10:00Z",
    )
    shas["baseline"]["inventory-api"] = commit_file(
        "inventory-api/config.py",
        "SUPPLIER_FEED_HOST = 'supplier-feed.external-partner.io'\nRETRY_LIMIT = 3\n",
        "chore(inventory-api): initial supplier feed config",
        "2026-11-19T10:15:00Z",
    )

    # --- Scenario 1: checkout-api DB pool exhaustion + decoy commit ---
    shas["culprit"]["db_pool_exhaustion"] = commit_file(
        "checkout-api/config.py",
        "DB_POOL_MAX = 5\nDB_POOL_TIMEOUT_SEC = 5\n",
        "chore(checkout-api): lower db pool size for staging parity",
        "2026-11-20T01:51:00Z",
    )
    shas["decoy"]["checkout_readme"] = commit_file(
        "checkout-api/README.md",
        "# Checkout API\nHandles cart and order checkout.\n",
        "docs(checkout-api): update service readme",
        "2026-11-20T01:52:30Z",
    )

    # --- Scenario 2: auth-service JWT timeout + decoy commit ---
    shas["culprit"]["auth_timeout"] = commit_file(
        "auth-service/config.py",
        "JWT_VERIFY_TIMEOUT_MS = 10\nJWKS_CACHE_TTL_SEC = 300\n",
        "perf(auth-service): tighten jwt verification timeout",
        "2026-11-20T03:10:00Z",
    )
    shas["decoy"]["auth_changelog"] = commit_file(
        "auth-service/CHANGELOG.md",
        "## v1.4.2\n- Minor logging cleanup\n",
        "docs(auth-service): update changelog",
        "2026-11-20T03:12:00Z",
    )

    # --- Scenario 3: payment-worker env var rename ---
    shas["culprit"]["env_var_rename"] = commit_file(
        "payment-worker/config.py",
        "import os\nSTRIPE_KEY = os.getenv('STRIPE_API_KEY')\n",
        "refactor(payment-worker): standardize stripe env var naming",
        "2026-11-20T05:00:00Z",
    )

    # --- Scenario 4: inventory-api has NO culprit commit (tests abstention) ---
    return shas


def seed_telemetry() -> None:
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
            """
        )

        logs = [
            # Scenario 1: checkout-api (noise + burst after 01:51 commit)
            ("checkout-api", "2026-11-20T01:48:00Z", "INFO", "GET /health 200 OK", "", "tr-100"),
            ("checkout-api", "2026-11-20T01:50:10Z", "INFO", "POST /v1/checkout 200 OK", "", "tr-101"),
            ("checkout-api", "2026-11-20T01:54:12Z", "ERROR", "ConnectionPoolExhaustedError: QueuePool limit of size 5 reached", "sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 0 reached, connection timed out", "tr-102"),
            ("checkout-api", "2026-11-20T01:54:18Z", "CRITICAL", "HTTP 500 spike on POST /v1/checkout", "ConnectionPoolExhaustedError: unable to acquire DB connection within 5s", "tr-103"),
            ("checkout-api", "2026-11-20T01:54:25Z", "ERROR", "ConnectionPoolExhaustedError: QueuePool limit of size 5 reached", "sqlalchemy.exc.TimeoutError", "tr-104"),

            # Scenario 2: auth-service (noise + burst after 03:10 commit)
            ("auth-service", "2026-11-20T03:05:00Z", "INFO", "JWKS cache refreshed successfully", "", "tr-200"),
            ("auth-service", "2026-11-20T03:14:05Z", "ERROR", "JWKSVerificationTimeout: token verification exceeded 10ms budget", "jwt.exceptions.TimeoutError: verification aborted at 10ms", "tr-201"),
            ("auth-service", "2026-11-20T03:14:11Z", "CRITICAL", "401/503 surge on POST /v1/token/verify", "JWKSVerificationTimeout", "tr-202"),

            # Scenario 3: payment-worker (noise + burst after 05:00 commit)
            ("payment-worker", "2026-11-20T04:55:00Z", "INFO", "Processed batch of 42 charges", "", "tr-300"),
            ("payment-worker", "2026-11-20T05:01:00Z", "WARN", "Retrying charge ch_9981 due to missing credentials", "", "tr-301"),
            ("payment-worker", "2026-11-20T05:03:00Z", "ERROR", "StripeAuthError: STRIPE_API_KEY resolved to None", "stripe.error.AuthenticationError: No API key provided", "tr-302"),
            ("payment-worker", "2026-11-20T05:03:15Z", "CRITICAL", "Dead-letter queue growing: 100% payment job failures", "stripe.error.AuthenticationError", "tr-303"),

            # Scenario 4: inventory-api (novel third-party outage, no bad commit/runbook)
            ("inventory-api", "2026-11-20T07:15:00Z", "INFO", "Synced 1,240 SKUs from supplier feed", "", "tr-400"),
            ("inventory-api", "2026-11-20T07:20:00Z", "ERROR", "DNSLookupError: NXDOMAIN resolving supplier-feed.external-partner.io", "socket.gaierror: [Errno -2] Name or service not known", "tr-401"),
            ("inventory-api", "2026-11-20T07:20:30Z", "CRITICAL", "Inventory sync stalled: external partner DNS unreachable", "socket.gaierror", "tr-402"),
        ]

        metrics = [
            # Scenario 1
            ("checkout-api", "2026-11-20T01:45:00Z", 0.2, 120.0, 12, 50),
            ("checkout-api", "2026-11-20T01:55:00Z", 18.4, 4850.0, 5, 5),

            # Scenario 2
            ("auth-service", "2026-11-20T03:05:00Z", 0.1, 45.0, 4, 20),
            ("auth-service", "2026-11-20T03:15:00Z", 24.7, 920.0, 4, 20),

            # Scenario 3
            ("payment-worker", "2026-11-20T04:55:00Z", 0.0, 210.0, 6, 30),
            ("payment-worker", "2026-11-20T05:05:00Z", 99.5, 340.0, 2, 30),

            # Scenario 4
            ("inventory-api", "2026-11-20T07:15:00Z", 0.0, 180.0, 3, 20),
            ("inventory-api", "2026-11-20T07:22:00Z", 42.0, 5100.0, 3, 20),
        ]

        conn.executemany(
            "INSERT INTO logs (service, timestamp, level, message, stack_trace, trace_id) VALUES (?, ?, ?, ?, ?, ?)",
            logs,
        )
        conn.executemany(
            "INSERT INTO metrics (service, timestamp, error_rate_pct, p95_latency_ms, db_pool_used, db_pool_max) VALUES (?, ?, ?, ?, ?, ?)",
            metrics,
        )


def seed_runbooks() -> None:
    RUNBOOKS_DIR.mkdir(parents=True, exist_ok=True)

    runbooks = {
        "postgres-pool-2023-deprecated.md": (
            "updated: 2023-02-10\n"
            "status: deprecated\n\n"
            "## Rollback\n"
            "Do NOT roll back checkout-api. Manually restart the primary Postgres instance.\n"
        ),
        "postgres-pool-runbook.md": (
            "updated: 2026-06-15\n"
            "status: active\n\n"
            "## Symptoms\n"
            "ConnectionPoolExhaustedError paired with db_pool_used == db_pool_max and a sudden 5xx spike on checkout-api.\n\n"
            "## Rollback\n"
            "Rolling back checkout-api to the prior known-good commit is safe if no Alembic schema migration ran in the culprit commit.\n"
        ),
        "auth-jwt-timeout-runbook.md": (
            "updated: 2026-08-01\n"
            "status: active\n\n"
            "## Symptoms\n"
            "JWKSVerificationTimeout errors accompanied by a surge in 401/503 responses on auth-service.\n\n"
            "## Remediation\n"
            "Verify JWT_VERIFY_TIMEOUT_MS in auth-service/config.py. Values below 500ms cause false timeouts under load. Roll back the offending config commit.\n"
        ),
        "payment-worker-env-runbook.md": (
            "updated: 2026-09-12\n"
            "status: active\n\n"
            "## Symptoms\n"
            "StripeAuthError or AuthenticationError stating No API key provided right after a payment-worker deployment.\n\n"
            "## Remediation\n"
            "Production secrets inject STRIPE_KEY (not STRIPE_API_KEY). Roll back the rename commit immediately and open a P1 incident ticket.\n"
        ),
    }

    for filename, content in runbooks.items():
        (RUNBOOKS_DIR / filename).write_text(content, encoding="utf-8")


def main() -> None:
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    shas = seed_git_repo()
    seed_telemetry()
    seed_runbooks()

    manifest = {
        "shas": shas,
        "scenarios": [
            {
                "id": "db_pool_exhaustion",
                "service": "checkout-api",
                "started_at": "2026-11-20T01:54:00Z",
                "expected_culprit_sha": shas["culprit"]["db_pool_exhaustion"],
                "expected_rollback_sha": shas["baseline"]["checkout-api"],
                "expected_runbook": "postgres-pool-runbook.md#rollback",
                "expected_action": "rollback",
            },
            {
                "id": "auth_timeout",
                "service": "auth-service",
                "started_at": "2026-11-20T03:14:00Z",
                "expected_culprit_sha": shas["culprit"]["auth_timeout"],
                "expected_rollback_sha": shas["baseline"]["auth-service"],
                "expected_runbook": "auth-jwt-timeout-runbook.md#remediation",
                "expected_action": "rollback",
            },
            {
                "id": "env_var_rename",
                "service": "payment-worker",
                "started_at": "2026-11-20T05:03:00Z",
                "expected_culprit_sha": shas["culprit"]["env_var_rename"],
                "expected_rollback_sha": shas["baseline"]["payment-worker"],
                "expected_runbook": "payment-worker-env-runbook.md#remediation",
                "expected_action": "rollback",
            },
            {
                "id": "novel_dns_outage",
                "service": "inventory-api",
                "started_at": "2026-11-20T07:20:00Z",
                "expected_culprit_sha": None,
                "expected_rollback_sha": None,
                "expected_runbook": None,
                "expected_action": "escalate_only",
            },
        ],
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Sandbox seeded successfully.\nManifest written to: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()