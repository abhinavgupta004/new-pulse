import type { ClusterDetail, IngestStatus, TimelineCluster } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request to ${path} failed with ${res.status}`, res.status, body);
  }
  return res.json();
}

export function getTimeline(): Promise<{ timeline: TimelineCluster[] }> {
  return request("/timeline");
}

export function getCluster(id: string): Promise<ClusterDetail> {
  return request(`/clusters/${id}`);
}

export function triggerIngest(): Promise<{ jobId: string; status: string }> {
  // 409 means a job is already running server-side; the caller treats that
  // as "attach to the existing job" rather than a hard failure.
  return request<{ jobId: string; status: string }>("/ingest/trigger", { method: "POST" }).catch((err) => {
    if (err instanceof ApiError && err.status === 409 && typeof err.body.jobId === "string") {
      return { jobId: err.body.jobId, status: "running" };
    }
    throw err;
  });
}

export function getIngestStatus(jobId: string): Promise<IngestStatus> {
  return request(`/ingest/status/${jobId}`);
}
