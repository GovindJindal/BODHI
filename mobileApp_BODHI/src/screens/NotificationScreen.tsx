import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { ChevronLeft, Bell, CheckCheck, Info, AlertTriangle, Briefcase, CheckCircle2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NotificationAPI } from '../api/client';
import { ScreenColors } from '../theme/tokens';

interface Notification {
  id: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT' | 'TRADE';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export const NotificationScreen = () => {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await NotificationAPI.fetchNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    try {
      await NotificationAPI.markAllAsRead();
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await NotificationAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const getIcon = (type: string, isRead: boolean) => {
    const color = isRead ? ScreenColors.notifications.timestamp : ScreenColors.notifications.iconInfo;
    switch (type) {
      case 'SUCCESS': return <CheckCircle2 size={20} color={color} />;
      case 'WARNING': return <AlertTriangle size={20} color={ScreenColors.notifications.iconMarket} />;
      case 'ALERT': return <AlertTriangle size={20} color={ScreenColors.notifications.iconSecurity} />;
      case 'TRADE': return <Briefcase size={20} color={ScreenColors.notifications.iconMarket} />;
      default: return <Info size={20} color={color} />;
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity 
      style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
      onPress={() => markAsRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        {getIcon(item.type, item.is_read)}
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.row}>
          <Text style={[styles.title, !item.is_read && styles.unreadText]}>{item.title}</Text>
          {!item.is_read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.time}>{new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color={ScreenColors.notifications.title} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markAllAsRead} style={styles.headerAction}>
          <CheckCheck size={20} color={ScreenColors.notifications.markAllRead} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ScreenColors.notifications.markAllRead} size="large" />
        </View>
      ) : (
      <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ScreenColors.notifications.markAllRead} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Bell size={64} color={ScreenColors.notifications.timestamp} />
              <Text style={styles.emptyText}>All caught up!</Text>
              <Text style={styles.emptySub}>No new notifications for you.</Text>
            </View>
          }
        />
      </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ScreenColors.notifications.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ScreenColors.notifications.itemBorder,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: ScreenColors.notifications.title, fontSize: responsiveFont(18), fontWeight: '700' },
  headerAction: { padding: 4 },
  listContent: { paddingBottom: 20 },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    backgroundColor: ScreenColors.notifications.itemBackground,
    borderBottomColor: ScreenColors.notifications.itemBorder,
  },
  unreadItem: { backgroundColor: ScreenColors.notifications.unreadBackground, borderLeftWidth: 3, borderLeftColor: ScreenColors.notifications.unreadAccent },
  iconContainer: { marginRight: 16, paddingTop: 2 },
  contentContainer: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { color: ScreenColors.notifications.title, fontSize: responsiveFont(15), fontWeight: '600' },
  unreadText: { color: ScreenColors.notifications.title },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ScreenColors.notifications.unreadAccent },
  message: { color: ScreenColors.notifications.body, fontSize: responsiveFont(13), lineHeight: 20 },
  time: { color: ScreenColors.notifications.timestamp, fontSize: responsiveFont(12), marginTop: 8 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { color: ScreenColors.notifications.title, fontSize: responsiveFont(18), fontWeight: '700', marginTop: 20 },
  emptySub: { color: ScreenColors.notifications.body, fontSize: responsiveFont(14), marginTop: 8 },
});
