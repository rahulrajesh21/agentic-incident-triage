import hashlib
import re
from typing import Any

from core.schemas import IncidentAlert


def make_incident_id(alert: IncidentAlert) -> str:
    """Generate a deterministic incident ID from an alert for deduplication."""
    clean_service = re.sub(r"[^a-zA-Z0-9_-]", "", alert.service).lower()
    content = f"{alert.service}:{alert.alertname}:{alert.starts_at}"
    digest = hashlib.sha256(content.encode()).hexdigest()[:8]
    return f"inc-{clean_service}-{digest}"


def parse_alert_payloads(payload: dict[str, Any]) -> list[IncidentAlert]:
    """Parse alerts from Prometheus Alertmanager webhooks or raw alert dictionaries."""
    alerts: list[IncidentAlert] = []

    # Case 1: Standard Alertmanager webhook with 'alerts' list
    if "alerts" in payload and isinstance(payload["alerts"], list):
        for raw in payload["alerts"]:
            if not isinstance(raw, dict):
                continue
            labels = raw.get("labels", {})
            annotations = raw.get("annotations", {})
            data = {
                "alertname": labels.get("alertname") or raw.get("alertname", "UnknownAlert"),
                "service": labels.get("service") or raw.get("service", "unknown-service"),
                "severity": labels.get("severity") or raw.get("severity", "critical"),
                "startsAt": raw.get("startsAt") or labels.get("startsAt") or "1970-01-01T00:00:00Z",
                "summary": (
                    annotations.get("summary")
                    or annotations.get("description")
                    or raw.get("summary", "")
                ),
            }
            alerts.append(IncidentAlert.model_validate(data))
        return alerts

    # Case 2: Single alert object (e.g. sandbox scenario alert_payload)
    if "service" in payload or "alertname" in payload:
        alerts.append(IncidentAlert.model_validate(payload))
        return alerts

    return alerts
