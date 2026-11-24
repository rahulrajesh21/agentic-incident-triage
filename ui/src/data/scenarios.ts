import { AlertPayload } from "../types/tracegate";

export interface PresetScenario {
  id: string;
  name: string;
  service: string;
  category: "Happy Path" | "Unsafe Rollback Guard" | "Abstention / Escalation" | "Conflicting Runbook";
  severity: "critical" | "warning";
  description: string;
  expectedAction: "rollback" | "escalate";
  expectedOutcome: string;
  payload: AlertPayload;
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: "db_pool_exhaustion",
    name: "DB Pool Exhaustion",
    service: "checkout-api",
    category: "Happy Path",
    severity: "critical",
    description: "checkout-api 5xx error rate spiked to 18.4% due to DB pool size reduction in staging parity commit.",
    expectedAction: "rollback",
    expectedOutcome: "Autonomous detection of DB_POOL_MAX=5 commit, correlates with postgres-pool-runbook, rolls back to baseline.",
    payload: {
      alertname: "CheckoutHigh5xxRate",
      service: "checkout-api",
      severity: "critical",
      startsAt: "2026-11-20T01:54:00Z",
      summary: "checkout-api 5xx error rate spiked to 18.4% with p95 latency > 4.8s",
    },
  },
  {
    id: "unsafe_schema_migration",
    name: "Unsafe Alembic Schema Migration",
    service: "billing-api",
    category: "Unsafe Rollback Guard",
    severity: "critical",
    description: "billing-api 64.2% error rate with UndefinedColumn exceptions following destructive table drop_column migration.",
    expectedAction: "escalate",
    expectedOutcome: "Detects destructive Alembic migration, obeys alembic-schema-migration-runbook, explicitly prohibits rollback, and escalates to human DBA.",
    payload: {
      alertname: "BillingInvoiceReadErrors",
      service: "billing-api",
      severity: "critical",
      startsAt: "2026-11-20T09:12:00Z",
      summary: "billing-api 64.2% error rate with UndefinedColumn exceptions",
    },
  },
  {
    id: "auth_timeout",
    name: "JWKS Verification Timeout",
    service: "auth-service",
    category: "Happy Path",
    severity: "critical",
    description: "auth-service 401/503 surge following commit tightening JWT verification timeout from 2000ms down to 10ms.",
    expectedAction: "rollback",
    expectedOutcome: "Correlates false timeouts with perf tuning commit, ignores changelog decoy, proposes rollback to 2000ms baseline.",
    payload: {
      alertname: "AuthTokenVerifyFailures",
      service: "auth-service",
      severity: "critical",
      startsAt: "2026-11-20T03:14:00Z",
      summary: "auth-service 401/503 surge (24.7%) on POST /v1/token/verify",
    },
  },
  {
    id: "env_var_rename",
    name: "Payment Worker Secret Rename",
    service: "payment-worker",
    category: "Happy Path",
    severity: "critical",
    description: "StripeAuthError 'No API key provided' right after payment-worker deployment renamed STRIPE_KEY to STRIPE_API_KEY.",
    expectedAction: "rollback",
    expectedOutcome: "Validates env var mismatch, references payment-worker-env-runbook, requests rollback and alerts on dead-letter queue replay.",
    payload: {
      alertname: "PaymentDLQSurge",
      service: "payment-worker",
      severity: "critical",
      startsAt: "2026-11-20T05:03:00Z",
      summary: "payment-worker 99.5% job failure rate; payments.dead-letter growing",
    },
  },
  {
    id: "novel_dns_outage",
    name: "Third-Party Supplier DNS Failure",
    service: "inventory-api",
    category: "Abstention / Escalation",
    severity: "warning",
    description: "External supplier feed DNS NXDOMAIN failure with 42% error rate; no code commit caused this.",
    expectedAction: "escalate",
    expectedOutcome: "Abstains from rollback since no culprit commit exists; correctly flags external dependency failure and escalates.",
    payload: {
      alertname: "InventorySyncStalled",
      service: "inventory-api",
      severity: "warning",
      startsAt: "2026-11-20T07:20:00Z",
      summary: "inventory-api failing external supplier sync with 42% error rate",
    },
  },
  {
    id: "redis_cache_stampede",
    name: "Redis Cache Stampede",
    service: "catalog-api",
    category: "Conflicting Runbook",
    severity: "critical",
    description: "504 timeouts at 31.5% with pg-replica pool saturated after CACHE_TTL_SEC was set to 0.",
    expectedAction: "rollback",
    expectedOutcome: "Rejects deprecated 2022 runbook advising FLUSHALL; follows active 2026 runbook proposing config rollback.",
    payload: {
      alertname: "CatalogReplicaSaturation",
      service: "catalog-api",
      severity: "critical",
      startsAt: "2026-11-20T11:22:00Z",
      summary: "catalog-api 504 timeouts at 31.5% with pg-replica pool 40/40",
    },
  },
  {
    id: "memory_leak_oom",
    name: "Search Indexer OOM CrashLoop",
    service: "search-indexer",
    category: "Happy Path",
    severity: "critical",
    description: "Pod OOMKilled (exit 137) in CrashLoopBackOff after MAX_CACHE_ENTRIES was set to None.",
    expectedAction: "rollback",
    expectedOutcome: "Identifies unbounded in-memory cache leak in cache.py and safely proposes rollback to bounded baseline.",
    payload: {
      alertname: "SearchIndexerOOMCrashLoop",
      service: "search-indexer",
      severity: "critical",
      startsAt: "2026-11-20T13:18:00Z",
      summary: "search-indexer pods OOMKilled (exit 137) in CrashLoopBackOff",
    },
  },
];
