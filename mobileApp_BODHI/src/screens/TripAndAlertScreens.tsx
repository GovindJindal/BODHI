import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { Colors, Fonts, Radius, Spacing } from '../theme/tokens';

// ─────────────────────────────────────────────────────────────
//  ImmuneSystemAlertScreen.tsx — Overspend warning
//  Dark mode | Matches immune_system_alert.html
// ─────────────────────────────────────────────────────────────

export function ImmuneSystemAlertScreen({ navigation }: any) {
  return (
    <View style={aStyles.root}>
      <View style={{ maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%', flex: 1 }}>
      {/* Ambient glows */}
      <View style={aStyles.glowGreen} />
      <View style={aStyles.glowViolet} />

      {/* Header */}
      <View style={aStyles.header}>
        <Text style={aStyles.wordmark}>BODHI</Text>
        <View style={aStyles.avatarRing}>
          <Text style={{ fontSize: responsiveFont(20) }}>👤</Text>
        </View>
      </View>

      {/* AI status */}
      <View style={aStyles.statusWrap}>
        <View style={aStyles.statusCircle}>
          <Text style={{ fontSize: responsiveFont(32) }}>🛡</Text>
          <View style={aStyles.boltBadge}>
            <Text style={{ fontSize: responsiveFont(10), color: Colors.neonLimeDark }}>⚡</Text>
          </View>
        </View>
        <Text style={aStyles.statusLabel}>IMMUNE SYSTEM ACTIVE</Text>
      </View>

      {/* Alert card */}
      <View style={aStyles.alertCard}>
        <View style={aStyles.alertCardAccent} />
        <Text style={aStyles.alertTitle}>
          You're about to overspend{' '}
          <Text style={{ color: Colors.neonLime }}>₹1,200</Text>
          {' '}on Gion Dinner.
        </Text>
        <Text style={aStyles.alertBody}>
          This transaction exceeds your daily dining budget by 15%. Proceeding will impact your "Japan Trip" savings goal.
        </Text>
        <View style={aStyles.chips}>
          <View style={aStyles.chip}>
            <Text style={{ fontSize: responsiveFont(14) }}>📈</Text>
            <Text style={aStyles.chipText}>BUDGET LIMIT: ₹8,000</Text>
          </View>
          <View style={aStyles.chip}>
            <Text style={{ fontSize: responsiveFont(14) }}>🐷</Text>
            <Text style={aStyles.chipText}>GOAL RISK: HIGH</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={aStyles.actions}>
        <View style={aStyles.buttonShadowWrapper}>
          <TouchableOpacity
            style={aStyles.cancelBtn}
            activeOpacity={0.88}
            onPress={() => navigation?.goBack()}
          >
            <Text style={aStyles.cancelBtnText}>✕  Cancel</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={aStyles.proceedBtn} activeOpacity={0.8}>
          <Text style={aStyles.proceedBtnText}>✓  Proceed</Text>
        </TouchableOpacity>
      </View>

      <Text style={aStyles.disclaimer}>
        Bodhi AI monitors your spending patterns in real-time to protect your long-term financial health.
      </Text>
      </View>
    </View>
  );
}



// ── Styles — ImmuneSystemAlert ───────────────────────────────
const S = Spacing;
const aStyles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: Colors.darkBase,
    alignItems:      'center',
    paddingHorizontal: S.xxl,
  },
  glowGreen: {
    position:      'absolute',
    top:           '30%',
    left:          '50%',
    marginLeft:    -200,
    width:         400,
    height:        400,
    borderRadius:  200,
    backgroundColor: 'rgba(209,252,0,0.05)',
  },
  glowViolet: {
    position:      'absolute',
    bottom:        '15%',
    right:         -100,
    width:         300,
    height:        300,
    borderRadius:  150,
    backgroundColor: 'rgba(112,42,225,0.08)',
  },
  header: {
    width:           '100%',
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingTop:      60,
    paddingBottom:   S.lg,
    zIndex:          10,
  },
  wordmark: {
    fontFamily:  Fonts.headline,
    fontSize: responsiveFont(22),
    fontWeight:  '900',
    fontStyle:   'italic',
    color:       '#FF6A00',
  },
  avatarRing: {
    width:        40,
    height:       40,
    borderRadius: 20,
    backgroundColor: '#1A0A00',
    borderWidth:  2,
    borderColor:  Colors.electricViolet,
    alignItems:   'center',
    justifyContent: 'center',
  },
  statusWrap: {
    alignItems:  'center',
    gap:         S.xl,
    marginBottom: S.xxl + 8,
    zIndex:      10,
  },
  statusCircle: {
    width:           80,
    height:          80,
    borderRadius:    40,
    borderWidth:     2,
    borderColor:     Colors.neonLime + '55',
    alignItems:      'center',
    justifyContent:  'center',
    position:        'relative',
  },
  boltBadge: {
    position:        'absolute',
    top:             -4,
    right:           -4,
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: Colors.neonLime,
    borderWidth:     4,
    borderColor:     Colors.darkBase,
    alignItems:      'center',
    justifyContent:  'center',
  },
  statusLabel: {
    fontFamily:  Fonts.label,
    fontSize: responsiveFont(10),
    fontWeight:  '700',
    color:       Colors.neonLime,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },

  alertCard: {
    width:           '100%',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
    borderRadius:    Radius.xl,
    padding:         S.xxl + 4,
    overflow:        'hidden',
    position:        'relative',
    gap:             S.lg,
    zIndex:          10,
  },
  alertCardAccent: {
    position:        'absolute',
    top:             0,
    right:           0,
    width:           120,
    height:          120,
    backgroundColor: 'rgba(209,252,0,0.06)',
  },
  alertTitle: {
    fontFamily:  Fonts.headline,
    fontSize: responsiveFont(26),
    fontWeight:  '700',
    color:       '#fff',
    lineHeight:  34,
  },
  alertBody: {
    fontFamily:  Fonts.body,
    fontSize: responsiveFont(16),
    fontWeight:  '500',
    color:       Colors.surfaceHighest,
    lineHeight:  26,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  chip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius:    Radius.full,
    paddingHorizontal: S.lg,
    paddingVertical:   10,
  },
  chipText: {
    fontFamily:  Fonts.label,
    fontSize: responsiveFont(11),
    fontWeight:  '700',
    color:       '#e2e8f0',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  actions: {
    width:       '100%',
    marginTop:   S.xxl + 4,
    gap:         S.lg,
    zIndex:      10,
  },
  buttonShadowWrapper: {
    width:           '100%',
    borderRadius:    Radius.lg,
    shadowColor:     Colors.neonLime,
    shadowOpacity:   0.4,
    shadowRadius:    20,
    elevation:       10,
  },
  cancelBtn: {
    width:           '100%',
    backgroundColor: Colors.neonLime,
    borderRadius:    Radius.lg,
    paddingVertical: 22,
    alignItems:      'center',
  },
  cancelBtnText: {
    fontFamily:  Fonts.headline,
    fontSize: responsiveFont(20),
    fontWeight:  '700',
    color:       Colors.neonLimeDark,
    letterSpacing: 0.5,
  },
  proceedBtn: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.10)',
    borderRadius:    Radius.lg,
    paddingVertical: 22,
    alignItems:      'center',
  },
  proceedBtnText: {
    fontFamily:  Fonts.headline,
    fontSize: responsiveFont(20),
    fontWeight:  '700',
    color:       '#fff',
  },
  disclaimer: {
    fontFamily:  Fonts.label,
    fontSize: responsiveFont(11),
    color:       '#4b5563',   // slate-600
    textAlign:   'center',
    marginTop:   S.xxl,
    lineHeight:  18,
    maxWidth:    280,
    zIndex:      10,
  },
});
