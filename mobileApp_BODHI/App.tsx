import React, { useEffect, useState } from 'react';
import { StatusBar, LogBox } from 'react-native';
// Safe import
import * as OAuth from './src/hooks/useOAuthSignIn'; 
import { AppNavigator } from './src/navigation/AppNavigator';
import { CalculatorProvider } from './src/context/CalculatorContext';
import { FloatingCalculator } from './src/components/FloatingCalculator';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'bodhi_onboarding_done';

// Screens
import { OnboardingScreen } from './src/screens/Onboarding/OnboardingScreen';
import VideoSplashScreen from './src/screens/Splash/VideoSplashScreen'; // Adjust path if needed

LogBox.ignoreLogs(['ViewPropTypes will be removed', 'ColorPropType will be removed']);

export default function App() {
  // 1. Controls the video splash animation
  const [showSplash, setShowSplash] = useState(true);
  
  // 2. Controls the Cyber-Glass onboarding – shown only on the very first launch
  const [showOnboarding, setShowOnboarding] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(done => { if (done === '1') setShowOnboarding(false); })
      .catch(() => {});
  }, []);

  const finishOnboarding = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
  };

  useEffect(() => {
    try {
      if (OAuth && OAuth.configureGoogleSignIn) {
        OAuth.configureGoogleSignIn(); 
      }
    } catch (e) {
      console.warn("Google Sign-In config failed", e);
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CalculatorProvider>
        <StatusBar 
          barStyle={(showSplash || showOnboarding) ? "light-content" : "dark-content"} 
          translucent 
          backgroundColor="transparent" 
        />
        
        {showSplash ? (
          // Step 1: Play the video. When done, it triggers setShowSplash(false)
          <VideoSplashScreen onFinish={() => setShowSplash(false)} />
        ) : showOnboarding ? (
          // Step 2: Show Onboarding. When they click START, it triggers setShowOnboarding(false)
          <OnboardingScreen onFinish={finishOnboarding} />
        ) : (
          // Step 3: Boot up the main application
          <AppNavigator />
        )}
        
        {!showSplash && <FloatingCalculator />}
      </CalculatorProvider>
    </GestureHandlerRootView>
  );
}