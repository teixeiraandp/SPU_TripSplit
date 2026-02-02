import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, SafeAreaView, ActivityIndicator, Modal } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TripCard } from '@/components/TripCard';
import { fetchTrips } from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { Trip, TripFilters } from '@/types';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';

const defaultFilters: TripFilters = {
  status: 'all',
  dateRange: 'all',
  hasBalance: 'all',
};

export default function TripsScreen() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<TripFilters>(defaultFilters);

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  const loadTrips = async () => {
    try {
      setLoading(true);
      const data = await fetchTrips();
      setTrips(data);
    } catch (error) {
      console.error('Failed to fetch trips:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [])
  );

  const filteredTrips = useMemo(() => {
    let result = trips;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(trip =>
        trip.name.toLowerCase().includes(query) ||
        (trip.location && trip.location.toLowerCase().includes(query)) ||
        trip.people.some(p => p.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(trip => trip.status === filters.status);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      result = result.filter(trip => {
        if (!trip.startDate && !trip.endDate) return filters.dateRange === 'all';

        const start = trip.startDate ? new Date(trip.startDate) : null;
        const end = trip.endDate ? new Date(trip.endDate) : null;

        switch (filters.dateRange) {
          case 'upcoming':
            return start && start > now;
          case 'current':
            return (start && start <= now) && (!end || end >= now);
          case 'past':
            return end && end < now;
          default:
            return true;
        }
      });
    }

    // Balance filter
    if (filters.hasBalance !== 'all') {
      result = result.filter(trip => {
        const balance = trip.userBalance || 0;
        switch (filters.hasBalance) {
          case 'owed':
            return balance > 0.01; // Others owe you
          case 'owing':
            return balance < -0.01; // You owe others
          case 'settled':
            return Math.abs(balance) < 0.01;
          default:
            return true;
        }
      });
    }

    return result;
  }, [trips, searchQuery, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status !== 'all') count++;
    if (filters.dateRange !== 'all') count++;
    if (filters.hasBalance !== 'all') count++;
    return count;
  }, [filters]);

  const handleTripPress = (tripId: string) => {
    console.log("Pressed tripId:", tripId);
    router.push(`/trip/${tripId}`);
  }; //todo for debugging
  /* it was:
  const handleTripPress = (tripId: string) => {
    router.push(`/trip/${tripId}`);
  };
  */

  const handleNewTrip = () => {
    router.push('/new-trip');
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TripSplit</Text>
        <Pressable style={styles.avatar} onPress={() => router.push('/profile')}>
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.actionRow}>
          <Text style={styles.sectionTitle}>Your trips</Text>
          <Pressable style={styles.addButton} onPress={handleNewTrip}>
            <Text style={styles.addButtonText}>+ New Trip</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search trips..."
            placeholderTextColor={Colors.dark.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Pressable
            style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
            onPress={() => setShowFilterModal(true)}
          >
            <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextActive]}>
              Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.dark.tint} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={filteredTrips}
            renderItem={({ item }) => (
              <TripCard
                trip={item}
                onPress={() => handleTripPress(item.id)}
              />
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🗺</Text>
                <Text style={styles.emptyTitle}>No trips found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery || activeFilterCount > 0
                    ? 'Try adjusting your search or filters'
                    : 'Create your first trip to get started'}
                </Text>
                {activeFilterCount > 0 && (
                  <Pressable style={styles.clearFiltersButton} onPress={clearFilters}>
                    <Text style={styles.clearFiltersText}>Clear filters</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Trips</Text>
              <Pressable onPress={() => setShowFilterModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            {/* Status Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Status</Text>
              <View style={styles.filterOptions}>
                {(['all', 'planning', 'active', 'completed'] as const).map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.filterChip, filters.status === option && styles.filterChipActive]}
                    onPress={() => setFilters({ ...filters, status: option })}
                  >
                    <Text style={[styles.filterChipText, filters.status === option && styles.filterChipTextActive]}>
                      {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Date Range Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Date</Text>
              <View style={styles.filterOptions}>
                {(['all', 'upcoming', 'current', 'past'] as const).map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.filterChip, filters.dateRange === option && styles.filterChipActive]}
                    onPress={() => setFilters({ ...filters, dateRange: option })}
                  >
                    <Text style={[styles.filterChipText, filters.dateRange === option && styles.filterChipTextActive]}>
                      {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Balance Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Balance</Text>
              <View style={styles.filterOptions}>
                {(['all', 'owed', 'owing', 'settled'] as const).map((option) => {
                  const labels = {
                    all: 'All',
                    owed: 'Owed to me',
                    owing: 'I owe',
                    settled: 'Settled',
                  };
                  return (
                    <Pressable
                      key={option}
                      style={[styles.filterChip, filters.hasBalance === option && styles.filterChipActive]}
                      onPress={() => setFilters({ ...filters, hasBalance: option })}
                    >
                      <Text style={[styles.filterChipText, filters.hasBalance === option && styles.filterChipTextActive]}>
                        {labels[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear All</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={() => setShowFilterModal(false)}>
                <Text style={styles.applyButtonText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes['4xl'],
    fontWeight: '600',
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  addButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.tint,
  },
  addButtonText: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.borderSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.dark.text,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardSecondary,
  },
  filterButtonActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  filterButtonText: {
    fontSize: FontSizes.base,
    color: Colors.dark.text,
  },
  filterButtonTextActive: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  list: {
    paddingBottom: Spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.tint,
  },
  clearFiltersText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.dark.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  modalClose: {
    fontSize: FontSizes.xl,
    color: Colors.dark.textSecondary,
    padding: Spacing.sm,
  },
  filterSection: {
    marginBottom: Spacing.lg,
  },
  filterLabel: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardSecondary,
  },
  filterChipActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
  filterChipTextActive: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  clearButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  applyButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: '#fff',
  },
});