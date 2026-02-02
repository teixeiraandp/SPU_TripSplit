import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExpenseRow } from '@/components/ExpenseRow';
import {
  fetchTrip,
  fetchTripBalances,
  addTripMember,
  fetchFriends,
  searchUsers,
  createPayment,
  confirmPayment,
  declinePayment,
  TripBalances
} from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { formatCurrency } from '@/utils/calculations';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Trip, User } from '@/types';

type PaymentMethod = 'venmo' | 'zelle' | 'cash' | 'other';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Array.isArray(id) ? id[0] : id;
  console.log("Route param id:", id); //todo
  console.log("Route param id raw:", id); //todo
  console.log("Route param tripId:", tripId); //todo
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [balancesData, setBalancesData] = useState<TripBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTo, setPaymentTo] = useState<{ userId: string; username: string } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('venmo');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadTrip = async () => {
    if (typeof tripId !== 'string' || !tripId) {
      console.log("No valid tripId:", tripId);
      setTrip(null);
      setLoading(false);
      return;
    }
  
    try {
      setLoading(true);
      console.log("Loading trip:", tripId);
  
      const [tripData, balances] = await Promise.all([
        fetchTrip(tripId),
        fetchTripBalances(tripId),
      ]);
  
      console.log("Trip loaded ok:", tripData?.id);
      setTrip(tripData);
      setBalancesData(balances);
  
      try {
        const f = await fetchFriends();
        setFriends(f);
      } catch {
        setFriends([]);
      }
    } catch (err) {
      console.error("loadTrip failed for id:", tripId, err);
      setTrip(null);
    } finally {
      setLoading(false);
    }
  };
  

  useFocusEffect(
    useCallback(() => {
      loadTrip();
    }, [id])
  );

  const handleSearchUsers = async (query: string) => {
    setNewMemberUsername(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchUsers(query);
      setSearchResults(results);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddMember = async (username?: string) => {
    const usernameToAdd = username || newMemberUsername.trim();
    if (!usernameToAdd) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    if (trip?.people.includes(usernameToAdd)) {
      Alert.alert('Already a Member', `${usernameToAdd} is already in this trip`);
      return;
    }
    setAddingMember(true);
    try {
      await addTripMember(tripId as string, usernameToAdd);
      Alert.alert('Success', `Added ${usernameToAdd} to the trip!`);
      setNewMemberUsername('');
      setSearchResults([]);
      setShowAddMember(false);
      loadTrip();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const openPaymentModal = (toUserId: string, toUsername: string, suggestedAmount?: number) => {
    setPaymentTo({ userId: toUserId, username: toUsername });
    setPaymentAmount(suggestedAmount ? suggestedAmount.toFixed(2) : '');
    setPaymentMethod('venmo');
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentTo) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    setSubmittingPayment(true);
    try {
      await createPayment(tripId as string, {
        toUserId: paymentTo.userId,
        amount,
        method: paymentMethod,
      });
      Alert.alert('Payment Recorded!', `Waiting for @${paymentTo.username} to confirm.`);
      setShowPaymentModal(false);
      setPaymentTo(null);
      setPaymentAmount('');
      loadTrip();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleConfirmPayment = async (paymentId: string, fromUsername: string) => {
    setRespondingTo(paymentId);
    try {
      await confirmPayment(paymentId);
      Alert.alert('Confirmed!', `Payment from @${fromUsername} confirmed`);
      loadTrip();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to confirm payment');
    } finally {
      setRespondingTo(null);
    }
  };

  const handleDeclinePayment = async (paymentId: string, fromUsername: string, amount: number) => {
    Alert.alert(
      'Decline Payment',
      `Are you sure @${fromUsername} didn't pay you ${formatCurrency(amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "They didn't pay me",
          style: 'destructive',
          onPress: async () => {
            setRespondingTo(paymentId);
            try {
              await declinePayment(paymentId);
              Alert.alert('Declined', 'Payment has been declined');
              loadTrip();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to decline payment');
            } finally {
              setRespondingTo(null);
            }
          },
        },
      ]
    );
  };

  const getInitials = (username: string) => username.slice(0, 2).toUpperCase();

  const availableFriends = friends.filter(friend => !trip?.people.includes(friend.username));
  const filteredSearchResults = searchResults.filter(u => !trip?.people.includes(u.username));

  const formatPaymentText = (payment: any) => {
    const isFromMe = payment.fromUser?.id === user?.id;
    const isToMe = payment.toUser?.id === user?.id;
    if (isFromMe) return `You paid @${payment.toUser?.username}`;
    if (isToMe) return `@${payment.fromUser?.username} paid you`;
    return `@${payment.fromUser?.username} paid @${payment.toUser?.username}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.dark.tint} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>← Trips</Text>
            </Pressable>

            <Pressable
              style={styles.editButton}
              onPress={() =>
                router.push({
                  pathname: '/trip/[id]/edit',
                  params: { id: String(id) },
                })
              }
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>Trip</Text> //todo
        </View>

        <Text style={styles.errorText}>Trip not found</Text>
      </SafeAreaView>
    );
  }

  const userBalance = trip.userBalance || 0;
  const total = trip.totalAmount || 0;
  const pendingPaymentsToMe = trip.payments?.filter((p: any) => p.status === 'pending' && p.toUser?.id === user?.id) || [];
  const confirmedPayments = trip.payments?.filter((p: any) => p.status === 'confirmed') || [];
  const pendingPaymentsFromMe = trip.payments?.filter((p: any) => p.status === 'pending' && p.fromUser?.id === user?.id) || [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Trips</Text>
          </Pressable>

          <Pressable
            style={styles.editButton}
            onPress={() => {
              if (typeof tripId !== "string" || !tripId) return;
              router.push(`/trip/${tripId}/edit`);
            }}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>

        </View>
        <Text style={styles.title}>Trip</Text>
      </View>


      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {trip.location && (
            <View style={styles.chip}><Text style={styles.chipText}>📍 {trip.location}</Text></View>
          )}
          <View style={styles.chip}><Text style={styles.chipText}>{trip.people.length} travelers</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Total: {formatCurrency(total)}</Text></View>
          <View style={[styles.chip, styles.statusChip]}><Text style={styles.statusChipText}>{trip.status}</Text></View>
        </View>

        {/* Members Section */}
        <View style={styles.membersSection}>
          <View style={styles.memberHeader}>
            <Text style={styles.sectionTitle}>Members</Text>
            <Pressable style={styles.addMemberBtn} onPress={() => { setShowAddMember(!showAddMember); setNewMemberUsername(''); setSearchResults([]); }}>
              <Text style={styles.addMemberBtnText}>{showAddMember ? '✕ Cancel' : '+ Add'}</Text>
            </Pressable>
          </View>

          {showAddMember && (
            <View style={styles.addMemberSection}>
              {availableFriends.length > 0 && (
                <View style={styles.quickAddSection}>
                  <Text style={styles.quickAddLabel}>Pick from friends:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendsScroll}>
                    {availableFriends.map((friend) => (
                      <Pressable key={friend.id} style={styles.friendQuickAdd} onPress={() => handleAddMember(friend.username)} disabled={addingMember}>
                        <View style={styles.friendQuickAvatar}><Text style={styles.friendQuickAvatarText}>{getInitials(friend.username)}</Text></View>
                        <Text style={styles.friendQuickName}>@{friend.username}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={styles.searchSection}>
                <Text style={styles.quickAddLabel}>{availableFriends.length > 0 ? 'Or search for a user:' : 'Search for a user:'}</Text>
                <View style={styles.addMemberForm}>
                  <TextInput style={styles.memberInput} placeholder="Enter username..." placeholderTextColor={Colors.dark.textSecondary} value={newMemberUsername} onChangeText={handleSearchUsers} autoCapitalize="none" />
                  <Pressable style={[styles.addBtn, addingMember && styles.addBtnDisabled]} onPress={() => handleAddMember()} disabled={addingMember || !newMemberUsername.trim()}>
                    {addingMember ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addBtnText}>Add</Text>}
                  </Pressable>
                </View>
                {searching && <ActivityIndicator size="small" color={Colors.dark.tint} style={{ marginTop: 10 }} />}
                {filteredSearchResults.length > 0 && (
                  <View style={styles.searchResultsContainer}>
                    {filteredSearchResults.slice(0, 3).map((u) => (
                      <Pressable key={u.id} style={styles.searchResultItem} onPress={() => handleAddMember(u.username)} disabled={addingMember}>
                        <View style={styles.searchResultAvatar}><Text style={styles.searchResultAvatarText}>{getInitials(u.username)}</Text></View>
                        <View style={styles.searchResultInfo}>
                          <Text style={styles.searchResultName}>@{u.username}</Text>
                          <Text style={styles.searchResultEmail}>{u.email}</Text>
                        </View>
                        <Text style={styles.tapToAdd}>Tap to add</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.membersList}>
            {trip.people.map((person, index) => (
              <View key={index} style={styles.memberChip}><Text style={styles.memberChipText}>{person}</Text></View>
            ))}
          </View>
        </View>

        {/* Balance Card */}
        {userBalance !== 0 && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceTitle}>Your Balance</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>{userBalance > 0 ? 'Others owe you' : 'You owe'}</Text>
              <Text style={[styles.balanceValue, userBalance > 0 ? styles.balancePositive : styles.balanceNegative]}>{formatCurrency(Math.abs(userBalance))}</Text>
            </View>
          </View>
        )}

        {/* Pending Payments To Confirm */}
        {pendingPaymentsToMe.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.sectionTitle}>Confirm Payments</Text>
            {pendingPaymentsToMe.map((payment: any) => (
              <View key={payment.id} style={styles.pendingPaymentCard}>
                <View style={styles.pendingPaymentInfo}>
                  <Text style={styles.pendingPaymentText}>@{payment.fromUser?.username} says they paid you</Text>
                  <Text style={styles.pendingPaymentAmount}>{formatCurrency(parseFloat(payment.amount))}{payment.method ? ` via ${payment.method}` : ''}</Text>
                </View>
                <View style={styles.pendingPaymentActions}>
                  <Pressable style={styles.confirmBtn} onPress={() => handleConfirmPayment(payment.id, payment.fromUser?.username)} disabled={respondingTo === payment.id}>
                    <Text style={styles.confirmBtnText}>{respondingTo === payment.id ? '...' : 'Confirm'}</Text>
                  </Pressable>
                  <Pressable style={styles.declineBtn} onPress={() => handleDeclinePayment(payment.id, payment.fromUser?.username, parseFloat(payment.amount))} disabled={respondingTo === payment.id}>
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Pending Payments From Me */}
        {pendingPaymentsFromMe.length > 0 && (
          <View style={styles.waitingSection}>
            <Text style={styles.sectionTitle}>Awaiting Confirmation</Text>
            {pendingPaymentsFromMe.map((payment: any) => (
              <View key={payment.id} style={styles.waitingPaymentCard}>
                <Text style={styles.waitingPaymentText}>You paid @{payment.toUser?.username}</Text>
                <Text style={styles.waitingPaymentAmount}>{formatCurrency(parseFloat(payment.amount))}{payment.method ? ` via ${payment.method}` : ''}</Text>
                <Text style={styles.waitingPaymentMeta}>Waiting for @{payment.toUser?.username} to confirm</Text>
              </View>
            ))}
          </View>
        )}

        {/* Settlements Section */}
        {balancesData && balancesData.settlements.length > 0 && (
          <View style={styles.settlementsSection}>
            <Text style={styles.sectionTitle}>Settle Up</Text>
            <Text style={styles.settlementsHint}>Tap a suggestion to record a payment</Text>
            {balancesData.settlements.map((settlement, idx) => (
              <Pressable key={idx} style={styles.settlementRow} onPress={() => openPaymentModal(settlement.to.userId, settlement.to.username, settlement.amount)}>
                <View style={styles.settlementInfo}>
                  <Text style={styles.settlementText}>
                    <Text style={styles.settlementName}>{settlement.from.userId === user?.id ? 'You' : `@${settlement.from.username}`}</Text>
                    {' → '}
                    <Text style={styles.settlementName}>{settlement.to.userId === user?.id ? 'You' : `@${settlement.to.username}`}</Text>
                  </Text>
                </View>
                <Text style={styles.settlementAmount}>{formatCurrency(settlement.amount)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* All Settled */}
        {balancesData && balancesData.settlements.length === 0 && trip.expenses.length > 0 && (
          <View style={styles.allSettledCard}>
            <Text style={styles.allSettledIcon}>✓</Text>
            <Text style={styles.allSettledText}>All settled up!</Text>
            <Text style={styles.allSettledSubtext}>No payments needed</Text>
          </View>
        )}

        {/* Add Expense */}
        <Pressable style={styles.addExpenseBanner} onPress={() => router.push(`/new-expense?tripId=${id}`)}>
          <Text style={styles.addExpenseText}>+ Add expense</Text>
        </Pressable>

        {/* Expenses */}
        <Text style={styles.sectionTitle}>Expenses</Text>
        {trip.expenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No expenses yet</Text>
            <Text style={styles.emptySubtext}>Tap "Add expense" to start tracking.</Text>
          </View>
        ) : (
          <View style={styles.expenseList}>
            {trip.expenses.map((expense, index) => (
              <ExpenseRow key={expense.id || index} expense={expense} onPress={() => {}} />
            ))}
          </View>
        )}

        {/* Payment History */}
        {confirmedPayments.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Payment History</Text>
            <View style={styles.paymentList}>
              {confirmedPayments.map((payment: any) => (
                <View key={payment.id} style={styles.paymentRow}>
                  <View style={styles.paymentIcon}><Text style={styles.paymentIconText}>💸</Text></View>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentText}>{formatPaymentText(payment)}</Text>
                    <Text style={styles.paymentMeta}>{payment.method ? `${payment.method} · ` : ''}{new Date(payment.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.paymentAmount}>{formatCurrency(parseFloat(payment.amount))}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={showPaymentModal} animationType="slide" transparent={true} onRequestClose={() => setShowPaymentModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <Pressable onPress={() => setShowPaymentModal(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            {paymentTo && (
              <>
                <Text style={styles.payingTo}>Paying <Text style={styles.payingToName}>@{paymentTo.username}</Text></Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput style={styles.amountInput} placeholder="0.00" placeholderTextColor={Colors.dark.textSecondary} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" autoFocus />
                </View>
                <Text style={styles.methodLabel}>Payment Method</Text>
                <View style={styles.methodOptions}>
                  {(['venmo', 'zelle', 'cash', 'other'] as PaymentMethod[]).map((method) => (
                    <Pressable key={method} style={[styles.methodChip, paymentMethod === method && styles.methodChipActive]} onPress={() => setPaymentMethod(method)}>
                      <Text style={[styles.methodChipText, paymentMethod === method && styles.methodChipTextActive]}>{method.charAt(0).toUpperCase() + method.slice(1)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.confirmNote}>@{paymentTo.username} will need to confirm this payment</Text>
                <Pressable style={[styles.recordButton, submittingPayment && styles.recordButtonDisabled]} onPress={handleRecordPayment} disabled={submittingPayment}>
                  {submittingPayment ? <ActivityIndicator color="#fff" /> : <Text style={styles.recordButtonText}>Record Payment</Text>}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  headerTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',},
  backButton: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.cardSecondary, alignSelf: 'flex-start', marginBottom: Spacing.sm },
  backButtonText: { fontSize: FontSizes.md, color: Colors.dark.text },
  title: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.dark.text },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.cardSecondary },
  chipText: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary },
  statusChip: { backgroundColor: 'rgba(56, 189, 248, 0.1)', borderColor: 'rgba(56, 189, 248, 0.5)' },
  statusChipText: { fontSize: FontSizes.sm, color: '#bae6fd' },
  membersSection: { backgroundColor: Colors.dark.cardSecondary, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.border, marginBottom: Spacing.md },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  addMemberBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.dark.tint },
  addMemberBtnText: { fontSize: FontSizes.sm, color: '#fff', fontWeight: '500' },
  addMemberSection: { marginBottom: Spacing.md },
  quickAddSection: { marginBottom: Spacing.md },
  quickAddLabel: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  friendsScroll: { marginBottom: Spacing.sm },
  friendQuickAdd: { alignItems: 'center', marginRight: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.dark.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border, minWidth: 80 },
  friendQuickAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.successLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  friendQuickAvatarText: { fontSize: FontSizes.sm, fontWeight: '600', color: '#fff' },
  friendQuickName: { fontSize: FontSizes.xs, color: Colors.dark.text },
  searchSection: { borderTopWidth: 1, borderTopColor: Colors.dark.border, paddingTop: Spacing.md },
  addMemberForm: { flexDirection: 'row', gap: Spacing.sm },
  memberInput: { flex: 1, backgroundColor: Colors.dark.background, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.dark.text, fontSize: FontSizes.base, borderWidth: 1, borderColor: Colors.dark.border },
  addBtn: { backgroundColor: Colors.dark.tint, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  editButton: {paddingVertical: 5, paddingHorizontal: 10, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.cardSecondary,},
  editButtonText: {fontSize: FontSizes.md, color: Colors.dark.tint, fontWeight: '600',},
  searchResultsContainer: { marginTop: Spacing.sm },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.background, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.dark.border },
  searchResultAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.dark.tint, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  searchResultAvatarText: { fontSize: FontSizes.xs, fontWeight: '600', color: '#fff' },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.dark.text },
  searchResultEmail: { fontSize: FontSizes.xs, color: Colors.dark.textSecondary },
  tapToAdd: { fontSize: FontSizes.xs, color: Colors.dark.tint, fontWeight: '500' },
  membersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  memberChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: Colors.dark.background, borderWidth: 1, borderColor: Colors.dark.border },
  memberChipText: { fontSize: FontSizes.sm, color: Colors.dark.text },
  balanceCard: { backgroundColor: Colors.dark.cardSecondary, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.border, marginBottom: Spacing.md },
  balanceTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.dark.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: Spacing.sm },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: FontSizes.base, color: Colors.dark.text },
  balanceValue: { fontSize: FontSizes.lg, fontWeight: '600' },
  balancePositive: { color: Colors.dark.successLight },
  balanceNegative: { color: Colors.dark.errorLight },
  sectionTitle: { fontSize: FontSizes.base, fontWeight: '600', color: Colors.dark.textSecondary, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: Spacing.sm },
  pendingSection: { marginBottom: Spacing.md },
  pendingPaymentCard: { backgroundColor: Colors.dark.cardSecondary, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.warning, marginBottom: Spacing.sm },
  pendingPaymentInfo: { marginBottom: Spacing.sm },
  pendingPaymentText: { fontSize: FontSizes.base, fontWeight: '500', color: Colors.dark.text },
  pendingPaymentAmount: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.dark.successLight, marginTop: 2 },
  pendingPaymentActions: { flexDirection: 'row', gap: 8 },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.dark.successLight },
  confirmBtnText: { color: '#000', fontSize: FontSizes.sm, fontWeight: '600' },
  declineBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.dark.border },
  declineBtnText: { color: Colors.dark.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },
  waitingSection: { marginBottom: Spacing.md },
  waitingPaymentCard: { backgroundColor: Colors.dark.cardSecondary, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.border, marginBottom: Spacing.sm },
  waitingPaymentText: { fontSize: FontSizes.base, fontWeight: '500', color: Colors.dark.text },
  waitingPaymentAmount: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.dark.text, marginTop: 2 },
  waitingPaymentMeta: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginTop: 4, fontStyle: 'italic' },
  settlementsSection: { backgroundColor: Colors.dark.cardSecondary, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.dark.successLight, marginBottom: Spacing.md },
  settlementsHint: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  settlementRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.dark.background, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.dark.border },
  settlementInfo: { flex: 1 },
  settlementText: { fontSize: FontSizes.base, color: Colors.dark.text },
  settlementName: { fontWeight: '600' },
  settlementAmount: { fontSize: FontSizes.base, fontWeight: '700', color: Colors.dark.successLight, marginLeft: Spacing.md },
  allSettledCard: { backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: BorderRadius.md, padding: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.successLight, marginBottom: Spacing.md },
  allSettledIcon: { fontSize: 32, color: Colors.dark.successLight, marginBottom: Spacing.xs },
  allSettledText: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.dark.successLight },
  allSettledSubtext: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginTop: 2 },
  addExpenseBanner: { borderRadius: BorderRadius.md, padding: Spacing.md, backgroundColor: 'rgba(56, 189, 248, 0.12)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(148, 163, 184, 0.7)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  addExpenseText: { fontSize: FontSizes.base, fontWeight: '600', color: Colors.dark.text },
  emptyCard: { padding: Spacing.xl, borderRadius: BorderRadius.md, backgroundColor: Colors.dark.cardSecondary, borderWidth: 1, borderColor: Colors.dark.border },
  emptyText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.dark.text, marginBottom: 4 },
  emptySubtext: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary },
  expenseList: { gap: Spacing.sm, paddingBottom: Spacing.md },
  paymentList: { gap: Spacing.sm, paddingBottom: Spacing.md },
  paymentRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.dark.cardSecondary, borderWidth: 1, borderColor: Colors.dark.border },
  paymentIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(34, 197, 94, 0.15)', alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  paymentIconText: { fontSize: 16 },
  paymentInfo: { flex: 1 },
  paymentText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.dark.text },
  paymentMeta: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginTop: 2 },
  paymentAmount: { fontSize: FontSizes.base, fontWeight: '600', color: Colors.dark.successLight, marginLeft: Spacing.md },
  errorText: { fontSize: FontSizes.lg, color: Colors.dark.text, textAlign: 'center', marginTop: Spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.dark.background, borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, padding: Spacing.lg, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.dark.text },
  modalClose: { fontSize: FontSizes.xl, color: Colors.dark.textSecondary, padding: Spacing.sm },
  payingTo: { fontSize: FontSizes.base, color: Colors.dark.textSecondary, marginBottom: Spacing.md },
  payingToName: { color: Colors.dark.text, fontWeight: '600' },
  amountInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.cardSecondary, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  currencySymbol: { fontSize: FontSizes['2xl'], color: Colors.dark.textSecondary, fontWeight: '600' },
  amountInput: { flex: 1, padding: Spacing.md, fontSize: FontSizes['2xl'], fontWeight: '600', color: Colors.dark.text },
  methodLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  methodOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  methodChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.cardSecondary },
  methodChipActive: { backgroundColor: Colors.dark.tint, borderColor: Colors.dark.tint },
  methodChipText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.dark.text },
  methodChipTextActive: { color: '#fff' },
  confirmNote: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, textAlign: 'center', marginBottom: Spacing.lg, fontStyle: 'italic' },
  recordButton: { backgroundColor: Colors.dark.successLight, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  recordButtonDisabled: { opacity: 0.6 },
  recordButtonText: { fontSize: FontSizes.base, fontWeight: '700', color: '#000' },
});