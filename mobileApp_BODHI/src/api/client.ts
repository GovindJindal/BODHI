import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


// Hardcoded API configuration pointing to AWS API Gateway (Serverless)
// (Bypassing @env to ensure Metro cache issues don't accidentally load local IP)
const getBaseUrl = () => {
  return 'https://l6927740gk.execute-api.ap-southeast-1.amazonaws.com';
};

export const BASE_URL = getBaseUrl();
console.log(`🔌 API Base URL initialized: ${BASE_URL}`);

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30s — real device over Wi-Fi can be slow on cold start
});

// Debugging: Log every request to see exactly what URL the app is hitting
apiClient.interceptors.request.use(request => {
  console.log(`🚀 Outgoing Request: [${request.method?.toUpperCase()}] ${request.baseURL}${request.url}`);
  return request;
});
// Interceptor: Automatically attach the JWT token to every single request
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('bodhi_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
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

/**
 * Text-to-Speech via backend → Sarvam TTS.
 * Returns a data URI string (base64 audio) or null on failure.
 */
export const fetchBodhiVoice = async (text: string): Promise<string | null> => {
  try {
    const response = await fetch(`${BASE_URL}/ai/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return `data:audio/mp3;base64,${data.audio_base64}`;

  } catch (error) {
    console.error("API Client Error fetching voice:", error);
    return null;
  }
};

/**
 * Speech-to-Text via backend → Sarvam STT.
 * Uploads a recorded audio file to the backend /ai/transcribe endpoint.
 * Returns the transcript string or null on failure.
 */
export const transcribeAudio = async (fileUri: string): Promise<string | null> => {
  try {
    // Ensure the URI has the correct scheme for iOS
    const uri = Platform.OS === 'ios' && !fileUri.startsWith('file://')
      ? `file://${fileUri}`
      : fileUri;

    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'audio/mp4',
      name: 'audio.mp4',
    } as any);

    console.log("🚀 Sending audio to backend /ai/transcribe...");
    const response = await fetch(`${BASE_URL}/ai/transcribe`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type — fetch sets the correct multipart boundary automatically
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Backend /ai/transcribe returned ${response.status}:`, errBody);
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Transcription received:", data.transcript);
    return data.transcript || null;

  } catch (error) {
    console.error("API Client Error transcribing audio:", error);
    return null;
  }
};

export interface VoiceCommandResponse {
  transcript: string;
  intent: string;
  text_response: string;
  suggested_action: string | null;
  audio_base64: string | null;
}

/**
 * Unified Voice Command Processor.
 * Takes recorded audio -> returns full AI logic payload.
 */
export const processVoiceCommand = async (fileUri: string): Promise<VoiceCommandResponse | null> => {
  try {
    const uri = Platform.OS === 'ios' && !fileUri.startsWith('file://')
      ? `file://${fileUri}`
      : fileUri;

    const formData = new FormData();
    formData.append('file', {
      uri,
      type: 'audio/mp4',
      name: 'audio.mp4',
    } as any);

    console.log("🚀 Sending audio to backend /ai/command...");
    const response = await fetch(`${BASE_URL}/ai/command`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ AI Command processed:", data.intent);
    return data;

  } catch (error) {
    console.error("API Client Error in voice command:", error);
    return null;
  }
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
