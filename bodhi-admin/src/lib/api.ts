import axios from 'axios';
import { config } from './config';

/** Axios client for the /admin-v2 API. Attaches the admin JWT and logs out on 401. */
const api = axios.create({
  baseURL: config.ADMIN_API_URL,
  timeout: 30000,
});

api.interceptors.request.use((req) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(config.STORAGE_KEYS.TOKEN);
    if (token) req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginCall = String(error.config?.url || '').includes('/login');
    if (error.response?.status === 401 && !isLoginCall && typeof window !== 'undefined') {
      clearAdminSession();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export function clearAdminSession() {
  localStorage.removeItem(config.STORAGE_KEYS.TOKEN);
  localStorage.removeItem(config.STORAGE_KEYS.USER);
}

/** Pulls a human-readable message out of an axios error. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(', ') || fallback;
  return fallback;
}

export default api;
