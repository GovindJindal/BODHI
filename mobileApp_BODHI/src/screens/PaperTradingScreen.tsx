import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Dimensions, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { TrendingUp, Wallet, Zap, CheckCircle2, X, ChevronRight, Clock, Search, ArrowUpRight, ArrowDownLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiClient } from '../api/client';
import CandlestickChart, { CandlestickData } from './CandlestickChart';

const { width: W } = Dimensions.get("window");

// ─── Theme Constants ───
const LIME = '#3D4DFF';
const PURPLE = "#FF5A00";
const DARK_BG = "#FDFDF9";
const CARD_BG = '#FFFFFF';
const CARD_BORDER = "rgba(0,0,0,0.06)";
const RED = '#C83232';

// ─── Formatters ───
const fmt = (n: number) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtK = (n: number) => n >= 100000 ? "₹" + (n / 100000).toFixed(2) + "L" : fmt(n);
const pct = (n: number) => (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";

// ─── Types ───
interface Holding {
  symbol: string;
  name?: string;
  qty: number;
  avg_price: number;
  live_price: number;
  current_value: number;
  invested_value: number;
  pnl: number;
  pnl_pct: number;
}

interface Portfolio {
  cash: number;
  total_value: number;
  starting_capital: number;
  total_pnl: number;
  total_pnl_pct: number;
  holdings: Holding[];
  market_status?: { open: boolean };
}

interface Transaction {
  type: "BUY" | "SELL";
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
}

export function PaperTradingScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("portfolio");
  
  // ─── Backend Data State ───
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // ─── Discover/Search State ───
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ─── Modal State ───
  const [tradeModal, setTradeModal] = useState(false);
  const [tradeStep, setTradeStep] = useState<"INPUT" | "REVIEW" | "SUCCESS">("INPUT");
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [livePrice, setLivePrice] = useState(0);
  const [candleData, setCandleData] = useState<CandlestickData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  
  const [inputMode, setInputMode] = useState<"QTY" | "AMOUNT">("QTY");
  const [inputVal, setInputVal] = useState("1");
  const [executing, setExecuting] = useState(false);

  // ─── Reset Logic ───
  const handleResetPortfolio = () => {
    Alert.alert(
      "Reset Portfolio?",
      "This will permanently delete all your trade history and holdings, and reset your balance to ₹1,00,000.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "RESET", 
          style: "destructive", 
          onPress: async () => {
            try {
              setLoading(true);
              await apiClient.post('/trade/reset');
              await fetchPaperData(); // Re-fetch the fresh ₹1L balance
              Alert.alert("Success", "Portfolio has been reset.");
            } catch (error) {
              Alert.alert("Error", "Could not reset portfolio.");
            } finally {
              setLoading(false);
            }
          } 
        }
      ]
    );
  };

  // ─── API Fetch Logic ───
  const fetchPaperData = useCallback(async () => {
    try {
      const [portRes, histRes] = await Promise.all([
        apiClient.get('/trade/portfolio'),
        apiClient.get('/trade/history?limit=50')
      ]);
      setPortfolio(portRes.data);
      setHistory(histRes.data.transactions || []);
    } catch (error) {
      console.error("Failed to fetch paper trading data:", error);
      Alert.alert("Connection Error", "Could not load your live portfolio.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPaperData();
  }, [fetchPaperData]);

  // ─── Live Search API Hook ───
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]); // Empty when not searching
      return;
    }

    const fetchSearchResults = async () => {
      setSearchLoading(true);
      try {
        const res = await apiClient.get(`/search?q=${encodeURIComponent(searchQuery)}`);
        const apiResults = res.data.results.map((r: any) => ({
          symbol: r.symbol,
          name: r.name,
          price: r.price || 0.00, 
          change: r.change_pct || 0.00 
        }));
        setSearchResults(apiResults);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setSearchLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => { fetchSearchResults(); }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // ─── Trade Engine Logic ───
  const handleOpenTrade = async (side: "BUY" | "SELL", symbol: string, price: number) => {
    setTradeSide(side);
    setTradeSymbol(symbol);
    setInputVal("1");
    setTradeStep("INPUT");
    setTradeModal(true);
    setCandleData([]); // Clear previous chart
    setChartLoading(true);

    // 1. Fetch Real Chart Data
    try {
      const chartRes = await apiClient.get(`/trade/chart?symbol=${symbol}&period=1mo`);
      
      setCandleData(chartRes.data.data);
    } catch (e) {
      console.error("Failed to fetch candlestick data");
    } finally {
      setChartLoading(false);
    }

    // 2. Fetch/Confirm Live Price
    if (!price || price === 0) {
      setLivePrice(0); 
      try {
        const res = await apiClient.get(`/trade/costs-preview?symbol=${symbol}&amount_inr=1000&side=BUY`);
        setLivePrice(res.data.live_price || 0);
      } catch (e) {
        Alert.alert("Pricing Error", "Could not fetch live price.");
      }
    } else {
      setLivePrice(price);
    }
  };

  const qty = inputMode === "QTY" ? (parseInt(inputVal) || 0) : Math.floor((parseFloat(inputVal) || 0) / livePrice);
  const total = qty * livePrice;

  const handleConfirmTrade = async () => {
    if (qty <= 0) return Alert.alert("Invalid", "Please enter a valid quantity.");
    if (livePrice === 0) return Alert.alert("Wait", "Fetching live price...");
    
    setExecuting(true);
    try {
      const endpoint = tradeSide === "BUY" ? "/trade/buy" : "/trade/sell";
      const payload = tradeSide === "BUY" 
        ? { symbol: tradeSymbol, amount_inr: total } 
        : { symbol: tradeSymbol, quantity: qty };

      await apiClient.post(endpoint, payload);
      setTradeStep("SUCCESS");
      
      fetchPaperData(); // Refresh UI in background
    } catch (error: any) {
      Alert.alert("Trade Failed", error.response?.data?.detail || "Something went wrong.");
    } finally {
      setExecuting(false);
    }
  };

  if (loading || !portfolio) {
    return <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={LIME} /></View>;
  }

  return (
    <View style={styles.root}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 20 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Paper <Text style={{ color: LIME }}>Trade</Text></Text>
            <Text style={styles.pageSub}>Real markets. Virtual capital.</Text>
          </View>
          <View style={[styles.marketBadge, !portfolio.market_status?.open && { borderColor: 'rgba(200,50,50,0.3)', backgroundColor: 'rgba(200,50,50,0.1)' }]}>
            <View style={[styles.marketDot, !portfolio.market_status?.open && { backgroundColor: '#C83232' }]} />
            <Text style={[styles.marketText, !portfolio.market_status?.open && { color: '#C83232' }]}>
              {portfolio.market_status?.open ? "OPEN" : "CLOSED"}
            </Text>
          </View>
        </View>

        {/* ── TABS ── */}
        <View style={styles.tabContainer}>
          {[
            { id: "portfolio", label: "Portfolio", icon: Wallet },
            { id: "discover", label: "Discover", icon: TrendingUp },
            { id: "history", label: "History", icon: Clock },
          ].map(tab => (
            <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}>
              <tab.icon size={14} color={activeTab === tab.id ? '#1C1C1E' : "rgba(0,0,0,0.4)"} />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={LIME} onRefresh={() => { setRefreshing(true); fetchPaperData(); }} />}
      >
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        
        {/* ════ PORTFOLIO TAB ════ */}
        {activeTab === "portfolio" && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.sectionHeading}>YOUR PAPER PORTFOLIO</Text>
              </View>
              <Text style={styles.mainValue}>{fmtK(portfolio.total_value)}</Text>
              <Text style={[styles.pnlValue, { color: portfolio.total_pnl >= 0 ? LIME : RED }]}>
                {pct(portfolio.total_pnl_pct)} · {portfolio.total_pnl >= 0 ? "+" : ""}{fmt(portfolio.total_pnl)} All Time
              </Text>

              <View style={styles.statsGrid}>
                <View style={styles.statBox}><Text style={styles.statLabel}>CASH</Text><Text style={styles.statVal}>{fmtK(portfolio.cash)}</Text></View>
                <View style={styles.statBox}><Text style={styles.statLabel}>RETURNS</Text><Text style={[styles.statVal, { color: portfolio.total_pnl >= 0 ? LIME : RED }]}>{fmtK(portfolio.total_pnl)}</Text></View>
                <View style={styles.statBox}><Text style={styles.statLabel}>TRADES</Text><Text style={styles.statVal}>{history.length}</Text></View>
              </View>
            </View>

            <Text style={[styles.sectionHeading, { marginVertical: 16 }]}>OPEN POSITIONS ({portfolio.holdings.length})</Text>
            
            {portfolio.holdings.length === 0 ? (
               <Text style={{color: 'rgba(0,0,0,0.4)', textAlign: 'center', marginTop: 20}}>No open positions yet.</Text>
            ) : (
              <View style={[styles.card, { paddingHorizontal: 16 }]}>
                {portfolio.holdings.map((h, i) => (
                  <View key={i} style={styles.holdingRow}>
                    <View style={styles.holdingIcon}><Text style={styles.holdingIconText}>{h.symbol.slice(0, 2)}</Text></View>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.hName}>{h.name || h.symbol}</Text>
                      <Text style={styles.hMeta}>{h.qty} shares · Avg {fmt(h.avg_price)}</Text>
                    </View>
                    <View style={{ flex: 1.5, alignItems: 'flex-end', paddingRight: 10 }}>
                      <Text style={styles.hName}>{fmt(h.live_price)}</Text>
                      <Text style={[styles.hMeta, { color: h.pnl >= 0 ? LIME : RED, fontWeight: '700' }]}>{h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}</Text>
                    </View>
                    <View style={styles.hActions}>
                      <TouchableOpacity style={[styles.hBtn, { backgroundColor: LIME }]} onPress={() => handleOpenTrade("BUY", h.symbol, h.live_price)}><Text style={[styles.hBtnText, { color: '#1C1C1E' }]}>B</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.hBtn, { backgroundColor: RED }]} onPress={() => handleOpenTrade("SELL", h.symbol, h.live_price)}><Text style={styles.hBtnText}>S</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ════ PORTFOLIO TAB ════ */}
        {activeTab === "portfolio" && (
          <View>
            {/* ... your existing cards and positions ... */}

            {/* 🔥 RESET BUTTON */}
            <TouchableOpacity 
              style={styles.resetBtn} 
              onPress={handleResetPortfolio}
            >
              <Clock size={16} color="rgba(0,0,0,0.4)" />
              <Text style={styles.resetBtnText}>RESET ALL PAPER DATA</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════ DISCOVER TAB ════ */}
        {activeTab === "discover" && (
          <View>
            <View style={styles.searchBox}>
              <Search size={18} color="rgba(0,0,0,0.4)" />
              <TextInput 
                style={styles.searchInput} 
                placeholder="Search stocks (e.g. RELIANCE)..." 
                placeholderTextColor="rgba(0,0,0,0.3)" 
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="characters"
              />
              {searchLoading && <ActivityIndicator size="small" color={LIME} style={{ marginRight: 10 }} />}
            </View>
            
            {searchQuery.length > 0 && (
              <Text style={[styles.sectionHeading, { marginBottom: 16 }]}>SEARCH RESULTS</Text>
            )}

            {searchQuery.length > 0 ? (
              <View style={[styles.card, { paddingHorizontal: 16 }]}>
                {searchResults.length === 0 && !searchLoading ? (
                  <Text style={{color: 'rgba(0,0,0,0.4)', textAlign: 'center', paddingVertical: 20}}>No stocks found.</Text>
                ) : (
                  searchResults.map((s, i) => (
                    <View key={i} style={styles.holdingRow}>
                      <View style={styles.holdingIcon}><Text style={styles.holdingIconText}>{s.symbol.slice(0, 2)}</Text></View>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.hName} numberOfLines={1}>{s.name || s.symbol}</Text>
                        <Text style={styles.hMeta}>{s.symbol}</Text>
                      </View>
                      <View style={{ flex: 1.5, alignItems: 'flex-end', paddingRight: 10 }}>
                        {s.price > 0 ? (
                          <>
                            <Text style={styles.hName}>{fmt(s.price)}</Text>
                            <Text style={[styles.hMeta, { color: s.change >= 0 ? LIME : RED, fontWeight: '700' }]}>{s.change > 0 ? "+" : ""}{s.change}%</Text>
                          </>
                        ) : (
                          <Text style={styles.hMeta}>Live Data</Text>
                        )}
                      </View>
                      <TouchableOpacity style={[styles.hBtn, { backgroundColor: LIME, paddingHorizontal: 16 }]} onPress={() => handleOpenTrade("BUY", s.symbol, s.price || 0)}>
                        <Text style={[styles.hBtnText, { color: '#1C1C1E' }]}>BUY</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginTop: 40, opacity: 0.5 }}>
                <Search size={48} color="rgba(0,0,0,0.2)" />
                <Text style={{ color: 'rgba(0,0,0,0.5)', marginTop: 16 }}>Search for a stock to simulate a trade.</Text>
              </View>
            )}
          </View>
        )}

        {/* ════ HISTORY TAB ════ */}
        {activeTab === "history" && (
          <View>
            <Text style={[styles.sectionHeading, { marginBottom: 16 }]}>TRANSACTION HISTORY</Text>
            {history.length === 0 ? (
               <Text style={{color: 'rgba(0,0,0,0.4)', textAlign: 'center', marginTop: 20}}>No past transactions.</Text>
            ) : (
              <View style={[styles.card, { paddingHorizontal: 16 }]}>
                {history.map((t, i) => {
                   const totalVal = t.price * t.quantity;
                   const dateStr = new Date(t.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
                   return (
                    <View key={i} style={styles.holdingRow}>
                      <View style={[styles.holdingIcon, { backgroundColor: t.type === "BUY" ? "rgba(200,255,0,0.1)" : "rgba(244,63,94,0.1)" }]}>
                        {t.type === "BUY" ? <ArrowUpRight size={18} color={LIME} /> : <ArrowDownLeft size={18} color={RED} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hName}>{t.symbol}</Text>
                        <Text style={styles.hMeta}>{t.quantity} shares · {dateStr}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.hName, { color: t.type === "BUY" ? RED : LIME }]}>{t.type === "BUY" ? "-" : "+"}{fmt(totalVal)}</Text>
                        <View style={{ backgroundColor: t.type === "BUY" ? "rgba(244,63,94,0.1)" : "rgba(200,255,0,0.1)", paddingHorizontal: 6, borderRadius: 4, marginTop: 4 }}>
                          <Text style={{ fontSize: responsiveFont(10), color: t.type === "BUY" ? RED : LIME, fontWeight: '700' }}>{t.type}</Text>
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}
        <View style={{ height: 100 }} />
        </View>
      </ScrollView>


      {/* ════ TRADE MODAL ════ */}
      <Modal visible={tradeModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setTradeModal(false)}><X size={24} color='#1C1C1E' /></TouchableOpacity>

            {tradeStep === "INPUT" && (
              <>
                <View style={styles.modalToggleRow}>
                  <TouchableOpacity style={[styles.mToggle, tradeSide === "BUY" ? { backgroundColor: LIME } : null]} onPress={() => setTradeSide("BUY")}><Text style={[styles.mToggleText, tradeSide === "BUY" && { color: '#1C1C1E' }]}>BUY</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.mToggle, tradeSide === "SELL" ? { backgroundColor: RED } : null]} onPress={() => setTradeSide("SELL")}><Text style={[styles.mToggleText, tradeSide === "SELL" && { color: '#1C1C1E' }]}>SELL</Text></TouchableOpacity>
                </View>

                <Text style={styles.mTitle}>{tradeSide} <Text style={{ color: PURPLE }}>{tradeSymbol}</Text></Text>
                <Text style={styles.mSub}>
                  Live Price: {livePrice === 0 ? "Fetching market data..." : fmt(livePrice)}
                </Text>

                {/* 🔥 REAL CANDLESTICK CHART */}
                <View style={{ marginBottom: 24, marginTop: -10 }}>
                  {chartLoading ? (
                    <View style={{ height: 200, justifyContent: 'center', alignItems: 'center', borderColor: CARD_BORDER, borderWidth: 1, borderRadius: 16 }}>
                      <ActivityIndicator color={PURPLE} />
                      <Text style={{ color: 'rgba(0,0,0,0.4)', marginTop: 10, fontSize: responsiveFont(12) }}>Loading 1M Chart...</Text>
                    </View>
                  ) : candleData.length > 0 ? (
                    <CandlestickChart data={candleData} height={200} />
                  ) : null}
                </View>

                <View style={styles.mInputToggleRow}>
                  <TouchableOpacity onPress={() => setInputMode("QTY")} style={[styles.mSubToggle, inputMode === "QTY" && styles.mSubToggleActive]}><Text style={styles.mToggleText}>Quantity</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setInputMode("AMOUNT")} style={[styles.mSubToggle, inputMode === "AMOUNT" && styles.mSubToggleActive]}><Text style={styles.mToggleText}>Amount (₹)</Text></TouchableOpacity>
                </View>

                <View style={styles.mainInputWrap}>
                  {inputMode === "AMOUNT" && <Text style={styles.inputCurrency}>₹</Text>}
                  <TextInput value={inputVal} onChangeText={setInputVal} keyboardType="numeric" style={styles.hugeInput} placeholder="0" placeholderTextColor="rgba(0,0,0,0.2)" />
                </View>

                <View style={styles.mSummaryCard}>
                  <View style={styles.mSummaryRow}><Text style={styles.mSumLabel}>Quantity</Text><Text style={styles.mSumVal}>{qty} shares</Text></View>
                  <View style={styles.mSummaryRow}><Text style={styles.mSumLabel}>Est. Price</Text><Text style={styles.mSumVal}>{livePrice === 0 ? "..." : fmt(livePrice)}</Text></View>
                  <View style={[styles.mSummaryRow, { borderTopWidth: 1, borderColor: CARD_BORDER, paddingTop: 12, marginTop: 4 }]}><Text style={styles.mSumLabel}>Total Value</Text><Text style={[styles.mSumVal, { color: LIME, fontSize: responsiveFont(18) }]}>{livePrice === 0 ? "..." : fmt(total)}</Text></View>
                </View>

                <TouchableOpacity style={[styles.mActionBtn, { backgroundColor: tradeSide === "BUY" ? LIME : RED }]} onPress={() => setTradeStep("REVIEW")}>
                  <Text style={[styles.mActionText, tradeSide === "BUY" ? { color: '#1C1C1E' } : { color: '#1C1C1E' }]}>REVIEW ORDER →</Text>
                </TouchableOpacity>
              </>
            )}

            {tradeStep === "REVIEW" && (
              <>
                <Text style={[styles.mTitle, { marginBottom: 24 }]}>Review Order</Text>
                
                {!(portfolio?.market_status?.open) && (
                  <View style={styles.amoWarningBox}>
                    <Clock size={18} color='#C83232' />
                    <Text style={styles.amoWarningText}>
                      Market is closed. This will be placed as an After Market Order (AMO).
                    </Text>
                  </View>
                )}

                <View style={[styles.mSummaryCard, { alignItems: 'center', paddingVertical: 30 }]}>
                  <Text style={styles.mSumLabel}>You are {tradeSide === "BUY" ? "buying" : "selling"}</Text>
                  <Text style={{ fontSize: responsiveFont(40), fontWeight: '900', color: '#1C1C1E', marginVertical: 8 }}>{qty}</Text>
                  <Text style={styles.mSumLabel}>shares of <Text style={{ color: PURPLE, fontWeight: '800' }}>{tradeSymbol}</Text></Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                  <TouchableOpacity style={[styles.mActionBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: CARD_BORDER }]} onPress={() => setTradeStep("INPUT")}>
                    <Text style={[styles.mActionText, { color: "rgba(0,0,0,0.6)" }]}>BACK</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mActionBtn, { flex: 2, backgroundColor: tradeSide === "BUY" ? LIME : RED }]} onPress={handleConfirmTrade} disabled={executing || livePrice === 0}>
                    {executing ? <ActivityIndicator color="#000" /> : <Text style={[styles.mActionText, tradeSide === "BUY" ? { color: '#1C1C1E' } : { color: '#1C1C1E' }]}>CONFIRM {tradeSide}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {tradeStep === "SUCCESS" && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(200,255,0,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1, borderColor: 'rgba(200,255,0,0.3)' }}>
                  <CheckCircle2 size={40} color={LIME} />
                </View>
                <Text style={[styles.mTitle, { marginBottom: 12 }]}>
                  {portfolio?.market_status?.open ? "Order Executed!" : "AMO Placed!"}
                </Text>
                <Text style={[styles.mSub, { textAlign: 'center', marginBottom: 40 }]}>
                  {portfolio?.market_status?.open 
                    ? `Successfully simulated ${tradeSide} of ${qty} shares of ${tradeSymbol} at ${fmt(livePrice)}`
                    : `Market is closed. Your order has been placed as an After Market Order (AMO) and will execute tomorrow morning.`
                  }
                </Text>
                <TouchableOpacity style={[styles.mActionBtn, { backgroundColor: LIME, width: '100%' }]} onPress={() => setTradeModal(false)}>
                  <Text style={[styles.mActionText, { color: '#1C1C1E' }]}>VIEW PORTFOLIO</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}



const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG },
  header: { paddingHorizontal: 30 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: responsiveFont(32), fontWeight: '900', color: '#1C1C1E', letterSpacing: -1 },
  pageSub: { fontSize: responsiveFont(13), color: 'rgba(0,0,0,0.5)', marginTop: 4 },
  marketBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(200,255,0,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(200,255,0,0.2)' },
  marketDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIME, marginRight: 6 },
  marketText: { fontSize: responsiveFont(11), fontWeight: '800', color: LIME },
  
  tabContainer: { flexDirection: 'row', backgroundColor: CARD_BG, borderRadius: 16, padding: 6, marginTop: 24, marginBottom: 20, borderWidth: 1, borderColor: CARD_BORDER },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  tabBtnActive: { backgroundColor: 'rgba(0,0,0,0.1)' },
  tabText: { fontSize: responsiveFont(13), fontWeight: '700', color: 'rgba(0,0,0,0.4)' },
  tabTextActive: { color: '#1C1C1E' },

  scroll: { paddingHorizontal: 20 },
  sectionHeading: { fontSize: responsiveFont(10), fontWeight: '800', color: 'rgba(0,0,0,0.4)', letterSpacing: 1.5 },
  
  card: { backgroundColor: CARD_BG, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: CARD_BORDER, marginBottom: 24 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  mainValue: { fontSize: responsiveFont(36), fontWeight: '900', color: '#1C1C1E', letterSpacing: -1 },
  pnlValue: { fontSize: responsiveFont(14), fontWeight: '700', marginTop: 4, marginBottom: 16 },
  
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  statBox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: CARD_BORDER, marginHorizontal: 4 },
  statLabel: { fontSize: responsiveFont(10), color: 'rgba(0,0,0,0.4)', fontWeight: '700', marginBottom: 4 },
  statVal: { fontSize: responsiveFont(14), fontWeight: '800', color: '#1C1C1E' },

  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CARD_BORDER },
  holdingIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,90,0,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  holdingIconText: { color: PURPLE, fontWeight: '800', fontSize: responsiveFont(12) },
  hName: { fontSize: responsiveFont(14), fontWeight: '700', color: '#1C1C1E', marginBottom: 2 },
  hMeta: { fontSize: responsiveFont(11), color: 'rgba(0,0,0,0.4)' },
  hActions: { flexDirection: 'row', gap: 6 },
  hBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  hBtnText: { fontSize: responsiveFont(11), fontWeight: '800', color: '#1C1C1E' },

  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 16, paddingHorizontal: 16, marginBottom: 24, borderWidth: 1, borderColor: CARD_BORDER },
  searchInput: { flex: 1, paddingVertical: 16, paddingHorizontal: 12, color: '#1C1C1E', fontSize: responsiveFont(15) },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' },
  modalContent: { backgroundColor: CARD_BG, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, borderWidth: 1, borderColor: CARD_BORDER, maxHeight: '90%', width: '100%', maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center' },
  modalClose: { position: 'absolute', top: 20, right: 20, zIndex: 10 },
  
  modalToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 20, marginRight: 40 },
  mToggle: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center' },
  mToggleText: { fontSize: responsiveFont(14), fontWeight: '800', color: 'rgba(0,0,0,0.4)' },
  
  mTitle: { fontSize: responsiveFont(24), fontWeight: '800', color: '#1C1C1E' },
  mSub: { fontSize: responsiveFont(13), color: 'rgba(0,0,0,0.5)', marginTop: 4, marginBottom: 24 },
  
  mInputToggleRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4, marginBottom: 20 },
  mSubToggle: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  mSubToggleActive: { backgroundColor: 'rgba(0,0,0,0.1)' },
  
  mainInputWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  inputCurrency: { fontSize: responsiveFont(32), fontWeight: '800', color: 'rgba(0,0,0,0.4)', marginRight: 8 },
  hugeInput: { fontSize: responsiveFont(52), fontWeight: '800', color: '#1C1C1E', minWidth: 100, textAlign: 'center' },
  
  mSummaryCard: { backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: CARD_BORDER, marginBottom: 24 },
  mSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mSumLabel: { fontSize: responsiveFont(13), color: 'rgba(0,0,0,0.5)' },
  mSumVal: { fontSize: responsiveFont(14), fontWeight: '700', color: '#1C1C1E' },
  
  mActionBtn: { paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mActionText: { fontSize: responsiveFont(15), fontWeight: '800', letterSpacing: 1 },

  amoWarningBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(200, 50, 50, 0.1)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(200, 50, 50, 0.3)', marginBottom: 20 },
  amoWarningText: { flex: 1, fontSize: responsiveFont(12), color: '#C83232', lineHeight: 18, marginLeft: 8 },

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 40,
    paddingVertical: 12,
    opacity: 0.6
  },
  resetBtnText: {
    fontSize: responsiveFont(11),
    fontWeight: '800',
    color: 'rgba(0,0,0,0.4)',
    letterSpacing: 1,
    textDecorationLine: 'underline'
  },
});