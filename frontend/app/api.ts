/**
 * 백엔드 API 클라이언트.
 * 브라우저에서는 VITE_API_BASE (없으면 http://localhost:8000) 로 직접 호출.
 */
const API_BASE =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  import.meta.env.VITE_API_BASE ||
  "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const msg = data?.detail || data?.message || `요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export interface Train {
  train_number: string;
  train_name: string;
  dep_station_name: string;
  arr_station_name: string;
  dep_date: string;
  dep_time: string;
  arr_date: string;
  arr_time: string;
  general_seat_state: string;
  special_seat_state: string;
  general_available: boolean;
  special_available: boolean;
}

export interface Job {
  id: number;
  dep: string;
  arr: string;
  date: string;
  time: string;
  train_number: string;
  train_label: string;
  seat_type: string;
  status: string;
  status_display: string;
  attempts: number;
  retry_interval_ms: number;
  last_message: string;
  reservation_number: string;
  result: any;
  created_at: string;
  updated_at: string;
}

export interface Credentials {
  srt_id: string;
  srt_pw: string;
}

export const api = {
  stations: () => request<{ stations: string[] }>("/stations/"),

  loginCheck: (c: Credentials) =>
    request<{ ok: boolean }>("/login-check/", {
      method: "POST",
      body: JSON.stringify(c),
    }),

  search: (
    c: Credentials,
    params: { dep: string; arr: string; date: string; time: string }
  ) =>
    request<{ trains: Train[] }>("/search/", {
      method: "POST",
      body: JSON.stringify({ ...c, ...params }),
    }),

  reserve: (payload: Record<string, unknown>) =>
    request<{
      reserved?: boolean;
      queued?: boolean;
      message: string;
      job: Job;
    }>("/reserve/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  job: (id: number) => request<Job>(`/jobs/${id}/`),

  jobs: () => request<{ jobs: Job[] }>("/jobs/"),

  startJob: (id: number, retry_interval_ms: number) =>
    request<Job>(`/jobs/${id}/start/`, {
      method: "POST",
      body: JSON.stringify({ retry_interval_ms }),
    }),

  cancelJob: (id: number) =>
    request<Job>(`/jobs/${id}/cancel/`, { method: "POST" }),

  pauseJob: (id: number) =>
    request<Job>(`/jobs/${id}/pause/`, { method: "POST" }),

  resumeJob: (id: number) =>
    request<Job>(`/jobs/${id}/resume/`, { method: "POST" }),
};
