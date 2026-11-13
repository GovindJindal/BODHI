import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Send,
  Sparkles,
  TrendingUp,
  Calendar,
  PiggyBank,
  Mic,
  Bell,
  StopCircle,
  ShieldClose,
  Globe,
} from 'lucide-react-native';
import { Colors, Radius, Spacing, ScreenColors } from '../theme/tokens';
import RNFS from 'react-native-fs';
import { WebView } from 'react-native-webview';

import { UsersAPI, NotificationAPI, BASE_URL, AIAPI, TransactionAPI } from '../api/client';
import type { VoiceCommandResponse } from '../api/client';

const NUM_BARS = 5;
const BAR_MIN_HEIGHT = 8;
const BAR_MAX_HEIGHT = 64;
const IDLE_HEIGHTS = [24, 40, 56, 32, 20];
const BAR_COLORS = [
  '#1A1A4E',
  '#D85A30',
  '#1A1A4E',
  '#D85A30',
  '#1A1A4E',
];

export function AIVoiceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const openProfile = () => {
    const parentNav = (navigation as any).getParent?.();
    if (parentNav) {
      parentNav.navigate('Profile');
      return;
    }
    (navigation as any).navigate('Profile');
  };

  const [inputText, setInputText] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userName, setUserName] = useState('User');
  const [base64Audio, setBase64Audio] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const resolveAvatarUrl = (path: string | null | undefined) => {
    if (!path || typeof path !== 'string') return null;
    const trimmed = path.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http')) return trimmed;
    return `${BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const profileData = await UsersAPI.fetchProfile();
        if (profileData && typeof profileData === 'object') {
          setProfile({
            ...profileData,
            avatar_url: resolveAvatarUrl(profileData.avatar_url),
          });
          setAvatarFailed(false);
          const name = profileData.full_name;
          if (typeof name === 'string' && name.trim()) {
            setUserName(name.trim().split(/\s+/)[0]);
          }
        }

        const notifications = await NotificationAPI.fetchNotifications();
        const unread = Array.isArray(notifications)
          ? notifications.filter((n: any) => n && !n.is_read).length
          : 0;
        setUnreadCount(unread);
      } catch (error) {
        console.error("Failed to fetch user data in AI screen:", error);
        const storedName = await AsyncStorage.getItem('user_full_name');
        if (typeof storedName === 'string' && storedName.trim()) {
          setUserName(storedName.trim().split(/\s+/)[0]);
        }
      }
    };
    fetchUserData();
  }, []);

  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;

  // Pulse rings
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  // Waveform bars — one Animated.Value per bar
  const barAnims = useRef(
    IDLE_HEIGHTS.map(h => new Animated.Value(h))
  ).current;
  const waveLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ─── Pulse animation (always running) ──────────────────────────
  useEffect(() => {
    const makePulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1.3,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

    makePulse(pulse1, 0).start();
    makePulse(pulse2, 800).start();

    return () => {
      pulse1.stopAnimation();
      pulse2.stopAnimation();
    };
  }, []);

  // ─── Waveform animation (only while recording) ──────────────────
  useEffect(() => {
    if (isRecording) {
      // Each bar animates at a slightly different speed for organic feel
      const loops = barAnims.map((anim, i) => {
        const speed = 220 + i * 70; // staggered speeds: 220, 290, 360, 430, 500ms
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue:
                BAR_MIN_HEIGHT +
                Math.random() * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT),
              duration: speed,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: BAR_MIN_HEIGHT + Math.random() * 20,
              duration: speed,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
          ])
        );
      });

      waveLoopRef.current = Animated.parallel(loops);
      waveLoopRef.current.start();
    } else {
      // Stop wave and ease bars back to idle heights
      waveLoopRef.current?.stop();
      waveLoopRef.current = null;

      barAnims.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: IDLE_HEIGHTS[i],
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isRecording]);

  // ─── Start recording ────────────────────────────────────────────
  const startRecording = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);
        if (
          granted['android.permission.RECORD_AUDIO'] !==
          PermissionsAndroid.RESULTS.GRANTED
        ) {
          console.log('Microphone permission denied');
          return;
        }
      }

      setIsRecording(true);
      // 🟢 Tweak: Gives immediate visual feedback to the user
      setTranscription('Listening...');

      const path = Platform.select({
        ios: 'speech_upload.m4a',
        android: `${RNFS.CachesDirectoryPath}/speech_upload.mp4`,
      });

      const uri = await audioRecorderPlayer.startRecorder(path);
      console.log('Recording started at:', uri);

      // 🟢 THE FIX: This empty listener absorbs the native events 
      // and stops the "rn-recordback" warning from spamming your console.
      audioRecorderPlayer.addRecordBackListener((e) => {
        return;
      });

    } catch (err) {
      console.error('Failed to start recording:', err);
      setIsRecording(false);
    }
  };

  // ─── Stop recording + send to Sarvam STT ───────────────────────
  const stopRecordingAndTranscribe = async () => {
    try {
      setIsRecording(false);
      setIsProcessing(true);

      const uri = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      console.log('Recording stopped. File at:', uri);

      if (!uri) {
        setIsProcessing(false);
        return;
      }

      setTranscription('Thinking...');
      const result = await AIAPI.command(uri);
      if (!result.transcript) {
        setTranscription(result.text_response || 'Could not understand audio. Please try again.');
        return;
      }
      await presentReply(result);
    } catch (error: any) {
      console.error('Voice Pipeline Error:', error?.message || error);
      setTranscription(aiErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startRecording();
    }
  };

  const aiErrorMessage = (error: any) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (error?.code === 'ECONNABORTED') return 'GAP took too long to answer. Please try again.';
    return 'Something went wrong. Please try again.';
  };

  /** Shows the reply, plays the voice and offers to log any detected transaction. */
  const presentReply = async (result: VoiceCommandResponse) => {
    setTranscription(result.transcript
      ? `You said: "${result.transcript}"\n\n${result.text_response}`
      : result.text_response);
    if (result.audio_base64) setBase64Audio(result.audio_base64);

    const tx = result.transaction_data;
    if (result.intent === 'add_transaction' && tx && tx.amount > 0) {
      Alert.alert(
        'Log this transaction?',
        `${tx.type === 'CREDIT' ? 'Received' : 'Spent'} ₹${tx.amount.toLocaleString('en-IN')} · ${tx.merchant} (${tx.category})`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: async () => {
              try {
                await TransactionAPI.saveVoiceTransaction({
                  merchant: tx.merchant,
                  category: tx.category,
                  amount: tx.amount,
                  type: tx.type,
                  note: result.transcript,
                });
                Alert.alert('Saved', 'Transaction added to your history.');
              } catch (e) {
                Alert.alert('Error', 'Could not save the transaction. Please try again.');
              }
            },
          },
        ],
      );
    }
  };

  // ─── Send typed text ────────────────────────────────────────────
  const handleSendText = async (overrideText?: string) => {
    const textToProcess = (overrideText || inputText).trim();
    if (!textToProcess || isProcessing) return;

    setIsProcessing(true);
    setTranscription(`You said: "${textToProcess}"\n\nThinking...`);
    setInputText('');

    try {
      const result = await AIAPI.chat(textToProcess);
      await presentReply(result);
    } catch (err: any) {
      setTranscription(aiErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Chip tap → show in transcription box immediately ───────────
  const handleChipPress = (text: string) => {
    handleSendText(text);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={[ScreenColors.brand.appBgWarmWhite, '#FFFFFF', ScreenColors.brand.appBgWarmWhite]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 10, flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%', flex: 1 }}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={openProfile}
          >
            {profile?.avatar_url && !avatarFailed ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImage}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {(profile?.full_name || userName || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.onlineDot} />
          </TouchableOpacity>

          <Image
            source={require('../../assets/images/bodhi-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.headerIcons}>
            <TouchableOpacity 
              style={styles.iconBtn}
              onPress={() => (navigation as any).navigate('Notifications')}
            >
              <Bell size={22} color="#1C1C1E" />
              {unreadCount > 0 && <View style={styles.notifBadge} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Hidden WebView for bulletproof Base64 Audio Playback */}
        {base64Audio ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: `<audio autoplay src="data:audio/wav;base64,${base64Audio}" onended="window.ReactNativeWebView.postMessage('ended')" />` }}
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled={true}
            onMessage={(event) => {
              if (event.nativeEvent.data === 'ended') {
                console.log('🛑 Audio finished playing via WebView');
                setBase64Audio(null);
              }
            }}
            style={{ width: 0, height: 0, opacity: 0 }}
          />
        ) : null}

        {/* ─── Glowing Orb ─── */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={toggleRecording}
          style={styles.orbContainer}
        >
          <Animated.View
            style={[
              styles.pulseRing,
              styles.ring1,
              { transform: [{ scale: pulse1 }] },
              isRecording && { borderColor: '#3D4DFF' },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              styles.ring2,
              { transform: [{ scale: pulse2 }] },
              isRecording && { borderColor: '#3D4DFF' },
            ]}
          />

          <View style={styles.orbWrapper}>
            {/* 🟢 STABILIZATION FIX: Decoupled shadow layer */}
            <View style={styles.orbShadowLayer} />

            <LinearGradient
              colors={['#FFFFFF', '#FFFFFF']}
              style={styles.orb}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.orbInner}>
                <View style={styles.waveform}>
                  {barAnims.map((anim, i) => (
                    <Animated.View
                      key={i}
                      style={[
                        styles.waveBar,
                        {
                          height: anim,
                          backgroundColor: BAR_COLORS[i],
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>

        {/* ─── Text Block ─── */}
        <View style={styles.textBlock}>
          <Text style={styles.greeting}>Hi {userName}! 👋</Text>
          <Text style={styles.headline}>Ask anything about</Text>
          <Text style={styles.headlineAccent}>your money</Text>
          <Text style={styles.subtitle}>
            {isRecording
              ? 'Listening...'
              : isProcessing
                ? 'Processing intent...'
                : 'Tap the orb to speak...'}
          </Text>
        </View>

        {/* ─── Live Transcribe Box ─── */}
        {(transcription !== '' || isProcessing) && (
          <View style={styles.transcriptionContainer}>
            <View style={styles.transcriptionBadge}>
              <Sparkles size={12} color={'#3D4DFF'} />
              <Text style={styles.transcriptionLabel}>LIVE TRANSCRIBE</Text>
            </View>
            {isProcessing && !transcription ? (
              <ActivityIndicator
                size="small"
                color={'#3D4DFF'}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              />
            ) : (
              <Text style={styles.transcriptionText}>"{transcription}"</Text>
            )}
          </View>
        )}

        {/* ─── Try Saying Chips ─── */}
        <View style={styles.trySayingSection}>
          <View style={styles.trySayingHeader}>
              <Sparkles size={16} color={ScreenColors.brand.navy} />
            <Text style={styles.trySayingText}>Try saying</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <TouchableOpacity
              style={styles.chip}
              onPress={() => handleChipPress('How is my portfolio doing?')}
            >
              <TrendingUp size={16} color={'#3D4DFF'} />
              <Text style={styles.chipText}>How is my{'\n'}portfolio doing?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() =>
                handleChipPress('How much can I save this month?')
              }
            >
              <PiggyBank size={16} color="#C83232" />
              <Text style={styles.chipText}>
                How much can{'\n'}I save this month?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() => handleChipPress('Upcoming payments?')}
            >
              <Calendar size={16} color="#C83232" />
              <Text style={styles.chipText}>Upcoming{'\n'}payments?</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
        </View>
      </ScrollView>
      </View>

      {/* ─── Bottom Chat Input ─── */}
      <View
        style={[
          styles.chatContainer,
          { paddingBottom: Math.max(insets.bottom, 20) },
        ]}
      >
        <View style={styles.chatInputWrapper}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type your message..."
            placeholderTextColor="rgba(0,0,0,0.4)"
            value={inputText}
            onChangeText={setInputText}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  inputText.length > 0
                    ? ScreenColors.brand.navy
                    : isRecording
                      ? '#C83232'
                      : 'rgba(0,0,0,0.1)',
              },
            ]}
            onPress={() => inputText.length > 0 ? handleSendText() : toggleRecording()}
          >
            {inputText.length > 0 ? (
              <Send size={16} color="#FFF" />
            ) : isRecording ? (
              <StopCircle size={16} color="#FFF" />
            ) : (
              <Mic size={16} color="#1C1C1E" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ScreenColors.brand.appBgWarmWhite },
  scrollContent: { paddingBottom: 40, minHeight: '100%' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  avatarContainer: { position: 'relative' },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: responsiveFont(20), fontWeight: '800', color: '#1C1C1E' },
  onlineDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3D4DFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  logo: { height: 35, width: 150, tintColor: '#1C1C1E' },
  headerIcons: { flexDirection: 'row', gap: 10 },
  iconBtn: { position: 'relative' },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C83232',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 220,
    marginTop: 10,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(200,50,50,0.32)',
  },
  ring1: { width: 180, height: 180, opacity: 0.45 },
  ring2: { width: 260, height: 260, opacity: 0.22 },
  orbWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  orbShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 70,
    backgroundColor: '#FFFFFF', // Solid background for shadow anchor
    shadowColor: '#C83232',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 16,
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(26,26,78,0.1)',
  },
  orbInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waveBar: { width: 6, borderRadius: 3 },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: 15,
  },
  greeting: { fontSize: responsiveFont(20), fontWeight: '500', color: '#1C1C1E', marginBottom: 8 },
  headline: { fontSize: responsiveFont(32), fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5 },
  headlineAccent: {
    fontSize: responsiveFont(32),
    fontWeight: '800',
    color: '#D85A30',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: { fontSize: responsiveFont(14), fontWeight: '400', color: '#AAAAAA' },
  transcriptionContainer: {
    backgroundColor: 'rgba(61,77,255,0.05)',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(61,77,255,0.3)',
    borderStyle: 'dashed',
    marginBottom: 40,
  },
  transcriptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  transcriptionLabel: {
    color: '#3D4DFF',
    fontSize: responsiveFont(10),
    fontWeight: '800',
    letterSpacing: 1,
  },
  transcriptionText: {
    color: '#1C1C1E',
    fontSize: responsiveFont(15),
    fontStyle: 'italic',
    lineHeight: 22,
  },
  trySayingSection: { paddingLeft: 20, marginTop: 20 },
  trySayingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  trySayingText: { color: 'rgba(0,0,0,0.8)', fontSize: responsiveFont(14), fontWeight: '500' },
  chipsScroll: { paddingRight: 40, gap: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EEF8',
    borderWidth: 1,
    borderColor: '#D8D4F0',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  chipText: {
    color: '#1A1A4E',
    fontSize: responsiveFont(12),
    fontWeight: '500',
    lineHeight: 16,
  },
  chatContainer: {
    width: '100%',
    backgroundColor: '#FDFDF9',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    zIndex: 10,
    elevation: 10,
  },
  chatInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: Radius.full,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chatInput: { flex: 1, color: '#1C1C1E', fontSize: responsiveFont(15), minHeight: 40 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});

export default AIVoiceScreen;