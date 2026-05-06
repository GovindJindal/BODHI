/**
 * BODHI — Placeholder Screens
 * BankAccountsScreen · SecuritySettingsScreen · PaperTradeScreen
 *
 * These are production-ready shells — replace the inner content
 * with your full feature implementations.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Spacing, Radius, FontSize } from '../theme/tokens';

// ─── Shared Placeholder Shell ─────────────────────────────────────────────────

interface PlaceholderProps {
  icon: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}

const PlaceholderShell: React.FC<PlaceholderProps> = ({
  icon, title, subtitle, ctaLabel, onCta,
}) => {
  return (
    <LinearGradient 
      colors={['#FDFDF9', '#FFFFFF', '#FDFDF9']} 
      style={placeholderStyles.root}
    >
      <StatusBar barStyle="dark-content" />

      <View style={[placeholderStyles.content, { maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%' }]}>
        <View style={placeholderStyles.iconContainer}>
          <Text style={placeholderStyles.icon}>{icon}</Text>
        </View>
        
        <Text style={placeholderStyles.title}>{title}</Text>
        <Text style={placeholderStyles.subtitle}>{subtitle}</Text>
        
        {ctaLabel && onCta && (
          <TouchableOpacity 
            style={placeholderStyles.ctaBtn} 
            onPress={onCta}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[Colors.neonLime, '#A3FF00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={placeholderStyles.ctaGradient}
            >
              <Text style={placeholderStyles.ctaText}>{ctaLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
};

const placeholderStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  icon: { 
    fontSize: responsiveFont(56) 
  },
  title: { 
    color: '#1C1C1E',
    fontSize: responsiveFont(28),
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  subtitle: { 
    color: 'rgba(0,0,0,0.6)',
    fontSize: responsiveFont(16),
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    marginBottom: Spacing.xl,
  },
  ctaBtn: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    shadowColor: Colors.neonLime,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaGradient: {
    paddingVertical: 16,
    paddingHorizontal: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: responsiveFont(16),
    letterSpacing: 0.5,
  },
});

// ─── BankAccountsScreen ───────────────────────────────────────────────────────

export const BankAccountsScreen: React.FC = () => (
  <PlaceholderShell
    icon="🏦"
    title="Bank Accounts"
    subtitle="Link and manage your bank accounts for seamless fund transfers."
    ctaLabel="+ Link Account"
    onCta={() => Alert.alert('Coming Soon', 'Bank linking flow coming soon!')}
  />
);

// ─── SecuritySettingsScreen ───────────────────────────────────────────────────
// Note: See BiometricAuth.ts for the FaceID / Secure Enclave implementation.

export const SecuritySettingsScreen: React.FC = () => (
  <PlaceholderShell
    icon="🔐"
    title="Security Settings"
    subtitle="Manage FaceID authentication, PIN, and session policies."
    ctaLabel="Enable Biometrics"
    onCta={() => Alert.alert('Coming Soon', 'Biometric setup flow coming soon!')}
  />
);

export const PaperTradeScreen: React.FC = () => (
  <PlaceholderShell
    icon="📈"
    title="Paper Trade"
    subtitle="Simulate trades risk-free with virtual ₹1,00,000 across NSE & BSE."
    ctaLabel="Start Simulating"
    onCta={() => Alert.alert('Coming Soon', 'Paper trading engine coming soon!')}
  />
);

export const TravelBookingScreen: React.FC = () => (
  <PlaceholderShell
    icon="✈️"
    title="Travel Booking"
    subtitle="Book luxury flights and stays directly with your BODHI rewards."
    ctaLabel="Explore Deals"
    onCta={() => Alert.alert('Coming Soon', 'Travel concierge launching in Phase 4.')}
  />
);

export const MarketScreen: React.FC = () => (
  <PlaceholderShell
    icon="📊"
    title="Market Insights"
    subtitle="Real-time global market data and predictive AI analytics."
    ctaLabel="View Market"
    onCta={() => Alert.alert('Coming Soon', 'Market data integration in progress.')}
  />
);

export default PaperTradeScreen;
