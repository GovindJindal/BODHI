import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { TransactionAPI, TransferAPI } from '../api/client';
import { MOCK_TRANSACTIONS } from '../data/mockTransactions';

export interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  date: string;
  type: 'CREDIT' | 'DEBIT';
  account_last4?: string;
}

export function TransactionHistoryScreen() {
  const navigation = useNavigation();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTransactions = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const realTxs = await TransactionAPI.listManualTransactions();

      const translatedTxs: Transaction[] = realTxs.map((tx: any) => ({
        id: tx.id,
        amount: tx.amount,
        merchant: tx.merchant,
        category: tx.category,
        date: tx.created_at || tx.date,
        type: (tx.type || 'DEBIT').toUpperCase() as 'CREDIT' | 'DEBIT',
        account_last4: 'Manual'
      }));

      // Fetch real wallet ledger entries (transfers, top-ups, etc.)
      let ledgerTxs: Transaction[] = [];
      try {
        const ledgerData = await TransferAPI.getHistory();
        ledgerTxs = (ledgerData.transactions || []).map((tx: any) => ({
          id: tx.id,
          amount: tx.amount,
          merchant: tx.description || 'Wallet Transfer',
          category: 'Transfer',
          date: tx.created_at,
          type: tx.type as 'CREDIT' | 'DEBIT',
          account_last4: 'Wallet'
        }));
      } catch (e) {
        console.warn('Could not fetch ledger history:', e);
      }

      // Include mock transactions for a fuller history
      const mockTxs: Transaction[] = MOCK_TRANSACTIONS.map((tx: any) => ({
        ...tx,
        type: tx.type.toUpperCase() as 'CREDIT' | 'DEBIT'
      }));

      const combined = [...ledgerTxs, ...translatedTxs, ...mockTxs].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setTransactions(combined);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTransactions(false);
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isCredit = item.type.toUpperCase() === 'CREDIT';

    return (
      <TouchableOpacity
        style={styles.txRow}
        activeOpacity={0.7}
        onPress={() => setSelectedTx(item)}
      >
        <View style={styles.txLeft}>
          <View style={[styles.iconWrap, { backgroundColor: isCredit ? 'rgba(200,255,0,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            {isCredit ? (
              <ArrowDownRight size={20} color="#FFE600" />
            ) : (
              <ArrowUpRight size={20} color="#1C1C1E" />
            )}
          </View>
          <View style={styles.txTextWrap}>
            <Text style={styles.txMerchant} numberOfLines={1}>{item.merchant}</Text>
            <Text style={styles.txCategory} numberOfLines={1}>
              {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {item.account_last4 || item.category}
            </Text>
          </View>
        </View>

        <View style={styles.txRight}>
          <Text style={[styles.txAmount, { color: isCredit ? '#3D4DFF' : '#1C1C1E' }]} numberOfLines={1}>
            {isCredit ? '+' : '-'}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
          <ChevronLeft size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* List */}
      {isLoading && !isRefreshing ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#FFE600" size="large" />
        </View>
      ) : (
      <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#FFE600"
              colors={["#FFE600"]}
            />
          }
        />
      </View>
      )}

      {/* Transaction Details Modal */}
      <Modal visible={!!selectedTx} animationType="slide" transparent onRequestClose={() => setSelectedTx(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxWidth: isTablet ? (isLandscape() ? 700 : 600) : '100%', alignSelf: 'center', width: '100%', borderTopLeftRadius: 30, borderTopRightRadius: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Receipt Detail</Text>
              <TouchableOpacity onPress={() => setSelectedTx(null)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>

            {selectedTx && (
              <View style={styles.receiptMain}>
                <View style={[styles.receiptIcon, { backgroundColor: selectedTx.type.toUpperCase() === 'CREDIT' ? 'rgba(200,255,0,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                  {selectedTx.type.toUpperCase() === 'CREDIT' ? <ArrowDownRight size={32} color="#FFE600" /> : <ArrowUpRight size={32} color="#1C1C1E" />}
                </View>
                <Text style={styles.receiptMerchant}>{selectedTx.merchant}</Text>
                <Text style={[styles.receiptAmount, { color: selectedTx.type.toUpperCase() === 'CREDIT' ? '#3D4DFF' : '#1C1C1E' }]}>
                  {selectedTx.type.toUpperCase() === 'CREDIT' ? '+' : '-'}₹{selectedTx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>

                <View style={styles.receiptDivider} />

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Transaction Date</Text>
                  <Text style={styles.receiptResult}>{new Date(selectedTx.date).toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Reference ID</Text>
                  <Text style={styles.receiptResult}>{selectedTx.id.toUpperCase()}-BODHI</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Category</Text>
                  <Text style={styles.receiptResult}>{selectedTx.category}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Account</Text>
                  <Text style={styles.receiptResult}>•••• {selectedTx.account_last4 || 'N/A'}</Text>
                </View>

              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFDF9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  title: { fontSize: responsiveFont(18), fontWeight: '800', color: '#1C1C1E' },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },

  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  txTextWrap: { flex: 1 },
  txMerchant: { color: '#1C1C1E', fontSize: responsiveFont(16), fontWeight: '700', marginBottom: 4 },
  txCategory: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(12), fontWeight: '500' },
  txRight: { alignItems: 'flex-end', flexShrink: 0 },
  txAmount: { fontSize: responsiveFont(16), fontWeight: '800' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: '#1C1C1E', fontSize: responsiveFont(20), fontWeight: '800' },
  modalCloseBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16 },
  modalCloseText: { color: '#1C1C1E', fontSize: responsiveFont(14), fontWeight: '700' },
  receiptMain: { alignItems: 'center' },
  receiptIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  receiptMerchant: { color: '#1C1C1E', fontSize: responsiveFont(20), fontWeight: '800', marginBottom: 6 },
  receiptAmount: { fontSize: responsiveFont(32), fontWeight: '900', marginBottom: 24 },
  receiptDivider: { width: '100%', height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginBottom: 24 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16 },
  receiptLabel: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(14), fontWeight: '600' },
  receiptResult: { color: '#1C1C1E', fontSize: responsiveFont(14), fontWeight: '700' },
});
