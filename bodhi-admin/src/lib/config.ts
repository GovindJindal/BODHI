/**
 * Admin dashboard configuration.
 * Override the API host at build time with NEXT_PUBLIC_API_URL.
 */
const API_GATEWAY_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'https://l6927740gk.execute-api.ap-southeast-1.amazonaws.com'
).replace(/\/+$/, '');

export const config = {
  API_GATEWAY_URL,
  ADMIN_API_URL: `${API_GATEWAY_URL}/admin-v2`,
  STORAGE_KEYS: {
    TOKEN: 'bodhi_admin_token',
    USER: 'bodhi_admin_user',
  },
} as const;
