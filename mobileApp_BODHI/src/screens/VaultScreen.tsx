import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  StatusBar,
  Alert,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import RazorpayCheckout from 'react-native-razorpay';
import { BASE_URL } from '../api/client';
import { BlurView } from '@react-native-community/blur';
import {
  Bell,
  ShieldCheck,
  EyeOff,
  Eye,
  ScanLine,
  Send,
  Plus,
  ArrowDownToLine,
  Smartphone,
  FileText,
  Plane,
  CreditCard,
  TrendingUp,
  PiggyBank,
  Landmark,
  ChevronRight,
  Calculator,
  ArrowDownRight,
  ArrowUpRight
} from 'lucide-react-native';

import { Colors, Spacing, Radius } from '../theme/tokens';
import { InsuranceScreen } from './InsuranceScreen';
import { MOCK_TRANSACTIONS } from '../data/mockTransactions';
import { NotificationAPI, UsersAPI } from '../api/client';
import { useCalculator } from '../context/CalculatorContext';

const { width: W } = Dimensions.get('window');

const QUICK_SERVICES = [
  { id: '1', label: 'Insurance Stories', icon: ShieldCheck, color: '#FF2D2D', route: 'InsuranceStories' },
  { id: '2', label: 'Subscriptions', icon: CreditCard, color: '#FF6A00', route: 'SubscriptionHub' },
  { id: '3', label: 'Calculator', icon: Calculator, color: '#FFB000' },
  { id: '4', label: 'History', icon: FileText, color: '#34c759', route: 'TransactionHistory' },
  { id: '5', label: 'Mobile Recharge', icon: Smartphone, color: '#3D4DFF' },
  { id: '6', label: 'Utility Bills', icon: FileText, color: '#FFE600' },
  { id: '7', label: 'Travel Booking', icon: Plane, color: '#FF5A00', route: 'TravelBooking' },

];

export function VaultScreen() {
  const navigation = useNavigation<any>();
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [showInsurance, setShowInsurance] = useState(false);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userName, setUserName] = useState('User');
  const [userInitial, setUserInitial] = useState('U');
  const [hasPassword, setHasPassword] = useState(true);

  // Razorpay / Balance State
  const [balance, setBalance] = useState('0.00');
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [amountToAdd, setAmountToAdd] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Password Modal State
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [uPin, setUPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const { toggleCalculator } = useCalculator();

  const fetchUserData = useCallback(async () => {
    try {
      const storedName = await AsyncStorage.getItem('user_full_name');
      if (storedName) {
        setUserName(storedName.split(' ')[0]);
        setUserInitial(storedName.charAt(0).toUpperCase());
      }
      const profile = await UsersAPI.fetchProfile();
      setHasPassword(profile.has_password);
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${BASE_URL}/transfers/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance.toFixed(2));
        setUserName(data.full_name.split(' ')[0] || 'User');
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const notifications = await NotificationAPI.fetchNotifications();
      const unread = notifications.filter((n: any) => !n.is_read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
      fetchUserData();
      fetchBalance();
    }, [fetchUnreadCount, fetchUserData, fetchBalance])
  );

  const sourceTransactions = MOCK_TRANSACTIONS;
  const today = new Date().toISOString().split('T')[0];
  const todayGrowth = sourceTransactions
    .filter(t => t.date.startsWith(today))
    .reduce((acc, t) => t.type.toLowerCase() === 'credit' ? acc + t.amount : acc - t.amount, 0);

  const foodSpending = sourceTransactions
    .filter(t => t.category === 'Food' || t.category === 'Groceries')
    .reduce((acc, t) => acc + t.amount, 0);
  const entertainmentSpending = sourceTransactions
    .filter(t => t.category === 'Entertainment')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalIncome = sourceTransactions.filter(t => t.type.toLowerCase() === 'credit').reduce((acc, t) => acc + t.amount, 0);
  const totalExpenses = sourceTransactions.filter(t => t.type.toLowerCase() === 'debit').reduce((acc, t) => acc + t.amount, 0);
  const savingsRate = totalIncome > 0 ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1) : '0';

  const dynamicInsights = [
    { id: '1', type: 'FOOD', title: 'Food & Groceries', value: `₹${foodSpending.toLocaleString('en-IN')}`, sub: 'spent closely over 90 days', icon: TrendingUp, bg: ['#8B0000', '#FF5A00'] },
    { id: '2', type: 'SUBS', title: 'You can save', value: `₹${entertainmentSpending.toLocaleString('en-IN')}`, sub: 'annually cutting subscriptions', icon: PiggyBank, bg: ['#FF5A00', '#FF007F'] },
    { id: '3', type: 'SAVE', title: 'Savings Rate', value: `${savingsRate}%`, sub: 'of income kept over 90 days', icon: TrendingUp, bg: ['#0052D4', '#4364F7'] },
  ];

  const renderInsightDetails = () => {
    if (!activeInsight) return null;
    let filtered: any[] = [];
    let title = '';
    if (activeInsight === 'FOOD') {
      title = "Food & Groceries Breakdown";
      filtered = sourceTransactions.filter(t => t.category === 'Food' || t.category === 'Groceries');
    } else if (activeInsight === 'SUBS') {
      title = "Entertainment Breakdown";
      filtered = sourceTransactions.filter(t => t.category === 'Entertainment');
    } else {
      title = "Quarterly Cash Flow";
      filtered = sourceTransactions;
    }

    return (
      <View style={styles.insightModalBg}>
        <View style={styles.insightModalContent}>
          <View style={styles.insightModalHeader}>
            <Text style={styles.insightModalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('QuickServices')}>
              <Text style={styles.viewAll}>View All ›</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(t) => t.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isCredit = item.type.toLowerCase() === 'credit';
              return (
                <View style={styles.insightRow}>
                  <View style={styles.insightRowLeft}>
                    <View style={[styles.insightIconCircle, { backgroundColor: isCredit ? 'rgba(200,255,0,0.1)' : 'rgba(255,255,255,0.05)' }]}>
                      {isCredit ? (
                        <ArrowDownRight size={18} color="#FFE600" />
                      ) : (
                        <ArrowUpRight size={18} color="#FFF" />
                      )}
                    </View>
                    <View style={styles.insightTextWrap}>
                      <Text style={styles.insightRowMerchant} numberOfLines={1}>{item.merchant}</Text>
                      <Text style={styles.insightRowCategory} numberOfLines={1}>
                        {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {item.category}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.insightRowRight}>
                    <Text style={[styles.insightRowAmount, { color: isCredit ? '#FFE600' : '#FFF' }]} numberOfLines={1}>
                      {isCredit ? '+' : '-'}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    );
  };

  const handleToggleBalance = () => {
    if (balanceVisible) {
      setBalanceVisible(false);
    } else {
      setUPin('');
      setIsPasswordModalVisible(true);
    }
  };

  const verifyBalanceUpin = async () => {
    if (!uPin) {
      Alert.alert("Required", "Please enter your U-PIN to view the balance.");
      return;
    }
    setIsVerifying(true);
    try {
      await UsersAPI.verifyUpin(uPin);
      setBalanceVisible(true);
      setIsPasswordModalVisible(false);
    } catch (error: any) {
      Alert.alert("Verification Failed", error.response?.data?.detail || "Incorrect U-PIN.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddMoney = async () => {
    if (!amountToAdd || parseFloat(amountToAdd) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    setIsProcessing(true);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${BASE_URL}/transfers/razorpay/create-order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amountToAdd), currency: 'INR', description: 'BODHI Wallet Top-up' })
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.detail || 'Failed to create order');

      const options = {
        description: 'BODHI Wallet Top-up',
        image: 'https://i.imgur.com/3g7nmJC.png',
        currency: orderData.currency,
        key: orderData.key_id,
        amount: orderData.amount,
        name: 'BODHI',
        order_id: orderData.order_id,
        theme: { color: '#FF5A00' }
      };

      RazorpayCheckout.open(options).then(async (data: any) => {
        const verifyRes = await fetch(`${BASE_URL}/transfers/razorpay/verify-and-credit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: data.razorpay_order_id,
            razorpay_payment_id: data.razorpay_payment_id,
            razorpay_signature: data.razorpay_signature,
            amount: parseFloat(amountToAdd)
          })
        });
        const verifyData = await verifyRes.json();
        if (verifyRes.ok) {
          Alert.alert('Success', verifyData.message);
          setAmountToAdd('');
          setShowAddMoney(false);
          fetchBalance();
        } else {
          Alert.alert('Verification Failed', verifyData.detail || 'Payment was not credited.');
        }
      }).catch((error: any) => {
        Alert.alert('Payment Failed', error.description || 'Payment was cancelled or failed.');
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good Morning';
    if (hr < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
          {/* ── HERO SECTION ── */}
          <LinearGradient
            colors={['#1A0000', '#8B0000', '#FF4D00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroSection}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Profile')}
                style={styles.avatarContainer}
              >
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{userInitial}</Text>
                </View>
                <View style={styles.onlineDot} />
              </TouchableOpacity>

              <Image
                source={require('../../assets/images/bodhi-logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />

              <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
                <View style={styles.glassCircleContainer}>
                  {Platform.OS === 'ios' ? (
                    <BlurView blurType="light" blurAmount={10} style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                  )}
                  <Bell size={20} color="#FFF" />
                  {unreadCount > 0 && <View style={styles.notifBadge} />}
                </View>
              </TouchableOpacity>
            </View>

            {/* Compact Balance Card */}
            <View style={styles.balanceArea}>
              <Text style={styles.greeting}>{getGreeting()}, {userName} 👋</Text>

              <View style={styles.netWorthHeader}>
                <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
                <TouchableOpacity onPress={handleToggleBalance} style={styles.revealBtn}>
                  {balanceVisible ? <Eye size={14} color="#FFF" /> : <EyeOff size={14} color="#FFF" />}
                </TouchableOpacity>
              </View>

              <View style={styles.balanceRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <Text style={styles.balanceMain}>{balanceVisible ? balance.split('.')[0] : '••••••'}</Text>
                <Text style={styles.balanceDecimals}>{balanceVisible ? `.${balance.split('.')[1] || '00'}` : ''}</Text>
              </View>

              <View style={styles.growthRow}>
                <TrendingUp size={14} color={todayGrowth >= 0 ? Colors.neonLime : '#FF4B4B'} />
                <Text style={[styles.growthTxt, { color: todayGrowth >= 0 ? Colors.neonLime : '#FF4B4B' }]}>
                  {todayGrowth >= 0 ? '+' : ''}₹{todayGrowth.toLocaleString('en-IN')} today
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* ── PRIMARY ACTIONS ── */}
          <View style={styles.parallelActions}>
            <TouchableOpacity
              style={styles.scanBtnContainer}
              onPress={() => navigation.navigate('ScanPay')}
              activeOpacity={0.9}
            >
              <View style={styles.scanGlassRing}>
                <LinearGradient colors={['#FF5A00', '#FFB000']} style={styles.scanBtn}>
                  <ScanLine size={24} color="#000" strokeWidth={2.5} />
                </LinearGradient>
              </View>
              <Text style={styles.scanBtnLabel}>Scan & Pay</Text>
            </TouchableOpacity>

        {/* ── MAIN CONTENT ── */}
        <View style={styles.contentSection}>
          {/* Quick Services */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Services</Text>
            <TouchableOpacity hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => navigation.navigate('QuickServices')}><Text style={styles.viewAll}>View All ›</Text></TouchableOpacity>
          </View>

          <View style={styles.servicesGrid}>
            {QUICK_SERVICES.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.serviceItem}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.label === 'Calculator' || item.id === '3') {
                    toggleCalculator();
                    return;
                  }
                  if (item.route === 'InsuranceStories') {
                    setShowInsurance(true);
                  } else if (item.route) {
                    navigation.navigate(item.route);
                  } else {
                    Alert.alert('Coming Soon', `${item.label} feature is under development.`);
                  }
                }}
              >
                <View style={styles.serviceIconWrap}>
                  <item.icon size={22} color={item.color} strokeWidth={2.5} />
            {/* Right: Pill Container */}
            <View style={styles.actionPillContainer}>
              {Platform.OS === 'ios' ? (
                <BlurView blurType="dark" blurAmount={32} style={StyleSheet.absoluteFill} pointerEvents="none" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} pointerEvents="none" />
              )}
              <TouchableOpacity style={styles.pillItem} onPress={() => navigation.navigate('SendMoney')}>
                <View style={styles.pillIconGlass}>
                  <Send size={18} color="#FFF" />
                </View>
                <Text style={styles.actionBtnLabel}>Send</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pillItem} onPress={() => setShowAddMoney(true)} activeOpacity={0.7}>
                <View style={styles.actionBtnCircle}>
                  <Plus size={20} color="#FFF" strokeWidth={3} />
                </View>
                <Text style={styles.actionBtnLabel}>Add</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pillItem} onPress={() => navigation.navigate('RequestMoney')} activeOpacity={0.7}>
                <View style={styles.actionBtnCircle}>
                  <ArrowDownToLine size={18} color="#FFF" strokeWidth={2.5} />
                </View>
                <Text style={styles.actionBtnLabel}>Request</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── MAIN CONTENT ── */}
          <View style={styles.contentSection}>
            {/* Quick Services */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Services</Text>
              <TouchableOpacity><Text style={styles.viewAll}>View All ›</Text></TouchableOpacity>
            </View>

            <View style={styles.servicesGrid}>
              {QUICK_SERVICES.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.serviceItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.label === 'Calculator' || item.id === '3') {
                      toggleCalculator();
                      return;
                    }
                    if (item.route === 'InsuranceStories') {
                      setShowInsurance(true);
                    } else if (item.route) {
                      navigation.navigate(item.route);
                    } else {
                      Alert.alert('Coming Soon', `${item.label} feature is under development.`);
                    }
                  }}
                >
                  <View style={styles.serviceIconWrap}>
                    <item.icon size={22} color={item.color} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.serviceLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>


            {/* AI Insights */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AI Insights</Text>
              <TouchableOpacity><Text style={styles.viewAll}>View All ›</Text></TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.insightsScroll}>
              {dynamicInsights.map((insight) => (
                <LinearGradient
                  key={insight.id}
                  colors={insight.bg}
                  style={styles.insightCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.insightIconWrap}>
                    <insight.icon size={18} color="#FFF" />
                  </View>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <Text style={styles.insightValue}>{insight.value}</Text>
                  <Text style={styles.insightSub}>{insight.sub}</Text>
                  <TouchableOpacity style={styles.insightLinkRow} onPress={() => setActiveInsight(insight.type)}>
                    <Text style={styles.insightLink}>View Details</Text>
                    <ChevronRight size={14} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                </LinearGradient>
              ))}
            </ScrollView>

            {/* Accounts */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Accounts</Text>
              <TouchableOpacity style={styles.addAccountBtn} onPress={() => navigation.navigate('BankAccounts')}>
                <Text style={styles.addAccountText}>+ Add Account</Text>
              </TouchableOpacity>
            </View>

            {/* Transaction History Banner */}

            {/* Transaction History Banner */}
            <TouchableOpacity
              style={[styles.accountCard, { marginTop: 24, justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.05)', borderColor: 'rgba(255,90,0,0.2)' }]}
              onPress={() => navigation.navigate('TransactionHistory')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <FileText size={20} color="#FF5A00" />
                <Text style={{ color: '#FF5A00', fontSize: responsiveFont(16), fontWeight: '700' }}>View Transaction History</Text>
              </View>
              <ChevronRight size={20} color="#FF5A00" style={{ position: 'absolute', right: 20 }} />
            </TouchableOpacity>

            <View style={{ height: 150 }} />
          </View>
        </View>
      </ScrollView>

      {/* ── INSURANCE MODAL MOUNTED HERE ── */}
      <InsuranceScreen
        visible={showInsurance}
        onClose={() => setShowInsurance(false)}
      />

      {/* ── DYNAMIC INSIGHTS MODAL ── */}
      <Modal visible={!!activeInsight} animationType="slide" transparent onRequestClose={() => setActiveInsight(null)}>
        {renderInsightDetails()}
      </Modal>

      {/* ── ADD MONEY MODAL ── */}
      <Modal visible={showAddMoney} transparent animationType="slide" onRequestClose={() => { }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetModalOverlay}
        >
          <View style={styles.sheetModalSheet}>
            <View style={styles.sheetModalHeader}>
              <Text style={styles.sheetModalTitle}>Add Money to Wallet</Text>
              <TouchableOpacity onPress={() => setShowAddMoney(false)}>
                <Text style={{ color: '#FFF', fontSize: responsiveFont(24) }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>AMOUNT (₹)</Text>
            <TextInput
              style={styles.input}
              value={amountToAdd}
              onChangeText={setAmountToAdd}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus
            />
            <TouchableOpacity onPress={handleAddMoney} disabled={isProcessing || !amountToAdd} style={{ opacity: isProcessing || !amountToAdd ? 0.6 : 1, marginTop: 16 }}>
              <LinearGradient colors={['#FF5A00', '#FFB000']} style={styles.payBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {isProcessing ? <ActivityIndicator color="#000" /> : <Text style={[styles.payBtnText, { color: '#000' }]}>PROCEED TO PAY</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Security Password Modal ─── */}
      <Modal
        visible={isPasswordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.securityModalOverlay}
        >
          <View style={styles.securityModalContent}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="dark" blurAmount={30} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)' }]} />
            )}
            <View style={styles.securityModalHeader}>
              <ShieldCheck size={24} color={Colors.neonLime} />
              <Text style={styles.securityModalTitle}>Enter U-PIN</Text>
              <Text style={styles.securityModalSub}>
                Enter your 4-digit transaction U-PIN to reveal your balance.
              </Text>
            </View>
            <View style={styles.modalInputWrapper}>
              <TextInput
                style={styles.modalInput}
                value={uPin}
                onChangeText={setUPin}
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
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsPasswordModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { opacity: uPin.length === 4 ? 1 : 0.5 }]} onPress={verifyBalanceUpin} disabled={isVerifying || uPin.length < 4}>
                {isVerifying ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.modalConfirmText}>Verify</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05001F' },
  securityModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 },
  securityModalContent: { borderRadius: 32, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', width: '100%', maxWidth: isTablet ? (isLandscape() ? 500 : 400) : '100%', alignSelf: 'center' },
  securityModalHeader: { alignItems: 'center', marginBottom: 24 },
  securityModalTitle: { color: '#FFF', fontSize: responsiveFont(20), fontWeight: '700', marginTop: 12 },
  securityModalSub: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(14), textAlign: 'center', marginTop: 8, lineHeight: 20 },
  // Common Modal Styles
  modalOverlayBottom: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalHeaderCommon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: responsiveFont(20), fontWeight: '700' },


  // U-PIN Modal
  modalContentUPin: { borderRadius: 32, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', width: '100%', maxWidth: isTablet ? (isLandscape() ? 500 : 400) : '100%', alignSelf: 'center' },
  modalHeaderUPin: { alignItems: 'center', marginBottom: 24 },
  modalSub: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(14), textAlign: 'center', marginTop: 8, lineHeight: 20 },
  modalInputWrapper: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 24 },
  modalInput: { height: 56, paddingHorizontal: 20, color: '#FFF', fontSize: responsiveFont(16), textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(16), fontWeight: '600' },
  modalConfirm: { flex: 1.5, height: 50, backgroundColor: Colors.neonLime, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { color: '#000', fontSize: responsiveFont(16), fontWeight: '700' },

  // Hero Section
  heroSection: {
    paddingTop: 58,
    paddingBottom: 65,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    zIndex: 10
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 44 },
  avatarContainer: { position: 'relative' },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { fontSize: responsiveFont(20), fontWeight: '800', color: '#FFF' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#34c759', borderWidth: 2, borderColor: '#000000' },
  logo: { height: 30, width: 120, tintColor: '#FFF' },
  iconBtn: { overflow: 'hidden', borderRadius: 22 },
  glassCircleContainer: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  notifBadge: {
    position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5A00',
  },

  balanceArea: { marginBottom: 0 },
  greeting: { color: 'rgba(255,255,255,0.9)', fontSize: responsiveFont(18), fontWeight: '700', marginBottom: 12 },
  netWorthHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  netWorthLabel: { color: 'rgba(255,255,255,0.6)', fontSize: responsiveFont(12), fontWeight: '800', letterSpacing: 1.2 },
  revealBtn: { marginLeft: 10, opacity: 0.6 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', marginVertical: 2 },
  currencySymbol: { color: '#FFF', fontSize: responsiveFont(26), fontWeight: '400', marginRight: 6 },
  balanceMain: { color: '#FFF', fontSize: responsiveFont(48), fontWeight: '900', letterSpacing: -1 },
  balanceDecimals: { color: 'rgba(255,255,255,0.7)', fontSize: responsiveFont(22), fontWeight: '700' },
  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  growthTxt: { color: '#FFE600', fontSize: responsiveFont(12), fontWeight: '800' },

  parallelActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -42, paddingHorizontal: 20, zIndex: 20 },
  scanBtnContainer: { alignItems: 'center', gap: 6 },
  scanGlassRing: { padding: 4, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  scanBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.neonLime, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 },
  scanLabel: { color: Colors.neonLime, fontSize: 10, fontWeight: '800', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  actionPillContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 84,
    borderRadius: 42,
    marginLeft: 16,
    paddingHorizontal: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  scanBtnLabel: { color: '#FF5A00', fontSize: responsiveFont(12), fontWeight: '900', marginTop: 10, letterSpacing: -0.2 },
  pillIconGlass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLabel: { color: 'rgba(255,255,255,0.85)', fontSize: responsiveFont(11), fontWeight: '700', marginTop: 6 },

  // Content
  contentSection: { paddingHorizontal: 20, paddingTop: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 24 },
  sectionTitle: { color: '#FFF', fontSize: responsiveFont(18), fontWeight: '700' },
  viewAll: { color: '#FF5A00', fontSize: responsiveFont(13), fontWeight: '600' },

  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, paddingHorizontal: isTablet ? 20 : 0 },
  serviceItem: { width: isTablet ? '18%' : '23%', alignItems: 'center', gap: 8, marginBottom: 16 },
  serviceIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#0F0F0F', alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { color: '#FFF', fontSize: responsiveFont(11), textAlign: 'center', fontWeight: '600' },


  insightsScroll: { paddingRight: 20, gap: 16 },
  insightCard: { width: 155, minHeight: 180, borderRadius: 20, padding: 16, justifyContent: 'space-between' },
  insightIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  insightTitle: { color: 'rgba(255,255,255,0.8)', fontSize: responsiveFont(12), marginTop: 12 },
  insightValue: { color: '#FFF', fontSize: responsiveFont(21), fontWeight: '800', marginVertical: 4 },
  insightSub: { color: 'rgba(255,255,255,0.8)', fontSize: responsiveFont(11), lineHeight: 16 },
  insightLinkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  insightLink: { color: 'rgba(255,255,255,0.7)', fontSize: responsiveFont(11), fontWeight: '600', marginRight: 4 },

  addAccountBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,90,0,0.12)' },
  addAccountText: { color: '#FF5A00', fontSize: responsiveFont(12), fontWeight: '700' },
  accountCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0F0F0F', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  accountLeft: { flexDirection: 'row', alignItems: 'center' },
  bankLogoWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bankName: { color: '#FFF', fontSize: responsiveFont(15), fontWeight: '600', marginBottom: 4 },
  bankDetail: { color: 'rgba(255,255,255,0.6)', fontSize: responsiveFont(12) },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  primaryTag: { backgroundColor: 'rgba(212,255,0,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  primaryTagText: { color: Colors.neonLime, fontSize: responsiveFont(10), fontWeight: '700' },
  accountRight: { flexDirection: 'row', alignItems: 'center' },
  accountBalance: { color: '#FFF', fontSize: responsiveFont(15), fontWeight: '700' },
  paginationDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { width: 16, backgroundColor: '#FF5A00' },

  sheetModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetModalSheet: { backgroundColor: '#0F0A20', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)', width: '100%', maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center' },
  sheetModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetModalTitle: { color: '#FFF', fontSize: responsiveFont(20), fontWeight: '700' },
  inputLabel: { color: 'rgba(255,255,255,0.6)', fontSize: responsiveFont(11), fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16, color: '#FFF', fontSize: responsiveFont(18), fontWeight: '600', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  payBtn: { borderRadius: 30, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  payBtnText: { fontSize: responsiveFont(15), fontWeight: '800', letterSpacing: 0.5 },
  // Insight Details Modal Specs
  insightModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  insightModalContent: { backgroundColor: '#0A0A14', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40, maxHeight: '70%', width: '100%', maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center' },
  insightModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  insightModalTitle: { color: '#FFF', fontSize: responsiveFont(18), fontWeight: '700' },
  modalCloseBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16 },
  modalCloseText: { color: '#FFF', fontSize: responsiveFont(14), fontWeight: '600' },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  insightRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  insightIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  insightTextWrap: { flex: 1 },
  insightRowMerchant: { color: '#FFF', fontSize: responsiveFont(16), fontWeight: '600', marginBottom: 4 },
  insightRowCategory: { color: 'rgba(255,255,255,0.5)', fontSize: responsiveFont(12) },
  insightRowRight: { alignItems: 'flex-end', flexShrink: 0 },
  insightRowAmount: { fontSize: responsiveFont(16), fontWeight: '800' }
});
