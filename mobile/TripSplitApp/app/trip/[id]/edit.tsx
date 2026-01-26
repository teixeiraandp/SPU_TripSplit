import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { fetchTrip, updateTrip } from '@/utils/api';

type TripStatus = 'planning' | 'active' | 'completed';

function formatDateInput(text: string) {
  const numbers = text.replace(/\D/g, '');
  let formatted = '';
  if (numbers.length > 0) {
    formatted = numbers.substring(0, 4);
    if (numbers.length > 4) formatted += '-' + numbers.substring(4, 6);
    if (numbers.length > 6) formatted += '-' + numbers.substring(6, 8);
  }
  return formatted;
}

function isValidDateString(val: string) {
  if (!val) return true;
  const d = new Date(val);
  return !Number.isNaN(d.getTime());
}

export default function EditTripScreen() {
  const { id } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [status, setStatus] = useState<TripStatus>('planning');

  useEffect(() => {
    const load = async () => {
      if (typeof id !== 'string') return;

      try {
        setLoading(true);
        const trip = await fetchTrip(id);

        if (!trip) {
          Alert.alert('Not found', 'Trip not found');
          router.back();
          return;
        }

        setName(trip.name || '');
        setLocation(trip.location || '');
        setStartDate(trip.startDate || '');
        setEndDate(trip.endDate || '');
        setStatus((trip.status as TripStatus) || 'planning');
      } catch {
        Alert.alert('Error', 'Failed to load trip');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const dateError = useMemo(() => {
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      return 'Invalid date format';
    }
    if (!startDate || !endDate) return null;

    const s = new Date(startDate);
    const e = new Date(endDate);
    if (e < s) return 'End date must be after start date';
    return null;
  }, [startDate, endDate]);

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (dateError) return false;
    return true;
  }, [name, dateError]);

  const handleSave = async () => {
    if (typeof id !== 'string') return;

    if (!name.trim()) {
      Alert.alert('Error', 'Trip name is required');
      return;
    }
    if (dateError) {
      Alert.alert('Error', dateError);
      return;
    }

    setSaving(true);
    try {
      await updateTrip(id, {
        name: name.trim(),
        location: location.trim() ? location.trim() : null,
        startDate: startDate ? startDate : null,
        endDate: endDate ? endDate : null,
        status,
      });

      Alert.alert('Saved', 'Trip updated!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update trip');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.dark.tint} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Edit Trip</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Trip Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Trip name"
              placeholderTextColor={Colors.dark.textSecondary}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Miami, FL"
              placeholderTextColor={Colors.dark.textSecondary}
              value={location}
              onChangeText={setLocation}
            />
          </View>

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
                  onChangeText={(t) => setStartDate(formatDateInput(t))}
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
                  onChangeText={(t) => setEndDate(formatDateInput(t))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>

            {dateError ? <Text style={styles.warnText}>{dateError}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {(['planning', 'active', 'completed'] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.statusChip, status === opt && styles.statusChipActive]}
                  onPress={() => setStatus(opt)}
                >
                  <Text style={[styles.statusChipText, status === opt && styles.statusChipTextActive]}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
            disabled={!canSave || saving}
            onPress={handleSave}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </Pressable>

          <View style={{ height: 24 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

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
  backButton: { color: Colors.dark.tint, fontSize: FontSizes.base, fontWeight: '500' },
  title: { color: Colors.dark.text, fontSize: FontSizes.lg, fontWeight: '600' },

  content: { flex: 1 },
  form: { padding: Spacing.lg, gap: Spacing.lg },

  inputGroup: { gap: Spacing.sm },
  label: { color: Colors.dark.text, fontSize: FontSizes.base, fontWeight: '600' },

  input: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
  },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dateField: { flex: 1 },
  dateLabel: { fontSize: FontSizes.sm, color: Colors.dark.textSecondary, marginBottom: 4 },
  dateInput: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
  },
  dateSeparator: { color: Colors.dark.textSecondary, fontSize: FontSizes.base, paddingTop: 18 },
  warnText: { color: Colors.dark.errorLight || '#fb7185', fontSize: FontSizes.sm },

  statusRow: { flexDirection: 'row', gap: Spacing.sm },
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
  statusChipText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.dark.textSecondary },
  statusChipTextActive: { color: Colors.dark.tint },

  saveButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.dark.tint,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: FontSizes.base, fontWeight: '700' },
});
