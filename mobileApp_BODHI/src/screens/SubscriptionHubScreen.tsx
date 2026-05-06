import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Linking,
  AppState,
  Modal,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import {
  Tv, Gamepad2, Briefcase, Music, BookOpen,
  ChevronRight, X, ChevronLeft, Search, Zap, Star,
  DollarSign, Flame, ArrowLeft,
} from 'lucide-react-native';
import { ScreenColors } from '../theme/tokens';
import { SubscriptionsAPI } from '../api/client';

const { width } = Dimensions.get('window');
const CARD_WIDTH = 168;

const FILTER_CHIPS = ['All', 'Entertainment', 'Productivity', 'Music', 'Finance'];

const BADGES: Record<string, { label: string; color: string; background?: string }> = {
  netflix:    { label: 'Popular',   color: ScreenColors.subscription.badgePopularText, background: ScreenColors.subscription.badgePopularBackground },
  prime:      { label: 'Best Value', color: ScreenColors.subscription.badgeBestValueText, background: ScreenColors.subscription.badgeBestValueBackground },
  spotify:    { label: '🎵 Top Pick',  color: ScreenColors.subscription.badgeGenericGreen },
  chatgpt:    { label: '⚡ Trending',  color: ScreenColors.subscription.badgeGenericTeal },
  m365:       { label: '💼 Essentials',color: ScreenColors.subscription.badgeGenericOrange },
  youtube:    { label: '📺 Popular',   color: ScreenColors.subscription.badgeGenericRed },
  hotstar:    { label: '🏏 Live Sport',color: ScreenColors.subscription.badgeGenericBlue },
};

const getCategoryIcon = (iconName: string) => {
  const props = { color: ScreenColors.subscription.primaryAccent, size: 18 };
  switch (iconName) {
    case 'Tv':        return <Tv {...props} />;
    case 'Briefcase': return <Briefcase {...props} />;
    case 'Gamepad2':  return <Gamepad2 {...props} />;
    case 'Music':     return <Music {...props} />;
    case 'BookOpen':  return <BookOpen {...props} />;
    default:          return <Zap {...props} />;
  }
};

export const SubscriptionHubScreen = () => {
  const navigation = useNavigation<any>();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [pendingSub, setPendingSub]   = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    loadCatalog();
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && pendingSub) {
        setShowConfirmModal(true);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [pendingSub]);

  const loadCatalog = async () => {
    try {
      const data = await SubscriptionsAPI.fetchCatalog();
      setCategories(data);
    } catch (e) {
      console.error('Failed to load catalog', e);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceSelect = (service: any) => setSelectedService(service);

  const handlePlanSelect = (plan: any) => {
    const subToTrack = {
      id: selectedService.id,
      name: `${selectedService.name} (${plan.name})`,
      price: plan.price,
      actionUrl: plan.url,
    };
    setPendingSub(subToTrack);
    Linking.openURL(plan.url).catch(err => console.error('Redirect error', err));
  };

  const confirmAndLogToVault = async () => {
    if (!pendingSub) return;
    try {
      await SubscriptionsAPI.addToVault({
        platform_id: pendingSub.id,
        platform_name: pendingSub.name,
        expected_monthly_cost: parseFloat(pendingSub.price),
      });
    } catch (e) {
      console.error('Failed to add to vault', e);
    } finally {
      setShowConfirmModal(false);
      setPendingSub(null);
    }
  };

  const cancelLog = () => { setShowConfirmModal(false); setPendingSub(null); };

  const filteredCategories = categories
    .map(cat => ({
      ...cat,
      subscriptions: cat.subscriptions.filter((s: any) => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = activeFilter === 'All' || cat.categoryName.includes(activeFilter);
        return matchesSearch && matchesFilter;
      }),
    }))
    .filter(cat => cat.subscriptions.length > 0);

  // ─────────────────────────────────────────
  // SUBSCRIPTION CARD
  // ─────────────────────────────────────────
  const renderSubscriptionCard = ({ item }: { item: any }) => {
    const badge = BADGES[item.id];
    const startPrice = item.availablePlans?.[0]?.price ?? '—';

    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: `${item.borderColor}55` }]}
        onPress={() => handleServiceSelect(item)}
        activeOpacity={0.82}
      >
        {/* Ambient glow */}
        <View style={[styles.cardAmbient, { backgroundColor: `${item.borderColor}18` }]} />

        {/* Badge — absolutely positioned top-right so it never shifts content */}
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.background ?? `${badge.color}22`, borderColor: 'transparent' }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        )}

        {/* Logo — always at top, unaffected by badge */}
        <View style={[styles.logoWrapper, { borderColor: `${item.borderColor}44` }]}>
          <Image
            key={item.logoUrl}
            source={{ uri: item.logoUrl }}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.appName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.planText} numberOfLines={1}>{item.plansSummary}</Text>

        {/* Starting price */}
        <View style={styles.priceRow}>
          <Text style={styles.priceFrom}>from </Text>
          <Text style={styles.priceNeon}>₹{startPrice}</Text>
          <Text style={styles.priceMo}>/mo</Text>
        </View>

        {/* CTA */}
        <View style={styles.ctaGradient}>
          <Text style={styles.ctaText}>View Plans</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────
  // CATEGORY ROW
  // ─────────────────────────────────────────
  const renderCategory = ({ item }: { item: any }) => (
    <View style={styles.categoryContainer}>
      <View style={styles.categoryHeader}>
        <View style={styles.categoryHeaderLeft}>
          <View style={styles.catIconBadge}>{getCategoryIcon(item.icon)}</View>
          <Text style={styles.categoryTitle}>{item.categoryName}</Text>
        </View>
        <TouchableOpacity style={styles.viewAllBtn}>
          <Text style={styles.viewAllText}>View All</Text>
          <ChevronRight color={ScreenColors.subscription.primaryAccent} size={15} />
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        data={item.subscriptions}
        keyExtractor={(sub: any) => sub.id}
        renderItem={renderSubscriptionCard}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
      />
    </View>
  );

  // ─────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={ScreenColors.subscription.primaryAccent} size="large" />
        <Text style={{ color: ScreenColors.subscription.textSecondary, marginTop: 12, fontSize: responsiveFont(13) }}>Loading marketplace…</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────
  // SUB-SCREEN: PLAN SELECTION
  // ─────────────────────────────────────────
  if (selectedService) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        <StatusBar barStyle="dark-content" />



        {/* Header */}
        <View style={styles.planHeader}>
          <TouchableOpacity onPress={() => setSelectedService(null)} style={styles.backBtn}>
            <ChevronLeft color={ScreenColors.subscription.iconOnDark} size={22} />
          </TouchableOpacity>
          <View style={styles.planHeaderMid}>
            <View style={[styles.planLogoWrapper, { borderColor: `${selectedService.borderColor}66` }]}>
              <Image source={{ uri: selectedService.logoUrl }} style={styles.planHeaderLogo} resizeMode="contain" />
            </View>
            <Text style={styles.planHeaderTitle}>{selectedService.name}</Text>
            <Text style={styles.planHeaderSub}>Select a plan to continue</Text>
          </View>
        </View>

        {/* Plans */}
        <FlatList
          data={selectedService.availablePlans}
          keyExtractor={(p: any) => p.name}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.planCard}
              onPress={() => handlePlanSelect(item)}
              activeOpacity={0.8}
            >
              <View style={[StyleSheet.absoluteFill, { backgroundColor: ScreenColors.brand.surface }]} />
              {/* Left: plan name + features */}
              <View style={{ flex: 1, paddingRight: 12 }}>
                {index === 0 && (
                  <View style={styles.popularBadge}>
                    <Star color={ScreenColors.subscription.star} size={10} fill={ScreenColors.subscription.star} />
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}
                <Text style={styles.planCardName}>{item.name}</Text>
                <Text style={styles.planCardFeatures}>{item.features || 'Full access'}</Text>
              </View>
              {/* Right: price + select — clean column, no badge overlap */}
              <View style={styles.planCardRight}>
                <View style={styles.planPriceRow}>
                  <Text style={styles.planPriceSym}>₹</Text>
                  <Text style={styles.planPriceVal}>{item.price}</Text>
                </View>
                <Text style={styles.planPriceMo}>/month</Text>
                <View style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>Select →</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────
  // MAIN SCREEN
  // ─────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 1000 : 800) : '100%', alignSelf: 'center', width: '100%' }}>
      <StatusBar barStyle="dark-content" />



      <FlatList
        data={filteredCategories}
        keyExtractor={(item: any) => item.categoryId}
        renderItem={renderCategory}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <View>
            {/* ── HERO HEADER ── */}
            {/* Back button */}
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.mainBackBtn}>
              <ArrowLeft size={22} color={ScreenColors.subscription.textPrimary} />
            </TouchableOpacity>

            <View style={styles.heroGradient}>
              <View style={styles.heroRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.heroPill}>
                    <Zap color={ScreenColors.subscription.primaryAccent} size={11} fill={ScreenColors.subscription.primaryAccent} />
                    <Text style={styles.heroPillText}>BODHI Marketplace</Text>
                  </View>
                  <Text style={styles.heroTitle}>Discover Plans</Text>
                  <Text style={styles.heroSubtitle}>All your subscriptions,{'\n'}one intelligent hub.</Text>
                </View>
                <View style={styles.heroGraphic}>
                  <LinearGradient
                    colors={[ScreenColors.subscription.categoryChipTint, ScreenColors.subscription.badgePopularBackground]}
                    style={styles.heroGraphicInner}
                  >
                    <Flame color={ScreenColors.subscription.primaryAccent} size={30} />
                  </LinearGradient>
                  <View style={[styles.orbDot, { top: -6, right: -6, backgroundColor: ScreenColors.subscription.categoryChipTint }]} />
                  <View style={[styles.orbDot, { bottom: -4, left: -4, backgroundColor: ScreenColors.subscription.badgePopularBackground }]} />
                </View>
              </View>

              {/* Stats strip */}
              <View style={styles.statsRow}>
                {[
                  { val: '50+', label: 'Services' },
                  { val: '4',   label: 'Categories' },
                  { val: '₹99', label: 'Starts at' },
                ].map((s, i) => (
                  <View key={i} style={styles.statItem}>
                    <Text style={styles.statVal}>{s.val}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── SEARCH BAR ── */}
            <View style={styles.searchWrapper}>
              <Search color={ScreenColors.subscription.textMuted} size={17} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Netflix, Spotify…"
                placeholderTextColor={ScreenColors.subscription.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X color={ScreenColors.subscription.textMuted} size={16} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── FILTER CHIPS ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {FILTER_CHIPS.map(chip => (
                <TouchableOpacity
                  key={chip}
                  onPress={() => setActiveFilter(chip)}
                  style={[styles.chip, activeFilter === chip && styles.chipActive]}
                >
                  <Text style={[styles.chipText, activeFilter === chip && styles.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>Browse Categories</Text>
          </View>
        }
      />
      </View>

      {/* ── VAULT CONFIRMATION MODAL ── */}
      <Modal visible={showConfirmModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalPill} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Did you subscribe?</Text>
                <Text style={styles.modalSub}>We'll track it for you automatically.</Text>
              </View>
              <TouchableOpacity onPress={cancelLog} style={styles.modalClose}>
                <X color={ScreenColors.subscription.iconMuted} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalBody}>
              Add <Text style={{ color: ScreenColors.subscription.primaryAccent, fontWeight: '700' }}>{pendingSub?.name}</Text> to your Vault to monitor this recurring expense?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelLog}>
                <Text style={styles.cancelBtnText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmAndLogToVault} style={{ flex: 1.6 }}>
                <LinearGradient colors={[ScreenColors.subscription.primaryAccent, ScreenColors.subscription.badgePopularText]} style={styles.confirmBtn}>
                  <Text style={[styles.confirmBtnText, { color: ScreenColors.subscription.textPrimary }]}>Add to Vault</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: ScreenColors.subscription.background },
  centered:    { justifyContent: 'center', alignItems: 'center' },

  // Ambient orbs
  orb: { position: 'absolute', borderRadius: 999 },
  orbDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },

  // ── HERO ──
  heroGradient: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: ScreenColors.subscription.headerBackground,
  },
  mainBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: ScreenColors.subscription.cardBackground, alignItems: 'center', justifyContent: 'center',
    marginLeft: 20, marginTop: 8, marginBottom: 4,
    borderWidth: 1, borderColor: ScreenColors.subscription.cardBorder,
  },
  heroRow:      { flexDirection: 'row', alignItems: 'flex-start' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: ScreenColors.subscription.cardBackground, borderRadius: 20, borderWidth: 1,
    borderColor: ScreenColors.subscription.cardBorder, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 14,
  },
  heroPillText: { color: ScreenColors.subscription.primaryAccent, fontSize: responsiveFont(10), fontWeight: '700', letterSpacing: 1 },
  heroTitle: { color: ScreenColors.subscription.textPrimary, fontSize: responsiveFont(28), fontWeight: '700', lineHeight: 34, letterSpacing: -0.3 },
  heroSubtitle: { color: ScreenColors.subscription.textSecondary, fontSize: responsiveFont(14), marginTop: 8, lineHeight: 20 },
  heroGraphic: {
    width: 76, height: 76, marginLeft: 16, position: 'relative',
    justifyContent: 'center', alignItems: 'center',
  },
  heroGraphicInner: {
    width: 72, height: 72, borderRadius: 22, justifyContent: 'center',
    alignItems: 'center', borderWidth: 1, borderColor: ScreenColors.subscription.heroGraphicBorder,
  },
  statsRow: {
    flexDirection: 'row', marginTop: 24, gap: 0,
    borderTopWidth: 1, borderTopColor: ScreenColors.subscription.cardBorder, paddingTop: 18,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal:  { color: ScreenColors.subscription.primaryAccent, fontSize: responsiveFont(20), fontWeight: '800' },
  statLabel:{ color: ScreenColors.subscription.textMuted, fontSize: responsiveFont(11), marginTop: 2 },

  // ── SEARCH ──
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: ScreenColors.subscription.searchBackground, borderRadius: 18,
    borderWidth: 0, borderColor: 'transparent',
    marginHorizontal: 20, marginTop: 20, paddingHorizontal: 16, paddingVertical: 13,
  },
  searchInput: { flex: 1, color: ScreenColors.subscription.textPrimary, fontSize: responsiveFont(14), padding: 0 },

  // ── FILTER CHIPS ──
  chipsRow: { paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: ScreenColors.subscription.chipBackground,
    borderWidth: 1, borderColor: ScreenColors.subscription.cardBorder,
  },
  chipActive: { backgroundColor: ScreenColors.subscription.chipSelectedBackground, borderColor: ScreenColors.subscription.chipSelectedBackground },
  chipText:       { color: ScreenColors.subscription.chipText, fontSize: responsiveFont(13), fontWeight: '600' },
  chipTextActive: { color: ScreenColors.subscription.chipSelectedText },

  // Section label
  sectionLabel: {
    color: ScreenColors.subscription.textSecondary, fontSize: responsiveFont(11), fontWeight: '700', letterSpacing: 1.5,
    textTransform: 'uppercase', paddingHorizontal: 22, marginBottom: 10,
  },

  // ── CATEGORY ──
  categoryContainer: { marginBottom: 32 },
  categoryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 22, marginBottom: 14,
  },
  categoryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIconBadge: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: ScreenColors.subscription.categoryChipTint, borderWidth: 1, borderColor: ScreenColors.subscription.cardBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryTitle: { color: ScreenColors.subscription.textPrimary, fontSize: responsiveFont(18), fontWeight: '700' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText:{ color: ScreenColors.subscription.primaryAccent, fontSize: responsiveFont(13), fontWeight: '600' },

  // ── SUBSCRIPTION CARD ──
  card: {
    width: CARD_WIDTH, minHeight: 210,
    backgroundColor: ScreenColors.subscription.cardBackground, borderRadius: 24, borderWidth: 1.5,
    padding: 16, marginRight: 14, overflow: 'hidden',
    justifyContent: 'space-between',
  },
  cardAmbient: {
    position: 'absolute', top: -30, right: -30,
    width: 100, height: 100, borderRadius: 50,
    opacity: 0.6,
  },
  badge: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
    zIndex: 10,
  },
  badgeText: { fontSize: responsiveFont(9), fontWeight: '700' },
  logoWrapper: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: ScreenColors.subscription.cardBackground, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  brandLogo: { width: 36, height: 36 },
  appName: { color: ScreenColors.subscription.textPrimary, fontSize: responsiveFont(15), fontWeight: '700', marginBottom: 3 },
  planText: { color: ScreenColors.subscription.textSecondary, fontSize: responsiveFont(11), marginBottom: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  priceFrom: { color: ScreenColors.subscription.textMuted, fontSize: responsiveFont(10) },
  priceNeon: { color: ScreenColors.subscription.primaryAccent, fontSize: responsiveFont(17), fontWeight: '800' },
  priceMo:   { color: ScreenColors.subscription.textMuted, fontSize: responsiveFont(10) },
  ctaGradient: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: ScreenColors.subscription.chipBackground },
  ctaText: { color: ScreenColors.subscription.textPrimary, fontWeight: '800', fontSize: responsiveFont(13) },

  // ── PLAN SELECTION ──
  planHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  backBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: ScreenColors.brand.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: ScreenColors.brand.border,
  },
  planHeaderMid: { alignItems: 'center', paddingBottom: 16 },
  planLogoWrapper: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: ScreenColors.subscription.cardBackground,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  planHeaderLogo: { width: 50, height: 50 },
  planHeaderTitle: { color: ScreenColors.brand.textPrimary, fontSize: responsiveFont(24), fontWeight: '800' },
  planHeaderSub:   { color: ScreenColors.brand.textSecondary, fontSize: responsiveFont(13), marginTop: 4 },

  planCard: {
    borderRadius: 22, borderWidth: 1.5, padding: 20, marginBottom: 14,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden', position: 'relative',
    backgroundColor: ScreenColors.brand.surface,
    borderColor: ScreenColors.brand.border,
  },
  popularBadge: {
    position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ScreenColors.subscription.badgePopularBackground, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: ScreenColors.subscription.cardBorder,
  },
  popularBadgeText: { color: ScreenColors.subscription.badgePopularText, fontSize: responsiveFont(10), fontWeight: '700' },
  planCardName: { color: ScreenColors.subscription.textPrimary, fontSize: responsiveFont(20), fontWeight: '800' },
  planCardFeatures: { color: ScreenColors.subscription.textSecondary, fontSize: responsiveFont(13), marginTop: 4 },
  planCardRight: { alignItems: 'flex-end', gap: 4 },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline' },
  planPriceSym: { color: ScreenColors.subscription.primaryAccent, fontSize: responsiveFont(13), fontWeight: '700' },
  planPriceVal: { color: ScreenColors.subscription.primaryAccent, fontSize: responsiveFont(26), fontWeight: '900' },
  planPriceMo:  { color: ScreenColors.subscription.textMuted, fontSize: responsiveFont(11) },
  selectBtn: {
    backgroundColor: '#F0EDE8', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: ScreenColors.brand.border,
  },
  selectBtnText: { color: ScreenColors.subscription.primaryAccent, fontWeight: '700', fontSize: responsiveFont(12) },

  // ── MODAL ──
  modalOverlay: { flex: 1, backgroundColor: ScreenColors.subscription.modalOverlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: ScreenColors.subscription.modalSheetBackground, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 48, borderTopWidth: 1, borderTopColor: ScreenColors.subscription.cardBorder,
  },
  modalPill: {
    width: 40, height: 4, backgroundColor: ScreenColors.subscription.modalPill, borderRadius: 2,
    alignSelf: 'center', marginBottom: 24,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  modalTitle:  { color: ScreenColors.subscription.textPrimary, fontSize: responsiveFont(22), fontWeight: '800' },
  modalSub:    { color: ScreenColors.subscription.textSecondary, fontSize: responsiveFont(13), marginTop: 3 },
  modalClose: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: ScreenColors.subscription.searchBackground,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBody: { color: ScreenColors.subscription.textSecondary, fontSize: responsiveFont(16), lineHeight: 24, marginBottom: 28 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 16,
    backgroundColor: ScreenColors.subscription.chipBackground, alignItems: 'center',
    borderWidth: 1, borderColor: ScreenColors.subscription.cardBorder,
  },
  cancelBtnText: { color: ScreenColors.subscription.textSecondary, fontWeight: '700', fontSize: responsiveFont(15) },
  confirmBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  confirmBtnText: { color: ScreenColors.subscription.textPrimary, fontWeight: '900', fontSize: responsiveFont(15) },
});