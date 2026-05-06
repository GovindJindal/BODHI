/**
 * CollaborationView.tsx
 * Overhauled Premium Component for Chat, Polls, and Activity Feed.
 * Controlled by parent screen tabs.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Dimensions, Image
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { 
  Send, Plus, CheckCircle2, User, 
  Share2, MoreHorizontal, Clock, Check,
  BarChart2, Activity
} from 'lucide-react-native';
import { CollaborationAPI, BASE_URL } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';

const { width: W } = Dimensions.get('window');

const C = {
  bg: '#FDFDF9', 
  card: '#FFFFFF', 
  border: 'rgba(0,0,0,0.08)',
  purple: '#C83232', 
  neonLime: '#3D4DFF', 
  white: '#1C1C1E',
  dim: 'rgba(0,0,0,0.4)', 
  muted: 'rgba(0,0,0,0.1)',
  red: '#C83232',
};

type CollabTab = 'CHAT' | 'POLLS' | 'FEED';

interface CollaborationViewProps {
  type: 'trip' | 'investment';
  id: number;
  activeTab: CollabTab;
}

export function CollaborationView({ type, id, activeTab }: CollaborationViewProps) {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [myId, setMyId] = useState('');
  const [inputText, setInputText] = useState('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    AsyncStorage.getItem('bodhi_user_id').then(val => setMyId(val || ''));
    loadData();
    connectWs();
    return () => wsRef.current?.close();
  }, [id, type]);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [msgs, pls, acts] = await Promise.all([
        CollaborationAPI.getMessages(type, id),
        CollaborationAPI.listPolls(type, id),
        CollaborationAPI.getActivity(type, id),
      ]);
      setMessages(msgs);
      setPolls(pls);
      setActivity(acts);
    } catch (e) {
      console.error("Collab load error:", e);
    } finally {
      setLoading(false);
    }
  };

  const connectWs = async () => {
    if (!id) return;
    const token = await AsyncStorage.getItem('bodhi_access_token');
    if (!token) return;
    const wsBase = BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');
    const ws = new WebSocket(`${wsBase}/collaboration/ws/${type}/${id}/chat?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'message' || data.type === 'system') {
          setMessages(prev => [...prev, data]);
          if (activeTab === 'CHAT') {
            setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      } catch {}
    };
    ws.onclose = () => setTimeout(connectWs, 3000);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ message: text }));
      } else {
        await CollaborationAPI.sendMessage(type, id, text);
        loadData();
      }
    } catch (e) {
      Alert.alert("Error", "Failed to send message");
    }
  };

  const handleVote = async (pollId: string, optionId: number) => {
    try {
      await CollaborationAPI.votePoll(type, id, pollId, optionId);
      loadData();
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.detail || "Failed to vote");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={C.neonLime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── CHAT ── */}
      {activeTab === 'CHAT' && (
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 140 : 0}
        >
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(item, i) => item.id || String(i)}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isMe = item.sender_id === myId;
              const isSystem = item.type === 'system';
              
              if (isSystem) {
                return (
                  <View style={styles.systemMsgContainer}>
                    <Text style={styles.systemMsg}>{item.message}</Text>
                  </View>
                );
              }

              return (
                <View style={[styles.bubbleWrapper, isMe ? styles.bubbleMeWrapper : styles.bubbleThemWrapper]}>
                  {!isMe && (
                    <View style={styles.avatarMini}>
                      <User size={14} color={C.white} />
                    </View>
                  )}
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}
                    <Text style={[styles.msgText, isMe && { color: C.bg }]}>{item.message}</Text>
                    <View style={styles.msgFooter}>
                      <Text style={[styles.msgTime, isMe && { color: 'rgba(0,0,0,0.4)' }]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {isMe && <Check size={10} color="rgba(0,0,0,0.4)" style={{ marginLeft: 4 }} />}
                    </View>
                  </View>
                </View>
              );
            }}
          />
          
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TouchableOpacity style={styles.attachBtn}>
                <Plus size={20} color={C.dim} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Message..."
                placeholderTextColor={C.dim}
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
            </View>
            <TouchableOpacity 
              style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]} 
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Send size={18} color={C.bg} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── POLLS ── */}
      {activeTab === 'POLLS' && (
        <View style={{ flex: 1 }}>
          <View style={styles.pollHeaderRow}>
             <Text style={styles.tabTitle}>Active Polls</Text>
             <TouchableOpacity 
              style={styles.newPollBtn}
              onPress={() => navigation.navigate('CreatePoll', { groupId: id, groupType: type })}
            >
              <Plus size={14} color={C.bg} strokeWidth={3} />
              <Text style={styles.newPollText}>Create</Text>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={polls}
            keyExtractor={p => p.id}
            contentContainerStyle={styles.pollList}
            renderItem={({ item: poll }) => {
              const voted = poll.my_vote !== null;
              return (
                <View style={styles.pollCard}>
                  <View style={styles.pollMeta}>
                    <Text style={styles.pollAuthor}>Group Decision</Text>
                    <Clock size={12} color={C.dim} />
                  </View>
                  <Text style={styles.pollQuestion}>{poll.question}</Text>
                  
                  {poll.options.map((opt: any) => (
                    <TouchableOpacity 
                      key={opt.id} 
                      style={[styles.pollOpt, poll.my_vote === opt.id && styles.pollOptSelected]}
                      onPress={() => handleVote(poll.id, opt.id)}
                      disabled={voted}
                      activeOpacity={0.8}
                    >
                      {voted && (
                        <View style={[styles.pollProgress, { width: `${opt.pct}%` }]} />
                      )}
                      <View style={styles.pollOptContent}>
                        <Text style={[styles.pollOptText, poll.my_vote === opt.id && { color: C.neonLime }]}>
                          {opt.text}
                        </Text>
                        {voted && <Text style={styles.pollOptPct}>{opt.pct}%</Text>}
                      </View>
                    </TouchableOpacity>
                  ))}
                  
                  {voted && (
                    <View style={styles.pollFooter}>
                      <CheckCircle2 size={12} color={C.neonLime} />
                      <Text style={styles.votedNote}>You voted • {poll.total_votes} total votes</Text>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <BarChart2 size={40} color={C.muted} />
                <Text style={styles.emptyText}>No active polls</Text>
              </View>
            }
          />
        </View>
      )}

      {/* ── FEED ── */}
      {activeTab === 'FEED' && (
        <View style={{ flex: 1 }}>
          <Text style={[styles.tabTitle, { marginHorizontal: 20, marginTop: 10 }]}>Activity Timeline</Text>
          <FlatList
            data={activity}
            keyExtractor={a => String(a.id)}
            contentContainerStyle={styles.feedList}
            renderItem={({ item: a, index }) => (
              <View style={styles.feedRow}>
                <View style={styles.feedLeft}>
                  <View style={styles.feedDot} />
                  {index !== activity.length - 1 && <View style={styles.feedLine} />}
                </View>
                <View style={styles.feedCard}>
                  <Text style={styles.feedText}>
                    <Text style={styles.feedUser}>{a.user_name}</Text>
                    {' '}{a.action_type.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.feedTime}>
                    {new Date(a.created_at).toLocaleDateString()} • {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Activity size={40} color={C.muted} />
                <Text style={styles.emptyText}>No activity logs yet</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  tabTitle: { color: C.white, fontSize: responsiveFont(18), fontWeight: '800', letterSpacing: -0.5 },

  // CHAT
  chatList: { paddingHorizontal: 16, paddingVertical: 20 },
  bubbleWrapper: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleMeWrapper: { justifyContent: 'flex-end' },
  bubbleThemWrapper: { justifyContent: 'flex-start' },
  avatarMini: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 4 },
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleMe: { backgroundColor: C.neonLime, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: C.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  senderName: { color: C.purple, fontSize: responsiveFont(11), fontWeight: '800', marginBottom: 2 },
  msgText: { color: C.white, fontSize: responsiveFont(15), lineHeight: 20 },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  msgTime: { color: C.dim, fontSize: responsiveFont(9), fontWeight: '600' },
  
  systemMsgContainer: { alignItems: 'center', marginVertical: 12 },
  systemMsg: { color: C.dim, fontSize: responsiveFont(11), fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  inputWrapper: { flex: 1, flexDirection: 'row', backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, alignItems: 'flex-end', paddingHorizontal: 8, minHeight: 48 },
  attachBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: C.white, fontSize: responsiveFont(15), paddingHorizontal: 12, paddingVertical: 12, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.neonLime, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  // POLLS
  pollHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 10 },
  newPollBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.neonLime, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 },
  newPollText: { color: C.bg, fontSize: responsiveFont(12), fontWeight: '800' },
  pollList: { padding: 20 },
  pollCard: { backgroundColor: C.card, borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  pollMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  pollAuthor: { color: C.dim, fontSize: responsiveFont(11), fontWeight: '700', flex: 1 },
  pollQuestion: { color: C.white, fontSize: responsiveFont(18), fontWeight: '800', marginBottom: 20, letterSpacing: -0.3 },
  pollOpt: { borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden', height: 52, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.02)' },
  pollOptSelected: { borderColor: C.neonLime, backgroundColor: 'rgba(61,77,255,0.05)' },
  pollProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(61,77,255,0.08)' },
  pollOptContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, alignItems: 'center', zIndex: 1 },
  pollOptText: { color: C.white, fontSize: responsiveFont(15), fontWeight: '600' },
  pollOptPct: { color: C.neonLime, fontSize: responsiveFont(14), fontWeight: '800' },
  pollFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  votedNote: { color: C.neonLime, fontSize: responsiveFont(11), fontWeight: '700' },

  // FEED
  feedList: { padding: 20 },
  feedRow: { flexDirection: 'row', minHeight: 70 },
  feedLeft: { alignItems: 'center', width: 20, marginRight: 15 },
  feedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.purple, borderWidth: 2, borderColor: C.bg, zIndex: 2 },
  feedLine: { width: 2, flex: 1, backgroundColor: C.muted, marginVertical: -5 },
  feedCard: { flex: 1, backgroundColor: C.card, padding: 14, borderRadius: 18, marginBottom: 15, borderWidth: 1, borderColor: C.border },
  feedText: { color: C.white, fontSize: responsiveFont(14), lineHeight: 20 },
  feedUser: { color: C.purple, fontWeight: '800' },
  feedTime: { color: C.dim, fontSize: responsiveFont(10), marginTop: 6, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, opacity: 0.5 },
  emptyText: { color: C.white, fontSize: responsiveFont(14), fontWeight: '600', marginTop: 12 },
});
