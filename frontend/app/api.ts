/**
 * 백엔드 API 클라이언트.
 * 브라우저에서는 VITE_API_BASE (없으면 http://localhost:8000) 로 직접 호출.
 */
const API_BASE =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  import.meta.env.VITE_API_BASE ||
  "http://localhost:8000";

const TOKEN_KEY = "srt_auth_token";
const USER_KEY = "srt_user_id";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_KEY);
}

export function setAuth(token: string, userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, userId);
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Auth-Token": token } : {}),
    },
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
  slack_user_id: string;
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

export interface SlackUser {
  id: string;
  name: string;
}

export const api = {
  stations: () => request<{ stations: string[] }>("/stations/"),

  slackUsers: () => request<{ users: SlackUser[] }>("/slack-users/"),

  loginCheck: (c: Credentials) =>
    request<{ ok: boolean; user_id: string; token: string }>("/login-check/", {
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

  pauseAll: () =>
    request<{ affected: number; jobs: Job[] }>("/jobs/pause-all/", {
      method: "POST",
    }),

  resumeAll: () =>
    request<{ affected: number; jobs: Job[] }>("/jobs/resume-all/", {
      method: "POST",
    }),

  setIntervalAll: (retry_interval_ms: number) =>
    request<{ affected: number; jobs: Job[] }>("/jobs/set-interval-all/", {
      method: "POST",
      body: JSON.stringify({ retry_interval_ms }),
    }),

  startJob: (id: number, retry_interval_ms: number) =>
    request<Job>(`/jobs/${id}/start/`, {
      method: "POST",
      body: JSON.stringify({ retry_interval_ms }),
    }),

  cancelJob: (id: number) =>
    request<Job>(`/jobs/${id}/cancel/`, { method: "POST" }),

  pauseJob: (id: number) =>
    request<Job>(`/jobs/${id}/pause/`, { method: "POST" }),

  resumeJob: (id: number, retry_interval_ms?: number) =>
    request<Job>(`/jobs/${id}/resume/`, {
      method: "POST",
      body: JSON.stringify(
        retry_interval_ms != null ? { retry_interval_ms } : {}
      ),
    }),
};
