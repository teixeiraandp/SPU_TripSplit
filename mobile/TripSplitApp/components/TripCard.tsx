import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Trip } from '@/types';
import { formatCurrency } from '@/utils/calculations';
import { Colors, BorderRadius, Spacing, FontSizes } from '@/constants/theme';

interface TripCardProps {
  trip: Trip;
  onPress: () => void;
}

function formatDateRange(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate && !endDate) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startYear === endYear) {
      return `${formatDate(startDate)} - ${formatDate(endDate)}, ${endYear}`;
    }
    return `${formatDate(startDate)}, ${startYear} - ${formatDate(endDate)}, ${endYear}`;
  }

  if (startDate) return `From ${formatDate(startDate)}`;
  if (endDate) return `Until ${formatDate(endDate)}`;
  return null;
}

function getStatusColor(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'active':
      return {
        bg: 'rgba(34, 197, 94, 0.1)',
        text: '#86efac',
        border: 'rgba(34, 197, 94, 0.5)',
      };
    case 'completed':
      return {
        bg: 'rgba(156, 163, 175, 0.1)',
        text: '#9ca3af',
        border: 'rgba(156, 163, 175, 0.5)',
      };
    case 'planning':
    default:
      return {
        bg: 'rgba(56, 189, 248, 0.08)',
        text: '#bae6fd',
        border: 'rgba(56, 189, 248, 0.6)',
      };
    case 'cancelled':
      return {
        bg: 'rgba(239, 68, 68, 0.1)',
        text: '#fca5a5',
        border: 'rgba(239, 68, 68, 0.55)',
      }
  }
}

export function TripCard({ trip, onPress }: TripCardProps) {
  const total =
    typeof (trip as any).totalAmount === 'number'
      ? (trip as any).totalAmount
      : 0;

  const expenseCount =
    typeof (trip as any).expenseCount === 'number'
      ? (trip as any).expenseCount
      : trip.expenses.length;

  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const statusColors = getStatusColor(trip.status);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed
      ]}
      onPress={onPress}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.name}>{trip.name}</Text>
          {trip.location && (
            <Text style={styles.location}>📍 {trip.location}</Text>
          )}
          {dateRange && (
            <Text style={styles.dates}>{dateRange}</Text>
          )}
        </View>
        <Text style={styles.total}>{formatCurrency(total)}</Text>
      </View>

      <View style={styles.pillRow}>
        <View style={[
          styles.pill,
          styles.pillStatus,
          { backgroundColor: statusColors.bg, borderColor: statusColors.border }
        ]}>
          <Text style={[styles.pillStatusText, { color: statusColors.text }]}>
            {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{trip.people.length} travelers</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{expenseCount} expenses</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  pressed: {
    transform: [{ translateY: -2 }],
    borderColor: Colors.dark.tint,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  name: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  location: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  dates: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  total: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pillText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  pillStatus: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.6)',
  },
  pillStatusText: {
    fontSize: FontSizes.xs,
    color: '#bae6fd',
  },
});