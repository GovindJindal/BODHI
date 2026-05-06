import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';
import { useNavigation } from '@react-navigation/native';
import { Shield, X, User, Landmark, ShieldCheck, LifeBuoy, LogOut, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { Colors, Spacing } from '../theme/tokens'; 

const getInitials = (name?: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 1).toUpperCase();
};

export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + 74; 
}

interface BodhiHeaderProps {
  showMore?: boolean;
  dark?: boolean;
  onInsurancePress?: () => void;
  showBack?: boolean;
  onBack?: () => void;
  username?: string;
}

export function BodhiHeader({ dark = false, onInsurancePress, showBack, onBack, username }: BodhiHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [profileOpen, setProfileOpen] = useState(false);

  const initials = getInitials(username);
  const displayName = username || 'BODHI User';

  // --- THE FIX: Dynamic text color based on the `dark` prop ---
  const headerTextColor = dark ? '#1C1C1E' : '#1C1C1E';
  const shadowColor = dark ? 'rgba(0,0,0,0.05)' : 'transparent';

  const handleLogout = () => {
    setProfileOpen(false);
    navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
  };

  return (
    <>
      <View style={[styles.wrapper, { paddingTop: insets.top }]}>
        {Platform.OS === 'ios' ? (
          <BlurView style={StyleSheet.absoluteFill} blurType={dark ? 'dark' : 'light'} blurAmount={20} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.9)' }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(5,5,5,0.75)' : 'rgba(0,0,0,0.2)' }]} />

        <View style={styles.inner}>
          <View style={styles.sideColumn}>
            {showBack ? (
              <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <ArrowLeft size={28} color={headerTextColor} /> {/* Dynamic Color */}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.avatarRing} onPress={() => setProfileOpen(true)} activeOpacity={0.8}>
                <View style={[styles.avatar, { backgroundColor: '#1A0800' }]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
                <View style={styles.onlineDot} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.centerLogo} pointerEvents="none">
            {/* Dynamic Color and Shadow applied here */}
            <Text style={[styles.logoText, { color: headerTextColor, textShadowColor: shadowColor }]}>
              BODHI
            </Text>
          </View>

          <View style={[styles.sideColumn, { alignItems: 'flex-end' }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={onInsurancePress}>
               <Shield size={26} color={'#C83232'} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)}>
        <View style={styles.modalOverlay}>
          {Platform.OS === 'ios' ? (
            <BlurView style={StyleSheet.absoluteFill} blurType="light" blurAmount={10} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)' }]} />
          )}
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setProfileOpen(false)} />
          
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account</Text>
              <TouchableOpacity onPress={() => setProfileOpen(false)} style={styles.closeBtn}>
                <X size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <View style={styles.userInfoCard}>
              <View style={[styles.largeAvatar, { backgroundColor: '#1A0800' }]}>
                <Text style={styles.largeAvatarText}>{initials}</Text>
              </View>
              <View style={styles.userInfoText}>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userUpi}>{displayName.split(' ')[0].toLowerCase()}@bodhi</Text>
              </View>
            </View>

            <View style={styles.menuGroup}>
              <MenuOption Icon={User} title="Personal Details" />
              <MenuOption Icon={Landmark} title="Bank Accounts & Cards" />
              <MenuOption Icon={ShieldCheck} title="Security & Biometrics" />
              <MenuOption Icon={LifeBuoy} title="Help & Support" />
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <LogOut size={20} color="#FF2D2D" strokeWidth={2.5} />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const MenuOption = ({ Icon, title }: { Icon: any, title: string }) => (
  <TouchableOpacity style={styles.menuOption} activeOpacity={0.7}>
    <View style={styles.menuOptionLeft}>
      <Icon size={22} color="#A0A0B0" strokeWidth={2} />
      <Text style={styles.menuOptionText}>{title}</Text>
    </View>
    <ChevronRight size={20} color="#606070" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, overflow: 'hidden' },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, height: 64 },
  
  sideColumn: { width: 60, justifyContent: 'center', zIndex: 20 }, 
  
  centerLogo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  logoText: { fontSize: responsiveFont(28), fontWeight: '900', letterSpacing: -0.5, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  
  avatarRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#C83232', padding: 2 },
  avatar: { width: '100%', height: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: responsiveFont(15), fontWeight: '700', color: '#3D4DFF' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#34c759', borderWidth: 2, borderColor: '#FDFDF9' },
  iconBtn: { padding: 8 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, borderTopWidth: 1, borderTopColor: 'rgba(200,50,50,0.15)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { fontSize: responsiveFont(20), fontWeight: '800', color: '#1C1C1E' },
  closeBtn: { padding: 6, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20 },
  
  userInfoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F0F0F', padding: Spacing.lg, borderRadius: 20, marginBottom: Spacing.xl },
  largeAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md, borderWidth: 2, borderColor: '#C83232' },
  largeAvatarText: { fontSize: responsiveFont(20), fontWeight: '800', color: '#1C1C1E' },
  userInfoText: { flex: 1 },
  userName: { fontSize: responsiveFont(18), fontWeight: '700', color: '#1C1C1E' },
  userUpi: { fontSize: responsiveFont(14), color: '#A0A0B0', marginTop: 2 },

  menuGroup: { backgroundColor: '#0F0F0F', borderRadius: 20, overflow: 'hidden', marginBottom: Spacing.xl },
  menuOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  menuOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  menuOptionText: { fontSize: responsiveFont(16), fontWeight: '600', color: '#1C1C1E' },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255, 45, 45, 0.1)', paddingVertical: Spacing.lg, borderRadius: 20, marginBottom: Spacing.lg },
  logoutText: { fontSize: responsiveFont(16), fontWeight: '700', color: '#C83232' },
});