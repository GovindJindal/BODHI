/**
 * SendMoneyScreen.tsx
 * Send money via contacts, phone number, or UPI ID.
 * Integrates react-native-contacts for phone contacts.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  ActivityIndicator, Alert, ScrollView, Platform, KeyboardAvoidingView,
  Modal, Linking,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { useNavigation } from '@react-navigation/native';
import Contacts from 'react-native-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Search, Users, Phone, Zap, ChevronRight, CheckCircle, X, ExternalLink, Landmark,
} from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Radius, Spacing, Gradients } from '../theme/tokens';
import { BASE_URL } from '../api/client';

const API = `${BASE_URL}/transfers`;

type Tab = 'contacts' | 'phone' | 'upi' | 'gap';

interface ContactItem {
  id: string;
  name: string;
  phone: string;
  initials: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#9B111E', '#FF2D2D', '#FFB000', '#00BCD4', '#4CAF50', '#E91E63'];
function avatarColor(name: string) {
  let sum = 0;
  for (const c of name) sum += c.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function SendMoneyScreen() {
  const navigation = useNavigation<any>();

  const [activeTab, setActiveTab] = useState<Tab>('gap');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [contactsPermission, setContactsPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Manual input tabs
  const [phoneInput, setPhoneInput] = useState('');
  const [upiInput, setUpiInput] = useState('');
  const [gapInput, setGapInput] = useState('');

  // Selected recipient → payment modal
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [recipientLabel, setRecipientLabel] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // U-PIN verification before BODHI payment
  const [showUpinModal, setShowUpinModal] = useState(false);
  const [uPinInput, setUPinInput] = useState('');
  const [isVerifyingUPin, setIsVerifyingUPin] = useState(false);

  // ── Contacts ─────────────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const permission = await Contacts.requestPermission();
      if (permission === 'authorized') {
        setContactsPermission('granted');
        const all = await Contacts.getAll();
        const mapped: ContactItem[] = all
          .filter(c => {
            // Accept contact if it has any name and at least one phone number
            const hasName = !!(c.displayName || c.givenName || c.familyName);
            return hasName && c.phoneNumbers && c.phoneNumbers.length > 0;
          })
          .map(c => {
            // Construct name with fallback: displayName → givenName + familyName → first phone
            const name = (
              c.displayName ||
              `${c.givenName || ''} ${c.familyName || ''}`.trim() ||
              c.phoneNumbers[0].number
            );
            // Clean phone: strip spaces, dashes, parentheses — keep + and digits
            const rawPhone = c.phoneNumbers[0].number || '';
            const phone = rawPhone.replace(/[\s\-().]/g, '');
            return {
              id: c.recordID,
              name,
              phone,
              initials: getInitials(name),
            };
          })
          .filter(c => c.phone.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        setContacts(mapped);
      } else {
        setContactsPermission('denied');
      }
    } catch (e) {
      console.error('Contacts error:', e);
      setContactsPermission('denied');
    } finally {
      setIsLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'contacts') loadContacts();
  }, [activeTab, loadContacts]);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery),
  );

  // ── Open payment modal ────────────────────────────────────────────────────
  const openPayFor = (identifier: string, label: string) => {
    setSelectedRecipient(identifier);
    setRecipientLabel(label);
    setAmount('');
    setNote('');
    setPaySuccess(false);
    setShowPayModal(true);
  };

  // ── Send money (BODHI) ───────────────────────────────────────────────────
  const handleSend = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!selectedRecipient) return;

    setIsProcessing(true);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${API}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient_identifier: selectedRecipient,
          amount: parseFloat(amount),
          note: note || undefined,
        }),
      });

      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { data = {}; }

      if (!res.ok) {
        throw new Error(data.detail || 'Payment failed. Please try again.');
      }

      setSuccessMsg(`₹${parseFloat(amount).toFixed(2)} sent to ${data.recipient_name}!`);
      setPaySuccess(true);
    } catch (err: any) {
      Alert.alert('Payment Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Initiate BODHI Wallet Send (opens U-PIN modal) ───────────────────────
  const initiateBodhiSend = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    setUPinInput('');
    setShowUpinModal(true);
  };

  // ── Verify U-PIN then send via BODHI Wallet ──────────────────────────────
  const verifyUpinAndSend = async () => {
    if (uPinInput.length !== 4) return;
    setIsVerifyingUPin(true);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const verifyRes = await fetch(`${BASE_URL}/auth/verify-upin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ u_pin: uPinInput }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        Alert.alert('U-PIN Error', err.detail || 'Incorrect U-PIN. Please try again.');
        setUPinInput('');
        return;
      }

      setShowUpinModal(false);
      await handleSend();
    } catch (e: any) {
      Alert.alert('Verification Error', e.message || 'Could not verify U-PIN.');
    } finally {
      setIsVerifyingUPin(false);
    }
  };

  // ── Send money (Native UPI) ──────────────────────────────────────────────
  const handleNativeUPIPay = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!selectedRecipient) return;

    setIsProcessing(true);
    try {
      const formattedAmount = parseFloat(amount).toFixed(2);
      // Build standard UPI URI
      let upiUrl = `upi://pay?pa=${encodeURIComponent(selectedRecipient)}&pn=${encodeURIComponent(recipientLabel)}&am=${formattedAmount}&cu=INR`;
      if (note) {
        upiUrl += `&tn=${encodeURIComponent(note)}`;
      }

      // Try specific Google Pay schemes first to avoid WhatsApp taking over
      const gpayUrl = upiUrl.replace(/^upi:\/\//i, 'gpay://upi/');
      const tezUrl = upiUrl.replace(/^upi:\/\//i, 'tez://upi/');

      if (await Linking.canOpenURL(gpayUrl)) {
        await Linking.openURL(gpayUrl);
        setSuccessMsg(`Google Pay opened! Please complete the payment.`);
        setPaySuccess(true);
      } else if (await Linking.canOpenURL(tezUrl)) {
        await Linking.openURL(tezUrl);
        setSuccessMsg(`Google Pay opened! Please complete the payment.`);
        setPaySuccess(true);
      } else if (await Linking.canOpenURL(upiUrl)) {
        // Fallback to generic UPI chooser
        await Linking.openURL(upiUrl);
        setSuccessMsg(`Payment intent opened. Please complete the payment!`);
        setPaySuccess(true);
      } else {
        Alert.alert('Error', 'No UPI app found on your device (tried GPay and generic UPI). Please install Google Pay.');
      }
    } catch (err: any) {
      Alert.alert('UPI Error', err.message || 'Could not open UPI app.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── U-PIN and Bodhi Send triggers ───────────────────────────────────────
  const initiateBodhiSend = () => {
    setShowUpinModal(true);
  };

  const verifyUpinAndSend = async () => {
    setIsVerifyingUPin(true);
    setTimeout(() => {
      setIsVerifyingUPin(false);
      setShowUpinModal(false);
      
      setTimeout(() => {
        handleSend();
      }, 500);
    }, 1200);
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; Icon: any }[] = [
    { key: 'gap', label: 'GAP ID', Icon: Landmark },
    { key: 'contacts', label: 'Contacts', Icon: Users },
    { key: 'phone', label: 'Phone', Icon: Phone },
    { key: 'upi', label: 'UPI / Email', Icon: Zap },
  ];

  const renderContactsTab = () => {
    if (contactsPermission === 'denied') {
      return (
        <View style={styles.centered}>
          <Users size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.permTitle}>Contacts Access Required</Text>
          <Text style={styles.permSub}>Allow BODHI to access your contacts to send money easily.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={loadContacts}>
            <Text style={styles.permBtnText}>Allow Access</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (isLoadingContacts) {
      return <View style={styles.centered}><ActivityIndicator color="#FF5A00" size="large" /></View>;
    }
    return (
      <>
        <View style={styles.searchBar}>
          <Search size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or number…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 32 }}>No contacts found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.contactRow} onPress={() => openPayFor(item.phone, item.name)}>
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.name) }]}>
                <Text style={styles.avatarText}>{item.initials}</Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactPhone}>{item.phone}</Text>
              </View>
              <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          )}
        />
      </>
    );
  };

  const renderPhoneTab = () => (
    <View style={styles.manualSection}>
      <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
      <View style={styles.phoneRow}>
        <View style={styles.countryCode}>
          <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
        </View>
        <TextInput
          style={styles.phoneInput}
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="Enter mobile number"
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="phone-pad"
          maxLength={10}
        />
      </View>
      <TouchableOpacity
        style={[styles.continueBtn, phoneInput.length < 10 && { opacity: 0.4 }]}
        disabled={phoneInput.length < 10}
        onPress={() => openPayFor(`+91${phoneInput}`, `+91 ${phoneInput}`)}
      >
        <LinearGradient
          colors={Gradients.authCTA.colors}
          style={styles.continueBtnGrad}
          start={Gradients.authCTA.start}
          end={Gradients.authCTA.end}
        >
          <Text style={[styles.continueBtnText, { color: '#000' }]}>Continue</Text>
          <ChevronRight size={18} color="#000" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderUPITab = () => (
    <View style={styles.manualSection}>
      <Text style={styles.inputLabel}>UPI ID OR EMAIL</Text>
      <TextInput
        style={styles.upiInput}
        value={upiInput}
        onChangeText={setUpiInput}
        placeholder="name@bank or user@example.com"
        placeholderTextColor="rgba(255,255,255,0.3)"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TouchableOpacity
        style={[styles.continueBtn, !upiInput && { opacity: 0.4 }]}
        disabled={!upiInput}
        onPress={() => openPayFor(upiInput.trim().toLowerCase(), upiInput.trim())}
      >
        <LinearGradient
          colors={Gradients.authCTA.colors}
          style={styles.continueBtnGrad}
          start={Gradients.authCTA.start}
          end={Gradients.authCTA.end}
        >
          <Text style={[styles.continueBtnText, { color: '#000' }]}>Continue</Text>
          <ChevronRight size={18} color="#000" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderGapTab = () => {
    const fullGapId = gapInput.toLowerCase().trim();
    const isValid = fullGapId.endsWith('.gap') && fullGapId.split('.').length >= 3;
    return (
      <View style={styles.manualSection}>
        <Text style={styles.inputLabel}>BODHI GAP ID</Text>
        <TextInput
          style={styles.upiInput}
          value={gapInput}
          onChangeText={setGapInput}
          placeholder="e.g. harshit.g.gap"
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: -12, marginBottom: 16 }}>
          Format: username.domain_letter.gap (e.g. piyush.g.gap for Gmail)
        </Text>
        {isValid && (
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 16 }}>
            Sending to: <Text style={{ color: Colors.neonLime, fontWeight: '700' }}>{fullGapId}</Text>
          </Text>
        )}
        <TouchableOpacity
          style={[styles.continueBtn, !isValid && { opacity: 0.4 }]}
          disabled={!isValid}
          onPress={() => openPayFor(fullGapId, fullGapId)}
        >
          <LinearGradient
            colors={Gradients.authCTA.colors}
            style={styles.continueBtnGrad}
            start={Gradients.authCTA.start}
            end={Gradients.authCTA.end}
          >
            <Text style={[styles.continueBtnText, { color: '#000' }]}>Continue</Text>
            <ChevronRight size={18} color="#000" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={Gradients.darkVibrant.colors}
      start={Gradients.darkVibrant.start}
      end={Gradients.darkVibrant.end}
      style={styles.root}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send Money</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(({ key, label, Icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => { setActiveTab(key); setSearchQuery(''); }}
          >
            <Icon size={15} color={activeTab === key ? Colors.neonLime : 'rgba(255,255,255,0.4)'} />
            <Text style={[styles.tabLabel, activeTab === key && styles.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        {activeTab === 'gap' && renderGapTab()}
        {activeTab === 'contacts' && renderContactsTab()}
        {activeTab === 'phone' && renderPhoneTab()}
        {activeTab === 'upi' && renderUPITab()}
      </View>

      {/* Payment Modal */}
      <Modal visible={showPayModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={[styles.modalSheet, { maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32 }]}>
            {paySuccess ? (
              <View style={styles.successContainer}>
                <CheckCircle size={64} color="#34c759" />
                <Text style={styles.successTitle}>Sent!</Text>
                <Text style={styles.successSub}>{successMsg}</Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => {
                  setShowPayModal(false);
                  navigation.goBack();
                }}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowPayModal(false); setPaySuccess(false); }} style={{ marginTop: 12 }}>
                  <Text style={{ color: '#FF5A00', fontSize: responsiveFont(14) }}>Send to someone else</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                <View style={[styles.modalHeader, { paddingTop: Platform.OS === 'ios' ? 10 : 0 }]}>
                  <Text style={styles.modalTitle}>Send Money</Text>
                  <TouchableOpacity onPress={() => setShowPayModal(false)}>
                    <X size={22} color="#FFF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.recipientTag}>
                  <Text style={styles.recipientLabel}>To</Text>
                  <Text style={styles.recipientValue}>{recipientLabel}</Text>
                </View>

                <Text style={styles.amtLabel}>ENTER AMOUNT</Text>
                <View style={styles.amtRow}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    style={styles.amtInput}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>

                {/* Quick amounts */}
                <View style={styles.quickAmounts}>
                  {[100, 500, 1000, 2000].map(q => (
                    <TouchableOpacity key={q} style={styles.quickPill} onPress={() => setAmount(String(q))}>
                      <Text style={styles.quickPillText}>+₹{q >= 1000 ? `${q / 1000}k` : q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note (optional)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                <View style={{ gap: 12 }}>
                  <TouchableOpacity
                    onPress={handleNativeUPIPay}
                    disabled={isProcessing || !amount}
                    style={{ opacity: isProcessing || !amount ? 0.6 : 1 }}
                  >
                    <LinearGradient
                      colors={['#8B0000', '#FF5A00']}
                      style={styles.payBtn}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                      {isProcessing ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.payBtnText, { color: '#FFF' }]}>
                            PAY VIA GPAY / UPI
                          </Text>
                          <ExternalLink size={18} color="#FFF" />
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={initiateBodhiSend}
                    disabled={isProcessing || !amount}
                    style={{ opacity: isProcessing || !amount ? 0.6 : 1 }}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)']}
                      style={[styles.payBtn, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                      {isProcessing ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={[styles.payBtnText, { color: '#FFF' }]}>
                          PAY VIA BODHI WALLET
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* U-PIN Verification Modal */}
      <Modal visible={showUpinModal} transparent animationType="fade" onRequestClose={() => setShowUpinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.upinOverlay}>
          <View style={styles.upinSheet}>
            <Text style={styles.upinTitle}>🔐 Confirm U-PIN</Text>
            <Text style={styles.upinSub}>Enter your 4-digit transaction U-PIN to authorise this payment.</Text>
            <TextInput
              style={styles.upinInput}
              value={uPinInput}
              onChangeText={setUPinInput}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              placeholder="••••"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoFocus
              importantForAutofill="no"
              autoComplete="off"
              textContentType="oneTimeCode"
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity style={styles.upinCancel} onPress={() => setShowUpinModal(false)}>
                <Text style={styles.upinCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.upinConfirm, { opacity: uPinInput.length === 4 ? 1 : 0.4 }]}
                onPress={verifyUpinAndSend}
                disabled={isVerifyingUPin || uPinInput.length < 4}
              >
                {isVerifyingUPin ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.upinConfirmText}>Confirm Payment</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 20,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { color: '#FFF', fontSize: responsiveFont(18), fontWeight: '800', letterSpacing: 0.5 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.neonLime },
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: responsiveFont(13), fontWeight: '700' },
  tabLabelActive: { color: Colors.neonLime },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16,
    marginHorizontal: 16, marginVertical: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: responsiveFont(15) },

  contactRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  avatar: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText: { color: '#FFF', fontSize: responsiveFont(16), fontWeight: '700' },
  contactInfo: { flex: 1 },
  contactName: { color: '#FFF', fontSize: responsiveFont(15), fontWeight: '600', marginBottom: 2 },
  contactPhone: { color: 'rgba(255,255,255,0.4)', fontSize: responsiveFont(13) },

  permTitle: { color: '#FFF', fontSize: responsiveFont(20), fontWeight: '700', marginTop: 16, marginBottom: 8 },
  permSub: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(14), textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  permBtn: { backgroundColor: Colors.neonLime, paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radius.lg },
  permBtnText: { color: '#000', fontSize: responsiveFont(15), fontWeight: '800' },

  manualSection: { padding: 20 },
  inputLabel: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(11), fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  phoneRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 20,
    height: 60, alignItems: 'center',
  },
  countryCode: {
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', height: '100%',
  },
  countryCodeText: { color: '#FFF', fontSize: responsiveFont(15), fontWeight: '700' },
  phoneInput: { flex: 1, paddingHorizontal: 14, color: '#FFF', fontSize: responsiveFont(16), fontWeight: '600' },
  upiInput: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    padding: 16, color: '#FFF', fontSize: responsiveFont(16), fontWeight: '600', marginBottom: 20,
    height: 60,
  },
  continueBtn: { borderRadius: Radius.xl, overflow: 'hidden' },
  continueBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  continueBtnText: { color: '#000', fontSize: responsiveFont(16), fontWeight: '800' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalSheet: {
    backgroundColor: '#12142d', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 44,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { color: '#FFF', fontSize: responsiveFont(22), fontWeight: '800' },

  recipientTag: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  recipientLabel: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(11), fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  recipientValue: { color: Colors.neonLime, fontSize: responsiveFont(18), fontWeight: '800' },

  amtLabel: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(11), fontWeight: '800', letterSpacing: 2, marginBottom: 8, textAlign: 'center' },
  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  rupee: { color: '#FFF', fontSize: responsiveFont(40), fontWeight: '300', marginRight: 8 },
  amtInput: { color: '#FFF', fontSize: responsiveFont(64), fontWeight: '900', minWidth: 100, textAlign: 'center' },

  quickAmounts: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 },
  quickPill: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  quickPillText: { color: Colors.neonLime, fontSize: responsiveFont(14), fontWeight: '700' },

  noteInput: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    padding: 16, color: '#FFF', fontSize: responsiveFont(15), marginBottom: 24,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  payBtn: { borderRadius: Radius.xl, paddingVertical: 18, alignItems: 'center' },
  payBtnText: { fontSize: responsiveFont(16), fontWeight: '900', letterSpacing: 0.5 },

  successContainer: { alignItems: 'center', paddingVertical: 16 },
  successTitle: { color: '#FFF', fontSize: responsiveFont(28), fontWeight: '900', marginTop: 16, marginBottom: 8 },
  successSub: { color: 'rgba(255,255,255,0.7)', fontSize: responsiveFont(16), textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  doneBtn: { backgroundColor: Colors.success, paddingHorizontal: 48, paddingVertical: 18, borderRadius: Radius.xl },
  doneBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  // U-PIN Modal
  upinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 },
  upinSheet: { backgroundColor: '#12142d', borderRadius: 28, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  upinTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  upinSub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  upinInput: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)', height: 60, color: '#FFF',
    fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 12, marginBottom: 8,
  },
  upinCancel: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  upinCancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' },
  upinConfirm: { flex: 2, height: 50, backgroundColor: '#C8FF00', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  upinConfirmText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
