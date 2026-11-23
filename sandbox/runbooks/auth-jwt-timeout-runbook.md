updated: 2026-08-01
status: active

## Symptoms
JWKSVerificationTimeout errors accompanied by a surge in 401/503 responses on auth-service.

## Remediation
Verify JWT_VERIFY_TIMEOUT_MS in auth-service/config.py. Values below 500ms cause false timeouts under load. Roll back the offending config commit.
