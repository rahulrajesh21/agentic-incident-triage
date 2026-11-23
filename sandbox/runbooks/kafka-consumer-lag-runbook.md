updated: 2026-07-19
status: active
owner: data-infra

## Symptoms
Sustained Kafka consumer group lag above 50,000 messages without authentication errors.

## Remediation
Scale consumer replicas up to partition count and inspect broker under-replicated partitions.
