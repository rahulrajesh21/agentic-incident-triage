updated: 2026-08-01
status: active
owner: identity-team

## Symptoms
JWKSVerificationTimeout or jwt.exceptions.TimeoutError accompanied by a surge in 401/503 responses on auth-service.

## Verification
Check JWT_VERIFY_TIMEOUT_MS in auth-service/config.py. Values below 500ms cause widespread false timeouts under normal CPU contention.

## Remediation
Roll back the offending auth-service config commit to restore JWT_VERIFY_TIMEOUT_MS to 2000ms. No token revocation or JWKS flush is required.
