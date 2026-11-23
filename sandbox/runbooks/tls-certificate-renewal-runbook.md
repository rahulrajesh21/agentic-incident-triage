updated: 2026-04-22
status: active
owner: security-eng

## Symptoms
SSL_ERROR_EXPIRED_CERT_ALERT or x509 certificate has expired errors at the ingress controller.

## Remediation
Trigger cert-manager renewal via `cmctl renew` and verify ACME DNS-01 challenge propagation.
