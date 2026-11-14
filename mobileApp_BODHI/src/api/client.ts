import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


// Hardcoded API configuration pointing to AWS API Gateway (Serverless)
// (Bypassing @env to ensure Metro cache issues don't accidentally load local IP)
const getBaseUrl = () => {
  return 'https://l6927740gk.execute-api.ap-southeast-1.amazonaws.com';
};

export const BASE_URL = getBaseUrl();

// ── Session storage keys ────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  accessToken: 'bodhi_access_token',
  refreshToken: 'bodhi_refresh_token',
  sessionId: 'bodhi_session_id',
  fullName: 'user_full_name',
  userId: 'bodhi_user_id',
} as const;

export interface SessionPayload {
  access_token: string;
  refresh_token?: string;
  session_id?: string;
  full_name?: string;
}

/** Persists everything the backend returns from /auth/token, /auth/refresh and OAuth logins. */
export const saveSession = async (data: SessionPayload) => {
  const pairs: [string, string][] = [[STORAGE_KEYS.accessToken, data.access_token]];
  if (data.refresh_token) pairs.push([STORAGE_KEYS.refreshToken, data.refresh_token]);
  if (data.session_id) pairs.push([STORAGE_KEYS.sessionId, String(data.session_id)]);
  if (data.full_name) pairs.push([STORAGE_KEYS.fullName, data.full_name]);
  await AsyncStorage.multiSet(pairs);
};

export const clearSession = async () => {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
};

/** Best-effort server-side revoke + local wipe. Never throws. */
export const logoutSession = async () => {
  try {
    const sessionId = await AsyncStorage.getItem(STORAGE_KEYS.sessionId);
    if (sessionId) {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
    }
  } catch (_) {
    // offline logout is still a logout
  }
  await clearSession();
};

let refreshInFlight: Promise<string | null> | null = null;

/** Rotates the refresh token. Concurrent callers share one network request. */
export const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const [[, refresh_token], [, session_id]] = await AsyncStorage.multiGet([
          STORAGE_KEYS.refreshToken,
          STORAGE_KEYS.sessionId,
        ]);
        if (!refresh_token || !session_id) return null;
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token, session_id }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        await saveSession(data);
        return data.access_token as string;
      } catch (_) {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
};

let onSessionExpired: (() => void) | null = null;
/** Registered by the navigator so an expired session sends the user back to login. */
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30s — real device over Wi-Fi can be slow on cold start
});

// Attach the JWT to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.accessToken);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401: rotate the refresh token once and replay; otherwise end the session.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url: string = original?.url || '';
    if (error.response?.status === 401 && original && !original._retried && !url.startsWith('/auth/')) {
      original._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newToken}` };
        return apiClient(original);
      }
      await clearSession();
      onSessionExpired?.();
    }
    return Promise.reject(error);
  },
);

export const PaymentAPI = {
  createIntent: async (data: { user_id: number; amount: number; currency: string; description: string }) => {
    // Assuming 'apiClient' is your Axios instance
    const res = await apiClient.post('/payments/intent', data);
    return res.data;
  }
};

export const InsuranceAPI = {
  ingest: async (uri: string, name: string) => {
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      name: name,
      type: 'application/pdf'
    } as any);

    // Longer timeout for ingestion since embedding takes time
    const res = await apiClient.post('/insurance/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,  // 2 minutes
    });
    return res.data;
  },
  query: async (question: string, documentId?: string) => {
    const res = await apiClient.post('/insurance/query', {
      question,
      document_id: documentId
    }, { timeout: 60000 }); // 1 minute for LLM response
    return res.data;
  },
  listDocuments: async () => {
    const res = await apiClient.get('/insurance/documents');
    return res.data;
  }
};

export const UsersAPI = {
  fetchProfile: async () => {
    const res = await apiClient.get('/users/me');
    return res.data;
  },
  updateProfile: async (data: {
    full_name?: string;
    phone?: string;
    age?: number;
    gender?: string;
    current_password: string
  }) => {
    const res = await apiClient.put('/users/me', data);
    return res.data;
  },
  deleteAccount: async (password: string) => {
    const res = await apiClient.delete('/users/me', { data: { password } });
    return res.data;
  },
  verifyPassword: async (password: string) => {
    const res = await apiClient.post('/users/verify', { password });
    return res.data;
  },
  verifyUpin: async (u_pin: string) => {
    const res = await apiClient.post('/auth/verify-upin', { u_pin });
    return res.data;
  },
  verifyMpin: async (m_pin: string) => {
    const res = await apiClient.post('/users/verify-mpin', { password: m_pin });
    return res.data;
  },
  uploadAvatar: async (uri: string, name: string) => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name,
      type: 'image/jpeg'
    } as any);

    const res = await apiClient.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }
};

export const AuthAPI = {
  sendRegisterOtp: async (data: { email?: string; phone?: string }) => {
    const res = await apiClient.post('/auth/send-register-otp', data);
    return res.data;
  },
  checkPhone: async (phone: string) => {
    const res = await apiClient.post('/auth/check-phone', { phone });
    return res.data;
  },
  verifyRegisterOtp: async (data: { email?: string; phone?: string; otp: string }) => {
    const res = await apiClient.post('/auth/verify-register-otp', data);
    return res.data;
  },
  requestPasswordReset: async (email: string) => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data;
  },
  confirmPasswordReset: async (data: any) => {
    const res = await apiClient.post('/auth/reset-password', data);
    return res.data;
  }
};

export const NotificationAPI = {
  fetchNotifications: async () => {
    const res = await apiClient.get('/notifications/');
    return res.data;
  },
  markAsRead: async (id: string) => {
    const res = await apiClient.patch(`/notifications/${id}/read`);
    return res.data;
  },
  markAllAsRead: async () => {
    const res = await apiClient.post('/notifications/read-all');
    return res.data;
  }
};

export const TransactionAPI = {
  /** Saves a voice-logged cash/offline transaction. Called after user confirms the AI's understanding. */
  saveVoiceTransaction: async (data: {
    merchant: string;
    category: string;
    amount: number;
    type?: string;
    note?: string;
  }) => {
    const res = await apiClient.post('/users/transactions', data);
    return res.data;
  },
  /** Returns all manually-logged transactions for the current user. */
  listManualTransactions: async () => {
    const res = await apiClient.get('/users/transactions');
    return res.data;
  }
};

export const TransferAPI = {
  /** Send money to another user via GAP ID, email, phone, or UPI ID. */
  send: async (data: { recipient_identifier: string; amount: number; note?: string }) => {
    const res = await apiClient.post('/transfers/send', data);
    return res.data;
  },
  /** Get wallet balance. */
  getBalance: async () => {
    const res = await apiClient.get('/transfers/balance');
    return res.data;
  },
  /** Get full wallet transfer history (ledger). */
  getHistory: async () => {
    const res = await apiClient.get('/transfers/history');
    return res.data;
  },
};

export const SubscriptionsAPI = {
  fetchCatalog: async () => {
    const res = await apiClient.get('/subscriptions/catalog');
    return res.data;
  },
  addToVault: async (data: { platform_id: string; platform_name: string; expected_monthly_cost: number }) => {
    const res = await apiClient.post('/subscriptions/vault/add', data);
    return res.data;
  }
};

export interface VoiceCommandResponse {
  transcript: string;
  intent: string;
  text_response: string;
  suggested_action: string | null;
  audio_base64: string | null;
  transaction_data?: {
    amount: number;
    merchant: string;
    category: string;
    type: 'DEBIT' | 'CREDIT';
  } | null;
}

/**
 * GAP assistant. All AI provider keys live on the backend; the app only talks
 * to authenticated BODHI endpoints.
 */
export const AIAPI = {
  /** Typed message → reply text (+ base64 voice when available). */
  chat: async (message: string, speak = true): Promise<VoiceCommandResponse> => {
    const res = await apiClient.post('/ai/chat', { message, speak }, { timeout: 60000 });
    return res.data;
  },
  /** Recorded audio → transcript → reply text (+ voice). */
  command: async (fileUri: string): Promise<VoiceCommandResponse> => {
    const isIOS = Platform.OS === 'ios';
    const uri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
    const formData = new FormData();
    formData.append('file', {
      uri,
      type: isIOS ? 'audio/m4a' : 'audio/mp4',
      name: isIOS ? 'speech.m4a' : 'speech.mp4',
    } as any);
    const res = await apiClient.post('/ai/command', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000,
    });
    return res.data;
  },
};

export const TravelAPI = {
  searchAirports: async (query: string) => {
    const res = await apiClient.get('/travel/airports/search', { params: { query } });
    return res.data;
  },
  searchFlights: async (data: {
    origin_sky_id: string;
    destination_sky_id: string;
    origin_entity_id: string;
    destination_entity_id: string;
    travel_date: string;
    adults?: number;
    cabin_class?: string;
  }) => {
    const res = await apiClient.post('/travel/flights/search', data);
    return res.data;
  },
  getPriceCalendar: async (data: {
    origin_sky_id: string;
    destination_sky_id: string;
    from_date: string;
    currency?: string;
  }) => {
    const res = await apiClient.post('/travel/flights/price-calendar', data);
    return res.data;
  },
  getFlightDetails: async (data: {
    itinerary_id: string;
    legs: string;
    session_id: string;
    adults?: number;
    cabin_class?: string;
    currency?: string;
  }) => {
    const res = await apiClient.post('/travel/flights/details', data);
    return res.data;
  },
};

// ── Collaboration API (Scoped Chat, Polls, Activity) ───────────────────────
export const CollaborationAPI = {
  // Polls
  createPoll: async (type: 'trip' | 'investment', id: number, data: { question: string; options: string[]; expires_hours?: number }) => {
    const res = await apiClient.post(`/collaboration/${type}/${id}/polls`, data);
    return res.data;
  },
  listPolls: async (type: 'trip' | 'investment', id: number) => {
    const res = await apiClient.get(`/collaboration/${type}/${id}/polls`);
    return res.data;
  },
  votePoll: async (type: 'trip' | 'investment', id: number, pollId: string, option_id: number) => {
    const res = await apiClient.post(`/collaboration/${type}/${id}/polls/${pollId}/vote`, { option_id });
    return res.data;
  },

  // Messages
  getMessages: async (type: 'trip' | 'investment', id: number, before?: string) => {
    const res = await apiClient.get(`/collaboration/${type}/${id}/messages`, { params: { before, limit: 50 } });
    return res.data;
  },
  sendMessage: async (type: 'trip' | 'investment', id: number, message: string) => {
    const res = await apiClient.post(`/collaboration/${type}/${id}/messages`, { message });
    return res.data;
  },

  // Activity
  getActivity: async (type: 'trip' | 'investment', id: number) => {
    const res = await apiClient.get(`/collaboration/${type}/${id}/activity`);
    return res.data;
  },
};
