// src/components/shared.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { ScreenColors } from '../theme/tokens';

export type NavTab = 'home' | 'payments' | 'social';

export const BodhiHeader = ({ onBack, onInsurancePress, showBack }: any) => (
  <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1C1C1E' }}>
    {showBack ? (
      <TouchableOpacity onPress={onBack} style={{ padding: 8 }}>
        <Text style={{ color: 'white', fontSize: responsiveFont(18) }}>←</Text>
      </TouchableOpacity>
    ) : <View style={{ width: 40 }} />}
    <TouchableOpacity onPress={onInsurancePress} style={{ padding: 8 }}>
      <Text style={{ color: '#3D4DFF', fontSize: responsiveFont(20) }}>🛡️</Text>
    </TouchableOpacity>
  </View>
);

export const BottomNav = ({ active, onPress }: any) => <View />; // Hide this since you have MainTabNavigator

export const SectionLabel: React.FC<{ title: string; style?: any }> = ({ title, style }) => (
  <Text style={[styles.sectionLabel, style]}>{title.toUpperCase()}</Text>
);

export const ProfileAvatar: React.FC<{
  initial: string;
  size?: number;
  onPress?: () => void;
}> = ({ initial, size = 44, onPress }) => {
  const r = size / 2;
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={[
        styles.avatarWrap,
        { width: size, height: size, borderRadius: r },
      ]}
    >
      <Text style={styles.avatarText}>{(initial || 'U').charAt(0).toUpperCase()}</Text>
    </TouchableOpacity>
  );
};

export const PrimaryCTAButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  rightIcon?: React.ReactNode;
  style?: any;
}> = ({ label, onPress, disabled, rightIcon, style }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    disabled={disabled}
    style={[
      styles.cta,
      disabled && { opacity: ScreenColors.brand.ctaDisabledOpacity },
      style,
    ]}
  >
    <Text style={styles.ctaText}>{label}</Text>
    {rightIcon}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  sectionLabel: {
    color: ScreenColors.brand.textMuted,
    fontSize: responsiveFont(11),
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  avatarWrap: {
    backgroundColor: ScreenColors.brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: responsiveFont(18),
    fontWeight: '800',
  },
  cta: {
    height: 58,
    borderRadius: 16,
    backgroundColor: ScreenColors.brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: responsiveFont(16),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});