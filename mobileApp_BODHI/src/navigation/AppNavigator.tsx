// FORCE RELOAD 1
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 🟢 ADDED: Missing import for your tab icon
import { Users } from 'lucide-react-native';

// ─── SCREEN IMPORTS ───
import { AuthScreen } from '../screens/AuthScreen';
import { VaultScreen } from '../screens/VaultScreen';
import { SocialScreen } from '../screens/SocialScreen';
import { AIVoiceScreen } from '../screens/AIVoiceScreen';
import { MarketScreen } from '../screens/MarketScreen';
import { PaperTradingScreen } from '../screens/PaperTradingScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { VentureClubScreen } from '../screens/VentureClubScreen';
import { TripWalletScreen } from '../screens/TripWalletScreen';
import { CreatePollScreen } from '../screens/CreatePollScreen';
import { ImmuneSystemAlertScreen } from '../screens/TripAndAlertScreens';
import { TransactionHistoryScreen } from '../screens/TransactionHistoryScreen';
import { ScanPayScreen } from '../screens/ScanPayScreen';
import { SendMoneyScreen } from '../screens/SendMoneyScreen';
import { RequestMoneyScreen } from '../screens/RequestMoneyScreen';
import { NotificationScreen } from '../screens/NotificationScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SubscriptionHubScreen } from '../screens/SubscriptionHubScreen';
import {
  BankAccountsScreen,
  SecuritySettingsScreen,
} from '../screens/PlaceholderScreens';
import { TravelBookingScreen } from '../screens/TravelBookingScreen';

// ─── COMPONENT IMPORTS ───
import { BodhiTabBar } from '../components/BodhiTabBar';
import HomeStack from './HomeStack';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BodhiTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Vault" component={HomeStack} />
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{
          tabBarIcon: ({ color, size }) => (<Users color={color} size={size} />)
        }}
      />
      <Tab.Screen name="AI" component={AIVoiceScreen} />
      <Tab.Screen name="Trade" component={PaperTradingScreen} />
      <Tab.Screen name="Market" component={MarketScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}>
      <RootStack.Screen name="MainTabs" component={MainTabNavigator} />

      <RootStack.Screen name="VentureClub" component={VentureClubScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="TripWallet" component={TripWalletScreen} options={{ animation: 'slide_from_right', gestureEnabled: true }} />
      <RootStack.Screen name="CreatePoll" component={CreatePollScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <RootStack.Screen name="PaymentScreen" component={PaymentScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="TransactionHistory" component={TransactionHistoryScreen} options={{ animation: 'slide_from_bottom' }} />
      <RootStack.Screen name="Notifications" component={NotificationScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="Profile" component={ProfileScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="BankAccounts" component={BankAccountsScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="SecuritySettings" component={SecuritySettingsScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="TravelBooking" component={TravelBookingScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="SubscriptionHub" component={SubscriptionHubScreen} options={{ animation: 'slide_from_right', gestureEnabled: true }} />
      <RootStack.Screen name="ImmuneAlert" component={ImmuneSystemAlertScreen} options={{ presentation: 'modal', animation: 'fade_from_bottom' }} />

      {/* ── Payment Features ── */}
      <RootStack.Screen name="ScanPay" component={ScanPayScreen} options={{ animation: 'slide_from_bottom', headerShown: false }} />
      <RootStack.Screen name="SendMoney" component={SendMoneyScreen} options={{ animation: 'slide_from_right', headerShown: false }} />
      <RootStack.Screen name="RequestMoney" component={RequestMoneyScreen} options={{ animation: 'slide_from_right', headerShown: false }} />
    </RootStack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: true }}>
          <AuthStack.Screen name="Auth" component={AuthScreen} />
          <AuthStack.Screen name="Main" component={RootNavigator} />
        </AuthStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}