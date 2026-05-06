// src/screens/InsuranceScreen.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Animated, Dimensions, Alert, ActivityIndicator, Platform,
  TextInput, KeyboardAvoidingView,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import DocumentPicker from 'react-native-document-picker';
import LinearGradient from 'react-native-linear-gradient';
import { 
  Zap, 
  Search, 
  MessageCircle, 
  CloudUpload, 
  FileText, 
  ChevronRight, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Diamond 
} from 'lucide-react-native';
import { Colors, Spacing, Radius, ScreenColors } from '../theme/tokens';
import { InsuranceAPI } from '../api/client';

const { width: W, height: H } = Dimensions.get('window');

interface Props { visible: boolean; onClose: () => void; }
type Phase = 'upload' | 'processing' | 'stories' | 'chat';

interface StorySlide {
  title: string; subtitle: string; explanation: string; clause_reference: string | null;
  confidence_level: 'High' | 'Medium' | 'Low'; fallback: string | null; icon: string; bgColor: string;
}
interface ChatMessage {
  id: string; role: 'user' | 'assistant'; text: string; confidence?: 'High' | 'Medium' | 'Low';
  clause?: string | null; loading?: boolean;
}

const STORY_QUESTIONS = [
  { q: 'What does this policy cover?', icon: '◈', bgColor: '#FFFFFF' },
  { q: 'What are the exclusions and things not covered?', icon: '✕', bgColor: '#FFFFFF' },
  { q: 'What is the claim process and timeline?', icon: '≡', bgColor: '#FFFFFF' },
  { q: 'What are the premium and payment details?', icon: '₹', bgColor: '#FFFFFF' },
  { q: 'Are there any hidden clauses or loopholes I should know about?', icon: '?', bgColor: '#FFFFFF' },
];

const CONFIDENCE_COLORS = { High: ScreenColors.brand.navy, Medium: '#BA7517', Low: '#E24B4A' };
const PRESET_QUESTIONS = ['Is maternity covered?', 'Pre-existing conditions?', 'Network hospitals?', 'What is my claim limit?', 'Is dental included?', 'How to file a claim?'];
const genId = () => Math.random().toString(36).slice(2);

async function pickPdfFile(): Promise<{ name: string; uri: string } | null> {
  try {
    const result = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.pdf] });
    return { name: result.name || 'document.pdf', uri: result.uri };
  } catch (err) {
    if (DocumentPicker.isCancel(err)) return null;
    throw err;
  }
}

export const InsuranceScreen: React.FC<Props> = ({ visible, onClose }) => {
  const [phase, setPhase]               = useState<Phase>('upload');
  const [documentId, setDocumentId]     = useState<string | null>(null);
  const [docName, setDocName]           = useState<string>('');
  const [slides, setSlides]             = useState<StorySlide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [uploading, setUploading]       = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const chatScrollRef                   = useRef<ScrollView>(null);

  const progressAnims = useRef(STORY_QUESTIONS.map(() => new Animated.Value(0))).current;
  const SLIDE_DURATION = 9000;

  const runProgress = useCallback((idx: number) => {
    progressAnims[idx].setValue(0);
    Animated.timing(progressAnims[idx], {
      toValue: 1, duration: SLIDE_DURATION, useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && idx < slides.length - 1) setCurrentSlide(idx + 1);
    });
  }, [progressAnims, slides.length]);

  useEffect(() => {
    if (phase === 'stories' && slides.length > 0) {
      progressAnims.forEach((a, i) => { a.setValue(i < currentSlide ? 1 : 0); });
      runProgress(currentSlide);
    }
    return () => { progressAnims.forEach(a => (a as any).stop?.()); };
  }, [currentSlide, phase, slides.length]);

  const buildSlides = async (docId: string | null) => {
    const generated: StorySlide[] = [];
    for (const { q, icon, bgColor } of STORY_QUESTIONS) {
      try {
        const res = await InsuranceAPI.query(q, docId ?? undefined);
        generated.push({ title: q.split(' ').slice(0, 5).join(' ') + '…', subtitle: 'INSURETECH SERIES', explanation: res.simple_explanation, clause_reference: res.clause_reference, confidence_level: res.confidence_level, fallback: res.fallback, icon, bgColor });
      } catch {
        generated.push({ title: q.split(' ').slice(0, 5).join(' ') + '…', subtitle: 'INSURETECH SERIES', explanation: 'Unable to retrieve information. Please consult your insurer directly.', clause_reference: null, confidence_level: 'Low', fallback: 'Try asking in the chat below.', icon, bgColor });
      }
    }
    return generated;
  };

  const handleUpload = async () => {
    let file: { name: string; uri: string } | null = null;
    try { file = await pickPdfFile(); if (!file) return; } catch { Alert.alert('Error', 'Could not open document picker.'); return; }
    setUploading(true); setPhase('processing'); setDocName(file.name);
    try {
      let docId: string | null = null;
      try {
        const ingested = await InsuranceAPI.ingest(file.uri, file.name);
        docId = ingested.document_id;
        setDocumentId(docId);
        console.log('Document ingested:', docId, 'chunks:', ingested.chunk_count);
      } catch (e) {
        console.warn('Ingestion failed, will use general context:', e);
      }
      const generated = await buildSlides(docId);
      setSlides(generated); setPhase('stories'); setCurrentSlide(0);
    } catch (e: any) { Alert.alert('Error', e.message ?? 'Something went wrong.'); setPhase('upload'); } finally { setUploading(false); }
  };

  const handleUseDemoDoc = async () => {
    // For demo, directly build slides without a real document (uses general insurance knowledge fallback)
    setPhase('processing'); setDocName('Demo Policy');
    try {
      setDocumentId(null);
      const generated = await buildSlides(null);
      setSlides(generated); setPhase('stories'); setCurrentSlide(0);
    } catch { Alert.alert('Error', 'Could not load demo. Please upload a document.'); setPhase('upload'); }
  };

  const goNext = () => { if (currentSlide < slides.length - 1) { progressAnims[currentSlide].setValue(1); setCurrentSlide(p => p + 1); } };
  const goPrev = () => { if (currentSlide > 0) { progressAnims[currentSlide].setValue(0); setCurrentSlide(p => p - 1); } };

  const openChat = () => {
    if (chatMessages.length === 0) setChatMessages([{ id: genId(), role: 'assistant', text: docName ? `Hi! I've analysed "${docName}". Ask me anything about your policy.` : "Hi! I'm your policy assistant." }]);
    setPhase('chat');
  };

  const sendMessage = async (text: string) => {
    const q = text.trim(); if (!q) return;
    const userMsg: ChatMessage = { id: genId(), role: 'user', text: q };
    const loadingMsg: ChatMessage = { id: genId(), role: 'assistant', text: '', loading: true };
    setChatMessages(prev => [...prev, userMsg, loadingMsg]); setChatInput(''); setChatLoading(true);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const res = await InsuranceAPI.query(q, documentId ?? undefined);
      setChatMessages(prev => prev.map(m => m.id === loadingMsg.id ? { ...m, loading: false, text: res.simple_explanation, confidence: res.confidence_level, clause: res.clause_reference } : m));
    } catch {
      setChatMessages(prev => prev.map(m => m.id === loadingMsg.id ? { ...m, loading: false, text: "Sorry, I couldn't reach the server. Please try again." } : m));
    } finally { setChatLoading(false); setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100); }
  };

  const reset = () => {
    setPhase('upload'); setSlides([]); setCurrentSlide(0); setDocumentId(null); setDocName(''); setChatMessages([]); setChatInput('');
    progressAnims.forEach(a => a.setValue(0));
  };

  const currentSlideData = slides[currentSlide];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        
        {/* ── GLOBAL SOFT-UI BACKGROUND ── */}
        <LinearGradient
          colors={['#FDFDF9', '#FFFFFF', '#FDFDF9']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* ═══════════════ UPLOAD PHASE ════════════════════════════════════ */}
        {phase === 'upload' && (
          <View style={styles.uploadPhase}>
            
            {/* Custom Close Button */}
            <TouchableOpacity onPress={onClose} style={styles.closeIconBtn} hitSlop={{top: 20, right: 20, bottom: 20, left: 20}}>
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>

            <ScrollView contentContainerStyle={styles.uploadContent} showsVerticalScrollIndicator={false}>
              <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%', alignItems: 'center' }}>
              
              {/* Glowing Orb Logo */}
              <View style={styles.orbContainer}>
                <View style={styles.orbRing1} />
                <View style={styles.orbRing2} />
                <View style={styles.orbShadowLayer} />
                <LinearGradient colors={[ScreenColors.brand.coral, ScreenColors.brand.coral]} style={styles.orbCore} start={{x:0, y:0}} end={{x:1, y:1}}>
                   <View style={styles.orbInnerCutout}>
                     <Diamond size={28} color="#FFFFFF" />
                   </View>
                </LinearGradient>
              </View>

              {/* Headers */}
              <Text style={styles.mainTitle}>
                Insurance{'\n'}Explained in <Text style={{ color: ScreenColors.brand.coral }}>30 sec</Text>
              </Text>
              <Text style={styles.mainSubtitle}>
                Upload your policy document and our AI will break it{'\n'}down — no jargon, no confusion.
              </Text>

              {/* Feature Cards */}
              <View style={styles.featureList}>
                {/* Fast Setup */}
                <View style={styles.featureCard}>
                  <View style={styles.featureIconWrap}>
                    <Zap size={20} color={ScreenColors.brand.navy} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={styles.featureTitle}>FAST SETUP</Text>
                    <Text style={styles.featureDesc}>Full analysis in under 5 minutes.</Text>
                  </View>
                  <View style={styles.featureBadge}>
                    <Clock size={12} color={ScreenColors.brand.navy} style={{ marginRight: 4 }} />
                    <Text style={styles.featureBadgeText}>~5 min</Text>
                  </View>
                </View>

                {/* Hidden Clauses */}
                <View style={styles.featureCard}>
                  <View style={styles.featureIconWrap}>
                    <Search size={20} color={ScreenColors.brand.navy} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={styles.featureTitle}>HIDDEN CLAUSES</Text>
                    <Text style={styles.featureDesc}>Loopholes and exclusions surfaced.</Text>
                  </View>
                  <View style={styles.featureBadge}>
                    <ShieldCheck size={12} color={ScreenColors.brand.navy} style={{ marginRight: 4 }} />
                    <Text style={styles.featureBadgeText}>100% Scan</Text>
                  </View>
                </View>

                {/* AI Chatbot */}
                <View style={styles.featureCard}>
                  <View style={styles.featureIconWrap}>
                    <MessageCircle size={20} color={ScreenColors.brand.navy} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={styles.featureTitle}>AI CHATBOT</Text>
                    <Text style={styles.featureDesc}>Ask follow-up questions instantly.</Text>
                  </View>
                  <View style={styles.featureBadge}>
                    <Sparkles size={12} color={ScreenColors.brand.navy} style={{ marginRight: 4 }} />
                    <Text style={styles.featureBadgeText}>24/7 AI</Text>
                  </View>
                </View>
              </View>

              {/* Main Upload Action */}
              <View style={styles.buttonShadowWrapper}>
                <TouchableOpacity style={styles.uploadMainBtn} onPress={handleUpload} disabled={uploading}>
                   <View style={styles.uploadIconCircle}>
                      <CloudUpload size={22} color="#FFFFFF" />
                   </View>
                   <View style={styles.uploadBtnTextWrap}>
                      <Text style={styles.uploadBtnTitle}>UPLOAD POLICY PDF</Text>
                      <Text style={styles.uploadBtnSub}>We support PDF up to 25MB</Text>
                   </View>
                   <View style={styles.uploadArrowCircle}>
                      <ChevronRight size={20} color="#FFFFFF" />
                   </View>
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or try with</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Demo Action */}
              <TouchableOpacity style={styles.demoMainBtn} onPress={handleUseDemoDoc} disabled={uploading}>
                 <View style={[styles.uploadIconCircle, { backgroundColor: 'rgba(255,90,0,0.15)' }]}>
                    <FileText size={22} color="#FF5A00" />
                 </View>
                 <View style={styles.uploadBtnTextWrap}>
                    <Text style={[styles.uploadBtnTitle, { color: '#1C1C1E' }]}>Try with demo document</Text>
                    <Text style={[styles.uploadBtnSub, { color: 'rgba(0,0,0,0.5)' }]}>See how BODHI AI works</Text>
                 </View>
                 <ChevronRight size={24} color="#FF5A00" />
              </TouchableOpacity>

              </View>
            </ScrollView>
          </View>
        )}

        {/* ═══════════════ PROCESSING PHASE ════════════════════════════════ */}
        {phase === 'processing' && (
          <View style={[styles.uploadPhase, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color={Colors.neonLime} style={{ marginBottom: Spacing.lg }} />
              <Text style={styles.processingTitle}>Analysing your policy…</Text>
              <Text style={styles.processingSubtitle}>{docName ? `"${docName}"` : 'Extracting key clauses'}</Text>
            </View>
          </View>
        )}

        {/* ═══════════════ STORIES PHASE ════════════════════════════════════ */}
        {phase === 'stories' && currentSlideData && (
          <View style={[styles.storySlide, { backgroundColor: '#FDFDF9' }]}>
            <View style={styles.progressBars}>
              {STORY_QUESTIONS.map((_, i) => (
                <View key={i} style={styles.progressBarTrack}><Animated.View style={[styles.progressBarFill, { width: progressAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /></View>
              ))}
            </View>

            <View style={styles.storyHeader}>
              <View style={styles.storyHeaderLeft}>
                <View style={styles.storyAvatar}><Text style={styles.storyAvatarText}>B</Text></View>
                <View><Text style={styles.storyUsername}>BODHI Vault</Text><Text style={styles.storySeriesLabel}>{currentSlideData.subtitle}</Text></View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <TouchableOpacity onPress={openChat} style={styles.chatHeaderBtn}><Text style={styles.chatHeaderBtnText}>Chat</Text></TouchableOpacity>
                <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
              </View>
            </View>

            <View style={styles.slideIconWrap}><View style={styles.slideIconCircle}><Text style={styles.slideIconText}>{currentSlideData.icon}</Text></View></View>

            <View style={styles.slideContent}>
              <Text style={styles.slideTitle}>{currentSlideData.title}</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: H * 0.28 }}>
                <Text style={styles.slideSubtitle}>{currentSlideData.explanation}</Text>
              </ScrollView>
              <View style={[styles.confidenceBadge, { borderColor: CONFIDENCE_COLORS[currentSlideData.confidence_level] }]}>
                <View style={[styles.confidenceDot, { backgroundColor: CONFIDENCE_COLORS[currentSlideData.confidence_level] }]} />
                <Text style={[styles.confidenceText, { color: CONFIDENCE_COLORS[currentSlideData.confidence_level] }]}>{currentSlideData.confidence_level} confidence</Text>
                {currentSlideData.clause_reference ? <Text style={styles.clauseRef}> · {currentSlideData.clause_reference}</Text> : null}
              </View>
            </View>

            <TouchableOpacity style={styles.tapLeft} onPress={goPrev} />
            <TouchableOpacity style={styles.tapRight} onPress={goNext} />

            <View style={styles.storyFooter}>
              <TouchableOpacity style={styles.queryBtn} onPress={openChat}><Text style={styles.queryBtnText}>Ask a question about this policy</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════ CHAT PHASE ═══════════════════════════════════════ */}
        {phase === 'chat' && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
            <View style={styles.chatHeader}>
              <TouchableOpacity style={styles.chatBackBtn} onPress={() => setPhase(slides.length > 0 ? 'stories' : 'upload')}><Text style={{ fontSize: responsiveFont(20), color: '#1C1C1E' }}>←</Text></TouchableOpacity>
              <View style={styles.chatHeaderInfo}>
                <View style={styles.storyAvatar}><Text style={styles.storyAvatarText}>AI</Text></View>
                <View><Text style={styles.chatHeaderTitle}>Policy Assistant</Text></View>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
            </View>

          <ScrollView ref={chatScrollRef} style={styles.chatMessages} contentContainerStyle={styles.chatMessagesContent} showsVerticalScrollIndicator={false}>
            <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
              {chatMessages.map(msg => (
                <View key={msg.id} style={[styles.msgBubble, msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAI]}>
                  {msg.loading ? <ActivityIndicator size="small" color={Colors.neonLime} /> : <Text style={[styles.msgText, msg.role === 'user' && styles.msgTextUser]}>{msg.text}</Text>}
                  {!msg.loading && msg.role === 'assistant' && msg.confidence && (
                    <View style={[styles.msgConfidenceBadge, { borderColor: CONFIDENCE_COLORS[msg.confidence] }]}>
                      <View style={[styles.msgConfidenceDot, { backgroundColor: CONFIDENCE_COLORS[msg.confidence] }]} />
                      <Text style={[styles.msgConfidenceText, { color: CONFIDENCE_COLORS[msg.confidence] }]}>{msg.confidence}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            </ScrollView>

            {/* Preset question chips */}
            {chatMessages.length <= 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll} contentContainerStyle={styles.presetsContainer}>
                <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%', flexDirection: 'row' }}>
                {PRESET_QUESTIONS.map(q => (
                  <TouchableOpacity key={q} style={styles.presetChip} onPress={() => sendMessage(q)} disabled={chatLoading}>
                    <Text style={styles.presetChipText}>{q}</Text>
                  </TouchableOpacity>
                ))}
                </View>
              </ScrollView>
            )}

            <View style={styles.chatInputBar}>
              <View style={{ maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
                <TextInput style={styles.chatInput} placeholder="Ask about your policy…" placeholderTextColor="rgba(0,0,0,0.4)" value={chatInput} onChangeText={setChatInput} onSubmitEditing={() => sendMessage(chatInput)} multiline />
                <TouchableOpacity style={[styles.sendBtn, (!chatInput.trim() || chatLoading) && { opacity: 0.4 }]} onPress={() => sendMessage(chatInput)} disabled={!chatInput.trim() || chatLoading}>
                  <Text style={{ fontSize: responsiveFont(18), color: '#FFFFFF', fontWeight: '700' }}>→</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFDF9' },
  
  // ── UPLOAD PHASE SOFT-UI ──
  uploadPhase: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40, position: 'relative' },
  closeIconBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, right: 20, zIndex: 10 },
  closeIconText: { fontSize: responsiveFont(24), color: 'rgba(0,0,0,0.5)', fontWeight: '300' },
  
  uploadContent: { paddingHorizontal: 20, paddingBottom: 60, alignItems: 'center' },
  
  orbContainer: { alignItems: 'center', justifyContent: 'center', height: 160, marginTop: 20, marginBottom: 20 },
  orbRing1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: 'rgba(216,90,48,0.22)', opacity: 0.5 },
  orbRing2: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: 'rgba(216,90,48,0.12)', opacity: 0.3 },
  orbShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(216,90,48,0.12)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  orbCore: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  orbInnerCutout: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  mainTitle: { fontSize: responsiveFont(32), fontWeight: '800', color: ScreenColors.brand.textPrimary, textAlign: 'center', lineHeight: 38, marginBottom: 16, letterSpacing: -0.5 },
  mainSubtitle: { fontSize: responsiveFont(13), color: ScreenColors.brand.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 32, paddingHorizontal: 10 },

  featureList: { width: '100%', gap: 12, marginBottom: 32 },
  featureCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
  featureIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(26,26,78,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1, borderColor: 'rgba(26,26,78,0.12)' },
  featureTextWrap: { flex: 1 },
  featureTitle: { fontSize: responsiveFont(13), fontWeight: '700', letterSpacing: 0.65, marginBottom: 4, color: '#1A1A4E' },
  featureDesc: { fontSize: responsiveFont(11), color: ScreenColors.brand.textSecondary },
  featureBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#EEF0FF', borderColor: '#C8CCF5' },
  featureBadgeText: { fontSize: responsiveFont(12), fontWeight: '600', color: '#1A1A4E' },

  buttonShadowWrapper: {
    width: '100%',
    borderRadius: 24,
    shadowColor: Colors.neonLime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  uploadMainBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A4E', borderRadius: 16, padding: 12, height: 60 },
  uploadIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  uploadBtnTextWrap: { flex: 1 },
  uploadBtnTitle: { fontSize: responsiveFont(15), fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  uploadBtnSub: { fontSize: responsiveFont(12), color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  uploadArrowCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  dividerText: { marginHorizontal: 16, fontSize: responsiveFont(12), color: 'rgba(0,0,0,0.4)', fontWeight: '500' },

  demoMainBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 12, borderWidth: 1, borderColor: 'rgba(255,90,0,0.3)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },

  // ── PROCESSING, STORIES, CHAT STYLES ──
  processingCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', width: W - 40, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 },
  processingTitle: { fontSize: responsiveFont(18), fontWeight: '800', color: '#1C1C1E', marginBottom: 8 },
  processingSubtitle: { fontSize: responsiveFont(14), color: 'rgba(0,0,0,0.6)', textAlign: 'center' },

  storyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 68 : 48, paddingBottom: 16 },
  storyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storyAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  storyAvatarText: { fontSize: responsiveFont(14), color: '#1C1C1E', fontWeight: '700' },
  storyUsername: { fontSize: responsiveFont(16), fontWeight: '700', color: '#1C1C1E' },
  storySeriesLabel: { fontSize: responsiveFont(10), color: 'rgba(0,0,0,0.5)', letterSpacing: 1 },
  closeBtn: { fontSize: responsiveFont(24), color: '#1C1C1E', fontWeight: '300', padding: 4 },
  chatHeaderBtn: { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  chatHeaderBtnText: { fontSize: responsiveFont(13), color: '#1C1C1E', fontWeight: '600' },

  progressBars: { flexDirection: 'row', paddingHorizontal: 16, gap: 4, paddingBottom: 8, paddingTop: Platform.OS === 'ios' ? 56 : 36, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  progressBarTrack: { flex: 1, height: 3, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: 3, backgroundColor: '#1C1C1E', borderRadius: 2 },

  storySlide: { flex: 1 },
  slideIconWrap: { alignItems: 'center', marginVertical: 40 },
  slideIconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 },
  slideIconText: { fontSize: responsiveFont(36), color: '#FF5A00', fontWeight: '700' },
  slideContent: { flex: 1, paddingHorizontal: 24, paddingBottom: 175 },
  slideTitle: { fontSize: responsiveFont(28), fontWeight: '800', color: '#1C1C1E', marginBottom: 16, lineHeight: 34 },
  slideSubtitle: { fontSize: responsiveFont(16), color: 'rgba(0,0,0,0.8)', lineHeight: 24, marginBottom: 24 },
  confidenceBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', gap: 6, marginBottom: 12 },
  confidenceDot: { width: 8, height: 8, borderRadius: 4 },
  confidenceText: { fontSize: responsiveFont(12), fontWeight: '700', letterSpacing: 0.5 },
  clauseRef: { fontSize: responsiveFont(12), color: 'rgba(0,0,0,0.5)' },

  tapLeft:  { position: 'absolute', left: 0,  top: 100, bottom: 200, width: W * 0.35 },
  tapRight: { position: 'absolute', right: 0, top: 100, bottom: 200, width: W * 0.35 },

  storyFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 40 },
  queryBtn: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  queryBtnText: { fontSize: responsiveFont(15), color: '#1C1C1E', fontWeight: '600' },

  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  chatBackBtn: { padding: 8 },
  chatHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginLeft: 8 },
  chatHeaderTitle: { fontSize: responsiveFont(16), fontWeight: '700', color: '#1C1C1E' },
  chatMessages: { flex: 1, backgroundColor: '#FDFDF9' },
  chatMessagesContent: { padding: 20, gap: 16, paddingBottom: 24 },
  msgBubble: { maxWidth: '85%', borderRadius: 20, padding: 16 },
  msgBubbleUser: { alignSelf: 'flex-end', backgroundColor: '#FF5A00', borderBottomRightRadius: 4 },
  msgBubbleAI: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
  msgText: { fontSize: responsiveFont(15), color: '#1C1C1E', lineHeight: 22 },
  msgTextUser: { color: '#FFFFFF' },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFFFF', padding: 12, paddingHorizontal: 20, gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  chatInput: { flex: 1, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, fontSize: responsiveFont(15), color: '#1C1C1E', maxHeight: 120, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.neonLime, alignItems: 'center', justifyContent: 'center' },

  presetsScroll: { maxHeight: 52, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  presetsContainer: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  presetChip: {
    backgroundColor: 'rgba(255,90,0,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,90,0,0.2)',
  },
  presetChipText: { fontSize: responsiveFont(12), color: '#FF5A00', fontWeight: '700' },

  msgConfidenceBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  msgConfidenceDot: { width: 6, height: 6, borderRadius: 3 },
  msgConfidenceText: { fontSize: responsiveFont(10), fontWeight: '700', letterSpacing: 0.4 },
});

export default InsuranceScreen;