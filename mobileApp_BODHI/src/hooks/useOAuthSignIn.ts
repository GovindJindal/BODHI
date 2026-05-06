import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  GoogleSignin,
  statusCodes as GoogleStatusCodes,
} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BASE_URL } from '../api/client';

const API_URL = `${BASE_URL}/auth`;
const JWT_STORAGE_KEY = 'bodhi_access_token';

interface OAuthResult {
  accessToken: string;
  isNewUser: boolean;
}

export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    // Your actual Web Client ID from Google Cloud Console
    webClientId: '527448749071-5b6bitovo5njvvgr7nctkc1mqgdv1l3j.apps.googleusercontent.com',
    iosClientId: '527448749071-janpij0bp1m4mc72ffcq0cbkumfkitd6.apps.googleusercontent.com',
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
}

export function useOAuthSignIn() {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const saveToken = async (token: string) => {
    await AsyncStorage.setItem(JWT_STORAGE_KEY, token);
  };

  // ── GOOGLE ──────────────────────────────────────────────────────────────────
  const handleGoogleLogin = useCallback(async (): Promise<OAuthResult | null> => {
    setIsLoading('google');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = (userInfo as any).idToken || (userInfo as any).data?.idToken;

      if (!idToken) throw new Error('Google Sign-In did not return an id_token.');

      const response = await fetch(`${API_URL}/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Backend verification failed');

      await saveToken(data.access_token);
      return { accessToken: data.access_token, isNewUser: data.is_new_user };

    } catch (error: any) {
      if (
        error.code === GoogleStatusCodes.SIGN_IN_CANCELLED ||
        error.code === GoogleStatusCodes.IN_PROGRESS
      ) return null;

      Alert.alert('Google Sign-In Failed', error.message || 'An unexpected error occurred.');
      return null;
    } finally {
      setIsLoading(null);
    }
  }, []);

  return { isLoading, handleGoogleLogin };
}