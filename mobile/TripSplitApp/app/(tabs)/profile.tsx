import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { Avatar } from '@/components/Avatar';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { formatCurrency } from '@/utils/calculations';
import { fetchTrips } from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { Trip } from '@/types';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalTracked, setTotalTracked] = useState(0);

  const initials = useMemo(() => {
    const u = user?.username || user?.email || 'U';
    return u.slice(0, 2).toUpperCase();
  }, [user]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const t = await fetchTrips();
      setTrips(t);

      // Use backend-calculated totals instead of fetching expenses separately
      const totalExpCount = t.reduce((sum, trip) => sum + (trip.expenseCount || 0), 0);
      const totalAmount = t.reduce((sum, trip) => sum + (trip.totalAmount || 0), 0);

      setTotalExpenses(totalExpCount);
      setTotalTracked(totalAmount);
    } catch (e: any) {
      console.error('Profile load error:', e);
      setTrips([]);
      setTotalExpenses(0);
      setTotalTracked(0);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const activeTrips = useMemo(() => {
    // Right now your trips default to "In Progress" in fetchTrips()
    // but keeping this logic because youâ€™ll eventually have real statuses.
    return trips.filter((t) => t.status !== 'Planned' && t.status !== 'Completed').length;
  }, [trips]);

  const memberSince = useMemo(() => {
    // You can later make this real by returning createdAt in /users/me
    return '2025';
  }, []);

  const handleLogout = async () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to log out');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Profile</Text>

        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>
                {user?.username ? `@${user.username}` : user?.email || 'User'}
              </Text>
              <Text style={styles.profileSubtitle}>
                {user?.email || 'Signed in'}
              </Text>
            </View>

            <Avatar initials={initials} size={40} />
          </View>

          <View style={styles.profileMeta}>
            <Text style={styles.profileMetaText}>Member since {memberSince}</Text>
            <Text style={styles.profileMetaText}>
              {trips.length} trips · {totalExpenses} expenses
            </Text>
          </View>

          <View style={styles.profileActionsRow}>
            <Pressable style={styles.smallButton} onPress={loadProfile} disabled={loading}>
              <Text style={styles.smallButtonText}>{loading ? 'Loadingâ€¦' : 'Refresh'}</Text>
            </Pressable>

            <Pressable style={[styles.smallButton, styles.logoutBtn]} onPress={handleLogout}>
              <Text style={styles.smallButtonText}>Log out</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.md }]}>Statistics</Text>

        <View style={styles.statsCard}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.dark.tint} style={{ paddingVertical: 10 }} />
          ) : (
            <>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total tracked</Text>
                <Text style={styles.statValue}>{formatCurrency(totalTracked)}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Trips</Text>
                <Text style={styles.statValue}>{trips.length}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Expenses</Text>
                <Text style={styles.statValue}>{totalExpenses}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Active trips</Text>
                <Text style={styles.statValue}>{activeTrips}</Text>
              </View>

              {/* Placeholder until OCR feature exists */}
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Receipts scanned</Text>
                <Text style={styles.statValue}>0</Text>
              </View>
            </>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.md }]}>Preferences</Text>

        <View style={styles.preferencesList}>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceMain}>
              <Text style={styles.preferenceName}>Default currency</Text>
              <Text style={styles.preferenceMeta}>USD ($)</Text>
            </View>
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.preferenceMain}>
              <Text style={styles.preferenceName}>Notifications</Text>
              <Text style={styles.preferenceMeta}>
                Expenses, settlements & trip invites
              </Text>
            </View>
            <Text style={styles.preferenceValue}>On</Text>
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.preferenceMain}>
              <Text style={styles.preferenceName}>Beta features</Text>
              <Text style={styles.preferenceMeta}>
                AI receipt scanning · Duplicate detection
              </Text>
            </View>
            <Text style={styles.preferenceValue}>Enabled</Text>
          </View>
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes['4xl'],
    fontWeight: '600',
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    marginBottom: Spacing.sm,
  },
  profileCard: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.background,
    marginBottom: Spacing.md,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 12,
  },
  profileName: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  profileSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  profileMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  profileMetaText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textTertiary,
  },
  profileActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.md,
  },
  smallButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    borderColor: Colors.dark.errorLight,
  },
  smallButtonText: {
    color: Colors.dark.text,
    fontWeight: '600',
    fontSize: FontSizes.sm,
  },
  statsCard: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
  },
  statValue: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  preferencesList: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 10,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.background,
  },
  preferenceMain: {
    flex: 1,
    gap: 2,
  },
  preferenceName: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.dark.text,
  },
  preferenceMeta: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  preferenceValue: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    marginLeft: Spacing.md,
  },
});