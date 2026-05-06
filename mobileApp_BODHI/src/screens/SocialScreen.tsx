/**
 * SocialScreen.tsx
 * Social Hub — Shared Investments & Trip Wallets
 * React Native (Expo) · TypeScript · lucide-react-native
 */
import { useEffect } from 'react';
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import {
  Plane,
  TrendingUp,
  Plus,
  MoreVertical,
  ChevronRight,
  Users,
  Vote,
  Wallet,
} from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: W } = Dimensions.get('window');

// ── Design Tokens ────────────────────────────────────────────

const C = {
  bg:           '#FDFDF9',
  cardBg:       '#FFFFFF',
  neonLime:     '#3D4DFF',
  purple:       '#C83232',
  red:          '#C83232',
  white:        '#FFFFFF',
  darkText:     '#1C1C1E',
  whiteMid:     'rgba(0,0,0,0.65)',
  whiteDim:     'rgba(0,0,0,0.35)',
  border:       'rgba(0,0,0,0.08)',
  limeBg:       'rgba(61,77,255,0.08)',
  limeBorder:   'rgba(61,77,255,0.22)',
  purpleBg:     'rgba(200,50,50,0.10)',
  purpleBorder: 'rgba(200,50,50,0.25)',
};

// ── Types ────────────────────────────────────────────────────

interface InvestmentClub {
  id: number;
  name: string;
  member_count: number;
  pending_votes: number;
  total_value: string;
  total_returns: string;
  returns_pct: string;
  your_share: string;
}

interface TripWallet {
  id: number;
  name: string;
  member_count: number;
  status_label: string;
  total_balance: string;
  you_spent: string;
  you_owe: string;
  you_owe_raw: number;
}

// ── Sub-Components ────────────────────────────────────────────

function StatDivider() {
  return <View style={styles.statDivider} />;
}

function ActiveBadge() {
  return (
    <View style={styles.activeBadge}>
      <View style={styles.activeDot} />
      <Text style={styles.activeBadgeText}>Active</Text>
    </View>
  );
}

function InvestmentCard({
  club,
  onOptions,
  onViewPortfolio,
}: {
  club: InvestmentClub;
  onOptions: () => void;
  onViewPortfolio: () => void;
}) {
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[C.purple, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardAccentLine}
      />

      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.iconBox, { backgroundColor: C.purpleBg, borderColor: C.purple }]}>
            <TrendingUp size={22} color={C.purple} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{club.name}</Text>
            <View style={styles.metaRow}>
              <Users size={11} color={C.whiteDim} />
              <Text style={styles.cardMeta}>{club.member_count} Members</Text>
              {club.pending_votes > 0 && (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Vote size={11} color={C.neonLime} />
                  <Text style={[styles.cardMeta, { color: C.neonLime }]}>
                    {club.pending_votes} Vote Pending
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <ActiveBadge />
          <TouchableOpacity
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={onOptions}
          >
            <MoreVertical size={18} color={C.whiteDim} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardInternalDivider} />

      <View style={styles.statsGrid}>
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Total Value</Text>
          <Text style={[styles.statValue, { color: C.neonLime }]}>{club.total_value}</Text>
        </View>
        <StatDivider />
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Total Returns</Text>
          <Text style={[styles.statValue, { color: C.neonLime }]}>{club.total_returns}</Text>
          <Text style={styles.statSubGreen}>{club.returns_pct}</Text>
        </View>
        <StatDivider />
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Your Share</Text>
          <Text style={styles.statValue}>{club.your_share}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.cardActionBtn}
        onPress={onViewPortfolio}
        activeOpacity={0.7}
      >
        <Text style={styles.cardActionText}>View Portfolio</Text>
        <ChevronRight size={15} color={C.purple} />
      </TouchableOpacity>
    </View>
  );
}

function TripCard({
  trip,
  onOptions,
  onSettle,
}: {
  trip: TripWallet;
  onOptions: () => void;
  onSettle: () => void;
}) {
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[C.neonLime, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardAccentLine}
      />

      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.iconBox, { backgroundColor: C.limeBg, borderColor: C.neonLime }]}>
            <Plane size={22} color={C.neonLime} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{trip.name}</Text>
            <View style={styles.metaRow}>
              <Users size={11} color={C.whiteDim} />
              <Text style={styles.cardMeta}>{trip.member_count} Members</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.cardMeta}>{trip.status_label}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <ActiveBadge />
          <TouchableOpacity
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={onOptions}
          >
            <MoreVertical size={18} color={C.whiteDim} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardInternalDivider} />

      <View style={styles.statsGrid}>
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Total Balance</Text>
          <Text style={[styles.statValue, { color: C.neonLime }]}>{trip.total_balance}</Text>
        </View>
        <StatDivider />
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>You Spent</Text>
          <Text style={styles.statValue}>{trip.you_spent}</Text>
        </View>
        <StatDivider />
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>You Owe</Text>
          <Text style={[styles.statValue, trip.you_owe_raw > 0 && { color: C.red }]}>{trip.you_owe}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.cardActionBtn}
        onPress={onSettle}
        activeOpacity={0.7}
      >
        <Text style={styles.cardActionText}>Settle Up</Text>
        <ChevronRight size={15} color={C.purple} />
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────

export function SocialScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [ventures, setVentures] = useState<InvestmentClub[]>([]);
  const [trips, setTrips] = useState<TripWallet[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Handlers ──────────────────────────────────────────────

  const fetchSocialData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/social/dashboard'); 
      setVentures(response.data.investments || []);
      setTrips(response.data.trips || []);
    } catch (error) {
      console.error("Error fetching social data:", error);
      setVentures([]);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSocialData();
  }, []);

  const handleAddVenture = () => {
    Alert.prompt(
      'New Investment Club',
      'Give your club a name',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name) => {
            if (!name?.trim()) return;
            try {
              await apiClient.post('/social/investments', { name: name.trim() });
              await fetchSocialData(); 
            } catch (e) {
              Alert.alert("Error", "Failed to create investment club.");
            }
          },
        },
      ],
    );
  };

  const handleJoinVenture = () => {
    Alert.prompt(
      'Join Investment Club',
      'Enter the 6-character invite code',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async (code) => {
            if (!code?.trim()) return;
            try {
              await apiClient.post('/social/investments/join', { invite_code: code.trim().toUpperCase() });
              await fetchSocialData();
            } catch (e) {
              Alert.alert("Error", "Failed to join club. Check your code.");
            }
          },
        },
      ],
    );
  };

  const handleAddTrip = () => {
    Alert.prompt(
      'New Trip Wallet',
      'Where are you headed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name) => {
            if (!name?.trim()) return;
            try {
              await apiClient.post('/social/trips', { name: name.trim() });
              await fetchSocialData();
            } catch (e) {
              Alert.alert("Error", "Failed to create trip wallet.");
            }
          },
        },
      ],
    );
  };

  const handleJoinTrip = () => {
    Alert.prompt(
      'Join Trip Wallet',
      'Enter the 6-character invite code',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async (code) => {
            if (!code?.trim()) return;
            try {
              await apiClient.post('/social/trips/join', { invite_code: code.trim().toUpperCase() });
              await fetchSocialData();
            } catch (e) {
              Alert.alert("Error", "Failed to join trip. Check your code.");
            }
          },
        },
      ],
    );
  };

  const ventureOptions = (id: number) => {
    Alert.alert('Manage Club', 'Are you sure you want to disband this club?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disband',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await apiClient.delete(`/social/investments/${id}`);
            await fetchSocialData(); 
          } catch (e) {
            Alert.alert("Error", "Failed to delete the investment club.");
            setLoading(false);
          }
        },
      },
    ]);
  };

  const tripOptions = (id: number) => {
    Alert.alert('Manage Trip', 'Are you sure you want to delete this trip wallet?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await apiClient.delete(`/social/trips/${id}`);
            await fetchSocialData();
          } catch (e) {
            Alert.alert("Error", "Failed to delete the trip wallet.");
            setLoading(false);
          }
        },
      },
    ]);
  };

  const totalSharedWealth = ventures.reduce((acc, v) => {
    const rawShare = v.your_share || '0';
    const val = parseFloat(rawShare.replace(/[^0-9.]/g, ''));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  // ── Render ─────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FDFDF9', '#FFFFFF', '#FDFDF9']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: Math.max(insets.top, 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        {/* ── HERO HEADER ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              Social <Text style={{ color: C.neonLime }}>Hub</Text>
            </Text>
            <Text style={styles.subtitle}>Shared wealth & group adventures</Text>
          </View>

          <View style={styles.orbContainer}>
            <View style={styles.orbOuter} />
            <View style={styles.orbInner} />
            <View style={styles.orbIcons}>
              <View style={[styles.miniIconBox, { backgroundColor: C.limeBg, borderColor: C.limeBorder }]}>
                <TrendingUp size={14} color={C.neonLime} strokeWidth={2.5} />
              </View>
              <Users size={36} color={C.purple} strokeWidth={1.5} style={{ marginHorizontal: 4 }} />
              <View style={[styles.miniIconBox, { backgroundColor: 'rgba(244,63,94,0.12)', borderColor: 'rgba(244,63,94,0.3)' }]}>
                <Plane size={14} color={C.red} strokeWidth={2.5} />
              </View>
            </View>
          </View>
        </View>

        {/* ── TOTAL SHARED WEALTH SUMMARY ── */}
        <LinearGradient
          colors={[C.purple, '#8B0000']}
          style={styles.wealthSummaryCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.wealthInfo}>
            <Text style={styles.wealthLabel}>Total Shared Wealth</Text>
            <Text style={styles.wealthValue}>₹{totalSharedWealth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.wealthStats}>
            <View style={styles.wealthStatItem}>
              <Text style={styles.wealthStatLabel}>Clubs</Text>
              <Text style={styles.wealthStatValue}>{ventures.length}</Text>
            </View>
            <StatDivider />
            <View style={styles.wealthStatItem}>
              <Text style={styles.wealthStatLabel}>Trips</Text>
              <Text style={styles.wealthStatValue}>{trips.length}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── SHARED INVESTMENTS ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Shared Investments</Text>
              <Text style={styles.sectionSub}>Invest together. Grow together.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: 'transparent' }]} onPress={handleJoinVenture} activeOpacity={0.75}>
                <Text style={styles.createBtnText}>Join</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleAddVenture} activeOpacity={0.75}>
                <Plus size={14} color={C.neonLime} strokeWidth={2.5} />
                <Text style={styles.createBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>

          {ventures.length === 0 ? (
            <View style={styles.emptyCard}>
              <TrendingUp size={32} color={C.whiteDim} />
              <Text style={styles.emptyText}>No investment clubs yet.</Text>
              <Text style={styles.emptyHint}>Create one and start growing together.</Text>
            </View>
          ) : (
            ventures.map((v) => (
              <InvestmentCard
                key={v.id}
                club={v}
                onOptions={() => ventureOptions(v.id)}
                onViewPortfolio={() =>
                  navigation.navigate('VentureClub', { clubId: v.id, clubName: v.name })
                }
              />
            ))
          )}
        </View>

        {/* ── SHARED TRIP WALLETS ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Shared Trip Wallets</Text>
              <Text style={styles.sectionSub}>Travel together. Spend together.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: 'transparent' }]} onPress={handleJoinTrip} activeOpacity={0.75}>
                <Text style={styles.createBtnText}>Join</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleAddTrip} activeOpacity={0.75}>
                <Plus size={14} color={C.neonLime} strokeWidth={2.5} />
                <Text style={styles.createBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>

          {trips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Plane size={32} color={C.whiteDim} />
              <Text style={styles.emptyText}>No active trips yet.</Text>
              <Text style={styles.emptyHint}>Plan your next adventure together.</Text>
            </View>
          ) : (
            trips.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                onOptions={() => tripOptions(t.id)}
                onSettle={() =>
                  navigation.navigate('TripWallet', { tripId: t.id, tripName: t.name })
                }
              />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // HEADER
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 36,
    marginTop: 8,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: responsiveFont(38),
    fontWeight: '900',
    color: C.darkText,
    letterSpacing: -1.2,
    lineHeight: 42,
  },
  subtitle: {
    fontSize: responsiveFont(13),
    color: C.whiteMid,
    marginTop: 6,
    fontWeight: '500',
    letterSpacing: 0.1,
  },

  // ORB
  orbContainer: {
    width: 128,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbOuter: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.28)',
  },
  orbInner: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.15)',
    backgroundColor: 'rgba(255,90,0,0.04)',
  },
  orbIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  miniIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // WEALTH SUMMARY
  wealthSummaryCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  wealthInfo: { flex: 1 },
  wealthLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: responsiveFont(12),
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  wealthValue: {
    color: C.white,
    fontSize: responsiveFont(26),
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  wealthStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    gap: 12,
  },
  wealthStatItem: { alignItems: 'center' },
  wealthStatLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: responsiveFont(9),
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  wealthStatValue: {
    color: C.white,
    fontSize: responsiveFont(14),
    fontWeight: '800',
  },

  // SECTION
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: responsiveFont(18),
    fontWeight: '800',
    color: C.darkText,
    letterSpacing: -0.5,
  },
  sectionSub: {
    fontSize: responsiveFont(12),
    color: C.whiteDim,
    marginTop: 3,
    fontWeight: '500',
  },

  // CREATE BUTTON
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: C.limeBg,
    borderWidth: 1,
    borderColor: C.limeBorder,
  },
  createBtnText: {
    fontSize: responsiveFont(12),
    fontWeight: '800',
    color: C.neonLime,
    letterSpacing: 0.2,
  },

  // EMPTY STATE
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 8,
  },
  emptyText: {
    color: C.whiteMid,
    fontSize: responsiveFont(14),
    fontWeight: '600',
  },
  emptyHint: {
    color: C.whiteDim,
    fontSize: responsiveFont(12),
  },

  // CARD
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 0,
    marginTop: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: responsiveFont(16),
    fontWeight: '800',
    color: C.darkText,
    letterSpacing: -0.3,
    marginBottom: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  cardMeta: {
    fontSize: responsiveFont(12),
    color: C.whiteDim,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: responsiveFont(12),
    color: C.whiteDim,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },

  // ACTIVE BADGE
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: C.limeBg,
    borderWidth: 1,
    borderColor: C.limeBorder,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.neonLime,
  },
  activeBadgeText: {
    fontSize: responsiveFont(10),
    fontWeight: '800',
    color: C.neonLime,
    letterSpacing: 0.5,
  },

  // INTERNAL DIVIDER
  cardInternalDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 18,
  },

  // STATS
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  statColumn: {
    flex: 1,
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 10,
    marginTop: 4,
  },
  statLabel: {
    fontSize: responsiveFont(11),
    color: C.whiteDim,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  statValue: {
    fontSize: responsiveFont(14),
    fontWeight: '800',
    color: C.darkText,
    letterSpacing: -0.3,
  },
  statSubGreen: {
    fontSize: responsiveFont(11),
    fontWeight: '700',
    color: C.neonLime,
    marginTop: 2,
  },

  // CARD ACTION
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: C.purpleBg,
    borderColor: C.purpleBorder,
  },
  cardActionText: {
    fontSize: responsiveFont(13),
    fontWeight: '800',
    letterSpacing: 0.1,
    color: C.purple,
  },
});
