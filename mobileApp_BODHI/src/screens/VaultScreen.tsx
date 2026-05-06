/* --------------- VaultScreen.tsx – Clean Soft‑UI redesign --------------- */
import React, { useState, useCallback } from 'react';
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
import {
  isTablet,
  isLandscape,
  responsiveFont,
  responsiveWidth,
  responsiveHeight,
} from '../utils/responsive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import RazorpayCheckout from 'react-native-razorpay';
import { BASE_URL } from '../api/client';
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
  ArrowUpRight,
} from 'lucide-react-native';

import { Colors, Spacing, Radius } from '../theme/tokens';
import { InsuranceScreen } from './InsuranceScreen';
import { MOCK_TRANSACTIONS } from '../data/mockTransactions';
import { NotificationAPI, UsersAPI } from '../api/client';
import { useCalculator } from '../context/CalculatorContext';

/* ----------------------------- Constants ----------------------------- */
const PRIMARY_COLOR = '#bab7b5a2'; // muted peachy-tan for RHS actions
const SCAN_PAY_COLOR = '#c7dc54ff'; // standout crimson red for Scan & Pay
const QUICK_SERVICES = [
  {
    id: '1',
    label: 'Insurance Stories',
    icon: ShieldCheck,
    color: '#b9a7b4ff', // Neon Orange
    route: 'InsuranceStories',
  },
  {
    id: '2',
    label: 'Subscriptions',
    icon: CreditCard,
    color: '#867363ff', // Bright Yellow
    route: 'SubscriptionHub',
  },
  {
    id: '3',
    label: 'Calculator',
    icon: Calculator,
    color: '#63806fff', // Lime Green
  },
  {
    id: '4',
    label: 'History',
    icon: FileText,
    color: '#a8c8cfff', // Vivid Blue
    route: 'TransactionHistory',
  },
  {
    id: '5',
    label: 'Mobile Recharge',
    icon: Smartphone,
    color: '#6c7a9fff',
  },
  {
    id: '6',
    label: 'Utility Bills',
    icon: FileText,
    color: '#cdcaadff',
  },
  {
    id: '7',
    label: 'Travel Booking',
    icon: Plane,
    color: '#e6a5a5ff', // use primary color for consistency
    route: 'TravelBooking',
  },
];

/* ---------------------------- Component ----------------------------- */
export function VaultScreen() {
  const navigation = useNavigation<any>();
  const openProfile = () => {
    const parentNav = navigation.getParent?.();
    if (parentNav) {
      parentNav.navigate('Profile');
      return;
    }
    navigation.navigate('Profile');
  };
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
      console.error('Failed to fetch user data:', error);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      const res = await fetch(`${BASE_URL}/transfers/balance`, {
        headers: { Authorization: `Bearer ${token}` },
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
      console.error('Failed to fetch unread count:', error);
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
    .filter((t) => t.date.startsWith(today))
    .reduce((acc, t) => (t.type.toLowerCase() === 'credit' ? acc + t.amount : acc - t.amount), 0);

  const foodSpending = sourceTransactions
    .filter((t) => t.category === 'Food' || t.category === 'Groceries')
    .reduce((acc, t) => acc + t.amount, 0);
  const entertainmentSpending = sourceTransactions
    .filter((t) => t.category === 'Entertainment')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalIncome = sourceTransactions
    .filter((t) => t.type.toLowerCase() === 'credit')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpenses = sourceTransactions
    .filter((t) => t.type.toLowerCase() === 'debit')
    .reduce((acc, t) => acc + t.amount, 0);
  const savingsRate =
    totalIncome > 0 ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1) : '0';

  const dynamicInsights = [
    {
      id: '1',
      type: 'FOOD',
      title: 'Food & Groceries',
      value: `₹${foodSpending.toLocaleString('en-IN')}`,
      sub: 'spent closely over 90 days',
      icon: TrendingUp,
    },
    {
      id: '2',
      type: 'SUBS',
      title: 'You can save',
      value: `₹${entertainmentSpending.toLocaleString('en-IN')}`,
      sub: 'annually cutting subscriptions',
      icon: PiggyBank,
    },
    {
      id: '3',
      type: 'SAVE',
      title: 'Savings Rate',
      value: `${savingsRate}%`,
      sub: 'of income kept over 90 days',
      icon: TrendingUp,
    },
  ];

  const renderInsightDetails = () => {
    if (!activeInsight) return null;
    let filtered: any[] = [];
    let title = '';

    if (activeInsight === 'FOOD') {
      title = 'Food & Groceries Breakdown';
      filtered = sourceTransactions.filter((t) => t.category === 'Food' || t.category === 'Groceries');
    } else if (activeInsight === 'SUBS') {
      title = 'Entertainment Breakdown';
      filtered = sourceTransactions.filter((t) => t.category === 'Entertainment');
    } else {
      title = 'Quarterly Cash Flow';
      filtered = sourceTransactions;
    }

    return (
      <View style={styles.insightModalBg}>
        <View style={styles.insightModalContent}>
          <View style={styles.insightModalHeader}>
            <Text style={styles.insightModalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => {
              setActiveInsight(null);
              navigation.navigate('TransactionHistory');
            }}>
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
                    <View
                      style={[
                        styles.insightIconCircle,
                        {
                          backgroundColor: isCredit
                            ? 'rgba(200,255,0,0.1)'
                            : 'rgba(255,255,255,0.05)',
                        },
                      ]}
                    >
                      {isCredit ? (
                        <ArrowDownRight size={18} color="#FFE600" />
                      ) : (
                        <ArrowUpRight size={18} color="#FFF" />
                      )}
                    </View>

                    <View style={styles.insightTextWrap}>
                      <Text style={styles.insightRowMerchant} numberOfLines={1}>
                        {item.merchant}
                      </Text>
                      <Text style={styles.insightRowCategory} numberOfLines={1}>
                        {new Date(item.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        • {item.category}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.insightRowRight}>
                    <Text
                      style={[
                        styles.insightRowAmount,
                        { color: isCredit ? '#FFE600' : '#555' },
                      ]}
                      numberOfLines={1}
                    >
                      {isCredit ? '+' : '-'}₹
                      {item.amount.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
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
      Alert.alert('Required', 'Please enter your U‑PIN to view the balance.');
      return;
    }
    setIsVerifying(true);
    try {
      await UsersAPI.verifyUpin(uPin);
      setBalanceVisible(true);
      setIsPasswordModalVisible(false);
    } catch (error: any) {
      Alert.alert('Verification Failed', error.response?.data?.detail || 'Incorrect U‑PIN.');
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amountToAdd),
          currency: 'INR',
          description: 'BODHI Wallet Top‑up',
        }),
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.detail || 'Failed to create order');

      const options = {
        description: 'BODHI Wallet Top‑up',
        image: 'https://i.imgur.com/3g7nmJC.png',
        currency: orderData.currency,
        key: orderData.key_id,
        amount: orderData.amount,
        name: 'BODHI',
        order_id: orderData.order_id,
        theme: { color: PRIMARY_COLOR },
      };

      RazorpayCheckout.open(options)
        .then(async (data: any) => {
          const verifyRes = await fetch(`${BASE_URL}/transfers/razorpay/verify-and-credit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: data.razorpay_order_id,
              razorpay_payment_id: data.razorpay_payment_id,
              razorpay_signature: data.razorpay_signature,
              amount: parseFloat(amountToAdd),
            }),
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
        })
        .catch((error: any) => {
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
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.container}>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.header}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={openProfile}
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
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation.navigate('Notifications')}
              >
                <View style={styles.iconWrapper}>
                  <Bell size={20} color="#000" />
                  {unreadCount > 0 && <View style={styles.notifBadge} />}
                </View>
              </TouchableOpacity>
            </View>

            {/* Balance Card */}
            <View style={styles.balanceCard}>
              <Text style={styles.greeting}>
                {getGreeting()}, {userName} 👋
              </Text>
              <View style={styles.netWorthHeader}>
                <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
                <TouchableOpacity onPress={handleToggleBalance} style={styles.revealBtn}>
                  {balanceVisible ? <Eye size={14} color="#000" /> : <EyeOff size={14} color="#000" />}
                </TouchableOpacity>
              </View>

              <View style={styles.balanceRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <Text style={styles.balanceMain}>
                  {balanceVisible ? balance.split('.')[0] : '••••••'}
                </Text>
                <Text style={styles.balanceDecimals}>
                  {balanceVisible ? `.${balance.split('.')[1] || '00'}` : ''}
                </Text>
              </View>

              <View style={styles.growthRow}>
                <TrendingUp
                  size={14}
                  color={todayGrowth >= 0 ? Colors.neonLime : '#FF4B4B'}
                />
                <Text
                  style={[
                    styles.growthTxt,
                    { color: todayGrowth >= 0 ? Colors.neonLime : '#FF4B4B' },
                  ]}
                >
                  {todayGrowth >= 0 ? '+' : ''}₹{todayGrowth.toLocaleString('en-IN')} today
                </Text>
              </View>
            </View>
          </View>

          {/* Primary Actions */}
          <View style={styles.primaryActions}>
            <TouchableOpacity
              style={styles.scanBtnContainer}
              onPress={() => navigation.navigate('ScanPay')}
              activeOpacity={0.9}
            >
              <View style={styles.scanBtn}>
                <ScanLine size={24} color="#FFF" strokeWidth={2.5} />
              </View>
              <Text style={styles.scanBtnLabel}>Scan & Pay</Text>
            </TouchableOpacity>

            <View style={styles.actionPillContainer}>
              <TouchableOpacity
                style={styles.pillItem}
                onPress={() => navigation.navigate('SendMoney')}
              >
                <View style={styles.pillIcon}>
                  <Send size={18} color="#1C1C1E" />
                </View>
                <Text style={styles.actionBtnLabel}>Send</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pillItem}
                onPress={() => setShowAddMoney(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pillIcon}>
                  <Plus size={20} color="#1C1C1E" strokeWidth={3} />
                </View>
                <Text style={styles.actionBtnLabel}>Add</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pillItem}
                onPress={() => navigation.navigate('RequestMoney')}
                activeOpacity={0.7}
              >
                <View style={styles.pillIcon}>
                  <ArrowDownToLine size={18} color="#1C1C1E" strokeWidth={2.5} />
                </View>
                <Text style={styles.actionBtnLabel}>Request</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Content */}
          <View style={styles.contentSection}>

            {/* Quick Services Grid */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Services</Text>
              <TouchableOpacity onPress={() => navigation.navigate('QuickServices')}>
                <Text style={styles.viewAll}>View All ›</Text>
              </TouchableOpacity>
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
                  <View style={[styles.serviceIconWrap, { backgroundColor: item.color }]}>
                    <item.icon size={22} color="#FFF" strokeWidth={2.5} />
                  </View>
                  <Text style={styles.serviceLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AI Insights */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AI Insights</Text>
              <TouchableOpacity>
                <Text style={styles.viewAll}>View All ›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.insightsScroll}
            >
              {dynamicInsights.map((insight) => (
                <View key={insight.id} style={styles.insightCard}>
                  <View style={styles.insightIconWrap}>
                    <insight.icon size={18} color="#000000" />
                  </View>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <Text style={styles.insightValue}>{insight.value}</Text>
                  <Text style={styles.insightSub}>{insight.sub}</Text>
                  <TouchableOpacity
                    style={styles.insightLinkRow}
                    onPress={() => setActiveInsight(insight.type)}
                  >
                    <Text style={styles.insightLink}>View Details</Text>
                    <ChevronRight size={14} color="#000000" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {/* Accounts Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Accounts</Text>
              <TouchableOpacity
                style={styles.addAccountBtn}
                onPress={() => navigation.navigate('BankAccounts')}
              >
                <Text style={styles.addAccountText}>+ Add Account</Text>
              </TouchableOpacity>
            </View>

            {/* Placeholder Account Card */}
            <TouchableOpacity
              style={[
                styles.accountCard,
                {
                  marginTop: 24,
                  backgroundColor: 'rgba(200, 50, 50, 0.05)',
                  borderColor: 'rgba(200, 50, 50, 0.2)',
                },
              ]}
              onPress={() => navigation.navigate('TransactionHistory')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <FileText size={20} color="#C83232" />
                <Text style={{ color: '#C83232', fontSize: responsiveFont(16), fontWeight: '700' }}>
                  View Transaction History
                </Text>
              </View>
              <ChevronRight size={20} color="#C83232" style={{ position: 'absolute', right: 20 }} />
            </TouchableOpacity>

            <View style={{ height: 150 }} />
          </View>
        </View>
      </ScrollView>

      {/* Insurance Modal */}
      <InsuranceScreen visible={showInsurance} onClose={() => setShowInsurance(false)} />

      {/* Insight Modal */}
      <Modal visible={!!activeInsight} animationType="slide" transparent onRequestClose={() => setActiveInsight(null)}>
        {renderInsightDetails()}
      </Modal>

      {/* Add Money Modal */}
      <Modal visible={showAddMoney} transparent animationType="slide" onRequestClose={() => setShowAddMoney(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetModalOverlay}>
          <View style={styles.sheetModalSheet}>
            <View style={styles.sheetModalHeader}>
              <Text style={styles.sheetModalTitle}>Add Money to Wallet</Text>
              <TouchableOpacity onPress={() => setShowAddMoney(false)}>
                <Text style={{ color: '#000', fontSize: responsiveFont(24) }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>AMOUNT (₹)</Text>
            <TextInput
              style={styles.input}
              value={amountToAdd}
              onChangeText={setAmountToAdd}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="rgba(0,0,0,0.3)"
              autoFocus
            />
            <TouchableOpacity
              onPress={handleAddMoney}
              disabled={isProcessing || !amountToAdd || parseFloat(amountToAdd || '0') <= 0}
              style={{ marginTop: 16 }}
            >
              <View
                style={[
                  styles.payBtn,
                  {
                    backgroundColor:
                      amountToAdd && parseFloat(amountToAdd) > 0 ? '#1A1A4E' : '#E8E8E8',
                  },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text
                    style={[
                      styles.payBtnText,
                      {
                        color: amountToAdd && parseFloat(amountToAdd) > 0 ? '#FFFFFF' : '#AAAAAA',
                      },
                    ]}
                  >
                    {`Add ₹${amountToAdd && parseFloat(amountToAdd) > 0 ? parseFloat(amountToAdd).toFixed(2) : '0.00'} to Wallet →`}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Password Modal */}
      <Modal
        visible={isPasswordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.securityModalOverlay}
        >
          <View style={styles.securityModalContent}>
            <View style={styles.securityModalHeader}>
              <ShieldCheck size={24} color={Colors.neonLime} />
              <Text style={styles.securityModalTitle}>Enter U‑PIN</Text>
              <Text style={styles.securityModalSub}>
                Enter your 4‑digit transaction U‑PIN to reveal your balance.
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
                placeholderTextColor="rgba(0,0,0,0.2)"
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

              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  { opacity: uPin.length === 4 ? 1 : 0.5 },
                ]}
                onPress={verifyBalanceUpin}
                disabled={isVerifying || uPin.length < 4}
              >
                {isVerifying ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.modalConfirmText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ------------------------------ Styles ------------------------------ */
const styles = StyleSheet.create({
  /* Global */
  root: { flex: 1, backgroundColor: '#FDFDF9' },
  container: {
    maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%',
    alignSelf: 'center',
    width: '100%',
  },

  /* Hero */
  heroSection: {
    paddingTop: 58,
    paddingBottom: 65,
    paddingHorizontal: 20,
    backgroundColor: '#f7efd8ef',
    borderRadius: 28,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 44 },

  avatarContainer: { position: 'relative' },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  avatarText: { fontSize: responsiveFont(20), fontWeight: '800', color: '#000' },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34c759',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  logo: { height: 30, width: 120, tintColor: '#000' },

  iconBtn: { overflow: 'hidden', borderRadius: 22 },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY_COLOR },

  /* Balance Card */
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  greeting: {
    color: '#333333',
    fontSize: responsiveFont(18),
    fontWeight: '800',
    marginBottom: 12,
  },
  netWorthHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  netWorthLabel: {
    color: '#333333',
    fontSize: responsiveFont(12),
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  revealBtn: { marginLeft: 10, opacity: 0.6 },

  balanceRow: { flexDirection: 'row', alignItems: 'baseline', marginVertical: 2 },
  currencySymbol: { color: '#333333', fontSize: responsiveFont(26), fontWeight: '400', marginRight: 6 },
  balanceMain: {
    color: '#333333',
    fontSize: responsiveFont(48),
    fontWeight: '200',
    letterSpacing: -1,
  },
  balanceDecimals: { color: '#333333', fontSize: responsiveFont(22), fontWeight: '700' },

  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  growthTxt: { color: '#CD2C38', fontSize: responsiveFont(12), fontWeight: '800' },

  /* Primary Actions */
  primaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -42,
    paddingHorizontal: 20,
    zIndex: 20,
    elevation: 10,
    position: 'relative',
  },
  scanBtnContainer: { alignItems: 'center', gap: 6 },
  scanBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCAN_PAY_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  scanBtnLabel: { color: '#333333', fontSize: responsiveFont(12), fontWeight: '900', marginTop: 10, letterSpacing: -0.2 },

  actionPillContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 84,
    borderRadius: 42,
    marginLeft: 16,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  pillItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pillIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLabel: { color: '#1C1C1E', fontSize: responsiveFont(11), fontWeight: '700', marginTop: 6 },

  /* Content */
  contentSection: { paddingHorizontal: 20, paddingTop: 10 },

  /* Sections */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 24,
  },
  sectionTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '700' },
  viewAll: { color: PRIMARY_COLOR, fontSize: responsiveFont(13), fontWeight: '600' },

  /* Services Grid */
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: isTablet ? 20 : 0,
  },
  serviceItem: { width: isTablet ? '18%' : '23%', alignItems: 'center', gap: 8, marginBottom: 16 },
  serviceIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: { color: '#1C1C1E', fontSize: responsiveFont(11), textAlign: 'center', fontWeight: '600' },

  /* AI Insights */
  insightsScroll: { paddingRight: 20, gap: 16 },
  insightCard: {
    width: 150,
    height: 170,
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  insightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: { color: 'rgba(0,0,0,0.6)', fontSize: responsiveFont(12), marginTop: 12 },
  insightValue: { color: '#1C1C1E', fontSize: responsiveFont(22), fontWeight: '800', marginVertical: 4 },
  insightSub: { color: 'rgba(0,0,0,0.6)', fontSize: responsiveFont(11), lineHeight: 16, height: 32 },
  insightLinkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  insightLink: { color: '#1C1C1E', fontSize: responsiveFont(11), fontWeight: '600', marginRight: 4 },

  /* Insight Modal */
  insightModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  insightModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    maxHeight: '70%',
    width: '100%',
    maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  insightModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  insightModalTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '700' },

  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  insightRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  insightIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  insightTextWrap: { flex: 1 },
  insightRowMerchant: { color: '#1C1C1E', fontSize: responsiveFont(16), fontWeight: '600', marginBottom: 4 },
  insightRowCategory: { color: '#8E8E93', fontSize: responsiveFont(12) },
  insightRowRight: { alignItems: 'flex-end', flexShrink: 0 },
  insightRowAmount: { fontSize: responsiveFont(16), fontWeight: '800' },

  /* Account Card */
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 1,
  },
  addAccountBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(200, 50, 50, 0.12)',
  },
  addAccountText: { color: '#C83232', fontSize: responsiveFont(12), fontWeight: '700' },

  /* Modals */
  sheetModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    width: '100%',
    maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  sheetModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetModalTitle: { color: '#1C1C1E', fontSize: responsiveFont(20), fontWeight: '700' },

  inputLabel: { color: '#8E8E93', fontSize: responsiveFont(11), fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    padding: 16,
    color: '#1C1C1E',
    fontSize: responsiveFont(18),
    fontWeight: '600',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  payBtn: { borderRadius: 30, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  payBtnText: { fontSize: responsiveFont(15), fontWeight: '800', letterSpacing: 0.5 },

  securityModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  securityModalContent: {
    borderRadius: 32,
    padding: 24,
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: isTablet ? (isLandscape() ? 500 : 400) : '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  securityModalHeader: { alignItems: 'center', marginBottom: 24 },
  securityModalTitle: { color: '#1C1C1E', fontSize: responsiveFont(20), fontWeight: '700', marginTop: 12 },
  securityModalSub: { color: '#8E8E93', fontSize: responsiveFont(14), textAlign: 'center', marginTop: 8, lineHeight: 20 },

  modalInputWrapper: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 24,
  },
  modalInput: { height: 56, paddingHorizontal: 20, color: '#1C1C1E', fontSize: responsiveFont(16), textAlign: 'center' },

  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: '#8E8E93', fontSize: responsiveFont(16), fontWeight: '600' },

  modalConfirm: {
    flex: 1.5,
    height: 50,
    backgroundColor: Colors.neonLime,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { color: '#000', fontSize: responsiveFont(16), fontWeight: '700' },
});
