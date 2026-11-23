updated: 2026-09-12
status: active

## Symptoms
StripeAuthError or AuthenticationError stating No API key provided right after a payment-worker deployment.

## Remediation
Production secrets inject STRIPE_KEY (not STRIPE_API_KEY). Roll back the rename commit immediately and open a P1 incident ticket.
