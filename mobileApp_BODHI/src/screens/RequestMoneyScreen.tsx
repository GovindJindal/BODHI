/**
 * RequestMoneyScreen.tsx
 * Create payment requests and view/fulfill incoming requests.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Modal, RefreshControl,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, ArrowDownToLine, Clock, CheckCircle, X, ChevronRight } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { BASE_URL } from '../api/client';
import { ScreenColors } from '../theme/tokens';
import { SectionLabel, PrimaryCTAButton } from '../components/shared';

const API = `${BASE_URL}/transfers`;

interface PendingRequest {
  request_id: string;
  requester_name: string;
  requester_email: string;
  amount: number;
  note: string;
  created_at: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function RequestMoneyScreen() {
  const navigation = useNavigation<any>();

  const [tab, setTab] = useState<'create' | 'pending'>('create');

  // Create request form
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Pending requests
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fulfill modal
  const [fulfillTarget, setFulfillTarget] = useState<PendingRequest | null>(null);
  const [showFulfillModal, setShowFulfillModal] = useState(false);
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [fulfillSuccess, setFulfillSuccess] = useState(false);

  // ── Fetch pending ─────────────────────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    setIsLoadingPending(true);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${API}/requests/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { data = { requests: [] }; }
      if (res.ok) setPendingRequests(data.requests || []);
    } catch (e) {
      console.error('Failed to fetch requests', e);
    } finally {
      setIsLoadingPending(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'pending') fetchPending();
  }, [tab, fetchPending]);

  // ── Create request ────────────────────────────────────────────────────────
  const handleCreateRequest = async () => {
    if (!recipientId.trim()) {
      Alert.alert('Required', 'Please enter the person\'s email or phone number.');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    setIsSending(true);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${API}/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requester_identifier: recipientId.trim().toLowerCase(),
          amount: parseFloat(amount),
          note: note || undefined,
        }),
      });

      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { data = {}; }

      if (!res.ok) {
        throw new Error(data.detail || 'Could not send payment request.');
      }

      setSuccessMsg(`Payment request of ₹${parseFloat(amount).toFixed(2)} sent to ${recipientId}!`);
      setCreateSuccess(true);
    } catch (err: any) {
      Alert.alert('Request Failed', err.message);
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setRecipientId('');
    setAmount('');
    setNote('');
    setCreateSuccess(false);
  };

  // ── Fulfill request ───────────────────────────────────────────────────────
  const handleFulfill = async () => {
    if (!fulfillTarget) return;
    setIsFulfilling(true);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${API}/requests/${fulfillTarget.request_id}/fulfill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { data = {}; }

      if (!res.ok) {
        throw new Error(data.detail || 'Payment failed.');
      }

      setFulfillSuccess(true);
      // Remove from list
      setPendingRequests(prev => prev.filter(r => r.request_id !== fulfillTarget.request_id));
    } catch (err: any) {
      Alert.alert('Payment Failed', err.message);
    } finally {
      setIsFulfilling(false);
    }
  };

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderCreateTab = () => {
    if (createSuccess) {
      return (
        <View style={styles.successContainer}>
          <CheckCircle size={72} color="#34c759" />
          <Text style={styles.successTitle}>Request Sent!</Text>
          <Text style={styles.successSub}>{successMsg}</Text>
          <Text style={styles.successHint}>
            They'll receive a notification to pay you.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => { resetForm(); navigation.goBack(); }}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={resetForm} style={{ marginTop: 14 }}>
            <Text style={{ color: '#C83232', fontSize: responsiveFont(14) }}>Request from someone else</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[styles.formContainer, { maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }]}>
          <Text style={styles.sectionTitle}>Who do you want to request from?</Text>

          <SectionLabel title="Email or Phone Number" style={styles.inputLabel} />
          <TextInput
            style={styles.input}
            value={recipientId}
            onChangeText={setRecipientId}
            placeholder="name@example.com or +91xxxxxxxxxx"
            placeholderTextColor="rgba(0,0,0,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <SectionLabel title="Amount (₹)" style={styles.inputLabel} />
          <View style={styles.amtRow}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amtInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="rgba(0,0,0,0.2)"
            />
          </View>

          {/* Quick amounts */}
          <View style={styles.quickAmounts}>
            {[100, 500, 1000, 5000].map(q => (
              <TouchableOpacity
                key={q}
                style={[styles.quickPill, amount === String(q) && styles.quickPillSelected]}
                onPress={() => setAmount(String(q))}
              >
                <Text style={[styles.quickPillText, amount === String(q) && styles.quickPillTextSelected]}>
                  ₹{q >= 1000 ? `${q / 1000}k` : q}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <SectionLabel title="Note (Optional)" style={styles.inputLabel} />
          <TextInput
            style={[styles.input, { marginBottom: 32 }]}
            value={note}
            onChangeText={setNote}
            placeholder="What's it for? e.g. Dinner split"
            placeholderTextColor="rgba(0,0,0,0.3)"
          />

          <PrimaryCTAButton
            label={`Send Request${amount ? ` for ₹${parseFloat(amount).toFixed(2)}` : ''}`}
            onPress={handleCreateRequest}
            disabled={isSending || !recipientId || !amount}
            rightIcon={isSending ? <ActivityIndicator color="#FFFFFF" /> : <ArrowDownToLine size={18} color="#FFFFFF" />}
            style={styles.requestBtn}
          />
        </View>
      </KeyboardAvoidingView>
    );
  };

  const renderPendingTab = () => {
    if (isLoadingPending) {
      return <View style={styles.centered}><ActivityIndicator color="#C83232" size="large" /></View>;
    }

    if (pendingRequests.length === 0) {
      return (
        <View style={styles.centered}>
          <CheckCircle size={52} color="rgba(0,0,0,0.1)" />
          <Text style={styles.emptyTitle}>All clear!</Text>
          <Text style={styles.emptySub}>You have no pending payment requests.</Text>
        </View>
      );
    }

    return (
    <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
      <FlatList
        data={pendingRequests}
        keyExtractor={item => item.request_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPending(); }} tintColor="#C83232" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <View style={styles.requestCard}>
            <View style={styles.requestCardLeft}>
              <View style={styles.reqAvatar}>
                <Text style={styles.reqAvatarText}>{getInitials(item.requester_name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reqName}>{item.requester_name}</Text>
                {item.note ? <Text style={styles.reqNote}>"{item.note}"</Text> : null}
                <Text style={styles.reqTime}>
                  {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
            </View>
            <View style={styles.requestCardRight}>
              <Text style={styles.reqAmount}>₹{item.amount.toLocaleString('en-IN')}</Text>
              <TouchableOpacity
                style={styles.payReqBtn}
                onPress={() => {
                  setFulfillTarget(item);
                  setFulfillSuccess(false);
                  setShowFulfillModal(true);
                }}
              >
                <Text style={styles.payReqBtnText}>Pay</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Money</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, tab === 'create' && styles.toggleBtnActive]}
          onPress={() => setTab('create')}
        >
          <Text style={[styles.toggleBtnText, tab === 'create' && styles.toggleBtnTextActive]}>
            New Request
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, tab === 'pending' && styles.toggleBtnActive]}
          onPress={() => setTab('pending')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.toggleBtnText, tab === 'pending' && styles.toggleBtnTextActive]}>
              Pending
            </Text>
            {pendingRequests.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingRequests.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {tab === 'create' ? renderCreateTab() : renderPendingTab()}

      {/* Fulfill Modal */}
      <Modal visible={showFulfillModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28 }]}>
            {fulfillSuccess ? (
              <View style={styles.successContainer}>
                <CheckCircle size={64} color="#34c759" />
                <Text style={styles.successTitle}>Paid!</Text>
                <Text style={styles.successSub}>
                  ₹{fulfillTarget?.amount.toFixed(2)} sent to {fulfillTarget?.requester_name}
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => setShowFulfillModal(false)}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Pay Request</Text>
                  <TouchableOpacity onPress={() => setShowFulfillModal(false)}>
                    <X size={22} color="#1C1C1E" />
                  </TouchableOpacity>
                </View>

                <View style={styles.fulfillSummary}>
                  <Text style={styles.fulfillFrom}>{fulfillTarget?.requester_name} is requesting</Text>
                  <Text style={styles.fulfillAmt}>₹{fulfillTarget?.amount.toFixed(2)}</Text>
                  {fulfillTarget?.note ? (
                    <Text style={styles.fulfillNote}>"{fulfillTarget.note}"</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={handleFulfill}
                  disabled={isFulfilling}
                  style={{ opacity: isFulfilling ? 0.6 : 1 }}
                >
                  <LinearGradient
                    colors={['#3D4DFF', '#3D4DFF']}
                    style={styles.requestBtn}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {isFulfilling
                      ? <ActivityIndicator color="#000" />
                      : <Text style={[styles.requestBtnText, { color: '#FFF' }]}>
                          Confirm & Pay ₹{fulfillTarget?.amount.toFixed(2)}
                        </Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.declineBtn} onPress={() => setShowFulfillModal(false)}>
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFDF9' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  headerTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '800' },

  tabToggle: {
    flexDirection: 'row', backgroundColor: '#F0EDE8',
    margin: 16, borderRadius: 14, padding: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  toggleBtnText: { color: '#9B9B9B', fontSize: responsiveFont(14), fontWeight: '700' },
  toggleBtnTextActive: { color: '#111111' },
  badge: { backgroundColor: '#1A1A4E', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { color: '#FFFFFF', fontSize: responsiveFont(11), fontWeight: '700' },

  formContainer: { padding: 20, flex: 1 },
  sectionTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '800', marginBottom: 24 },
  inputLabel: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(11), fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
    padding: 16, color: '#1C1C1E', fontSize: responsiveFont(15), marginBottom: 20,
  },
  amtRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, justifyContent: 'center' },
  rupee: { color: '#CCCCCC', fontSize: responsiveFont(24), fontWeight: '400', marginRight: 8 },
  amtInput: { color: '#111111', fontSize: responsiveFont(52), fontWeight: '800', textAlign: 'center' },
  quickAmounts: { flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' },
  quickPill: {
    backgroundColor: '#EEF0FF', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 9,
    borderWidth: 1, borderColor: '#C8CCF5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  quickPillSelected: {
    backgroundColor: '#1A1A4E',
    borderColor: '#1A1A4E',
  },
  quickPillText: { color: '#1A1A4E', fontSize: responsiveFont(13), fontWeight: '700' },
  quickPillTextSelected: { color: '#FFFFFF' },
  requestBtn: {
    borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 10,
    backgroundColor: '#1A1A4E',
  },
  requestBtnText: { color: '#FFFFFF', fontSize: responsiveFont(16), fontWeight: '800' },

  // pending
  requestCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  requestCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  reqAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#3D4DFF', alignItems: 'center', justifyContent: 'center',
  },
  reqAvatarText: { color: '#FFFFFF', fontSize: responsiveFont(16), fontWeight: '700' },
  reqName: { color: '#1C1C1E', fontSize: responsiveFont(15), fontWeight: '700', marginBottom: 2 },
  reqNote: { color: 'rgba(0,0,0,0.6)', fontSize: responsiveFont(13), fontStyle: 'italic', marginBottom: 4 },
  reqTime: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(12) },
  requestCardRight: { alignItems: 'flex-end', gap: 8 },
  reqAmount: { color: '#1C1C1E', fontSize: responsiveFont(17), fontWeight: '800' },
  payReqBtn: { backgroundColor: '#1C1C1E', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  payReqBtnText: { color: '#FFFFFF', fontSize: responsiveFont(13), fontWeight: '700' },

  emptyTitle: { color: '#1C1C1E', fontSize: responsiveFont(20), fontWeight: '800', marginTop: 16, marginBottom: 8 },
  emptySub: { color: 'rgba(0,0,0,0.5)', fontSize: responsiveFont(14), textAlign: 'center' },

  // modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 44,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { color: '#1C1C1E', fontSize: responsiveFont(22), fontWeight: '800' },
  fulfillSummary: { alignItems: 'center', paddingVertical: 20, marginBottom: 24 },
  fulfillFrom: { color: 'rgba(0,0,0,0.6)', fontSize: responsiveFont(15), marginBottom: 8 },
  fulfillAmt: { color: '#1C1C1E', fontSize: responsiveFont(48), fontWeight: '900', marginBottom: 8 },
  fulfillNote: { color: 'rgba(0,0,0,0.6)', fontSize: responsiveFont(14), fontStyle: 'italic' },
  declineBtn: { marginTop: 18, alignItems: 'center' },
  declineBtnText: { color: '#C83232', fontSize: responsiveFont(15), fontWeight: '700' },

  // success
  successContainer: { alignItems: 'center', paddingVertical: 16 },
  successTitle: { color: '#1C1C1E', fontSize: responsiveFont(26), fontWeight: '900', marginTop: 16, marginBottom: 8 },
  successSub: { color: 'rgba(0,0,0,0.7)', fontSize: responsiveFont(15), textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  successHint: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(13), textAlign: 'center', marginBottom: 32 },
  doneBtn: { backgroundColor: '#34c759', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 30 },
  doneBtnText: { color: '#FFFFFF', fontSize: responsiveFont(16), fontWeight: '800' },
});
