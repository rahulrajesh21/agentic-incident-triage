updated: 2026-05-10
status: active
owner: infra-sre

## Symptoms
Pods entering Evicted state with DiskPressure or EphemeralStorage exhaustion on worker nodes.

## Remediation
Cordon and drain affected nodes, clear orphaned container logs, and verify PVC autoscaling policies.
