// app/(tabs)/activity.tsx  (or wherever your ActivityScreen lives)
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchActivity,
  ActivityItem,
  fetchInvites,
  TripInvite,
  acceptInvite,
  declineInvite,
  fetchPendingPayments,
  Payment,
  confirmPayment,
  declinePayment,
} from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { formatCurrency } from '@/utils/calculations';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';

function timeAgo(iso: string) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);

  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [tripInvites, setTripInvites] = useState<TripInvite[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [activityData, tripInvitesData, pendingPaymentsData] = await Promise.all([
        fetchActivity(),
        fetchInvites(),
        fetchPendingPayments(),
      ]);
      setItems(activityData);
      setTripInvites(tripInvitesData);
      setPendingPayments(pendingPaymentsData);
    } catch (e: any) {
      setError(e?.message || 'Failed to load activity');
      setItems([]);
      setTripInvites([]);
      setPendingPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const handleAcceptTrip = async (invite: TripInvite) => {
    setRespondingTo(invite.id);
    try {
      await acceptInvite(invite.id);
      Alert.alert('Joined!', `You joined "${invite.trip.name}"`);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to accept invite');
    } finally {
      setRespondingTo(null);
    }
  };

  const handleDeclineTrip = async (invite: TripInvite) => {
    Alert.alert('Decline Invite', `Decline invite to "${invite.trip.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setRespondingTo(invite.id);
          try {
            await declineInvite(invite.id);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to decline invite');
          } finally {
            setRespondingTo(null);
          }
        },
      },
    ]);
  };

  const handleConfirmPayment = async (payment: Payment) => {
    setRespondingTo(payment.id);
    try {
      await confirmPayment(payment.id);
      Alert.alert('Confirmed!', `Payment from @${payment.fromUser.username} confirmed`);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to confirm payment');
    } finally {
      setRespondingTo(null);
    }
  };

  const handleDeclinePayment = async (payment: Payment) => {
    Alert.alert(
      'Decline Payment',
      `Are you sure @${payment.fromUser.username} didn't pay you ${formatCurrency(
        parseFloat(String(payment.amount))
      )}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "They didn't pay me",
          style: 'destructive',
          onPress: async () => {
            setRespondingTo(payment.id);
            try {
              await declinePayment(payment.id);
              Alert.alert('Declined', 'Payment has been declined');
              load();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to decline payment');
            } finally {
              setRespondingTo(null);
            }
          },
        },
      ]
    );
  };

  const formatPaymentText = (item: ActivityItem) => {
    const isFromMe = item.fromUserId === user?.id;
    const isToMe = item.toUserId === user?.id;

    if (isFromMe) return `You paid @${item.toUser}`;
    if (isToMe) return `@${item.fromUser} paid you`;
    return `@${item.fromUser} paid @${item.toUser}`;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return { text: 'Pending', style: styles.pendingBadge };
      case 'confirmed':
        return { text: 'Confirmed', style: styles.confirmedBadge };
      case 'declined':
        return { text: 'Declined', style: styles.declinedBadge };
      default:
        return null;
    }
  };

  const renderActivityItem = ({ item }: { item: ActivityItem }) => {
    const isPayment = item.type === 'payment';
    const statusBadge = isPayment ? getStatusBadge(item.status) : null;

    return (
      <Pressable
        style={[
          styles.activityRow,
          isPayment && styles.paymentRow,
          item.status === 'declined' && styles.declinedRow,
        ]}
        onPress={() => router.push(`/trip/${item.tripId}`)}
      >
        <View style={styles.activityIcon}>
          <Text style={styles.activityIconText}>{isPayment ? '💸' : '🧾'}</Text>
        </View>

        <View style={styles.activityMain}>
          <Text style={[styles.activityName, item.status === 'declined' && styles.declinedText]}>
            {isPayment ? formatPaymentText(item) : `${item.paidBy} added "${item.title}"`}
          </Text>

          <View style={styles.activityMetaRow}>
            <Text style={styles.activityMeta}>
              {item.tripName} · {timeAgo(item.createdAt)}
              {isPayment && item.method ? ` · ${item.method}` : ''}
            </Text>

            {statusBadge && (
              <View style={[styles.statusBadge, statusBadge.style]}>
                <Text style={styles.statusBadgeText}>{statusBadge.text}</Text>
              </View>
            )}
          </View>
        </View>

        <Text
          style={[
            styles.activityAmount,
            isPayment && item.status === 'confirmed' && styles.confirmedAmount,
            item.status === 'declined' && styles.declinedText,
          ]}
        >
          {formatCurrency(parseFloat(item.amount))}
        </Text>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <>
      {/* Header (safe-area fixed) */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={styles.title}>Activity</Text>
      </View>

      {/* Content top padding */}
      <View style={styles.contentTop} />

      {/* Trip Invites */}
      {tripInvites.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Trip Invites</Text>
          {tripInvites.map((invite) => (
            <View key={invite.id} style={styles.inviteCard}>
              <View style={styles.inviteInfo}>
                <Text style={styles.inviteTripName}>{invite.trip.name}</Text>
                <Text style={styles.inviteFrom}>
                  From @{invite.inviter.username} · {timeAgo(invite.createdAt)}
                </Text>
              </View>

              <View style={styles.inviteActions}>
                <Pressable
                  style={[styles.inviteBtn, styles.acceptBtn]}
                  onPress={() => handleAcceptTrip(invite)}
                  disabled={respondingTo === invite.id}
                >
                  <Text style={styles.acceptBtnText}>
                    {respondingTo === invite.id ? '...' : 'Accept'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.inviteBtn, styles.declineBtn]}
                  onPress={() => handleDeclineTrip(invite)}
                  disabled={respondingTo === invite.id}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Pending Payments */}
      {pendingPayments.length > 0 && (
        <>
          <Text
            style={[
              styles.sectionTitle,
              tripInvites.length > 0 && { marginTop: Spacing.lg },
            ]}
          >
            Confirm Payments
          </Text>

          {pendingPayments.map((payment) => (
            <View key={payment.id} style={styles.pendingPaymentCard}>
              <View style={styles.pendingPaymentInfo}>
                <Text style={styles.pendingPaymentText}>
                  @{payment.fromUser.username} says they paid you
                </Text>
                <Text style={styles.pendingPaymentAmount}>
                  {formatCurrency(parseFloat(String(payment.amount)))}
                  {payment.method ? ` via ${payment.method}` : ''}
                </Text>
                <Text style={styles.pendingPaymentMeta}>
                  {payment.trip?.name} · {timeAgo(payment.createdAt)}
                </Text>
              </View>

              <View style={styles.pendingPaymentActions}>
                <Pressable
                  style={[styles.inviteBtn, styles.confirmBtn]}
                  onPress={() => handleConfirmPayment(payment)}
                  disabled={respondingTo === payment.id}
                >
                  <Text style={styles.confirmBtnText}>
                    {respondingTo === payment.id ? '...' : 'Confirm'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.inviteBtn, styles.declineBtn]}
                  onPress={() => handleDeclinePayment(payment)}
                  disabled={respondingTo === payment.id}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Recent Activity Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {loading && (
        <ActivityIndicator size="large" color={Colors.dark.tint} style={{ marginTop: 10 }} />
      )}

      {!loading && error && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>Couldn't load activity</Text>
          <Text style={styles.emptyCardSubtitle}>{error}</Text>
        </View>
      )}

      {!loading && !error && items.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>No activity yet</Text>
          <Text style={styles.emptyCardSubtitle}>
            Add an expense or record a payment and it'll show up here.
          </Text>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderActivityItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },

  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes['4xl'],
    fontWeight: '600',
    color: Colors.dark.text,
  },

  // just gives breathing room between title and cards
  contentTop: {
    height: Spacing.md,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },

  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardSecondary,
  },
  refreshText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },

  sectionTitle: {
    paddingHorizontal: Spacing.lg,
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },

  emptyCard: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.lg,
  },
  emptyCardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '500',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  emptyCardSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
  },

  inviteCard: {
    marginHorizontal: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
    marginBottom: Spacing.sm,
  },
  inviteInfo: { flex: 1 },
  inviteTripName: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 2,
  },
  inviteFrom: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary },

  inviteActions: { flexDirection: 'row', gap: 8 },
  inviteBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full },

  acceptBtn: { backgroundColor: Colors.dark.tint },
  acceptBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '600' },

  confirmBtn: { backgroundColor: Colors.dark.successLight },
  confirmBtnText: { color: '#000', fontSize: FontSizes.sm, fontWeight: '600' },

  declineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  declineBtnText: { color: Colors.dark.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },

  pendingPaymentCard: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.warning,
    marginBottom: Spacing.sm,
  },
  pendingPaymentInfo: { marginBottom: Spacing.sm },
  pendingPaymentText: { fontSize: FontSizes.base, fontWeight: '500', color: Colors.dark.text },
  pendingPaymentAmount: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.dark.successLight,
    marginTop: 2,
  },
  pendingPaymentMeta: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginTop: 2 },
  pendingPaymentActions: { flexDirection: 'row', gap: 8 },

  activityRow: {
    marginHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 10,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 8,
  },
  paymentRow: { borderColor: Colors.dark.border },
  declinedRow: { opacity: 0.6 },

  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  activityIconText: { fontSize: 16 },

  activityMain: { flex: 1, gap: 2 },

  activityName: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.dark.text },

  activityMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityMeta: { fontSize: FontSizes.sm, color: Colors.dark.textTertiary },

  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  pendingBadge: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  confirmedBadge: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  declinedBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  statusBadgeText: { fontSize: FontSizes.xs, fontWeight: '600', color: Colors.dark.text },

  activityAmount: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.text,
    marginLeft: Spacing.md,
  },
  confirmedAmount: { color: Colors.dark.successLight },
  declinedText: { color: Colors.dark.textSecondary, textDecorationLine: 'line-through' },

  list: {
    paddingBottom: Spacing.xl,
  },
});