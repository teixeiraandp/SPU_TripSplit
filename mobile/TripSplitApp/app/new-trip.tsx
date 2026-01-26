import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { createTrip } from '@/utils/api';

type TripStatus = 'planning' | 'active' | 'completed';

export default function NewTripScreen() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<TripStatus>('planning');
  const [loading, setLoading] = useState(false);

  const handleCreateTrip = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a trip name');
      return;
    }

    // Validate dates if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end < start) {
        Alert.alert('Error', 'End date must be after start date');
        return;
      }
    }

    setLoading(true);
    try {
      await createTrip({
        name: name.trim(),
        location: location.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status,
      });
      Alert.alert('Success', 'Trip created!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create trip');
    } finally {
      setLoading(false);
    }
  };

  const formatDateInput = (text: string, setter: (val: string) => void) => {
    // Remove non-numeric characters
    const numbers = text.replace(/\D/g, '');

    // Format as YYYY-MM-DD
    let formatted = '';
    if (numbers.length > 0) {
      formatted = numbers.substring(0, 4);
      if (numbers.length > 4) {
        formatted += '-' + numbers.substring(4, 6);
      }
      if (numbers.length > 6) {
        formatted += '-' + numbers.substring(6, 8);
      }
    }
    setter(formatted);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Trip</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          {/* Trip Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Trip Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Beach Weekend"
              placeholderTextColor={Colors.dark.textSecondary}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Miami, FL"
              placeholderTextColor={Colors.dark.textSecondary}
              value={location}
              onChangeText={setLocation}
            />
            <Text style={styles.hint}>Optional - helps you organize trips</Text>
          </View>

          {/* Date Range */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date Range</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>Start</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.textSecondary}
                  value={startDate}
                  onChangeText={(text) => formatDateInput(text, setStartDate)}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
              <Text style={styles.dateSeparator}>to</Text>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>End</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.textSecondary}
                  value={endDate}
                  onChangeText={(text) => formatDateInput(text, setEndDate)}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>
            <Text style={styles.hint}>Optional - filter trips by date later</Text>
          </View>

          {/* Status */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              <Pressable
                style={[styles.statusChip, status === 'planning' && styles.statusChipActive]}
                onPress={() => setStatus('planning')}
              >
                <Text style={[styles.statusChipText, status === 'planning' && styles.statusChipTextActive]}>
                  Planning
                </Text>
              </Pressable>
              <Pressable
                style={[styles.statusChip, status === 'active' && styles.statusChipActive]}
                onPress={() => setStatus('active')}
              >
                <Text style={[styles.statusChipText, status === 'active' && styles.statusChipTextActive]}>
                  Active
                </Text>
              </Pressable>
              <Pressable
                style={[styles.statusChip, status === 'completed' && styles.statusChipActive]}
                onPress={() => setStatus('completed')}
              >
                <Text style={[styles.statusChipText, status === 'completed' && styles.statusChipTextActive]}>
                  Completed
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleCreateTrip}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Trip</Text>
            )}
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    color: Colors.dark.tint,
    fontSize: FontSizes.base,
    fontWeight: '500',
  },
  title: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  label: {
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
  },
  hint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dateField: {
    flex: 1,
  },
  dateLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
  },
  dateSeparator: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.base,
    paddingTop: 20,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusChip: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardSecondary,
    alignItems: 'center',
  },
  statusChipActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  statusChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
  },
  statusChipTextActive: {
    color: Colors.dark.tint,
  },
  button: {
    backgroundColor: Colors.dark.tint,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.base,
    fontWeight: '700',
  },
});