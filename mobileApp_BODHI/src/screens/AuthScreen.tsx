import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Smartphone,
  Mail,
  Lock,
  ShieldCheck,
  User,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react-native';
import { Colors, Radius, Spacing, FontSize, Gradients, ScreenColors } from '../theme/tokens';
import { SocialAuthButtons } from '../components/SocialAuthButtons';
import { BASE_URL, AuthAPI } from '../api/client';

// New Reusable Components
import { AuthCard } from '../components/auth/AuthCard';
import { AuthInput } from '../components/auth/AuthInput';
import { AuthButton } from '../components/auth/AuthButton';
import { OTPInput } from '../components/auth/OTPInput';
import { StepIndicator } from '../components/auth/StepIndicator';

const API_URL = `${BASE_URL}/auth`;

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

export function AuthScreen({ navigation }: any) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);

  // Wizard State
  const [currentStep, setCurrentStep] = useState(0);

  // Form State
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mPin, setMPin] = useState('');
  const [confirmMPin, setConfirmMPin] = useState('');
  const [uPin, setUPin] = useState('');
  const [confirmUPin, setConfirmUPin] = useState('');
  const [otp, setOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [isGenderOpen, setIsGenderOpen] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(true);
  const [newPassword, setNewPassword] = useState('');

  const resetForm = () => {
    setName('');
    setAge('');
    setGender('');
    setPhone('');
    setEmail('');
    setPassword('');
    setMPin('');
    setConfirmMPin('');
    setUPin('');
    setConfirmUPin('');
    setOtp('');
    setCurrentStep(0);
    setIsEmailSent(false);
    setIsEmailVerified(false);
    setIsEditingEmail(true);
  };

  const switchMode = (mode: AuthMode) => {
    resetForm();
    setAuthMode(mode);
  };

  const formatError = (error: any): string => {
    // 1. Handle Axios/Fetch responses with JSON bodies
    const data = error.response?.data || error.data;
    if (data && data.detail) {
      if (Array.isArray(data.detail)) {
        return data.detail.map((d: any) => `${d.msg || JSON.stringify(d)}${d.loc ? ` (${d.loc.join('/')})` : ''}`).join('\n');
      }
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
    
    // 2. Handle standard Error objects
    if (error.message) return String(error.message);
    
    // 3. Fallback for everything else
    return typeof error === 'object' ? JSON.stringify(error) : String(error);
  };

  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    // Diagnostic check: Test if we can at least perform a GET request to the server
    const testConnection = async () => {
      try {
        console.log(`🔍 Connectivity Check: Fetching ${BASE_URL}/ ...`);
        const res = await fetch(`${BASE_URL}/`, { method: 'GET' });
        console.log(`📊 Status: ${res.status}`);
        if (res.ok) {
          const text = await res.text();
          console.log(`✅ Connectivity Check Success: ${text.substring(0, 50)}`);
        } else {
          console.warn(`⚠️ Connectivity Check returned non-OK status: ${res.status}`);
        }
      } catch (err: any) {
        console.error(`❌ Connectivity Check Failed: ${err.message}`, err);
      }
    };
    testConnection();
  }, []);

  const startResendTimer = () => setResendTimer(60);


  const handleSendOtp = async (target: 'email' | 'phone') => {
    try {
      const val = target === 'email' ? email : phone;
      if (!val) {
        Alert.alert("Warning", `Please enter ${target} first`);
        return;
      }

      setIsLoading(true);

      // Using native fetch as a fallback to bypass potential axios-specific network blocks
      const otpResponse = await fetch(`${BASE_URL}/auth/send-register-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target === 'email' ? { email } : { phone }),
      });

      if (!otpResponse.ok) {
        const errorData = await otpResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server responded with ${otpResponse.status}`);
      }

      if (target === 'email') {
        setIsEmailVerified(true);
      } else {
        setIsPhoneVerified(true);
      }
      startResendTimer();
      Alert.alert("Sent!", `OTP has been sent to your ${target}`);
    } catch (error: any) {
      console.error("OTP Error:", error);
      Alert.alert("Error", `Failed to send OTP: ${formatError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      if (!otp || otp.length !== 6) {
        Alert.alert("Warning", "Please enter a valid 6-digit code");
        return;
      }

      setIsLoading(true);
      await AuthAPI.verifyRegisterOtp({ email: email.trim().toLowerCase(), otp });
      setOtp('');
      setResendTimer(0);
      setCurrentStep(2);
    } catch (error: any) {
      Alert.alert("Invalid Code", formatError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSuccess = () => {
    navigation.replace('Main');
  };

  const handleStandardAuth = async () => {
    if (authMode === 'signup') {
      if (!email || !mPin || !uPin) {
        Alert.alert('Warning', 'Please enter your Email, M-PIN and U-PIN.');
        return;
      }
      if (mPin !== confirmMPin) {
        Alert.alert('Warning', 'M-PINs do not match.');
        return;
      }
      if (uPin !== confirmUPin) {
        Alert.alert('Warning', 'U-PINs do not match.');
        return;
      }
    } else {
      if (!email || !password) {
        Alert.alert('Warning', 'Please enter your email and password.');
        return;
      }
    }

    setIsLoading(true);
    try {
      if (authMode === 'login') {
        const formBody = [];
        const details: any = {
          username: email.trim().toLowerCase(),
          password: String(password).trim().slice(0, 10),
        };
        for (const property in details) {
          const encodedKey = encodeURIComponent(property);
          const encodedValue = encodeURIComponent(details[property]);
          formBody.push(encodedKey + "=" + encodedValue);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let response;
        try {
          response = await fetch(`${API_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody.join('&'),
            signal: controller.signal,
          });
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError') throw new Error('Connection timed out. Please check your network.');
          throw new Error(`Network request failed. Ensure you have an active internet connection. (${fetchErr.message || fetchErr})`);
        } finally {
          clearTimeout(timer);
        }

        const rawText = await response.text();
        console.log("📥 Raw Server Response:", rawText); 

        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          throw new Error(`Server returned non-JSON: ${rawText.substring(0, 100)}`);
        }

        if (!response.ok) {
          // Unpack the error as much as possible
          const errorDetail = data.detail || data.message || data;
          const finalMsg = typeof errorDetail === 'object' 
            ? JSON.stringify(errorDetail) 
            : String(errorDetail);
          throw new Error(finalMsg);
        }

        await AsyncStorage.setItem('bodhi_access_token', data.access_token);
        if (data.full_name) await AsyncStorage.setItem('user_full_name', data.full_name);
        
        try {
          const profileRes = await fetch(`${BASE_URL}/users/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` }
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.id) await AsyncStorage.setItem('bodhi_user_id', profile.id);
          }
        } catch (_) {}

        navigation.replace('Main');

      } else if (authMode === 'signup') {
        const payload = {
          email: email.trim().toLowerCase(),
          password: String(mPin).trim().slice(0, 10),
          full_name: name.trim(),
          phone_number: phone.trim(),
          m_pin: String(mPin).trim().slice(0, 10),
          u_pin: String(uPin).trim().slice(0, 10),
          age: parseInt(age) || 0,
          gender: gender
        };

        console.log("📡 SIGNUP PAYLOAD DEBUG:", {
          email: `${payload.email.length} chars`,
          password: `${payload.password.length} chars`,
          full_name: `${payload.full_name.length} chars`,
          phone_number: `${payload.phone_number.length} chars`,
          m_pin: `${payload.m_pin.length} chars`,
          u_pin: `${payload.u_pin.length} chars`,
        });

        const response = await fetch(`${API_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        console.log("📥 Signup Raw Response:", rawText);
        
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          throw new Error(`Signup Server Error: ${rawText.substring(0, 50)}`);
        }

        if (!response.ok) {
          const errorDetail = data.detail || data.message || data;
          const finalMsg = typeof errorDetail === 'object' 
            ? JSON.stringify(errorDetail) 
            : String(errorDetail);
          throw new Error(finalMsg);
        }

        Alert.alert('Success', 'Account created! Welcome to BODHI.');
        switchMode('login');
      }
    } catch (error: any) {
      console.error("🏁 Auth Logic Failure:", error);
      Alert.alert('Authentication Failed', formatError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Warning', 'Please enter your email address.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data.detail;
        const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : 'Failed to send reset code.');
        throw new Error(msg);
      }
      setAuthMode('reset');
    } catch (error: any) {
      const msg = typeof error.message === 'string' ? error.message : JSON.stringify(error.message) || 'An unexpected error occurred';
      Alert.alert('Error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (otp.length !== 6 || newPassword.length < 4) {
      Alert.alert('Warning', 'Enter 6-digit code and new 4-digit M-PIN.');
      return;
    }

    if (newPassword !== confirmMPin) {
      Alert.alert('Warning', 'PINs do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp,
          new_password: newPassword
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data.detail;
        const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : 'Invalid code.');
        throw new Error(msg);
      }
      Alert.alert('Success 🎉', 'Your password has been reset!');
      switchMode('login');
    } catch (error: any) {
      const msg = typeof error.message === 'string' ? error.message : JSON.stringify(error.message) || 'Failed to reset password';
      Alert.alert('Reset Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonGradient = (disabled?: boolean, variant?: string) => {
    if (disabled) return ['#333', '#222'];
    if (variant === 'signup') return ['#C83232', '#3D4DFF']; // Premium Warm Fire
    return Gradients.authCTA.colors;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[ScreenColors.auth.background, ScreenColors.auth.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/bodhi-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>
              Your money. <Text style={styles.taglineHighlight}>Alive.</Text>
            </Text>
          </View>

          <AuthCard>
            {authMode === 'login' && (
              <>
                <Text style={styles.flowTitle}>Welcome Back</Text>
                <Text style={styles.flowSub}>Enter your credentials to access your account</Text>

                <AuthInput
                  label="Email"
                  placeholder="e.g., name@example.com"
                  icon={<Mail size={20} color="#C83232" />}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <AuthInput
                  label="Login PIN (M-PIN)"
                  placeholder="••••"
                  icon={<Lock size={20} color="#C83232" />}
                  value={password}
                  onChangeText={setPassword}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={styles.linksRow}>
                  <TouchableOpacity onPress={() => switchMode('signup')}>
                    <Text style={[styles.linkText, { color: '#C83232' }]}>Sign Up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => switchMode('forgot')}>
                    <Text style={[styles.linkText, { color: '#C83232' }]}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>

                <AuthButton
                  title="Login to BODHI"
                  onPress={handleStandardAuth}
                  isLoading={isLoading}
                />

                <View style={styles.socialSection}>
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or continue with</Text>
                    <View style={styles.dividerLine} />
                  </View>
                  <View style={styles.socialRow}>
                    <SocialAuthButtons onSuccess={handleOAuthSuccess} />
                    <TouchableOpacity style={styles.socialBtn}>
                      <Smartphone size={24} color="#1C1C1E" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.securityFooter}>
                  <ShieldCheck size={14} color={Colors.neonLime} />
                  <Text style={styles.securityText}>Secure bank-level encryption</Text>
                </View>
              </>
            )}

            {authMode === 'signup' && (
              <>
                <StepIndicator currentStep={currentStep} totalSteps={3} />

                <Text style={styles.flowTitle}>
                  {currentStep === 0 ? "About You" : currentStep === 1 ? "Verify Email" : "Secure Assets"}
                </Text>
                <Text style={styles.flowSub}>
                  {currentStep === 0 ? "Personalize your journey" : currentStep === 1 ? `Sent to ${email}` : "Set your access pins"}
                </Text>

                {currentStep === 0 && (
                  <>
                    <AuthInput
                      label="Full Name"
                      placeholder="Jane Doe"
                      icon={<User size={20} color="rgba(0,0,0,0.4)" />}
                      value={name}
                      onChangeText={setName}
                    />

                    <View style={{ flexDirection: 'row', gap: 16, zIndex: 10 }}>
                      <View style={{ flex: 1 }}>
                        <AuthInput
                          label="Age"
                          placeholder="25"
                          value={age}
                          onChangeText={setAge}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={{ flex: 1.5, zIndex: 20, marginBottom: 24 }}>
                        <Text style={{
                          color: 'rgba(0,0,0,0.45)',
                          fontSize: 11,
                          fontWeight: '800',
                          marginBottom: 8,
                          letterSpacing: 1,
                          marginLeft: 4,
                        }}>GENDER</Text>
                        <TouchableOpacity
                          style={[styles.dropdownHeader, isGenderOpen && { borderColor: Colors.neonLime, backgroundColor: 'rgba(200, 255, 0, 0.05)' }]}
                          onPress={() => setIsGenderOpen(!isGenderOpen)}
                        >
                          <Text style={{ color: gender ? '#1C1C1E' : 'rgba(0,0,0,0.3)', fontWeight: '600', fontSize: 16 }}>
                            {gender || "Select"}
                          </Text>
                          <ChevronDown size={18} color={Colors.neonLime} />
                        </TouchableOpacity>

                        {isGenderOpen && (
                          <View style={styles.dropdownList}>
                            {['Male', 'Female', 'Other'].map((g) => (
                              <TouchableOpacity
                                key={g}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setGender(g);
                                  setIsGenderOpen(false);
                                }}
                              >
                                <Text style={styles.dropdownItemText}>{g}</Text>
                                {gender === g && <CheckCircle2 size={16} color={Colors.neonLime} />}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>

                    <AuthInput
                      label="Phone Number"
                      placeholder="+91 9876543210"
                      icon={<Smartphone size={20} color="#C83232" />}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                    />

                    <AuthButton
                      title="Continue"
                      onPress={() => {
                        if (!name.trim() || !age.trim() || !gender || !phone.trim()) {
                          Alert.alert('Warning', 'Please fill in all personal details.');
                          return;
                        }
                        if (phone.trim().length < 10) {
                          Alert.alert('Warning', 'Please enter a valid 10-digit phone number.');
                          return;
                        }
                        setCurrentStep(1);
                      }}
                      style={{ marginTop: Spacing.md }}
                    />
                  </>
                )}

                {currentStep === 1 && (
                  <>
                    <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                    <View style={styles.inputWrapper}>
                      <Mail size={18} color="#C83232" style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, isEmailVerified && { color: 'rgba(0,0,0,0.4)' }]}
                        placeholder="name@example.com"
                        placeholderTextColor="rgba(0,0,0,0.4)"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!isEmailVerified}
                      />
                      <TouchableOpacity
                        style={styles.verifyInlineBtn}
                        disabled={resendTimer > 0 || isLoading}
                        onPress={() => handleSendOtp('email')}
                      >
                        <Text style={{ color: '#C83232', fontWeight: '700', fontSize: responsiveFont(13) }}>
                          {resendTimer > 0 ? `Resend in ${resendTimer}s` : (isEmailSent ? "Resend Code" : "Send Code")}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {isEmailVerified && (
                      <>
                        <Text style={styles.inputLabel}>6-DIGIT EMAIL CODE</Text>
                        <View style={styles.inputWrapper}>
                          <TextInput
                            style={[styles.input, { letterSpacing: 8, textAlign: 'center', fontWeight: '800' }]}
                            placeholder="••••••"
                            placeholderTextColor="rgba(0,0,0,0.2)"
                            keyboardType="number-pad"
                            maxLength={6}
                            value={otp}
                            onChangeText={setOtp}
                          />
                        </View>
                      </>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleVerifyOtp('email')}
                      style={{ marginTop: 32 }}
                      disabled={!isEmailVerified || isLoading}
                    >
                      <LinearGradient
                        colors={isEmailVerified ? ['#3D4DFF', '#3D4DFF'] : ['#333', '#222']}
                        style={styles.primaryBtn}
                      >
                        {isLoading ? <ActivityIndicator color="#000" /> : (
                          <>
                            <Text style={[styles.primaryBtnText, !isEmailVerified && { color: '#666' }]}>Verify & Next</Text>
                            <ChevronRight size={20} color={isEmailVerified ? "#000" : "#666"} style={{ position: 'absolute', right: 20 }} />
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}

                {currentStep === 2 && (
                  <>
                    <AuthInput
                      label="Login Pin (M-PIN)"
                      placeholder="••••"
                      icon={<Lock size={20} color="#C83232" />}
                      value={mPin}
                      onChangeText={setMPin}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      importantForAutofill="no"
                      autoComplete="off"
                      textContentType="oneTimeCode"
                    />

                    <AuthInput
                      label="Confirm M-PIN"
                      placeholder="••••"
                      icon={<Lock size={20} color="#C83232" />}
                      value={confirmMPin}
                      onChangeText={setConfirmMPin}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      importantForAutofill="no"
                      autoComplete="off"
                      textContentType="oneTimeCode"
                    />

                    <AuthInput
                      label="Transaction Pin (U-PIN)"
                      placeholder="••••"
                      icon={<ShieldCheck size={20} color="#C83232" />}
                      value={uPin}
                      onChangeText={setUPin}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      importantForAutofill="no"
                      autoComplete="off"
                      textContentType="oneTimeCode"
                    />

                    <AuthInput
                      label="Confirm U-PIN"
                      placeholder="••••"
                      icon={<ShieldCheck size={20} color="#C83232" />}
                      value={confirmUPin}
                      onChangeText={setConfirmUPin}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      importantForAutofill="no"
                      autoComplete="off"
                      textContentType="oneTimeCode"
                    />

                    <AuthButton
                      title="Complete Signup"
                      onPress={handleStandardAuth}
                      isLoading={isLoading}
                      disabled={!mPin || mPin.length < 4 || uPin.length < 4 || mPin !== confirmMPin || uPin !== confirmUPin}
                      variant="signup"
                    />
                  </>
                )}

                <View style={styles.wizardFooter}>
                  {currentStep > 0 ? (
                    <TouchableOpacity onPress={() => setCurrentStep(currentStep - 1)}>
                      <Text style={styles.navLink}>← Back</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => switchMode('login')}>
                      <Text style={styles.navLink}>← Login</Text>
                    </TouchableOpacity>
                  )}
                  {currentStep > 0 && (
                    <TouchableOpacity onPress={() => switchMode('login')}>
                      <Text style={styles.navLink}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {(authMode === 'forgot' || authMode === 'reset') && (
              <>
                <Text style={styles.flowTitle}>{authMode === 'forgot' ? "Forgot Password" : "Reset Password"}</Text>
                <Text style={styles.flowSub}>
                  {authMode === 'forgot' ? "Enter email to receive reset code" : `Sent to ${email}`}
                </Text>

                {authMode === 'forgot' && (
                  <AuthInput
                    label="Email"
                    placeholder="e.g., name@example.com"
                    icon={<Mail size={20} color="#C83232" />}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}

                {authMode === 'reset' && (
                  <>
                    <OTPInput value={otp} onChange={setOtp} />
                    <AuthInput
                      label="New Login PIN (M-PIN)"
                      placeholder="••••"
                      icon={<Lock size={20} color="#C83232" />}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <AuthInput
                      label="Confirm New M-PIN"
                      placeholder="••••"
                      icon={<Lock size={20} color="#C83232" />}
                      value={confirmMPin}
                      onChangeText={setConfirmMPin}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </>
                )}

                <AuthButton
                  title={authMode === 'forgot' ? "Send Code" : "Update Password"}
                  onPress={authMode === 'forgot' ? handleForgotPassword : handleResetPassword}
                  isLoading={isLoading}
                />

                <TouchableOpacity
                  style={{ marginTop: 24, alignItems: 'center' }}
                  onPress={() => switchMode('login')}
                >
                  <Text style={styles.navLink}>← Back to Login</Text>
                </TouchableOpacity>
              </>
            )}
          </AuthCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ScreenColors.auth.background },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    paddingTop: 80,
    paddingBottom: 40
  },
  header: { alignItems: 'center', marginBottom: 40 },
  logoImage: { width: 160, height: 50, marginBottom: 12, tintColor: '#1C1C1E' },
  tagline: { fontSize: responsiveFont(16), color: '#1C1C1E', letterSpacing: 0.5 },
  taglineHighlight: { color: '#8c9c32ff', fontWeight: '800' },

  // ── TOGGLE ──
  toggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: Radius.full, padding: 4, marginBottom: Spacing.xl },
  toggleBtn: { flex: 1, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', height: 44 },
  activeToggleBg: { width: '100%', height: '100%', borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', shadowColor: '#C83232', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 },
  toggleText: { fontSize: responsiveFont(14), fontWeight: '600', color: 'rgba(0,0,0,0.6)' },
  toggleTextActive: { color: '#1C1C1E', fontWeight: '800', fontSize: responsiveFont(14) },

  // ── FORM & TEXT ──
  form: { marginBottom: Spacing.sm },
  flowTitle: {
    fontSize: responsiveFont(22),
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.5
  },
  flowSub: {
    fontSize: responsiveFont(12.5),
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18
  },

  inputLabel: {
    fontSize: responsiveFont(10.5),
    fontWeight: '800',
    color: 'rgba(0,0,0,0.45)',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 14
  },

  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  linkText: {
    color: Colors.neonLime,
    fontWeight: '700',
    fontSize: responsiveFont(14)
  },

  socialSection: { marginTop: 40 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  dividerText: { marginHorizontal: 16, fontSize: responsiveFont(12), color: 'rgba(0,0,0,0.4)', fontWeight: '600', textTransform: 'uppercase' },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  socialBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)'
  },

  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32
  },
  securityText: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: responsiveFont(12),
    marginLeft: 8,
    fontWeight: '500'
  },

  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: Radius.md,
    height: 56,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)'
  },
  dropdownHeaderText: { color: '#1C1C1E', fontSize: responsiveFont(16), fontWeight: '700' },
  dropdownList: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: '#2A0845',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.neonLime,
    overflow: 'hidden',
    shadowColor: Colors.neonLime,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 1000,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)'
  },

  wizardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
    paddingHorizontal: 4
  },
  navLink: {
    color: 'rgba(0,0,0,0.6)',
    fontWeight: '700',
    fontSize: responsiveFont(14)
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 14,
    height: 56,
    marginBottom: 4,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
    padding: 0,
    margin: 0,
    height: '100%',
  },
  verifyInlineBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: Radius.xl,
    paddingHorizontal: 24,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  dropdownItemText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
  },
});