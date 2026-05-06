/**
 * CreatePollScreen.tsx
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { CollaborationAPI } from '../api/client';

const C = {
  bg: '#FDFDF9', card: '#FFFFFF', border: 'rgba(0,0,0,0.06)',
  purple: '#C83232', lime: '#3D4DFF', white: '#1C1C1E',
  dim: 'rgba(0,0,0,0.4)', muted: 'rgba(0,0,0,0.25)', red: '#C83232',
};

export function CreatePollScreen({ route }: any) {
  const { groupId, groupType } = route.params || {};
  const navigation = useNavigation<any>();
  const [question, setQuestion]   = useState('');
  const [options, setOptions]     = useState(['', '']);
  const [expiresHours, setExpires] = useState('');
  const [loading, setLoading]     = useState(false);

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, '']);
  };
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };
  const updateOption = (idx: number, text: string) => {
    const next = [...options];
    next[idx] = text;
    setOptions(next);
  };

  const handleCreate = async () => {
    if (!question.trim()) { Alert.alert('Required', 'Enter a question'); return; }
    const filled = options.filter(o => o.trim());
    if (filled.length < 2) { Alert.alert('Required', 'At least 2 options needed'); return; }
    setLoading(true);
    try {
      await CollaborationAPI.createPoll(groupType, groupId, {
        question: question.trim(),
        options: filled,
        expires_hours: expiresHours ? parseInt(expiresHours) : undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to create poll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.title}>Create Poll</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }}>
        <Text style={s.label}>QUESTION *</Text>
        <TextInput
          style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 14 }]}
          placeholder="What would you like to ask?"
          placeholderTextColor={C.muted}
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={300}
        />

        <Text style={s.label}>OPTIONS *</Text>
        {options.map((opt, idx) => (
          <View key={idx} style={s.optionRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder={`Option ${idx + 1}`}
              placeholderTextColor={C.muted}
              value={opt}
              onChangeText={t => updateOption(idx, t)}
              maxLength={100}
            />
            {options.length > 2 && (
              <TouchableOpacity onPress={() => removeOption(idx)} style={s.removeBtn}>
                <Trash2 size={16} color={C.red} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {options.length < 6 && (
          <TouchableOpacity style={s.addOptionBtn} onPress={addOption}>
            <Plus size={16} color={C.purple} />
            <Text style={s.addOptionText}>Add Option</Text>
          </TouchableOpacity>
        )}

        <Text style={s.label}>EXPIRES IN (HOURS, OPTIONAL)</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. 24 (leave blank for no expiry)"
          placeholderTextColor={C.muted}
          value={expiresHours}
          onChangeText={setExpires}
          keyboardType="number-pad"
          maxLength={4}
        />

        <TouchableOpacity
          style={[s.createBtn, loading && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={C.bg} /> : <Text style={s.createBtnText}>Launch Poll 🗳️</Text>}
        </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.white, fontSize: responsiveFont(18), fontWeight: '800' },
  content: { padding: 20, paddingBottom: 60 },
  label: { color: C.dim, fontSize: responsiveFont(11), fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  input: {
    backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: C.white, fontSize: responsiveFont(15), borderWidth: 1, borderColor: C.border,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,51,102,0.1)', alignItems: 'center', justifyContent: 'center' },
  addOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(138,92,255,0.3)', borderStyle: 'dashed',
    paddingVertical: 12, paddingHorizontal: 16, marginTop: 4,
  },
  addOptionText: { color: C.purple, fontSize: responsiveFont(14), fontWeight: '600' },
  createBtn: {
    backgroundColor: C.lime, borderRadius: 18, paddingVertical: 18,
    alignItems: 'center', marginTop: 32,
  },
  createBtnText: { color: C.bg, fontSize: responsiveFont(17), fontWeight: '800' },
});
