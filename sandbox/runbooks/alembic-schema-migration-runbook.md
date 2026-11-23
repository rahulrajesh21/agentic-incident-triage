updated: 2026-10-02
status: active
owner: dba-oncall

## Symptoms
psycopg2.errors.UndefinedColumn or MissingRelation errors on billing-api immediately following an Alembic migration deployment.

## Verification
Inspect the recent git diff for files under alembic/versions/. Check if upgrade() executes destructive DDL such as drop_column or drop_table.

## Remediation
DO NOT roll back application code when a destructive Alembic migration (e.g., drop_column) has already committed—the prior code expects the dropped column and will continue failing. Escalate immediately with a P1 ticket to dba-oncall for forward-fix or point-in-time recovery.
