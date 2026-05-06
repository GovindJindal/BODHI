// ─────────────────────────────────────────────────────────────
//  GradientCard.tsx — Signature neon gradient card
//  Used in: Vault balance, Trip wallet, Stock result banner
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import { Gradients, Radius } from '../theme/tokens';

interface GradientCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  colors?: string[];
}

export function GradientCard({ children, style, colors }: GradientCardProps) {
  return (
    <LinearGradient
      colors={(colors ?? Gradients.signatureNeon.colors) as (string | number)[]}
      start={Gradients.signatureNeon.start}
      end={Gradients.signatureNeon.end}
      style={[styles.card, style]}
    >
      {/* Ambient light blob top-right */}
      <View style={styles.blob} />
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  blob: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  content: {
    flex: 1,
  },
});
