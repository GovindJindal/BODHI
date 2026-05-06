import 'fast-text-encoding';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {Clipboard} from '@react-native-clipboard/clipboard';
import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DocumentPicker from 'react-native-document-picker';
import { 
  Pencil, Camera, Check, X as CloseIcon, 
  ChevronLeft, ChevronRight, User, Mail, Phone, Users, 
  LogOut, Landmark, UserCog, Fingerprint, Plane, Bell, 
  ShieldCheck, QrCode as QrIcon, Share2, Copy, Wallet, RefreshCw
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

import { Colors, Fonts, Radius, Spacing, ScreenColors } from '../theme/tokens';
import { ProfileAvatar, SectionLabel } from '../components/shared';
import { UsersAPI, BASE_URL } from '../api/client';

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [originalData, setOriginalData] = useState<any>(null);
  const [gapId, setGapId] = useState('');
  const [balance, setBalance] = useState(0);
  const [hasPassword, setHasPassword] = useState(true);

  // Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isQrModalVisible, setIsQrModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'verify_field' | 'verify_avatar' | 'confirm_save'>('verify_field');
  const [targetField, setTargetField] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const resolveAvatarUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${BASE_URL}/${path}`;
  };

  // Locked State
  const [editingField, setEditingField] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await UsersAPI.fetchProfile();
      setFullName(data.full_name);
      setEmail(data.email);
      setPhone(data.phone || '');
      setAge(data.age ? String(data.age) : '');
      setGender(data.gender || '');
      setGapId(data.gap_id || '');
      setBalance(data.balance || 0);
      setHasPassword(data.has_password);
      console.log("Profile Data Loaded:", { gapId: data.gap_id, balance: data.balance, hasPassword: data.has_password });
      
      setAvatarUrl(resolveAvatarUrl(data.avatar_url));
      
      setOriginalData(data);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      Alert.alert("Error", "Could not load profile details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem('bodhi_access_token');
            await AsyncStorage.removeItem('user_full_name');
            navigation.navigate('Auth');
          }
        }
      ]
    );
  };

  const copyToClipboard = () => {
    if (gapId) {
      Clipboard.setString(gapId);
      Alert.alert("Copied", "GAP ID copied to clipboard!");
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Pay me on BODHI using my GAP ID: ${gapId}`,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const handleEditPress = (field: string) => {
    setTargetField(field);
    setModalType(field === 'avatar' ? 'verify_avatar' : 'verify_field');
    setPassword('');
    setIsModalVisible(true);
  };

  const [isPickerActive, setIsPickerActive] = useState(false);

  const pickAvatar = async () => {
    if (isPickerActive) return;
    setIsPickerActive(true);
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.images],
      });
      const file = res[0];
      setLoading(true);
      const uploadRes = await UsersAPI.uploadAvatar(file.uri, file.name || 'avatar.jpg');
      setAvatarUrl(resolveAvatarUrl(uploadRes.avatar_url));
      Alert.alert("Success", "Profile picture updated!");
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error("Picker Error:", err);
      }
    } finally {
      setIsPickerActive(false);
      setLoading(false);
    }
  };

  const executeAction = async () => {
    if (hasPassword && !password && modalType !== 'confirm_save') {
      Alert.alert("Error", "M-PIN is required.");
      return;
    }

    setIsActionLoading(true);
    try {
      if (modalType === 'verify_field' || modalType === 'verify_avatar') {
        await UsersAPI.verifyMpin(password);
        setIsModalVisible(false);
        if (modalType === 'verify_avatar') {
          // Use setTimeout to ensure the modal is fully dismissed before opening picker
          setTimeout(() => {
            pickAvatar();
          }, 500);
        } else {
          setEditingField(targetField);
        }
      } else if (modalType === 'confirm_save') {
        const payload: any = { current_password: password };
        if (editingField === 'name') payload.full_name = fullName;
        if (editingField === 'phone') payload.phone = phone;
        if (editingField === 'age') payload.age = parseInt(age);
        if (editingField === 'gender') payload.gender = gender;

        await UsersAPI.updateProfile(payload);
        setOriginalData({ ...originalData, ...payload });
        setEditingField(null);
        setIsModalVisible(false);
        Alert.alert("Success", "Changes saved!");
      }
    } catch (error: any) {
      console.error("Action Error:", error.response?.data);
      const errorData = error.response?.data?.detail;
      let displayMsg = "Invalid M-PIN or update failed.";
      
      if (typeof errorData === 'string') {
        displayMsg = errorData;
      } else if (Array.isArray(errorData)) {
        displayMsg = errorData.map((e: any) => e.msg || JSON.stringify(e)).join('\n');
      } else if (errorData && typeof errorData === 'object') {
        displayMsg = JSON.stringify(errorData);
      }
      
      Alert.alert("Failed", displayMsg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSavePress = () => {
    setModalType('confirm_save');
    setIsModalVisible(true);
  };

  const isDirty = originalData && (
    fullName !== originalData.full_name || 
    phone !== (originalData.phone || '') ||
    age !== (originalData.age ? String(originalData.age) : '') ||
    gender !== (originalData.gender || '')
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.neonLime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <SafeAreaView style={{ flex: 1 }}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={28} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MY PROFILE</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }}>
          {/* ─── Avatar Section ─── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarGlow}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <ProfileAvatar
                    initial={fullName ? fullName.trim().charAt(0).toUpperCase() : 'B'}
                    size={84}
                  />
                )}
              </View>
              <TouchableOpacity 
                style={styles.editAvatarBtn}
                onPress={() => handleEditPress('avatar')}
              >
                <Camera size={16} color="#000" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userNameText}>{fullName}</Text>
            <Text style={styles.userEmailText}>{email}</Text>
          </View>

          {/* ─── Profile Details Card ─── */}
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={20} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
            )}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <User size={20} color={Colors.neonLime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>FULL NAME</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={fullName}
                  onChangeText={setFullName}
                  editable={editingField === 'name'}
                  placeholder="Enter Full Name"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                />
              </View>
              {editingField === 'name' ? (
                <TouchableOpacity onPress={handleSavePress}>
                  <Check size={20} color={Colors.neonLime} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => handleEditPress('name')}>
                  <Pencil size={18} color="rgba(0,0,0,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <Mail size={20} color="rgba(0,0,0,0.4)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <Text style={styles.readOnlyText}>{email}</Text>
              </View>
              <ShieldCheck size={18} color="rgba(0,0,0,0.3)" />
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <Phone size={20} color={Colors.neonLime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={phone}
                  onChangeText={setPhone}
                  editable={editingField === 'phone'}
                  placeholder="e.g., +91 9876543210"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  keyboardType="phone-pad"
                />
              </View>
              {editingField === 'phone' ? (
                <TouchableOpacity onPress={handleSavePress}>
                  <Check size={20} color={Colors.neonLime} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => handleEditPress('phone')}>
                  <Pencil size={18} color="rgba(0,0,0,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <User size={20} color={Colors.neonLime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>AGE</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={age}
                  onChangeText={setAge}
                  editable={editingField === 'age'}
                  placeholder="e.g., 25"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  keyboardType="number-pad"
                />
              </View>
              {editingField === 'age' ? (
                <TouchableOpacity onPress={handleSavePress}>
                  <Check size={20} color={Colors.neonLime} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => handleEditPress('age')}>
                  <Pencil size={18} color="rgba(0,0,0,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={styles.fieldIcon}>
                <Users size={20} color={Colors.neonLime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>GENDER</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={gender}
                  onChangeText={setGender}
                  editable={editingField === 'gender'}
                  placeholder="e.g., Female"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                />
              </View>
              {editingField === 'gender' ? (
                <TouchableOpacity onPress={handleSavePress}>
                  <Check size={20} color={Colors.neonLime} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => handleEditPress('gender')}>
                  <Pencil size={18} color="rgba(0,0,0,0.4)" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ─── Financial Identity ─── */}
          <SectionLabel title="Financial Identity" style={styles.sectionLabel} />
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={20} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
            )}
            <TouchableOpacity 
              style={styles.linkRow} 
              onPress={() => setIsQrModalVisible(true)}
            >
              <View style={[styles.fieldIcon, { backgroundColor: 'rgba(200, 255, 0, 0.1)' }]}>
                <QrIcon size={20} color={Colors.neonLime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>BODHI GAP ID</Text>
                <Text style={styles.linkSub}>Your unique scan & pay identity</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>
          </View>

          {/* ─── Account & Banking ─── */}
          <SectionLabel title="Account & Banking" style={styles.sectionLabel} />
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={20} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
            )}
            <TouchableOpacity 
              style={styles.linkRow} 
              onPress={() => navigation.navigate('BankAccounts')}
            >
              <View style={[styles.fieldIcon, { backgroundColor: 'rgba(51, 153, 255, 0.1)' }]}>
                <Landmark size={20} color="#3D4DFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Linked Bank Accounts</Text>
                <Text style={styles.linkSub}>Manage your primary funding sources</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.linkRow}
              onPress={() => navigation.navigate('VentureClub')}
            >
              <View style={[styles.fieldIcon, { backgroundColor: 'rgba(200, 255, 0, 0.1)' }]}>
                <UserCog size={20} color={Colors.neonLime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Venture Club Status</Text>
                <Text style={styles.linkSub}>Review your club membership details</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>
          </View>

          {/* ─── Security & Privacy ─── */}
          <SectionLabel title="Security & Privacy" style={styles.sectionLabel} />
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={20} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
            )}
            <TouchableOpacity 
              style={styles.linkRow}
              onPress={() => navigation.navigate('SecuritySettings')}
            >
              <View style={[styles.fieldIcon, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                <Fingerprint size={20} color="#C83232" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Biometrics & Security</Text>
                <Text style={styles.linkSub}>Secure your assets with FaceID / PIN</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>
          </View>

          {/* ─── Preferences ─── */}
          <SectionLabel title="App Preferences" style={styles.sectionLabel} />
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={20} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
            )}
            <TouchableOpacity 
              style={styles.linkRow}
              onPress={() => navigation.navigate('TravelBooking')}
            >
              <View style={[styles.fieldIcon, { backgroundColor: 'rgba(255, 153, 0, 0.1)' }]}>
                <Plane size={20} color="#FFB000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Travel Preferences</Text>
                <Text style={styles.linkSub}>Configure your luxury travel concierge</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.linkRow}
              onPress={() => navigation.navigate('Notifications')}
            >
              <View style={[styles.fieldIcon, { backgroundColor: 'rgba(0, 230, 118, 0.1)' }]}>
                <Bell size={20} color="#00E676" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Notifications</Text>
                <Text style={styles.linkSub}>Manage alerts and price updates</Text>
              </View>
              <ChevronRight size={18} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>
          </View>

          {/* ─── Action Buttons ─── */}
          <View style={styles.actionContainer}>
            <TouchableOpacity 
              style={[styles.primaryBtn, !editingField && styles.disabledBtn]}
              disabled={!editingField}
              onPress={handleSavePress}
            >
              <LinearGradient
                colors={editingField ? ['#3D4DFF', '#3D4DFF'] : ['#333', '#222']}
                style={styles.gradientBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.btnText, { color: editingField ? '#FFFFFF' : '#666' }]}>SAVE PROFILE</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <LogOut size={20} color="rgba(0,0,0,0.6)" />
              <Text style={styles.logoutBtnText}>Logout Session</Text>
            </TouchableOpacity>


          </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ─── GAP ID & QR Modal ─── */}
      <Modal
        visible={isQrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsQrModalVisible(false)}
      >
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={30} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
            )}
            <TouchableOpacity 
              style={styles.qrCloseBtn} 
              onPress={() => setIsQrModalVisible(false)}
            >
              <CloseIcon size={24} color="#1C1C1E" />
            </TouchableOpacity>

            <View style={styles.qrHeader}>
              <Text style={styles.qrModalTitle}>MY GAP ID</Text>
              <Text style={styles.qrModalSub}>Receive money instantly</Text>
            </View>

            <View style={styles.qrMainCard}>
              <QRCode
                value={`bodhi://pay?gap=${gapId}`}
                size={220}
                color="#000"
                backgroundColor="#FFFFFF"
              />
            </View>

            <View style={styles.qrFooter}>
              <View style={styles.qrIdBadge}>
                <Text style={styles.qrIdValue}>{gapId}</Text>
              </View>
              
              <View style={styles.qrActions}>
                <TouchableOpacity style={styles.qrActionBtn} onPress={copyToClipboard}>
                  <Copy size={20} color={Colors.neonLime} />
                  <Text style={styles.qrActionText}>COPY ID</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.qrActionBtn} onPress={handleShare}>
                  <Share2 size={20} color={Colors.neonLime} />
                  <Text style={styles.qrActionText}>SHARE QR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Security Modal ─── */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            {Platform.OS === 'ios' ? (
              <BlurView blurType="light" blurAmount={30} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
            )}
            <View style={styles.modalHeader}>
              <ShieldCheck size={24} color={Colors.neonLime} />
              <Text style={styles.modalTitle}>
                {modalType === 'confirm_save' ? "Save Changes?" : "Authorize Edit"}
              </Text>
              <Text style={styles.modalSub}>
                {modalType === 'confirm_save' 
                  ? "Are you sure you want to save these changes to your profile?" 
                  : (hasPassword 
                      ? `Enter your M-PIN to unlock the ${targetField || 'profile'} field for editing.`
                      : `Confirm to unlock the ${targetField || 'profile'} field for editing.`)}
              </Text>
            </View>

            {hasPassword && (
              <View style={styles.modalInputWrapper}>
                <TextInput
                  style={[styles.modalInput, { letterSpacing: 8, fontWeight: '800' }]}
                  placeholder="M-PIN"
                  placeholderTextColor="rgba(0,0,0,0.4)"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  autoFocus
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modalConfirm} 
                onPress={executeAction}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {modalType === 'confirm_save' ? "Yes, Save" : "Unlock Field"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ScreenColors.brand.appBgCool },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    height: 60,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  headerTitle: {
    color: '#1C1C1E',
    fontSize: responsiveFont(16),
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: Fonts.label,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarGlow: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.neonLime,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  userNameText: {
    color: '#111111',
    fontSize: responsiveFont(24),
    fontWeight: '700',
    marginTop: 16,
  },
  userEmailText: {
    color: '#6B6560',
    fontSize: responsiveFont(14),
    marginTop: 4,
  },
  // ... removed legacy QR and Balance styles ...
  glassCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  fieldIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  fieldLabel: {
    color: '#9B9B9B',
    fontSize: responsiveFont(10),
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  fieldInput: {
    color: '#111111',
    fontSize: responsiveFont(15),
    fontWeight: '600',
    padding: 0,
    margin: 0,
    minHeight: 24,
    ...Platform.select({
      android: { paddingVertical: 0, textAlignVertical: 'center' },
    }),
  },
  readOnlyText: {
    color: '#111111',
    fontSize: responsiveFont(15),
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 8,
  },
  actionContainer: {
    marginTop: 24,
    gap: 16,
  },
  sectionLabel: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: responsiveFont(11),
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 32,
    marginBottom: 12,
    marginLeft: 4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  linkTitle: {
    color: '#111111',
    fontSize: responsiveFont(15),
    fontWeight: '700',
    marginBottom: 2,
  },
  linkSub: {
    color: '#6B6560',
    fontSize: responsiveFont(12),
    fontWeight: '500',
  },
  primaryBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  gradientBtn: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: responsiveFont(16),
    fontWeight: '800',
    letterSpacing: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    gap: 8,
  },
  logoutBtnText: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: responsiveFont(15),
    fontWeight: '600',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  deleteBtnText: {
    color: '#FF4B4B',
    fontSize: responsiveFont(13),
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#1C1C1E',
    fontSize: responsiveFont(20),
    fontWeight: '700',
    marginTop: 12,
  },
  modalSub: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: responsiveFont(14),
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  modalInputWrapper: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 24,
  },
  modalInput: {
    height: 56,
    paddingHorizontal: 20,
    color: '#1C1C1E',
    fontSize: responsiveFont(16),
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#9B9B9B',
    fontSize: responsiveFont(16),
    fontWeight: '600',
  },
  modalConfirm: {
    flex: 1.5,
    height: 50,
    backgroundColor: Colors.neonLime,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: responsiveFont(16),
    fontWeight: '700',
  },
  modalDelete: {
    backgroundColor: '#FF4B4B',
  },
  modalDeleteText: {
    color: '#FFFFFF',
  },
  
  // New QR Modal Styles
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(253,253,249,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalContent: {
    width: '100%',
    borderRadius: 40,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  qrCloseBtn: {
    position: 'absolute',
    top: 24,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  qrModalTitle: {
    color: Colors.neonLime,
    fontSize: responsiveFont(14),
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  qrModalSub: {
    color: 'rgba(0,0,0,0.5)',
    fontSize: responsiveFont(16),
    fontWeight: '500',
  },
  qrMainCard: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    shadowColor: Colors.neonLime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  qrFooter: {
    width: '100%',
    alignItems: 'center',
    marginTop: 40,
  },
  qrIdBadge: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 32,
  },
  qrIdValue: {
    color: '#1C1C1E',
    fontSize: responsiveFont(18),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  qrActions: {
    flexDirection: 'row',
    gap: 24,
    width: '100%',
    justifyContent: 'center',
  },
  qrActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(200,255,0,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(200,255,0,0.2)',
  },
  qrActionText: {
    color: Colors.neonLime,
    fontSize: responsiveFont(12),
    fontWeight: '800',
    letterSpacing: 1,
  },
});
