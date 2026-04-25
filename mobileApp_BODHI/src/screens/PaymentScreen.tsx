// src/screens/PaymentScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { useNavigation } from '@react-navigation/native';
import {
  Send,
  QrCode,
  Download,
  Users,
  Smartphone,
  Zap,
  Tv,
  ArrowLeft,
  Check,
  ChevronRight
} from 'lucide-react-native'; // <-- Professional Vector Icons
import { Colors, Typography, Spacing, Radius, Shadow, Gradients } from '../theme/tokens';
import LinearGradient from 'react-native-linear-gradient';
import { BottomNav, GradientCard, SectionHeader } from '../components';
import type { NavTab } from '../components/shared';
import { PaymentAPI } from '../api/client';

const { width: W } = Dimensions.get('window');

interface Props {
  onNavigate?: (tab: NavTab) => void;
  activeTab?: NavTab;
  onInsurancePress?: () => void;
  onBack?: () => void;
  currentUserId?: string;
  route?: any;
  navigation?: any;
}

type PaymentMode = 'home' | 'send' | 'qr' | 'confirm';

interface Contact {
  id: string;
  name: string;
  phone: string;
  recent?: boolean;
  upiId?: string;
}

// Emjois removed. We will auto-generate professional initials from the names.
const CONTACTS: Contact[] = [
  { id: '1', name: 'Hana Mori', phone: '+91 98765 43210', recent: true, upiId: 'hana@bodhi' },
  { id: '2', name: 'Kenji Sato', phone: '+91 87654 32109', recent: true, upiId: 'kenji@bodhi' },
  { id: '3', name: 'Priya Sharma', phone: '+91 76543 21098', upiId: 'priya@bodhi' },
  { id: '4', name: 'Arjun Nair', phone: '+91 65432 10987', upiId: 'arjun@bodhi' },
  { id: '5', name: 'Zara Khan', phone: '+91 54321 09876', upiId: 'zara@bodhi' },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

const RECENT_TRANSACTIONS = [
  { id: 'r1', name: 'Hana Mori', amount: 1200, type: 'sent', time: '2h ago' },
  { id: 'r2', name: 'Kenji Sato', amount: 3400, type: 'received', time: 'Yesterday' },
  { id: 'r3', name: 'Netflix', amount: 799, type: 'sent', time: '3 days ago', isService: true }, // Flagged to use a TV icon
];

// Helper function to extract initials (e.g., "Hana Mori" -> "HM")
const getInitials = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export const PaymentScreen: React.FC<Props> = ({
  onNavigate, activeTab, onInsurancePress, onBack, currentUserId,
}) => {
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<PaymentMode>('home');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [inputTab, setInputTab] = useState<'contacts' | 'phone' | 'upi'>('contacts');
  const [qrScanning, setQrScanning] = useState(false);
  const [showMyQr, setShowMyQr] = useState(false);
  const [myProfile, setMyProfile] = useState<any>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await UsersAPI.fetchProfile();
      setMyProfile(data);
    } catch (e) {
      console.error('Failed to load profile', e);
    }
  };

  const getMyUpiString = () => {
    if (!myProfile) return '';
    const pa = `${myProfile.phone || myProfile.id}@bodhi`;
    const pn = encodeURIComponent(myProfile.full_name);
    return `upi://pay?pa=${pa}&pn=${pn}&cu=INR`;
  };

  const successAnim = useRef(new Animated.Value(0)).current;

  const filteredContacts = CONTACTS.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery),
  );

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setMode('send');
  };

  const handleProceed = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setMode('confirm');
  };

  const handleConfirmPayment = async () => {
    setLoading(true);
    try {
      if (currentUserId) {
        await PaymentAPI.createIntent({
          user_id: currentUserId ? Number(currentUserId) : 0,
          amount: Math.round(parseFloat(amount) * 100),
          currency: 'INR',
          description: note || `Payment to ${selectedContact?.name ?? phoneInput}`,
        });
      }
      setPaySuccess(true);
      Animated.spring(successAnim, { toValue: 1, useNativeDriver: true }).start();
      setTimeout(() => {
        setPaySuccess(false);
        successAnim.setValue(0);
        setMode('home');
        setSelectedContact(null);
        setAmount('');
        setNote('');
        setPhoneInput('');
      }, 2400);
    } catch (e: any) {
      Alert.alert('Payment Failed', e.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQrMock = () => {
    setQrScanning(true);
    setTimeout(() => {
      setQrScanning(false);
      setSelectedContact(CONTACTS[0]);
      setMode('send');
    }, 2000);
  };

  const resetToHome = () => {
    setMode('home');
    setSelectedContact(null);
    setAmount('');
    setNote('');
    setPhoneInput('');
    setSearchQuery('');
  };

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (paySuccess) {
    return (
      <View style={styles.successContainer}>
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />
        <Animated.View style={[styles.successCircle, { transform: [{ scale: successAnim }] }]}>
          <Check size={56} color="#000000" strokeWidth={3} />
        </Animated.View>
        <Text style={styles.successTitle}>Payment Sent!</Text>
        <Text style={styles.successSub}>
          ₹{parseFloat(amount).toLocaleString('en-IN')} → {selectedContact?.name ?? phoneInput}
        </Text>
        <Text style={styles.successNote}>TXN{Date.now().toString().slice(-8)}</Text>
        </View>
      </View>
    );
  }

  // ── CONFIRM SCREEN ─────────────────────────────────────────────────────────
  if (mode === 'confirm') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />

        <View style={styles.darkHeader}>
          <TouchableOpacity onPress={() => setMode('send')} style={styles.backBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <ArrowLeft size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.darkHeaderTitle}>Confirm Payment</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.confirmBody}>
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }}>
          <View style={styles.confirmAvatarWrap}>
            <View style={[styles.contactAvatar, { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: Colors.purple }]}>
              {selectedContact ? (
                <Text style={{ fontSize: responsiveFont(32), fontWeight: '700', color: Colors.textPrimary }}>{getInitials(selectedContact.name)}</Text>
              ) : (
                <Smartphone size={36} color={Colors.textPrimary} />
              )}
            </View>
          </View>
          <Text style={styles.confirmTo}>SENDING TO</Text>
          <Text style={styles.confirmName}>{selectedContact?.name ?? phoneInput}</Text>
          {selectedContact?.upiId ? (
            <Text style={styles.confirmUpi}>{selectedContact.upiId}</Text>
          ) : null}

          <View style={styles.confirmAmountBox}>
            <Text style={styles.confirmCurrency}>₹</Text>
            <Text style={styles.confirmAmount}>
              {parseFloat(amount).toLocaleString('en-IN')}
            </Text>
          </View>

          {note ? <Text style={styles.confirmNote}>"{note}"</Text> : null}

          <View style={styles.confirmMeta}>
            {[
              { label: 'Payment method', value: 'BODHI Vault' },
              { label: 'Processing time', value: 'Instant' },
              { label: 'Transaction fee', value: 'FREE', highlight: true },
            ].map(row => (
              <View key={row.label} style={styles.confirmMetaRow}>
                <Text style={styles.confirmMetaLabel}>{row.label}</Text>
                <Text style={[styles.confirmMetaValue, row.highlight && { color: Colors.green }]}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
          </View>
        </ScrollView>

        <View style={styles.confirmFooter}>
          <TouchableOpacity style={styles.editBtn} onPress={() => setMode('send')}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payNowBtn, loading && { opacity: 0.7 }]}
            onPress={handleConfirmPayment}
            disabled={loading}
          >
            <Text style={styles.payNowBtnText}>{loading ? 'Processing…' : 'PAY NOW'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── SEND / AMOUNT SCREEN ───────────────────────────────────────────────────
  if (mode === 'send') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.sendHeader}>
          <TouchableOpacity onPress={resetToHome} style={styles.backBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <ArrowLeft size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.sendHeaderContact}>
            <View style={[styles.contactAvatar, { width: 40, height: 40 }]}>
              {selectedContact ? (
                <Text style={{ fontSize: responsiveFont(16), fontWeight: '700', color: Colors.textPrimary }}>{getInitials(selectedContact.name)}</Text>
              ) : (
                <Smartphone size={20} color={Colors.textPrimary} />
              )}
            </View>
            <View>
              <Text style={styles.sendHeaderName}>{selectedContact?.name ?? phoneInput}</Text>
              {selectedContact?.upiId ? (
                <Text style={styles.sendHeaderUpi}>{selectedContact.upiId}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.sendBody} keyboardShouldPersistTaps="handled">
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }}>
          <Text style={styles.enterAmtLabel}>ENTER AMOUNT</Text>

          <View style={styles.amountInputRow}>
            <Text style={styles.rupeeSymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <View style={styles.quickAmtsRow}>
            {QUICK_AMOUNTS.map(qa => (
              <TouchableOpacity
                key={qa}
                style={styles.quickAmtPill}
                onPress={() => setAmount(qa.toString())}
              >
                <Text style={styles.quickAmtText}>+₹{qa >= 1000 ? `${qa / 1000}k` : qa}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={Colors.textMuted}
          />

          <View style={styles.balanceInfo}>
            <Text style={styles.balanceInfoText}>Available balance</Text>
            <Text style={styles.balanceInfoAmt}>₹4,82,930</Text>
          </View>
          </View>
        </ScrollView>

        <View style={styles.sendFooter}>
          <TouchableOpacity
            style={[styles.proceedBtn, (!amount || parseFloat(amount) <= 0) && styles.proceedBtnDisabled]}
            onPress={handleProceed}
          >
            <Text style={styles.proceedBtnText}>PROCEED TO PAY</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── QR SCREEN ──────────────────────────────────────────────────────────────
  if (mode === 'qr') {
    return (
      <View style={styles.qrContainer}>
        <View style={styles.qrHeader}>
          <TouchableOpacity onPress={resetToHome} style={styles.backBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <ArrowLeft size={26} color={Colors.textWhite} />
          </TouchableOpacity>
          <Text style={styles.qrHeaderTitle}>Scan to Pay</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.qrViewfinder}>
          <View style={styles.qrFrame}>
            <View style={[styles.qrCorner, styles.qrTL]} />
            <View style={[styles.qrCorner, styles.qrTR]} />
            <View style={[styles.qrCorner, styles.qrBL]} />
            <View style={[styles.qrCorner, styles.qrBR]} />
            {qrScanning ? (
              <View style={styles.qrScanLine} />
            ) : (
              <View style={styles.qrMockGrid}>
                {[
                  [1, 1, 1, 0, 1], [1, 0, 1, 1, 0], [0, 1, 0, 1, 1],
                  [1, 1, 0, 0, 1], [1, 0, 1, 0, 1],
                ].map((row, r) => (
                  <View key={r} style={{ flexDirection: 'row' }}>
                    {row.map((cell, c) => (
                      <View
                        key={c}
                        style={[styles.qrCell, { opacity: cell ? 1 : 0.08 }]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
          <Text style={styles.qrHint}>
            {qrScanning ? 'Scanning…' : 'Point camera at a Bodhi QR code'}
          </Text>
        </View>

        <View style={styles.qrFooter}>
          <TouchableOpacity style={styles.qrScanBtn} onPress={handleQrMock} disabled={qrScanning}>
            <Text style={styles.qrScanBtnText}>
              {qrScanning ? 'Scanning…' : 'TAP TO SIMULATE SCAN'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.myQrBtn} onPress={() => setShowMyQr(true)}>
            <Text style={styles.myQrBtnText}>SHOW MY QR CODE</Text>
          </TouchableOpacity>
        </View>

        {/* ── MY QR MODAL ── */}
        <Modal visible={showMyQr} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.myQrCard}>
              <TouchableOpacity
                style={styles.closeQr}
                onPress={() => setShowMyQr(false)}
              >
                <X size={24} color={Colors.textPrimary} />
              </TouchableOpacity>

              <View style={styles.myQrHeader}>
                <View style={styles.myQrAvatar}>
                  <Text style={styles.myQrAvatarText}>{myProfile ? getInitials(myProfile.full_name) : 'U'}</Text>
                </View>
                <Text style={styles.myQrName}>{myProfile?.full_name || 'Loading...'}</Text>
                <Text style={styles.myQrId} numberOfLines={1} adjustsFontSizeToFit>{myProfile ? `${myProfile.phone}@bodhi` : ''}</Text>
              </View>

              <View style={styles.realQrContainer}>
                {myProfile ? (
                  <Image
                    source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getMyUpiString())}` }}
                    style={styles.realQrImage}
                  />
                ) : (
                  <ActivityIndicator color={Colors.purple} />
                )}
              </View>

              <View style={styles.myQrFooter}>
                <View style={styles.upiBadge}>
                  <Text style={styles.upiBadgeText}>BHIM UPI</Text>
                </View>
                <Text style={styles.scanToPayText}>Scan with any UPI app like GPay, PhonePe or Paytm to pay me</Text>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── HOME SCREEN ────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={Gradients.darkVibrant.colors}
      start={Gradients.darkVibrant.start}
      end={Gradients.darkVibrant.end}
      style={styles.container}
    >
      <View style={styles.homeHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <ArrowLeft size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 1000 : 800) : '100%', alignSelf: 'center', width: '100%' }}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Payments</Text>
          <Text style={styles.pageSub}>INSTANT · ZERO FEE · SECURE</Text>
        </View>

        {/* Balance card */}
        <GradientCard style={styles.balanceCard}>
          <Text style={styles.cardLabel}>VAULT BALANCE</Text>
          <Text style={styles.cardBalance}>₹4,82,930</Text>
          <View style={styles.cardActions}>
            {[
              { Icon: Send, label: 'SEND', onPress: () => setMode('send') },
              { Icon: QrCode, label: 'QR PAY', onPress: () => setMode('qr') },
              { Icon: Download, label: 'REQUEST', onPress: () => { } },
            ].map(a => (
              <TouchableOpacity key={a.label} style={styles.cardAction} onPress={a.onPress}>
                <View style={styles.cardActionIcon}>
                  <a.Icon size={24} color={Colors.textWhite} strokeWidth={2.5} />
                </View>
                <Text style={styles.cardActionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </GradientCard>

        {/* Send money section */}
        <View style={styles.section}>
          <SectionHeader title="Send Money" />

          {/* Professional Tab Row with Lucide Icons */}
          <View style={styles.tabRow}>
            {(['contacts', 'phone', 'upi'] as const).map(t => {
              const Icon = t === 'contacts' ? Users : t === 'phone' ? Smartphone : Zap;
              const isActive = inputTab === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => setInputTab(t)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon size={16} color={isActive ? Colors.purple : Colors.textSecondary} strokeWidth={isActive ? 2.5 : 2} />
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {t === 'contacts' ? 'Contacts' : t === 'phone' ? 'Phone' : 'UPI'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* CONTACTS tab */}
          {inputTab === 'contacts' && (
            <>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search name or number…"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.subLabel}>RECENT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentsRow}>
                {CONTACTS.filter(c => c.recent).map(c => (
                  <TouchableOpacity key={c.id} style={styles.recentContact} onPress={() => handleSelectContact(c)}>
                    <View style={styles.recentAvatar}>
                      <Text style={{ fontSize: responsiveFont(20), fontWeight: '700', color: Colors.textPrimary }}>
                        {getInitials(c.name)}
                      </Text>
                    </View>
                    <Text style={styles.recentName}>{c.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.subLabel}>ALL CONTACTS</Text>
              {filteredContacts.map(c => (
                <TouchableOpacity key={c.id} style={styles.contactRow} onPress={() => handleSelectContact(c)}>
                  <View style={styles.contactAvatar}>
                    <Text style={{ fontSize: responsiveFont(16), fontWeight: '700', color: Colors.textPrimary }}>
                      {getInitials(c.name)}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{c.name}</Text>
                    <Text style={styles.contactPhone}>{c.phone}</Text>
                  </View>
                  <ChevronRight size={20} color={Colors.purple} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* PHONE tab */}
          {inputTab === 'phone' && (
            <View style={{ gap: Spacing.md }}>
              <View style={styles.phoneRow}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  placeholder="Enter mobile number"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
              <TouchableOpacity
                style={[styles.proceedBtn, phoneInput.length !== 10 && styles.proceedBtnDisabled]}
                disabled={phoneInput.length !== 10}
                onPress={() => { setSelectedContact(null); setMode('send'); }}
              >
                <Text style={styles.proceedBtnText}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* UPI tab */}
          {inputTab === 'upi' && (
            <View style={{ gap: Spacing.md }}>
              <TextInput
                style={styles.upiInput}
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="Enter UPI ID  e.g. name@bodhi"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.proceedBtn, !phoneInput.includes('@') && styles.proceedBtnDisabled]}
                disabled={!phoneInput.includes('@')}
                onPress={() => { setSelectedContact(null); setMode('send'); }}
              >
                <Text style={styles.proceedBtnText}>VERIFY & CONTINUE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Recent transactions */}
        <View style={styles.section}>
          <SectionHeader title="Recent" />
          {RECENT_TRANSACTIONS.map(tx => (
            <TouchableOpacity
              key={tx.id}
              style={styles.txRow}
              onPress={() => {
                const c = CONTACTS.find(x => x.name === tx.name);
                if (c) handleSelectContact(c);
              }}
            >
              <View style={styles.txAvatar}>
                {tx.isService ? (
                  <Tv size={20} color={Colors.textPrimary} />
                ) : (
                  <Text style={{ fontSize: responsiveFont(16), fontWeight: '700', color: Colors.textPrimary }}>
                    {getInitials(tx.name)}
                  </Text>
                )}
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txName}>{tx.name}</Text>
                <Text style={styles.txTime}>{tx.time}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.txAmount, { color: tx.type === 'received' ? Colors.green : Colors.textPrimary }]}>
                  {tx.type === 'received' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                </Text>
                <View style={[styles.txPill, { backgroundColor: tx.type === 'received' ? '#DCFCE7' : Colors.bg }]}>
                  <Text style={[styles.txPillText, { color: tx.type === 'received' ? Colors.green : Colors.textSecondary }]}>
                    {tx.type.toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        </View>
      </ScrollView>

      <BottomNav active={activeTab} onPress={onNavigate} />
    </LinearGradient>
  );
};

// ─── styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 32 },

  homeHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  pageHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  pageTitle: { fontSize: responsiveFont(32), fontWeight: '900', color: '#FFF' },
  pageSub: { fontSize: responsiveFont(12), color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginTop: 4, fontWeight: '700' },

  balanceCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.xl, height: 180 },
  cardLabel: { fontSize: responsiveFont(11), color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, marginBottom: 4, fontWeight: '800' },
  cardBalance: { fontSize: responsiveFont(36), fontWeight: '900', color: '#FFF', marginBottom: Spacing.lg },
  cardActions: { flexDirection: 'row', justifyContent: 'space-around' },
  cardAction: { alignItems: 'center' },
  cardActionIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  cardActionLabel: { fontSize: responsiveFont(11), color: '#FFF', fontWeight: '800', letterSpacing: 0.5 },

  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },

  tabRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg, padding: 4, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  tabText: { fontSize: responsiveFont(13), color: 'rgba(255,255,255,0.4)', fontWeight: '700' },
  tabTextActive: { color: Colors.neonLime, fontWeight: '800' },

  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    padding: 16, fontSize: responsiveFont(15), color: '#FFF',
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  subLabel: {
    fontSize: responsiveFont(11), color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5, fontWeight: '800', marginBottom: Spacing.md,
  },

  recentsRow: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  recentContact: { alignItems: 'center', marginRight: 20, width: 64 },
  recentAvatar: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1.5, borderColor: Colors.neonLime,
  },
  recentName: { fontSize: responsiveFont(12), color: 'rgba(255,255,255,0.6)', fontWeight: '700', textAlign: 'center' },

  contactRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20,
    padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  contactAvatar: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  contactInfo: { flex: 1 },
  contactName: { fontSize: responsiveFont(16), fontWeight: '700', color: '#FFF' },
  contactPhone: { fontSize: responsiveFont(13), color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  phoneRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  countryCode: {
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)', justifyContent: 'center',
  },
  countryCodeText: { fontSize: responsiveFont(15), color: '#FFF', fontWeight: '700' },
  phoneInput: { flex: 1, padding: 16, fontSize: responsiveFont(16), color: '#FFF', fontWeight: '600' },
  upiInput: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    padding: 16, fontSize: responsiveFont(16), color: '#FFF', fontWeight: '600', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
  },

  txRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 20,
    padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  txAvatar: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  txInfo: { flex: 1 },
  txName: { fontSize: responsiveFont(16), fontWeight: '700', color: '#FFF' },
  txTime: { fontSize: responsiveFont(13), color: 'rgba(255,255,255,0.3)', marginTop: 2 },
  txAmount: { fontSize: responsiveFont(16), fontWeight: '800' },
  txPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  txPillText: { fontSize: responsiveFont(10), fontWeight: '900', letterSpacing: 0.5 },

  // ── send ──
  sendHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12 },
  sendHeaderContact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sendHeaderName: { fontSize: responsiveFont(18), fontWeight: '800', color: '#FFF' },
  sendHeaderUpi: { fontSize: responsiveFont(13), color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  sendBody: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 },
  enterAmtLabel: { fontSize: responsiveFont(11), color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textAlign: 'center', marginBottom: 16, fontWeight: '800' },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  rupeeSymbol: { fontSize: responsiveFont(40), fontWeight: '300', color: '#FFF', marginRight: 8, marginBottom: 4 },
  amountInput: { fontSize: responsiveFont(64), fontWeight: '900', color: '#FFF', minWidth: 120, textAlign: 'center' },

  quickAmtsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 40 },
  quickAmtPill: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  quickAmtText: { fontSize: responsiveFont(14), color: Colors.neonLime, fontWeight: '700' },

  noteInput: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    padding: 16, fontSize: responsiveFont(16), color: '#FFF',
    marginBottom: 24, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  balanceInfo: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  balanceInfoText: { fontSize: responsiveFont(13), color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  balanceInfoAmt: { fontSize: responsiveFont(13), fontWeight: '800', color: '#FFF' },

  sendFooter: {
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  proceedBtn: {
    backgroundColor: Colors.neonLime, borderRadius: Radius.xl,
    padding: 18, alignItems: 'center',
  },
  proceedBtnDisabled: { opacity: 0.4 },
  proceedBtnText: { fontSize: responsiveFont(16), fontWeight: '900', color: '#000', letterSpacing: 1 },

  // ── confirm ──
  darkHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 16,
  },
  darkHeaderTitle: { fontSize: responsiveFont(20), fontWeight: '900', color: '#FFF' },

  confirmBody: { flexGrow: 1, alignItems: 'center', padding: 24, paddingBottom: 40 },
  confirmAvatarWrap: { marginBottom: 24 },
  confirmTo: { fontSize: responsiveFont(11), color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 8, fontWeight: '800' },
  confirmName: { fontSize: responsiveFont(28), fontWeight: '900', color: '#FFF' },
  confirmUpi: { fontSize: responsiveFont(14), color: 'rgba(255,255,255,0.4)', marginTop: 4, marginBottom: 24 },
  confirmAmountBox: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 32 },
  confirmCurrency: { fontSize: responsiveFont(28), fontWeight: '400', color: '#FFF', marginBottom: 12, marginRight: 4 },
  confirmAmount: { fontSize: responsiveFont(64), fontWeight: '900', color: '#FFF' },
  confirmNote: { fontSize: responsiveFont(16), color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', marginBottom: 40, textAlign: 'center' },
  confirmMeta: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24, padding: 20, gap: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  confirmMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confirmMetaLabel: { fontSize: responsiveFont(15), color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  confirmMetaValue: { fontSize: responsiveFont(15), fontWeight: '800', color: '#FFF' },

  confirmFooter: {
    flexDirection: 'row', gap: 16,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  editBtn: {
    flex: 1, padding: 18, borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  editBtnText: { fontSize: responsiveFont(16), color: '#FFF', fontWeight: '800' },
  payNowBtn: { flex: 2, backgroundColor: Colors.neonLime, borderRadius: Radius.xl, padding: 18, alignItems: 'center' },
  payNowBtnText: { fontSize: responsiveFont(16), fontWeight: '900', color: '#000', letterSpacing: 1 },

  // ── success ──
  successContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  successCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: Colors.neonLime,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },
  successTitle: { fontSize: responsiveFont(32), fontWeight: '900', color: '#FFF', marginBottom: 12 },
  successSub: { fontSize: responsiveFont(18), color: 'rgba(255,255,255,0.7)', marginBottom: 12, textAlign: 'center' },
  successNote: { fontSize: responsiveFont(14), color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, fontWeight: '700' },

  // ── QR ──
  qrContainer: { flex: 1 },
  qrHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 24,
  },
  qrHeaderTitle: { fontSize: responsiveFont(20), fontWeight: '900', color: '#FFF' },
  qrViewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  qrFrame: {
    width: W * 0.75, height: W * 0.75,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  qrCorner: { position: 'absolute', width: 40, height: 40, borderColor: Colors.neonLime, borderWidth: 4 },
  qrTL: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 20 },
  qrTR: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 20 },
  qrBL: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 20 },
  qrBR: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 20 },
  qrScanLine: { position: 'absolute', width: '90%', height: 3, backgroundColor: Colors.neonLime, opacity: 0.8 },
  qrMockGrid: { gap: 10 },
  qrCell: { width: 32, height: 32, backgroundColor: '#FFF', margin: 4, borderRadius: 6 },
  qrHint: { color: 'rgba(255,255,255,0.5)', marginTop: 40, fontSize: responsiveFont(15), textAlign: 'center', fontWeight: '600' },

  qrFooter: { padding: 24, paddingBottom: 60, gap: 16 },
  qrScanBtn: {
    backgroundColor: Colors.neonLime, borderRadius: Radius.xl,
    padding: 20, alignItems: 'center',
  },
  qrScanBtnText: { fontSize: responsiveFont(16), fontWeight: '900', color: '#000', letterSpacing: 1 },
  myQrBtn: {
    borderRadius: Radius.xl, padding: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  myQrBtnText: { fontSize: responsiveFont(14), color: '#FFF', fontWeight: '800', letterSpacing: 1 },

  // ── MY QR MODAL STYLES ──
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
  myQrCard: {
    width: W * 0.85,
    backgroundColor: '#12142d',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  closeQr: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  myQrHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  myQrAvatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.neonLime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  myQrAvatarText: {
    fontSize: responsiveFont(28),
    fontWeight: '900',
    color: '#000',
  },
  myQrName: {
    fontSize: responsiveFont(22),
    fontWeight: '900',
    color: '#FFF',
  },
  myQrId: {
    fontSize: responsiveFont(16),
    color: Colors.neonLime,
    marginTop: 6,
    fontWeight: '800',
  },
  realQrContainer: {
    width: 240,
    height: 240,
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  realQrImage: {
    width: 200,
    height: 200,
  },
  myQrFooter: {
    alignItems: 'center',
  },
  upiBadge: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  upiBadgeText: {
    fontSize: responsiveFont(14),
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
  },
  scanToPayText: {
    fontSize: responsiveFont(13),
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
});