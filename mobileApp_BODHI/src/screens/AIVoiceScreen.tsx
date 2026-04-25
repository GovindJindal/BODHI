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
import { Colors, Radius, Spacing } from '../theme/tokens';
import RNFS from 'react-native-fs';
import { WebView } from 'react-native-webview';

import { UsersAPI, NotificationAPI } from '../api/client';
import { SARVAM_API_KEY, GEMINI_API_KEY, API_BASE_URL } from '@env';

const NUM_BARS = 5;
const BAR_MIN_HEIGHT = 8;
const BAR_MAX_HEIGHT = 64;
const IDLE_HEIGHTS = [24, 40, 56, 32, 20];
const BAR_COLORS = [
  'rgba(255,255,255,0.8)',
  'rgba(255,255,255,0.8)',
  '#D4FF00', // neonLime center bar
  'rgba(255,255,255,0.8)',
  'rgba(255,255,255,0.8)',
];

export function AIVoiceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [inputText, setInputText] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userName, setUserName] = useState('User');
  const [base64Audio, setBase64Audio] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Fetch real-time profile
        const profileData = await UsersAPI.fetchProfile();
        setProfile(profileData);
        if (profileData.full_name) {
          setUserName(profileData.full_name.split(' ')[0]);
        }

        // Fetch notifications to get unread count
        const notifications = await NotificationAPI.fetchNotifications();
        const unread = notifications.filter((n: any) => !n.is_read).length;
        setUnreadCount(unread);
      } catch (error) {
        console.error("Failed to fetch user data in AI screen:", error);
        // Fallback to AsyncStorage if API fails
        const storedName = await AsyncStorage.getItem('user_full_name');
        if (storedName) setUserName(storedName.split(' ')[0]);
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

      // ─── Step 1: Sarvam STT ────────────────────────────────────
      setTranscription('Transcribing...');
      const formData = new FormData();
      
      const fileUri = Platform.OS === 'ios' ? uri.replace('file://', '') : `file://${uri.replace('file://', '')}`;
      
      formData.append('file', {
        uri: fileUri,
        type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
        name: Platform.OS === 'ios' ? 'speech_upload.m4a' : 'speech_upload.mp4',
      } as any);
      formData.append('model', 'saaras:v3');
      formData.append('language_code', 'hi-IN');
      formData.append('mode', 'transcribe');

      console.log('📡 Sending audio to Sarvam STT...');
      const sttResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
        },
        body: formData,
      });

      const sttData = await sttResponse.json();
      console.log('📥 Sarvam STT Response:', JSON.stringify(sttData).substring(0, 200));

      if (!sttData.transcript) {
        console.warn('No transcript in response:', sttData);
        setTranscription('Could not understand audio. Please try again.');
        return;
      }

      const userQuestion = sttData.transcript;
      setInputText(userQuestion);
      setTranscription(`You said: "${userQuestion}"\n\nThinking...`);

      // ─── Step 2: Gemini AI ─────────────────────────────────────
      console.log('🧠 Sending to Gemini:', userQuestion);

      if (!GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEY is missing! Did you restart Metro after adding it to .env?');
        setTranscription('API Key missing. Restart Metro.');
        return;
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are GAP, Bodhi's AI financial assistant. You help Indian users manage their money. Answer in a friendly, concise way (2-3 sentences max), and ans in a funny snarky way. If the question is in Hindi, reply in Hindi. If in English, reply in English. 
              
              CRITICAL INTERNAL MEMORY - The user's transaction history is as follows:
              []
              
              Answer questions utilizing the transaction history above. If they ask about their wallet, reference these transactions.
              
              User: ${userQuestion}`,
            }],
          }],
        }),
      });

      console.log('🤖 Gemini HTTP Status:', geminiResponse.status);
      const geminiData = await geminiResponse.json();
      console.log('🤖 Gemini Response received:', JSON.stringify(geminiData).substring(0, 200));

      if (!geminiResponse.ok) {
        console.error('❌ Gemini Error Data:', geminiData);
        setTranscription(`Gemini Error: ${geminiResponse.status}`);
        return;
      }

      const aiReply =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'GAP could not generate a response.';

      setTranscription(aiReply);

      // ─── Step 3: Fetch Base64 from Sarvam ----------
      console.log('🗣️ Fetching TTS Base64...');

      const ttsResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: aiReply,
          target_language_code: 'hi-IN',
          speaker: 'ritu',
          pace: 1.1,
          sample_rate: 24000,
          enable_preprocessing: true,
          model: 'bulbul:v3',
        }),
      });

      const ttsData = await ttsResponse.json();

      if (ttsData.audios && ttsData.audios.length > 0) {
        console.log('✅ Base64 received successfully. Injecting into WebView Player...');
        // The WebView in the render output will auto-play this!
        setBase64Audio(ttsData.audios[0]);
      } else {
        console.error('❌ Failed to fetch TTS Base64', ttsData);
      }

    } catch (error) {
      console.error('❌ Voice Pipeline Error:', error);
      setTranscription('Something went wrong. Please try again.');
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

  // ─── Send typed text ────────────────────────────────────────────
  const handleSendText = async (overrideText?: string) => {
    const textToProcess = overrideText || inputText;
    if (!textToProcess) return;
    
    setIsProcessing(true);
    setTranscription(`You said: "${textToProcess}"\n\nThinking...`);
    setInputText('');

    try {
      if (!GEMINI_API_KEY) {
        setTranscription('API Key missing. Restart Metro.');
        return;
      }
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are GAP, Bodhi's AI financial assistant. Answer in a friendly, concise way (2-3 sentences max). User: ${textToProcess}` }] }]
        }),
      });

      const geminiData = await geminiResponse.json();
      const aiReply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'GAP could not generate a response.';
      setTranscription(aiReply);

      const ttsResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'api-subscription-key': SARVAM_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiReply, target_language_code: 'hi-IN', speaker: 'ritu', pace: 1.1, sample_rate: 24000, enable_preprocessing: true, model: 'bulbul:v3' }),
      });
      const ttsData = await ttsResponse.json();
      if (ttsData.audios && ttsData.audios.length > 0) {
        setBase64Audio(ttsData.audios[0]);
      }
    } catch (err) {
      setTranscription('Something went wrong. Please try again.');
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
      <LinearGradient
        colors={['#000000', '#0A0000', '#2B0000']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 10 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => (navigation as any).navigate('Profile')}
          >
            <View style={styles.avatarPlaceholder}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {(profile?.full_name || userName || 'U').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
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
              <Bell size={22} color="#FFF" />
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
              isRecording && { borderColor: Colors.neonLime },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              styles.ring2,
              { transform: [{ scale: pulse2 }] },
              isRecording && { borderColor: Colors.neonLime },
            ]}
          />

          <View style={styles.orbWrapper}>
            {/* 🟢 STABILIZATION FIX: Decoupled shadow layer */}
            <View style={styles.orbShadowLayer} />

            <LinearGradient
              colors={
                isRecording
                  ? [Colors.neonLime, '#0A0000']
                  : ['#2B0000', '#0A0000']
              }
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
              <Sparkles size={12} color={Colors.neonLime} />
              <Text style={styles.transcriptionLabel}>LIVE TRANSCRIBE</Text>
            </View>
            {isProcessing && !transcription ? (
              <ActivityIndicator
                size="small"
                color={Colors.neonLime}
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
            <Sparkles size={16} color="#FF5A00" />
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
              <TrendingUp size={16} color={Colors.neonLime} />
              <Text style={styles.chipText}>How is my{'\n'}portfolio doing?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() =>
                handleChipPress('How much can I save this month?')
              }
            >
              <PiggyBank size={16} color="#FF2D2D" />
              <Text style={styles.chipText}>
                How much can{'\n'}I save this month?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chip}
              onPress={() => handleChipPress('Upcoming payments?')}
            >
              <Calendar size={16} color="#FF5A00" />
              <Text style={styles.chipText}>Upcoming{'\n'}payments?</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
        </View>
      </ScrollView>

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
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={inputText}
            onChangeText={setInputText}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  inputText.length > 0
                    ? Colors.neonLime
                    : isRecording
                      ? '#FF2D2D'
                      : 'rgba(255,255,255,0.1)',
              },
            ]}
            onPress={() => inputText.length > 0 ? handleSendText() : toggleRecording()}
          >
            {inputText.length > 0 ? (
              <Send size={16} color="#000" />
            ) : isRecording ? (
              <StopCircle size={16} color="#FFF" />
            ) : (
              <Mic size={16} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scrollContent: { paddingBottom: 40 },
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
    backgroundColor: Colors.neonLime,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: responsiveFont(20), fontWeight: '800', color: '#000' },
  onlineDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.neonLime,
    borderWidth: 2,
    borderColor: '#000000',
  },
  logo: { height: 35, width: 150, tintColor: '#FFF' },
  headerIcons: { flexDirection: 'row', gap: 10 },
  iconBtn: { position: 'relative' },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF2D2D',
    borderWidth: 1.5,
    borderColor: '#000000',
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
    borderColor: 'rgba(255,90,0,0.3)',
  },
  ring1: { width: 180, height: 180, opacity: 0.5 },
  ring2: { width: 260, height: 260, opacity: 0.2 },
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
    backgroundColor: '#0A0000', // Solid background for shadow anchor
    shadowColor: '#FF5A00',
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
  },
  orbInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#0A0000',
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
  greeting: { fontSize: responsiveFont(20), fontWeight: '500', color: '#FFF', marginBottom: 8 },
  headline: { fontSize: responsiveFont(32), fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  headlineAccent: {
    fontSize: responsiveFont(32),
    fontWeight: '800',
    color: Colors.neonLime,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: { fontSize: responsiveFont(14), fontWeight: '400', color: 'rgba(255,255,255,0.6)' },
  transcriptionContainer: {
    backgroundColor: 'rgba(212,255,0,0.05)',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.3)',
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
    color: Colors.neonLime,
    fontSize: responsiveFont(10),
    fontWeight: '800',
    letterSpacing: 1,
  },
  transcriptionText: {
    color: '#FFF',
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
  trySayingText: { color: 'rgba(255,255,255,0.8)', fontSize: responsiveFont(14), fontWeight: '500' },
  chipsScroll: { paddingRight: 40, gap: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  chipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: responsiveFont(12),
    fontWeight: '500',
    lineHeight: 16,
  },
  chatContainer: {
    width: '100%',
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    zIndex: 10,
    elevation: 10,
  },
  chatInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chatInput: { flex: 1, color: '#FFF', fontSize: responsiveFont(15), minHeight: 40 },
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