import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Dimensions, ActivityIndicator,
  Modal, FlatList, Alert, Platform
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import { LineChart } from 'react-native-gifted-charts';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp, Edit2, Calendar, TrendingDown, Hourglass, Sparkles } from 'lucide-react-native';

import { apiClient } from '../api/client';
import { Colors, Radius, Spacing, ScreenColors } from '../theme/tokens';
import { SectionLabel, PrimaryCTAButton } from '../components/shared';

const { width: W } = Dimensions.get('window');

type Mode = 'Historical' | 'Predictive';

interface CrashEvent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  lesson: string;
  nifty_fall_pct: number;
}

interface StockOption {
  symbol: string;
  name: string;
  exchange: string;
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

function thinChartData(data: any[], maxPoints = 120) {
  if (!data || data.length <= maxPoints) return data || [];
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1);
}

export function MarketScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  // ── Input state ──
  const [amountText, setAmountText] = useState('10,000');
  const [mode, setMode]             = useState<Mode>('Historical');
  const [selectedStock, setSelectedStock] = useState<StockOption>({
    symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE',
  });
  const [selectedEvent, setSelectedEvent] = useState<CrashEvent | null>(null);
  const [customStartDate, setCustomStartDate] = useState('2020-01-01');

  // ── Remote data ──
  const [crashEvents, setCrashEvents] = useState<CrashEvent[]>([]);
  const [simResult, setSimResult]     = useState<any | null>(null);

  // ── UI state ──
  const [loading, setLoading]               = useState(false);
  const [loadingEvents, setLoadingEvents]   = useState(true);
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [searchQuery, setSearchQuery]       = useState('');
  const [searchResults, setSearchResults]   = useState<StockOption[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);

  // ─── Wiring: Deep-link to PaperTradingScreen ───
  const openTradeModal = () => {
    navigation.navigate('Trade', { 
      openBuy: true, 
      symbol: selectedStock.symbol 
    });
  };

  // ── Fetch crash events on mount ──
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await apiClient.get('/simulate/events');
        setCrashEvents(res.data.events || []);
        if (res.data.events?.length) setSelectedEvent(res.data.events[0]);
      } catch (e) {
        console.error('Events fetch failed:', e);
      } finally {
        setLoadingEvents(false);
      }
    };
    fetchEvents();
  }, []);

  // ── Stock search ──
  const searchStocks = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const res = await apiClient.get(`/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchStocks(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchStocks]);

  // ── Run simulation ──
  const simulate = async () => {
    const amount = parseFloat(amountText.replace(/[₹, ]/g, ''));
    if (!amount || amount < 100) {
      Alert.alert('Amount too low', 'Enter at least ₹100 to simulate.');
      return;
    }

    setLoading(true);
    setSimResult(null);

    try {
      if (mode === 'Historical') {
        if (!selectedEvent) return;
        const res = await apiClient.post('/simulate/crash', {
          symbol:         selectedStock.symbol,
          crash_event_id: selectedEvent.id,
          investment_inr: amount,
        });
        setSimResult({ mode: 'crash', ...res.data });
      } else {
        const start = customStartDate || '2022-01-01';
        const res = await apiClient.post('/simulate/replay', {
          symbol:         selectedStock.symbol,
          start_date:     start,
          investment_inr: amount,
        });
        setSimResult({ mode: 'replay', ...res.data });
      }
    } catch (e: any) {
      Alert.alert('Simulation Error', e.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived display values ──
  const sim = simResult?.simulation ?? simResult?.primary ?? null;
  const chartData = sim ? thinChartData(sim.chart_data) : [];
  const isGain = sim ? sim.gain_pct >= 0 : true;

  return (
    <View style={styles.root}>
      {/* ── Background Gradient ── */}
      <LinearGradient
        colors={[ScreenColors.brand.appBgWarmWhite, '#FFFFFF', ScreenColors.brand.appBgWarmWhite]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* ─── STOCK PICKER MODAL ─── */}
      <Modal visible={showStockPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 700) : '100%', alignSelf: 'center', width: '100%', flex: 1 }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Asset</Text>
            <TouchableOpacity onPress={() => setShowStockPicker(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search NSE / BSE…"
            placeholderTextColor="rgba(0,0,0,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchLoading && <ActivityIndicator style={{ marginTop: 16 }} color="#FF5A00" />}
          <FlatList
            data={searchResults}
            keyExtractor={i => i.symbol}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchRow}
                onPress={() => {
                  setSelectedStock(item);
                  setShowStockPicker(false);
                  setSearchQuery('');
                }}
              >
                <View style={styles.assetIconSmall}>
                  <TrendingUp size={16} color="#FF5A00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchRowName}>{item.name}</Text>
                  <Text style={styles.searchRowMeta}>{item.symbol} • {item.exchange}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
          </View>
        </View>
      </Modal>

      {/* ─── EVENT PICKER MODAL ─── */}
      <Modal visible={showEventPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 700) : '100%', alignSelf: 'center', width: '100%', flex: 1 }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick a Crash Event</Text>
            <TouchableOpacity onPress={() => setShowEventPicker(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={crashEvents}
            keyExtractor={i => i.id}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.eventRow,
                  selectedEvent?.id === item.id && styles.eventRowSelected,
                ]}
                onPress={() => {
                  setSelectedEvent(item);
                  setShowEventPicker(false);
                }}
              >
                <Text style={styles.eventEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventName}>{item.name}</Text>
                  <Text style={styles.eventDesc}>{item.description}</Text>
                  <Text style={[styles.eventFall, { color: Colors.hotPink }]}>
                    Nifty fell {item.nifty_fall_pct}%
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
          </View>
        </View>
      </Modal>

      {/* ─── MAIN SCROLL ─── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) }]}
      >
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        
        {/* ── HERO HEADER ── */}
        <View style={styles.headerSection}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.pageTitle}>Time <Text style={{color: '#FF5A00'}}>Warp</Text></Text>
            <Text style={styles.pageSubtitle}>Simulate the past. Predict the future.</Text>
          </View>
          
          {/* Glowing Hourglass Illustration */}
          <View style={styles.heroGlowBox}>
            <View style={[styles.glowRing, { borderColor: 'rgba(255,90,0,0.3)', width: 120, height: 120, borderRadius: 60 }]} />
            <View style={[styles.glowRing, { borderColor: 'rgba(255,45,120,0.2)', width: 80, height: 80, borderRadius: 40 }]} />
            <Hourglass size={44} color="#FF5A00" style={{ zIndex: 2 }} />
          </View>
        </View>

        {/* ── INPUTS ── */}
        <View style={styles.inputGroup}>
          <SectionLabel title="Asset of Choice" style={styles.inputLabel} />
          <View style={styles.glassRow}>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setShowStockPicker(true)}>
              <View style={styles.assetIconBox}>
                <TrendingUp size={22} color="#FF5A00" />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.assetName}>{selectedStock.name}</Text>
                <Text style={styles.assetTicker}>{selectedStock.symbol} • {selectedStock.exchange}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.liveTradeBtn} onPress={openTradeModal}>
              <Text style={styles.liveTradeBtnText}>TRADE LIVE</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <SectionLabel title="Simulation Principal" style={styles.inputLabel} />
          <View style={styles.glassRow}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              value={amountText}
              onChangeText={t => setAmountText(t.replace(/[^0-9.]/g, ''))}
              style={styles.textInput}
              keyboardType="numeric"
              placeholderTextColor="rgba(0,0,0,0.4)"
            />
            <View style={styles.editIconBox}>
              <Edit2 size={16} color="#FF5A00" />
            </View>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <SectionLabel title="Simulation Mode" style={styles.inputLabel} />
          <View style={styles.toggleContainer}>
            {(['Historical', 'Predictive'] as Mode[]).map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[styles.toggleBtn, mode === m && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {mode === 'Historical' && (
          <View style={styles.inputGroup}>
            <SectionLabel title="Crash Event (Optional)" style={styles.inputLabel} />
            {loadingEvents ? (
              <ActivityIndicator color="#FF5A00" />
            ) : (
              <TouchableOpacity style={styles.glassRow} onPress={() => setShowEventPicker(true)}>
                <View style={styles.assetIconBox}>
                  <TrendingDown size={22} color="#FF5A00" />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.assetName}>{selectedEvent?.name ?? 'Select crash event'}</Text>
                  <Text style={styles.assetTicker}>{selectedEvent?.description ?? 'e.g. COVID-19 Crash, 2008 Crisis'}</Text>
                </View>
                <Text style={styles.changeBtnText}>Change ›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {mode === 'Predictive' && (
          <View style={styles.inputGroup}>
          <SectionLabel title="Start Date (YYYY-MM-DD)" style={styles.inputLabel} />
            <View style={styles.glassRow}>
              <Calendar size={22} color="#FF5A00" style={{ marginRight: 16 }} />
              <TextInput
                value={customStartDate}
                onChangeText={setCustomStartDate}
                style={styles.textInput}
                placeholder="2020-01-01"
                placeholderTextColor="rgba(0,0,0,0.4)"
              />
              <View style={styles.editIconBox}>
                <Edit2 size={16} color="#FF5A00" />
              </View>
            </View>
          </View>
        )}

        {/* ── CALCULATE BUTTON ── */}
        <View style={styles.buttonShadowWrapper}>
          <PrimaryCTAButton
            label="CALCULATE ALPHA"
            onPress={simulate}
            disabled={loading}
            rightIcon={loading ? <ActivityIndicator color="#FFFFFF" /> : <Sparkles size={18} color="#FFFFFF" />}
            style={styles.calcBtn}
          />
        </View>

        {/* ─── Results Section ─────────────────────────────────────── */}
        {sim && (
          <View style={{ marginTop: 20 }}>
            <LinearGradient
              colors={['#FF5A00', '#9B111E', '#FF2D2D']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.impactCard}
            >
              <Text style={styles.impactLabel}>PORTFOLIO IMPACT</Text>
              <Text style={styles.impactTitle}>
                {isGain ? 'Your hypothetical\nwealth is growing.' : 'A tough window — but\nknowledge is alpha.'}
              </Text>
              <Text style={styles.impactDesc}>{simResult?.narrative}</Text>
            </LinearGradient>

            <View style={styles.resultCard}>
              <View style={styles.resultTop}>
                <Text style={styles.resultLabel}>SIMULATED VALUE TODAY</Text>
                <Text style={styles.resultPeriod}>{Math.round(sim.calendar_days / 30)}M</Text>
              </View>
              <View style={styles.resultAmtRow}>
                <Text style={styles.resultAmt}>{fmt(sim.value_now)}</Text>
                <View style={[styles.resultBadge, { backgroundColor: isGain ? 'rgba(212,255,0,0.1)' : 'rgba(255,45,120,0.1)' }]}>
                  <Text style={[styles.resultBadgeText, { color: isGain ? Colors.neonLime : Colors.hotPink }]}>
                    {fmtPct(sim.gain_pct)}
                  </Text>
                </View>
              </View>

              <View style={styles.chartArea}>
                <LineChart
                  data={chartData.map((d: any) => ({ value: d.value }))}
                  width={W - 40 - 48}
                  height={120}
                  thickness={3}
                  color={isGain ? Colors.neonLime : Colors.hotPink}
                  startFillColor={isGain ? Colors.neonLime : Colors.hotPink}
                  endFillColor={isGain ? Colors.neonLime : Colors.hotPink}
                  startOpacity={0.2}
                  endOpacity={0.0}
                  initialSpacing={0}
                  hideDataPoints
                  hideRules
                  hideYAxisText
                  hideAxesAndRules
                  adjustToWidth
                />
                <View style={styles.chartLabels}>
                  <Text style={styles.chartLabelText}>{sim.start_date}</Text>
                  <Text style={[styles.chartLabelText, { color: Colors.neonLime }]}>TODAY</Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statCard, { flex: 1 }]}>
                <Text style={styles.statLabel}>WORST DROP</Text>
                <Text style={[styles.statVal, { color: Colors.hotPink }]}>
                  {fmtPct(sim.loss_at_trough_pct)}
                </Text>
              </View>
              <View style={{ width: 16 }} />
              <View style={[styles.statCard, { flex: 1 }]}>
                <Text style={styles.statLabel}>VOLATILITY</Text>
                <Text style={styles.statVal}>{sim.volatility_pct.toFixed(1)}%</Text>
              </View>
            </View>

            <View style={[styles.statCard, { marginBottom: 40 }]}>
              <Text style={styles.statLabel}>ALPHA SCORE</Text>
              <View style={styles.statRow}>
                <Text style={styles.statVal}>{sim.alpha_score}/100</Text>
                <View style={styles.alphaBar}>
                  <View style={[styles.alphaFill, { width: `${sim.alpha_score}%` }]} />
                </View>
              </View>
            </View>
          </View>
        )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF8' },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },
  
  // ── HERO HEADER ──
  headerSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, marginTop: 10 },
  headerTextWrap: { flex: 1 },
  pageTitle: { fontSize: responsiveFont(36), fontWeight: '800', color: '#1C1C1E', letterSpacing: -1 },
  pageSubtitle: { fontSize: responsiveFont(13), color: '#6B6560', marginTop: 4, fontWeight: '500' },
  
  heroGlowBox: { width: 120, height: 120, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  glowRing: { position: 'absolute', borderWidth: 1 },

  // ── INPUT GROUPS ──
  inputGroup: { marginBottom: 20 },
  inputLabel: { marginBottom: 12 },
  
  glassRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#EEEBE6' },
  
  assetIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(26,26,78,0.08)', borderWidth: 1, borderColor: 'rgba(26,26,78,0.15)', alignItems: 'center', justifyContent: 'center' },
  assetName: { fontSize: responsiveFont(15), fontWeight: '700', color: '#1C1C1E', marginBottom: 2 },
  assetTicker: { fontSize: responsiveFont(12), color: 'rgba(0,0,0,0.5)' },
  
  liveTradeBtn: { backgroundColor: '#E8FFF0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#A8DDB8' },
  liveTradeBtnText: { fontSize: responsiveFont(11), fontWeight: '800', color: '#1A7A3C', letterSpacing: 0.5 },

  currencyPrefix: { fontSize: responsiveFont(24), fontWeight: '700', color: '#1C1C1E', marginRight: 12 },
  textInput: { flex: 1, fontSize: responsiveFont(24), fontWeight: '700', color: '#1C1C1E' },
  editIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,90,0,0.1)', alignItems: 'center', justifyContent: 'center' },

  toggleContainer: { flexDirection: 'row', backgroundColor: '#F0EDE8', borderRadius: 24, padding: 6, borderWidth: 1, borderColor: '#DDDDDD' },
  toggleBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 20 },
  toggleActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDDDDD' },
  toggleText: { fontSize: responsiveFont(14), fontWeight: '600', color: '#9B9B9B' },
  toggleTextActive: { color: '#1C1C1E', fontWeight: '700' },

  changeBtnText: { fontSize: responsiveFont(13), fontWeight: '700', color: '#D85A30' },

  // ── CALCULATE BUTTON ──
  buttonShadowWrapper: {
    borderRadius: 24,
    shadowColor: Colors.neonLime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
    marginTop: 10,
  },
  calcBtn: { backgroundColor: '#1A1A4E', borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center', height: 58 },
  calcBtnText: { fontSize: responsiveFont(16), fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },

  // ── RESULTS ──
  impactCard: { borderRadius: 24, padding: 24, marginBottom: 16 },
  impactLabel: { fontSize: responsiveFont(10), fontWeight: '800', color: 'rgba(0,0,0,0.6)', letterSpacing: 1.5, marginBottom: 8 },
  impactTitle: { fontSize: responsiveFont(24), fontWeight: '800', color: '#1C1C1E', lineHeight: 32, marginBottom: 12 },
  impactDesc: { fontSize: responsiveFont(14), color: 'rgba(0,0,0,0.8)', lineHeight: 22 },

  resultCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  resultLabel: { fontSize: responsiveFont(10), fontWeight: '800', color: 'rgba(0,0,0,0.5)', letterSpacing: 1.2 },
  resultPeriod: { fontSize: responsiveFont(11), fontWeight: '700', color: 'rgba(0,0,0,0.5)' },
  resultAmtRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  resultAmt: { fontSize: responsiveFont(36), fontWeight: '800', color: '#1C1C1E', letterSpacing: -1 },
  resultBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  resultBadgeText: { fontSize: responsiveFont(12), fontWeight: '700' },

  chartArea: { marginTop: 8 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chartLabelText: { fontSize: responsiveFont(10), fontWeight: '600', color: 'rgba(0,0,0,0.4)' },

  statsRow: { flexDirection: 'row', marginBottom: 16 },
  statCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', flex: 1 },
  statLabel: { fontSize: responsiveFont(10), fontWeight: '800', color: 'rgba(0,0,0,0.5)', letterSpacing: 1.2, marginBottom: 8 },
  statVal: { fontSize: responsiveFont(24), fontWeight: '800', color: '#1C1C1E' },
  
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alphaBar: { height: 6, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden', width: '50%' },
  alphaFill: { height: '100%', backgroundColor: Colors.neonLime, borderRadius: 3 },

  // ── MODALS ──
  modal: { flex: 1, backgroundColor: '#FDFDF9' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  modalTitle: { fontSize: responsiveFont(20), fontWeight: '800', color: '#1C1C1E' },
  modalClose: { fontSize: responsiveFont(15), fontWeight: '700', color: '#FF5A00' },
  searchInput: { margin: 20, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 16, padding: 16, fontSize: responsiveFont(16), color: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  assetIconSmall: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,90,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  searchRowName: { fontSize: responsiveFont(15), fontWeight: '700', color: '#1C1C1E', marginBottom: 2 },
  searchRowMeta: { fontSize: responsiveFont(12), color: 'rgba(0,0,0,0.5)' },
  
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  eventRowSelected: { backgroundColor: 'rgba(255,90,0,0.1)', borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,90,0,0.3)' },
  eventEmoji: { fontSize: responsiveFont(28), marginTop: 2 },
  eventName: { fontSize: responsiveFont(16), fontWeight: '800', color: '#1C1C1E', marginBottom: 4 },
  eventDesc: { fontSize: responsiveFont(13), color: 'rgba(0,0,0,0.6)', lineHeight: 20, marginBottom: 6 },
  eventFall: { fontSize: responsiveFont(12), fontWeight: '700' },
});