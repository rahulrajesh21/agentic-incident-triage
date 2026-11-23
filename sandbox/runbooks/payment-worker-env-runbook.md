updated: 2026-09-12
status: active
owner: payments-eng

## Symptoms
StripeAuthError or stripe.error.AuthenticationError stating 'No API key provided' right after a payment-worker deployment, accompanied by rapid DLQ growth.

## Verification
Inspect payment-worker/config.py diff for environment variable renames. Vault/Kubernetes secrets inject STRIPE_KEY (not STRIPE_API_KEY).

## Remediation
Roll back the rename commit immediately to restore STRIPE_KEY lookup and open a P1 incident ticket so on-call can replay payments.dead-letter after recovery.
