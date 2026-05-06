/**
 * TripWalletScreen.tsx
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
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { 
  ChevronLeft, Receipt, Users, Plus, 
  CheckCircle2, MessageCircle, BarChart2, 
  Activity, Share2, MoreVertical
} from 'lucide-react-native';
import { apiClient } from '../api/client';
import { CollaborationView } from '../components/CollaborationView';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export function TripWalletScreen({ route, navigation }: any) {
  const { tripId, tripName } = route.params || {};
  const [tab, setTab] = useState<'WALLET' | 'CHAT' | 'POLLS' | 'FEED'>('WALLET');
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<any>(null);

  const formatINR = (val: number) => `₹${Math.abs(val || 0).toLocaleString('en-IN')}`;

  const fetchTripData = async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      const response = await apiClient.get(`/social/trips/${tripId}`);
      setTripData(response.data);
    } catch (error) {
      console.error("Failed to fetch trip data:", error);
      Alert.alert("Error", "Could not load the trip wallet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTripData();
  }, [tripId]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my trip wallet "${tripData?.name}" on BODHI! Use invite code: ${tripData?.invite_code}`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleAddExpense = () => {
    Alert.prompt(
      'Log an Expense',
      'Enter the amount you paid (₹)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (amountStr) => {
            const amount = parseFloat(amountStr || '0');
            if (!amount || amount <= 0) return;
            try {
              await apiClient.post(`/social/trips/${tripId}/expenses`, {
                description: 'Group Expense',
                amount: amount,
              });
              await fetchTripData();
            } catch (e) {
              Alert.alert("Error", "Failed to add expense.");
            }
          },
        },
      ],
      'plain-text',
      '',
      'number-pad'
    );
  };

  const handleSettleUp = async () => {
    if (!tripData?.expenses || tripData.expenses.length === 0) {
      Alert.alert("Nothing to Settle", "No expenses logged yet!");
      return;
    }
    try {
      setLoading(true);
      const response = await apiClient.get(`/social/trips/${tripId}/settle`);
      const transactions = response.data.transactions;
      if (transactions.length === 0) {
        Alert.alert("All Settled!", "No transfers needed.");
        return;
      }
      const settlementText = transactions.map((t: any) => {
        const from = t.from_user.substring(0, 6);
        const to = t.to_user.substring(0, 6);
        return `• User ${from} pays ₹${t.amount} to User ${to}`;
      }).join('\n\n');
      Alert.alert("Settlement Plan", settlementText);
    } catch (e) {
      Alert.alert("Error", "Failed to calculate settlement.");
    } finally {
      setLoading(false);
    }
  };

  if (loading || !tripData) {
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
          <Text style={styles.headerTitle} numberOfLines={1}>{tripData.name || tripName}</Text>
          <View style={styles.headerBadge}>
            <Users size={10} color={C.neonLime} />
            <Text style={styles.headerBadgeText}>{tripData.members?.length || 0} Members</Text>
            <Text style={styles.headerBadgeDot}>•</Text>
            <Text style={styles.headerBadgeText}>Invite: {tripData.invite_code}</Text>
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
            { key: 'WALLET', icon: Receipt, label: 'Wallet' },
            { key: 'CHAT', icon: MessageCircle, label: 'Chat' },
            { key: 'POLLS', icon: BarChart2, label: 'Polls' },
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

      {tab === 'WALLET' ? (
        <ScrollView 
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
          <LinearGradient
            colors={['#FDFDF9', '#FFFFFF']}
            style={styles.summaryCard}
          >
            <View>
              <Text style={styles.summaryLabel}>Total Group Spends</Text>
              <Text style={styles.summaryValue}>{formatINR(tripData.total_expenses || tripData.total_spent || 0)}</Text>
            </View>
            <View style={styles.summaryIconBox}>
              <Receipt size={32} color={C.neonLime} />
            </View>
          </LinearGradient>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleAddExpense} activeOpacity={0.8}>
              <LinearGradient colors={[C.neonLime, '#A3CF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                <Plus size={20} color={C.bg} strokeWidth={3} />
                <Text style={styles.actionBtnText}>Add Expense</Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleSettleUp} activeOpacity={0.8}>
              <CheckCircle2 size={18} color={C.neonLime} />
              <Text style={styles.actionBtnTextSecondary}>Settle Up</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Expenses</Text>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>

          {(!tripData.expenses || tripData.expenses.length === 0) && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No expenses logged yet.</Text>
            </View>
          )}

          {tripData.expenses?.map((exp: any) => (
            <View key={exp.id} style={styles.expenseCard}>
              <View style={styles.expenseIcon}>
                <Receipt size={20} color={C.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.expDesc}>{exp.desc}</Text>
                <Text style={styles.expPaidBy}>Paid by {exp.paid_by.substring(0, 8)}</Text>
              </View>
              <Text style={styles.expAmount}>{formatINR(exp.amount)}</Text>
            </View>
          ))}

          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <Text style={styles.sectionTitle}>Members Balance</Text>
          </View>
          
          <View style={styles.memberList}>
            {tripData.members?.map((member: any) => (
              <View key={member.user_id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.avatarText}>{member.user_id.substring(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{member.user_id.substring(0, 12)}...</Text>
                  <Text style={styles.memberSub}>Paid {formatINR(member.contributed)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                   <Text style={[styles.balanceValue, { color: member.balance >= 0 ? C.neonLime : C.red }]}>
                    {member.balance >= 0 ? '+' : '-'}{formatINR(member.balance)}
                  </Text>
                  <Text style={styles.balanceLabel}>{member.balance >= 0 ? 'is owed' : 'owes'}</Text>
                </View>
              </View>
            ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <CollaborationView type="trip" id={tripId} activeTab={tab as any} />
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
  summaryLabel: { color: C.whiteDim, fontSize: responsiveFont(13), fontWeight: '700', marginBottom: 6 },
  summaryValue: { color: C.neonLime, fontSize: responsiveFont(32), fontWeight: '900', letterSpacing: -1 },
  summaryIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(200,255,0,0.1)', alignItems: 'center', justifyContent: 'center' },

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
  viewAll: { color: C.purple, fontSize: responsiveFont(13), fontWeight: '700' },

  expenseCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: C.cardBg, 
    padding: 16, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: C.border 
  },
  expenseIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(200,50,50,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  expDesc: { color: C.white, fontSize: responsiveFont(15), fontWeight: '700', marginBottom: 2 },
  expPaidBy: { color: C.whiteDim, fontSize: responsiveFont(11), fontWeight: '600' },
  expAmount: { color: C.white, fontSize: responsiveFont(16), fontWeight: '800' },

  // MEMBERS
  memberList: { backgroundColor: C.cardBg, borderRadius: 24, padding: 8, borderWidth: 1, borderColor: C.border },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: C.bg, fontSize: responsiveFont(14), fontWeight: '800' },
  memberName: { color: C.white, fontSize: responsiveFont(14), fontWeight: '700', marginBottom: 2 },
  memberSub: { color: C.whiteDim, fontSize: responsiveFont(11), fontWeight: '600' },
  balanceValue: { fontSize: responsiveFont(15), fontWeight: '800', marginBottom: 2 },
  balanceLabel: { color: C.whiteDim, fontSize: responsiveFont(9), fontWeight: '700', textTransform: 'uppercase' },

  emptyState: { padding: 40, alignItems: 'center' },
  emptyStateText: { color: C.whiteDim, fontSize: responsiveFont(14), fontWeight: '600' },
});