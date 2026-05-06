/**
 * ScanPayScreen.tsx
 * QR scanner using react-native-vision-camera v4 (stable, widely used).
 * useCodeScanner detects QR codes natively via the camera.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform, Linking, AppState
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, X, CheckCircle, ExternalLink } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Radius, Spacing, Gradients } from '../theme/tokens';
import { BASE_URL } from '../api/client';

const API = `${BASE_URL}/transfers`;

export function ScanPayScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [isScanning, setIsScanning] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  const hasScanned = useRef(false);

  // Safely determine if camera should be active
  // using useIsFocused prevents TOO_MANY_OPEN_CAMERAS during navigation
  const isActive = isFocused && isScanning;

  // Post-scan payment state
  const [scannedData, setScannedData] = useState<string | null>(null);  // raw QR
  const [parsedRecipient, setParsedRecipient] = useState<string | null>(null); // display label
  const [showPayModal, setShowPayModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // U-PIN verification
  const [showUpinModal, setShowUpinModal] = useState(false);
  const [uPinInput, setUPinInput] = useState('');
  const [isVerifyingUPin, setIsVerifyingUPin] = useState(false);

  // Parse a QR code into a clean display label
  const parseQRDisplay = (raw: string): string => {
    // BODHI payment QR: bodhi://pay?gap=username.g.gap
    if (raw.toLowerCase().startsWith('bodhi://')) {
      const match = raw.match(/[?&]gap=([^&]+)/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
    // UPI QR
    if (raw.toLowerCase().startsWith('upi://')) {
      const match = raw.match(/[?&]pa=([^&]+)/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
    return raw;
  };

  // Check if this is a BODHI GAP ID QR
  const isBodhiQR = (raw: string): boolean => {
    return raw.toLowerCase().startsWith('bodhi://');
  };

  // Extract GAP ID from bodhi:// URI
  const extractGapId = (raw: string): string | null => {
    const match = raw.match(/[?&]gap=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const parseQRAmount = (raw: string): string => {
    const match = raw.match(/[?&]am=([^&]+)/i);
    return match ? match[1] : '';
  };

  // ── QR scanner (v4 API) ──────────────────────────────────────────────────
  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13'],
    onCodeScanned: useCallback((codes: any[]) => {
      if (hasScanned.current || codes.length === 0) return;
      const value: string | undefined = codes[0]?.value;
      if (!value) return;

      hasScanned.current = true;
      setIsScanning(false);
      setScannedData(value);
      setParsedRecipient(parseQRDisplay(value));
      
      const qrAmt = parseQRAmount(value);
      if (qrAmt) setAmount(qrAmt);
      
      setShowPayModal(true);
    }, []),
  });

  // ── Payment handler (BODHI Wallet) ───────────────────────────────────────
  const handlePay = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setPaymentError('Please enter a valid amount.');
      return;
    }
    if (!scannedData) return;

    setIsProcessing(true);
    setPaymentError(null);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');

      // If it's a BODHI GAP ID QR, use /transfers/send with the GAP ID
      let endpoint = `${API}/qr-pay`;
      let body: any = {
        qr_data: scannedData,
        amount: parseFloat(amount),
        note: note || undefined,
      };

      if (isBodhiQR(scannedData)) {
        const gapId = extractGapId(scannedData);
        if (!gapId) {
          setPaymentError('Could not read GAP ID from this QR code.');
          setIsProcessing(false);
          return;
        }
        endpoint = `${API}/send`;
        body = {
          recipient_identifier: gapId,
          amount: parseFloat(amount),
          note: note || undefined,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch { data = {}; }

      if (!res.ok) {
        throw new Error(data.detail || `Server Error ${res.status}: ${rawText.substring(0, 50)}`);
      }

      setSuccessMsg(`₹${parseFloat(amount).toFixed(2)} sent to ${data.recipient_name} successfully!`);
      setPaySuccess(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Verify U-PIN then Pay ────────────────────────────────────────────────
  const initiatePay = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setPaymentError('Please enter a valid amount.');
      return;
    }
    setUPinInput('');
    setShowUpinModal(true);
  };

  const verifyUpinAndPay = async () => {
    if (uPinInput.length !== 4) return;
    setIsVerifyingUPin(true);
    setPaymentError(null);
    try {
      const token = await AsyncStorage.getItem('bodhi_access_token');
      // Use standard verification endpoint
      const verifyRes = await fetch(`${BASE_URL}/auth/verify-upin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ u_pin: uPinInput }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        setPaymentError(err.detail || 'Incorrect U-PIN. Please try again.');
        setUPinInput('');
        return;
      }
      
      setShowUpinModal(false);
      await handlePay();
    } catch (e: any) {
      setPaymentError(e.message || 'Verification Error');
    } finally {
      setIsVerifyingUPin(false);
    }
  };

  // ── Payment handler (Native UPI Deep Linking) ────────────────────────────
  const handleNativeUPIPay = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!scannedData || !scannedData.toLowerCase().startsWith('upi://')) {
      Alert.alert('Invalid QR', 'This is not a valid UPI QR code for external payment.');
      return;
    }

    setIsProcessing(true);
    try {
      let finalUrl = scannedData;
      
      // If the QR code is dynamic (already has an amount or a signature), 
      // DO NOT mutate the URL or it will fail bank security checks (Limit Reached / Invalid Signature).
      if (!/[?&]am=/i.test(scannedData)) {
        if (!finalUrl.includes('cu=')) {
          finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'cu=INR';
        }
        finalUrl = finalUrl.replace(/&&+/g, '&').replace(/\?&/g, '?').replace(/&$/, '');
        
        const formattedAmount = parseFloat(amount).toFixed(2);
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `am=${formattedAmount}`;
        if (note) {
          finalUrl += `&tn=${encodeURIComponent(note)}`;
        }
      }

      // Try specific Google Pay schemes first to avoid WhatsApp taking over
      const gpayUrl = finalUrl.replace(/^upi:\/\//i, 'gpay://upi/');
      const tezUrl = finalUrl.replace(/^upi:\/\//i, 'tez://upi/');

      if (await Linking.canOpenURL(gpayUrl)) {
        await Linking.openURL(gpayUrl);
        setSuccessMsg(`Google Pay opened! Please complete the payment.`);
        setPaySuccess(true);
      } else if (await Linking.canOpenURL(tezUrl)) {
        await Linking.openURL(tezUrl);
        setSuccessMsg(`Google Pay opened! Please complete the payment.`);
        setPaySuccess(true);
      } else if (await Linking.canOpenURL(finalUrl)) {
        await Linking.openURL(finalUrl);
        setSuccessMsg(`Payment intent opened. Please complete the payment!`);
        setPaySuccess(true);
      } else {
        Alert.alert('App Not Found', 'No UPI app found on your device. Please install Google Pay.');
      }
    } catch (err: any) {
      Alert.alert('UPI Error', err.message || 'Could not open UPI app.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAndScanAgain = () => {
    hasScanned.current = false;
    setScannedData(null);
    setParsedRecipient(null);
    setShowPayModal(false);
    setAmount('');
    setNote('');
    setPaySuccess(false);
    setIsScanning(true);
  };

  // ── No permission ─────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSub}>
          BODHI needs camera permission to scan QR codes for payments.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#C83232' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionTitle}>No Camera Found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#C83232' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isUpiQr = scannedData?.toLowerCase().startsWith('upi://');

  return (
    <View style={styles.root}>
      {/* Camera with QR code scanner */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        codeScanner={codeScanner}
      />

      {/* Dark overlay */}
      <LinearGradient
        colors={['rgba(10,11,30,0.4)', 'rgba(10,11,30,0.7)']}
        style={styles.overlay}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan to Pay</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderContainer}>
          <Text style={styles.scanInstructions}>
            Point your camera at a{'\n'}BODHI or UPI QR code
          </Text>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <Text style={styles.scanHint}>QR code will be detected automatically</Text>
        </View>
      </LinearGradient>

      {/* Pay Modal */}
      <Modal visible={showPayModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32 }]}>
            {paySuccess ? (
              <View style={styles.successContainer}>
                <CheckCircle size={64} color="#34c759" />
                <Text style={styles.successTitle}>Done</Text>
                <Text style={styles.successSub}>{successMsg}</Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.doneBtnText}>Return Home</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={resetAndScanAgain} style={{ marginTop: 12 }}>
                  <Text style={{ color: '#C83232', fontSize: responsiveFont(14) }}>Scan Another</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.modalHeader, { paddingTop: Platform.OS === 'ios' ? 10 : 0 }]}>
                  <Text style={styles.modalTitle}>Pay via QR</Text>
                  <TouchableOpacity onPress={resetAndScanAgain}>
                    <X size={22} color="#1C1C1E" />
                  </TouchableOpacity>
                </View>

                <View style={styles.scannedTag}>
                  <Text style={styles.scannedLabel}>Paying to</Text>
                  <Text style={styles.scannedValue} numberOfLines={1}>{parsedRecipient}</Text>
                </View>

                <Text style={styles.inputLabel}>AMOUNT (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  autoFocus
                />

                <Text style={styles.inputLabel}>NOTE (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, { marginBottom: paymentError ? 8 : 24 }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="What's it for?"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                />

                {paymentError && (
                  <Text style={{ color: '#C83232', fontSize: 13, fontWeight: '600', marginBottom: 16, textAlign: 'center' }}>
                    {paymentError}
                  </Text>
                )}

                <View style={{ gap: 12 }}>
                  {isUpiQr && (
                    <TouchableOpacity
                      onPress={handleNativeUPIPay}
                      disabled={isProcessing || !amount}
                      style={{ opacity: isProcessing || !amount ? 0.6 : 1 }}
                    >
                      <LinearGradient
                        colors={['#1C1C1E', '#C83232']}
                        style={styles.payBtn}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      >
                        {isProcessing ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.payBtnText, { color: '#FFFFFF' }]}>
                              PAY VIA GPAY / UPI
                            </Text>
                            <ExternalLink size={18} color="#FFFFFF" />
                          </View>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={initiatePay}
                    disabled={isProcessing || !amount}
                    style={{ opacity: isProcessing || !amount ? 0.6 : 1 }}
                  >
                    <LinearGradient
                      colors={isUpiQr ? ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.1)'] : ['#3D4DFF', '#3D4DFF']}
                      style={[styles.payBtn, isUpiQr && { borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                      {isProcessing ? (
                        <ActivityIndicator color={isUpiQr ? '#1C1C1E' : '#FFFFFF'} />
                      ) : (
                        <Text style={[styles.payBtnText, isUpiQr && { color: '#1C1C1E' }]}>
                          PAY VIA BODHI WALLET
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* U-PIN Verification Modal */}
      <Modal visible={showUpinModal} transparent animationType="fade" onRequestClose={() => setShowUpinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.upinOverlay}>
          <View style={styles.upinSheet}>
            <Text style={styles.upinTitle}>🔐 Confirm U-PIN</Text>
            <Text style={styles.upinSub}>Enter your 4-digit transaction U-PIN to authorise this QR payment.</Text>
            <TextInput
              style={styles.upinInput}
              value={uPinInput}
              onChangeText={setUPinInput}
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
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity style={styles.upinCancel} onPress={() => setShowUpinModal(false)}>
                <Text style={styles.upinCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.upinConfirm, { opacity: uPinInput.length === 4 ? 1 : 0.4 }]}
                onPress={verifyUpinAndPay}
                disabled={isVerifyingUPin || uPinInput.length < 4}
              >
                {isVerifyingUPin ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.upinConfirmText}>Confirm Pay</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDFDF9', padding: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', backgroundColor: 'rgba(253, 253, 249, 0.4)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  headerTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '800', letterSpacing: 0.5 },
  viewfinderContainer: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scanInstructions: { color: '#1C1C1E', fontSize: responsiveFont(16), textAlign: 'center', marginBottom: 32, lineHeight: 24, fontWeight: '700' },
  viewfinder: { width: 260, height: 260, position: 'relative' },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: Colors.neonLime },
  tl: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderBottomRightRadius: 12 },
  scanHint: { color: 'rgba(0,0,0,0.7)', fontSize: responsiveFont(13), marginTop: 32, fontWeight: '600' },
  permissionTitle: { color: '#1C1C1E', fontSize: responsiveFont(22), fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  permissionSub: { color: 'rgba(0,0,0,0.6)', fontSize: responsiveFont(14), textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  grantBtn: { backgroundColor: Colors.neonLime, paddingHorizontal: 32, paddingVertical: 14, borderRadius: Radius.lg },
  grantBtnText: { color: '#FFF', fontSize: responsiveFont(15), fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: '#1C1C1E', fontSize: responsiveFont(22), fontWeight: '800' },
  scannedTag: {
    backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  scannedLabel: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(11), fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  scannedValue: { color: Colors.neonLime, fontSize: responsiveFont(16), fontWeight: '800' },
  inputLabel: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(11), fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 16, padding: 16,
    color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '700', marginBottom: 16,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)',
  },
  payBtn: { borderRadius: Radius.xl, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  payBtnText: { fontSize: responsiveFont(16), fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  successContainer: { alignItems: 'center', paddingVertical: 20 },
  successTitle: { color: '#1C1C1E', fontSize: responsiveFont(28), fontWeight: '900', marginTop: 16, marginBottom: 8 },
  successSub: { color: 'rgba(0,0,0,0.7)', fontSize: responsiveFont(16), textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  doneBtn: { backgroundColor: Colors.success, paddingHorizontal: 48, paddingVertical: 18, borderRadius: Radius.xl },
  doneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // U-PIN Modal Styles (Consistent with SendMoneyScreen)
  upinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  upinSheet: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  upinTitle: { color: '#1C1C1E', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  upinSub: { color: 'rgba(0,0,0,0.6)', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  upinInput: {
    backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)', height: 60, color: '#1C1C1E',
    fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 12, marginBottom: 8,
  },
  upinCancel: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  upinCancelText: { color: 'rgba(0,0,0,0.4)', fontSize: 16, fontWeight: '600' },
  upinConfirm: { flex: 2, height: 50, backgroundColor: Colors.neonLime, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  upinConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
