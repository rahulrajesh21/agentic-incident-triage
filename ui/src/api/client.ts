import {
  AlertPayload,
  ApprovalDecision,
  IncidentDetail,
  WebhookResponse,
} from "../types/tracegate";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let detail = `HTTP error ${response.status}`;
      try {
        const body = await response.json();
        detail = body.detail || body.message || detail;
      } catch {
        // use fallback
      }
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : "Network error / Backend unreachable";
    throw new ApiError(msg, 0);
  }
}

export const api = {
  baseUrl: API_BASE_URL,

  async checkHealth(): Promise<{ status: string }> {
    return request<{ status: string }>("/health");
  },

  async listIncidents(): Promise<{ incidents: string[] }> {
    return request<{ incidents: string[] }>("/incidents");
  },

  async sendAlert(alert: AlertPayload): Promise<WebhookResponse> {
    return request<WebhookResponse>("/webhooks/alertmanager", {
      method: "POST",
      body: JSON.stringify(alert),
    });
  },

  async getIncident(incidentId: string): Promise<IncidentDetail> {
    return request<IncidentDetail>(`/incidents/${encodeURIComponent(incidentId)}`);
  },

  async approveIncident(
    incidentId: string,
    decision: ApprovalDecision
  ): Promise<{
    incident_id: string;
    status: string;
    approved: boolean;
    approved_by: string;
    remediation_result: Record<string, unknown>;
  }> {
    return request(`/incidents/${encodeURIComponent(incidentId)}/approve`, {
      method: "POST",
      body: JSON.stringify(decision),
    });
  },
};
