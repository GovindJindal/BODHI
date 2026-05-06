/**
 * VentureClubScreen.tsx
 * Redesigned Premium Experience for BODHI
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { 
  ChevronLeft, TrendingUp, Vote, Plus, 
  BarChart2, Wallet, MessageCircle, Activity, 
  Share2, ArrowUpRight, ArrowDownLeft, User
} from 'lucide-react-native';
import { apiClient } from '../api/client';
import { CollaborationView } from '../components/CollaborationView';
import LinearGradient from 'react-native-linear-gradient';

const { width: W } = Dimensions.get('window');

const C = {
  bg: '#FDFDF9',
  cardBg: '#FFFFFF',
  neonLime: '#3D4DFF',
  purple: '#C83232',
  red: '#C83232',
  white: '#1C1C1E',
  whiteMid: 'rgba(0,0,0,0.7)',
  whiteDim: 'rgba(0,0,0,0.3)',
  border: 'rgba(0,0,0,0.08)',
};

export function VentureClubScreen({ route, navigation }: any) {
  const { clubId, clubName } = route.params || {};
  const [tab, setTab] = useState<'PORTFOLIO' | 'CHAT' | 'POLLS' | 'FEED'>('PORTFOLIO');
  const [loading, setLoading] = useState(true);
  const [clubData, setClubData] = useState<any>(null);

  const formatINR = (val: number) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const fetchClubData = async () => {
    if (!clubId) return;
    try {
      setLoading(true);
      const response = await apiClient.get(`/social/investments/${clubId}`);
      setClubData(response.data);
    } catch (error) {
      console.error("Failed to fetch club data:", error);
      Alert.alert("Error", "Could not load club details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClubData();
  }, [clubId]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my investment club "${clubData?.name}" on BODHI! Use invite code: ${clubData?.invite_code}`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleAddFunds = () => {
    Alert.prompt(
      'Add Funds to Pool',
      'Enter the amount you want to contribute (₹)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deposit',
          onPress: async (amountStr) => {
            const amount = parseFloat(amountStr || '0');
            if (!amount || amount <= 0) return;
            try {
              await apiClient.post(`/social/investments/${clubId}/contribute`, {
                amount: amount,
              });
              await fetchClubData();
            } catch (e) {
              Alert.alert("Error", "Failed to add funds.");
            }
          },
        },
      ],
      'plain-text',
      '',
      'number-pad'
    );
  };

  const handleProposeTrade = () => {
    Alert.prompt(
      'Propose Trade',
      'Enter Symbol, Qty, Type (e.g., RELIANCE.NS, 10, BUY)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Propose',
          onPress: async (input) => {
            const parts = input?.split(',').map(s => s.trim());
            if (!parts || parts.length < 3) {
              Alert.alert("Error", "Format: Symbol, Qty, Type");
              return;
            }
            const [symbol, qtyStr, type] = parts;
            const quantity = parseFloat(qtyStr);
            try {
              await apiClient.post(`/social/investments/${clubId}/polls`, {
                symbol,
                quantity,
                type: type.toUpperCase()
              });
              await fetchClubData();
              Alert.alert("Success", "Proposal created! Members can now vote.");
            } catch (e) {
              Alert.alert("Error", "Failed to create proposal.");
            }
          },
        },
      ],
    );
  };

  if (loading || !clubData) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.neonLime} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* ── PREMIUM HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.headerBtn}
          activeOpacity={0.7}
        >
          <ChevronLeft color={C.white} size={24} />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{clubData.name || clubName}</Text>
          <View style={styles.headerBadge}>
            <TrendingUp size={10} color={C.purple} />
            <Text style={styles.headerBadgeText}>{clubData.members?.length || 0} Partners</Text>
            <Text style={styles.headerBadgeDot}>•</Text>
            <Text style={styles.headerBadgeText}>Invite: {clubData.invite_code}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleShare} style={styles.headerBtn} activeOpacity={0.7}>
          <Share2 color={C.white} size={22} />
        </TouchableOpacity>
      </View>

      {/* ── CONSOLIDATED TABS ── */}
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
          {[
            { key: 'PORTFOLIO', icon: BarChart2, label: 'Portfolio' },
            { key: 'CHAT', icon: MessageCircle, label: 'Chat' },
            { key: 'POLLS', icon: Vote, label: 'Polls' },
            { key: 'FEED', icon: Activity, label: 'Activity' },
          ].map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.activeTab]}
              onPress={() => setTab(t.key as any)}
              activeOpacity={0.8}
            >
              <t.icon size={16} color={tab === t.key ? C.bg : C.whiteDim} />
              <Text style={[styles.tabText, tab === t.key && styles.activeTabText]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {tab === 'PORTFOLIO' ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
          <LinearGradient
            colors={['#FDFDF9', '#FFFFFF']}
            style={styles.summaryCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View>
              <Text style={styles.summaryLabel}>Group Buying Power</Text>
              <Text style={styles.summaryValue}>{formatINR(clubData.buying_power)}</Text>
            </View>
            <View style={styles.summaryIconBox}>
              <Wallet size={32} color={C.white} />
            </View>
          </LinearGradient>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleAddFunds} activeOpacity={0.8}>
              <LinearGradient colors={[C.neonLime, '#A3CF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                <Plus size={20} color={C.bg} strokeWidth={3} />
                <Text style={styles.actionBtnText}>Add Funds</Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleProposeTrade} activeOpacity={0.8}>
              <ArrowUpRight size={18} color={C.neonLime} />
              <Text style={styles.actionBtnTextSecondary}>Propose Trade</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Club Holdings</Text>
            <Text style={styles.holdingCount}>{clubData.holdings?.length || 0} Assets</Text>
          </View>

          {(!clubData.holdings || clubData.holdings.length === 0) && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No holdings yet. Start investing together!</Text>
            </View>
          )}

          {clubData.holdings?.map((item: any) => {
            const currentPrice = item.currentPrice || item.avgPrice;
            const profit = (currentPrice - item.avgPrice) * item.qty;
            const isPositive = profit >= 0;
            return (
              <View key={item.id} style={styles.holdingCard}>
                <View style={[styles.holdingIcon, { backgroundColor: isPositive ? 'rgba(200,255,0,0.1)' : 'rgba(244,63,94,0.1)' }]}>
                   {isPositive ? <ArrowUpRight size={20} color={C.neonLime} /> : <ArrowDownLeft size={20} color={C.red} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.symbol}>{item.symbol}</Text>
                  <Text style={styles.qty}>{item.qty} Shares @ {formatINR(item.avgPrice)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.currentPrice}>{formatINR(currentPrice)}</Text>
                  <Text style={[styles.profit, { color: isPositive ? C.neonLime : C.red }]}>
                    {isPositive ? '+' : ''}{formatINR(profit)}
                  </Text>
                </View>
              </View>
            );
          })}
          
          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <Text style={styles.sectionTitle}>Partner Shares</Text>
          </View>
          <View style={styles.partnerList}>
            {clubData.members?.map((m: any) => (
              <View key={m.user_id} style={styles.partnerRow}>
                <View style={styles.partnerAvatar}>
                   <User size={16} color={C.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.partnerName}>{m.user_id.substring(0, 15)}...</Text>
                </View>
                <Text style={styles.partnerShare}>{m.share || 0}% Share</Text>
              </View>
            ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <CollaborationView type="investment" id={clubId} activeTab={tab as any} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  
  // HEADER
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border
  },
  headerTitleContainer: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { color: C.white, fontSize: responsiveFont(18), fontWeight: '900', letterSpacing: -0.5 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  headerBadgeText: { color: C.whiteDim, fontSize: responsiveFont(10), fontWeight: '700' },
  headerBadgeDot: { color: C.whiteDim, fontSize: responsiveFont(10) },

  // TABS
  tabContainer: { paddingVertical: 15 },
  tab: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 10, 
    paddingHorizontal: 20, 
    borderRadius: 14, 
    backgroundColor: C.cardBg, 
    borderWidth: 1, 
    borderColor: C.border, 
    gap: 8 
  },
  activeTab: { backgroundColor: C.neonLime, borderColor: C.neonLime },
  tabText: { color: C.whiteDim, fontSize: responsiveFont(13), fontWeight: '800' },
  activeTabText: { color: C.bg },

  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  // SUMMARY
  summaryCard: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24, 
    borderRadius: 28, 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: 'rgba(0,0,0,0.1)',
  },
  summaryLabel: { color: 'rgba(0,0,0,0.8)', fontSize: responsiveFont(13), fontWeight: '700', marginBottom: 6 },
  summaryValue: { color: C.neonLime, fontSize: responsiveFont(32), fontWeight: '900', letterSpacing: -1 },
  summaryIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' },

  // ACTIONS
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  actionBtn: { flex: 1.2 },
  actionBtnGrad: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 15, 
    borderRadius: 18, 
    gap: 8 
  },
  actionBtnText: { color: C.bg, fontSize: responsiveFont(15), fontWeight: '800' },
  actionBtnSecondary: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.neonLime,
    borderRadius: 18,
    gap: 8
  },
  actionBtnTextSecondary: { color: C.neonLime, fontSize: responsiveFont(15), fontWeight: '800' },

  // SECTIONS
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { color: C.white, fontSize: responsiveFont(17), fontWeight: '800', letterSpacing: -0.3 },
  holdingCount: { color: C.whiteDim, fontSize: responsiveFont(12), fontWeight: '600' },

  holdingCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: C.cardBg, 
    padding: 16, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: C.border 
  },
  holdingIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  symbol: { color: C.white, fontSize: responsiveFont(15), fontWeight: '800', marginBottom: 2 },
  qty: { color: C.whiteDim, fontSize: responsiveFont(11), fontWeight: '600' },
  currentPrice: { color: C.white, fontSize: responsiveFont(16), fontWeight: '800', marginBottom: 2 },
  profit: { fontSize: responsiveFont(13), fontWeight: '700' },

  // PARTNERS
  partnerList: { backgroundColor: C.cardBg, borderRadius: 24, padding: 8, borderWidth: 1, borderColor: C.border },
  partnerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  partnerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  partnerName: { color: C.white, fontSize: responsiveFont(14), fontWeight: '700' },
  partnerShare: { color: C.neonLime, fontSize: responsiveFont(14), fontWeight: '800' },

  emptyState: { padding: 40, alignItems: 'center' },
  emptyStateText: { color: C.whiteDim, fontSize: responsiveFont(14), fontWeight: '600' },
});