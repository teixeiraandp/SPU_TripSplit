// app/new-expense.tsx
import React, { useEffect, useMemo, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Trip } from '@/types';
import * as ImagePicker from 'expo-image-picker';
import MlkitOcr from 'react-native-mlkit-ocr';
import { createExpense, fetchTrip, submitReceiptOcr } from '@/utils/api';

type Screen = 'choose-method' | 'manual-entry';
type Mode = 'simple' | 'items';
type SplitType = 'even' | 'custom';
type TipType = 'percent' | 'amount';

type Member = { userId: string; username: string };

type MemberSplit = {
  userId: string;
  username: string;
  share: string;
  selected: boolean;
};

type ReceiptItem = {
  id: string;
  name: string;
  price: string;
  assignedUserIds: string[];
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toCents(n: number) {
  return Math.round((n + Number.EPSILON) * 100);
}
function fromCents(c: number) {
  return c / 100;
}

function allocateProportionally(
  subtotalCentsByUser: Map<string, number>,
  allocCents: number
): Map<string, number> {
  const entries = Array.from(subtotalCentsByUser.entries());
  const totalSubtotal = entries.reduce((sum, [, c]) => sum + c, 0);

  const out = new Map<string, number>();
  if (allocCents === 0 || totalSubtotal === 0) {
    for (const [userId] of entries) out.set(userId, 0);
    return out;
  }

  const raw = entries.map(([userId, subCents]) => {
    const exact = (allocCents * subCents) / totalSubtotal;
    const floor = Math.floor(exact);
    const rem = exact - floor;
    return { userId, floor, rem };
  });

  let used = raw.reduce((sum, r) => sum + r.floor, 0);
  let remaining = allocCents - used;

  raw.sort((a, b) => b.rem - a.rem);

  for (let i = 0; i < raw.length; i++) {
    const add = remaining > 0 ? 1 : 0;
    out.set(raw[i].userId, raw[i].floor + add);
    remaining -= add;
  }

  if (remaining !== 0 && raw.length > 0) {
    const first = raw[0].userId;
    out.set(first, (out.get(first) || 0) + remaining);
  }

  return out;
}

export default function NewExpenseScreen() {
  const { tripId } = useLocalSearchParams();

  const [screen, setScreen] = useState<Screen>('choose-method');
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [saving, setSaving] = useState(false);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('simple');

  // SIMPLE mode
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('even');
  const [memberSplits, setMemberSplits] = useState<MemberSplit[]>([]);

  // ITEMS mode
  const [items, setItems] = useState<ReceiptItem[]>([
    { id: uid(), name: '', price: '', assignedUserIds: [] },
  ]);
  const [tax, setTax] = useState('');
  const [tipType, setTipType] = useState<TipType>('percent');
  const [tipValue, setTipValue] = useState('');

  const loadTripData = async () => {
    try {
      if (typeof tripId !== 'string') return;

      const tripData = await fetchTrip(tripId);
      setTrip(tripData);

      const tripMembers: Member[] =
        tripData?.members?.map((m: any) => ({
          userId: m.userId,
          username: m.user?.username || 'Unknown',
        })) || [];

      setMembers(tripMembers);

      setMemberSplits(
        tripMembers.map((m) => ({
          userId: m.userId,
          username: m.username,
          share: '',
          selected: true,
        }))
      );

      // Default first item assigned to all members (nice UX)
      setItems((prev) => {
        if (tripMembers.length === 0) return prev;
        return prev.map((it, idx) =>
          idx === 0 && it.assignedUserIds.length === 0
            ? { ...it, assignedUserIds: tripMembers.map((m) => m.userId) }
            : it
        );
      });
    } finally {
      setLoadingTrip(false);
    }
  };

  useEffect(() => {
    loadTripData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // OCR helpers (single source of truth)
  const runOcr = async (uri: string) => {
    const blocks: any[] = await MlkitOcr.detectFromUri(uri);

    const lines: string[] = [];
    for (const b of blocks ?? []) {
      if (b?.lines?.length) {
        for (const ln of b.lines) {
          const t = (ln?.text ?? '').trim();
          if (t) lines.push(t);
        }
      } else {
        const t = (b?.text ?? '').trim();
        if (t) lines.push(t);
      }
    }

    return lines.join('\n').trim();
  };

  const handleReceiptImage = async (uri: string) => {
    if (typeof tripId !== 'string') {
      Alert.alert('Error', 'No trip selected.');
      return;
    }

    setSaving(true);
    try {
      const ocrText = await runOcr(uri);

      if (!ocrText) {
        Alert.alert('OCR', 'No text found on the receipt.');
        return;
      }

      const parsed = await submitReceiptOcr(tripId, ocrText);

      // Jump to manual entry screen and items mode
      setScreen('manual-entry');
      setMode('items');

      // Fill UI based on backend response (optional fields)
      if (parsed?.title) setTitle(String(parsed.title));
      if (typeof parsed?.tax === 'number') setTax(String(parsed.tax));

      if (parsed?.tip?.type && typeof parsed?.tip?.value === 'number') {
        setTipType(parsed.tip.type);
        setTipValue(String(parsed.tip.value));
      }

      if (Array.isArray(parsed?.items) && parsed.items.length) {
        setItems(
          parsed.items.map((it: any) => ({
            id: uid(),
            name: String(it.name ?? ''),
            price: String(it.price ?? ''),
            // default assign all members (user can edit)
            assignedUserIds: members.map((m) => m.userId),
          }))
        );
      }

      Alert.alert('Success', 'Receipt scanned and loaded.');
    } catch (e: any) {
      Alert.alert('OCR error', e?.message ?? 'Failed to scan receipt.');
    } finally {
      setSaving(false);
    }
  };

  const onTakePicture = async () => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (camPerm.status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) return;

    await handleReceiptImage(uri);
  };

  const onUploadPicture = async () => {
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libPerm.status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) return;

    await handleReceiptImage(uri);
  };

  // SIMPLE MODE helpers
  const toggleSimpleMember = (index: number) => {
    const updated = [...memberSplits];
    updated[index].selected = !updated[index].selected;
    setMemberSplits(updated);
  };

  const updateSimpleShare = (index: number, value: string) => {
    const updated = [...memberSplits];
    updated[index].share = value;
    setMemberSplits(updated);
  };

  // ITEMS MODE helpers
  const addItemRow = () => {
    setItems((prev) => [...prev, { id: uid(), name: '', price: '', assignedUserIds: [] }]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) {
      Alert.alert('Keep one item', 'You need at least one item row.');
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItemField = (id: string, field: 'name' | 'price', value: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const toggleAssignee = (itemId: string, userId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const has = it.assignedUserIds.includes(userId);
        const next = has
          ? it.assignedUserIds.filter((x) => x !== userId)
          : [...it.assignedUserIds, userId];
        return { ...it, assignedUserIds: next };
      })
    );
  };

  const assignAllToItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, assignedUserIds: members.map((m) => m.userId) } : it
      )
    );
  };

  const clearAssignees = (itemId: string) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, assignedUserIds: [] } : it)));
  };

  // ITEMS MODE calculations
  const itemsCalc = useMemo(() => {
    const subtotalCentsByUser = new Map<string, number>();
    for (const m of members) subtotalCentsByUser.set(m.userId, 0);

    const parsedItems = items
      .map((it) => ({
        ...it,
        priceNum: parseFloat(it.price),
      }))
      .filter((it) => it.name.trim().length > 0 || (it.price && !isNaN(it.priceNum)));

    for (const it of parsedItems) {
      const priceNum = it.priceNum;
      if (!priceNum || isNaN(priceNum) || priceNum <= 0) continue;
      if (!it.assignedUserIds || it.assignedUserIds.length === 0) continue;

      const priceCents = toCents(priceNum);
      const n = it.assignedUserIds.length;
      const base = Math.floor(priceCents / n);
      let rem = priceCents - base * n;

      for (let idx = 0; idx < it.assignedUserIds.length; idx++) {
        const userId = it.assignedUserIds[idx];
        const add = rem > 0 ? 1 : 0;
        rem -= add;
        const shareCents = base + add;
        subtotalCentsByUser.set(userId, (subtotalCentsByUser.get(userId) || 0) + shareCents);
      }
    }

    const subtotalCentsTotal = Array.from(subtotalCentsByUser.values()).reduce((a, b) => a + b, 0);
    const subtotal = fromCents(subtotalCentsTotal);

    const taxNum = Math.max(0, parseFloat(tax) || 0);
    const tipRaw = Math.max(0, parseFloat(tipValue) || 0);
    const tipDollars =
      tipType === 'amount' ? tipRaw : subtotal > 0 ? (tipRaw / 100) * subtotal : 0;

    const taxCents = toCents(taxNum);
    const tipCents = toCents(tipDollars);

    const taxAlloc = allocateProportionally(subtotalCentsByUser, taxCents);
    const tipAlloc = allocateProportionally(subtotalCentsByUser, tipCents);

    const owedCentsByUser = new Map<string, number>();
    for (const [userId, subCents] of subtotalCentsByUser.entries()) {
      owedCentsByUser.set(
        userId,
        subCents + (taxAlloc.get(userId) || 0) + (tipAlloc.get(userId) || 0)
      );
    }

    const totalCents = subtotalCentsTotal + taxCents + tipCents;
    const total = fromCents(totalCents);

    return {
      subtotal,
      tax: taxNum,
      tip: tipDollars,
      total,
      owedByUser: owedCentsByUser,
    };
  }, [items, members, tax, tipType, tipValue]);

  // Submit handlers
  const submitSimple = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an expense title');
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (typeof tripId !== 'string') {
      Alert.alert('Error', 'No trip selected');
      return;
    }

    let splits: { userId: string; share: number }[] = [];

    if (splitType === 'even') {
      const selectedMembers = memberSplits.filter((m) => m.selected);
      if (selectedMembers.length === 0) {
        Alert.alert('Error', 'Please select at least one member');
        return;
      }
      const sharePerPerson = amountNum / selectedMembers.length;
      splits = selectedMembers.map((m) => ({ userId: m.userId, share: sharePerPerson }));
    } else {
      const customSplits = memberSplits.filter((m) => m.selected && parseFloat(m.share) > 0);
      if (customSplits.length === 0) {
        Alert.alert('Error', 'Please enter amounts for at least one member');
        return;
      }

      const totalShares = customSplits.reduce((sum, m) => sum + parseFloat(m.share || '0'), 0);
      if (Math.abs(totalShares - amountNum) > 0.01) {
        Alert.alert(
          'Error',
          `Split amounts ($${totalShares.toFixed(2)}) must equal total ($${amountNum.toFixed(2)})`
        );
        return;
      }

      splits = customSplits.map((m) => ({ userId: m.userId, share: parseFloat(m.share) }));
    }

    setSaving(true);
    try {
      await createExpense(tripId, {
        title: title.trim(),
        amount: amountNum,
        splits,
      });

      Alert.alert('Success', 'Expense added!', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create expense');
    } finally {
      setSaving(false);
    }
  };

  const submitItems = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an expense title');
      return;
    }
    if (typeof tripId !== 'string') {
      Alert.alert('Error', 'No trip selected');
      return;
    }
    if (members.length === 0) {
      Alert.alert('No members', 'Add members to the trip before adding receipt items.');
      return;
    }

    const cleanedItems = items
      .map((it) => ({
        name: it.name.trim(),
        priceNum: parseFloat(it.price),
        assignedUserIds: it.assignedUserIds,
      }))
      .filter((it) => it.name.length > 0 || (!isNaN(it.priceNum) && it.priceNum > 0));

    if (cleanedItems.length === 0) {
      Alert.alert('Add items', 'Please add at least one item with a name and price.');
      return;
    }

    for (const it of cleanedItems) {
      if (!it.name) {
        Alert.alert('Missing item name', 'Each item needs a name.');
        return;
      }
      if (isNaN(it.priceNum) || it.priceNum <= 0) {
        Alert.alert('Invalid price', `Item "${it.name}" needs a valid price.`);
        return;
      }
      if (!it.assignedUserIds || it.assignedUserIds.length === 0) {
        Alert.alert('Assign people', `Select at least one person for "${it.name}".`);
        return;
      }
    }

    const taxNum = Math.max(0, parseFloat(tax) || 0);
    const tipRaw = Math.max(0, parseFloat(tipValue) || 0);

    const tipPayload =
      tipValue.trim().length === 0
        ? undefined
        : ({ type: tipType, value: tipRaw } as { type: TipType; value: number });

    setSaving(true);
    try {
      await createExpense(tripId, {
        title: title.trim(),
        tax: taxNum,
        tip: tipPayload,
        items: cleanedItems.map((it) => ({
          name: it.name,
          price: it.priceNum,
          assignedUserIds: it.assignedUserIds,
        })),
      });

      Alert.alert('Success', 'Receipt expense added!', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create expense');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (mode === 'simple') return submitSimple();
    return submitItems();
  };

  if (loadingTrip) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.dark.tint} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  // SIMPLE mode derived
  const selectedCount = memberSplits.filter((m) => m.selected).length;
  const amountNum = parseFloat(amount) || 0;
  const evenSplitAmount = selectedCount > 0 ? amountNum / selectedCount : 0;

  // ==================== CHOOSE METHOD SCREEN ====================
  if (screen === 'choose-method') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Expense</Text>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.methodContainer}>
          <Text style={styles.methodTitle}>How would you like to add this expense?</Text>
          <Text style={styles.methodSubtitle}>Choose an option below</Text>

          <Pressable style={styles.methodCard} onPress={() => setScreen('manual-entry')}>
            <View style={styles.methodIconContainer}>
              <Text style={styles.methodIcon}>✏️</Text>
            </View>
            <View style={styles.methodCardContent}>
              <Text style={styles.methodCardTitle}>Input Manually</Text>
              <Text style={styles.methodCardDesc}>Type in the expense details and split among friends</Text>
            </View>
            <Text style={styles.methodArrow}>→</Text>
          </Pressable>

          <Pressable style={styles.methodCard} onPress={onTakePicture}>
            <View style={styles.methodIconContainer}>
              <Text style={styles.methodIcon}>📷</Text>
            </View>
            <View style={styles.methodCardContent}>
              <Text style={styles.methodCardTitle}>Take Picture</Text>
              <Text style={styles.methodCardDesc}>Snap a photo of your receipt to auto-fill items</Text>
            </View>
            <Text style={styles.methodArrow}>→</Text>
          </Pressable>

          <Pressable style={styles.methodCard} onPress={onUploadPicture}>
            <View style={styles.methodIconContainer}>
              <Text style={styles.methodIcon}>🖼️</Text>
            </View>
            <View style={styles.methodCardContent}>
              <Text style={styles.methodCardTitle}>Upload Picture</Text>
              <Text style={styles.methodCardDesc}>Choose a receipt image from your gallery</Text>
            </View>
            <Text style={styles.methodArrow}>→</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== MANUAL ENTRY SCREEN ====================
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setScreen('choose-method')}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manual Entry</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          {/* Expense Title */}
          <Text style={styles.label}>What's this expense for?</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Dinner at Sushi Spot"
            placeholderTextColor={Colors.dark.textSecondary}
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
          />

          {/* Mode Toggle */}
          <View style={styles.modeSection}>
            <Pressable
              style={[styles.modeCard, mode === 'simple' && styles.modeCardActive]}
              onPress={() => setMode('simple')}
            >
              <Text style={styles.modeEmoji}>💵</Text>
              <Text style={[styles.modeTitle, mode === 'simple' && styles.modeTitleActive]}>
                Quick Split
              </Text>
              <Text style={[styles.modeDesc, mode === 'simple' && styles.modeDescActive]}>
                One total, split evenly or custom
              </Text>
            </Pressable>

            <Pressable
              style={[styles.modeCard, mode === 'items' && styles.modeCardActive]}
              onPress={() => setMode('items')}
            >
              <Text style={styles.modeEmoji}>🧾</Text>
              <Text style={[styles.modeTitle, mode === 'items' && styles.modeTitleActive]}>
                Itemized
              </Text>
              <Text style={[styles.modeDesc, mode === 'items' && styles.modeDescActive]}>
                Add items & assign who had what
              </Text>
            </Pressable>
          </View>

          {/* SIMPLE MODE */}
          {mode === 'simple' && (
            <>
              <Text style={styles.label}>Total Amount</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.dark.textSecondary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.splitToggle}>
                <Pressable
                  style={[styles.splitOption, splitType === 'even' && styles.splitOptionActive]}
                  onPress={() => setSplitType('even')}
                >
                  <Text
                    style={[
                      styles.splitOptionText,
                      splitType === 'even' && styles.splitOptionTextActive,
                    ]}
                  >
                    Split Evenly
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.splitOption, splitType === 'custom' && styles.splitOptionActive]}
                  onPress={() => setSplitType('custom')}
                >
                  <Text
                    style={[
                      styles.splitOptionText,
                      splitType === 'custom' && styles.splitOptionTextActive,
                    ]}
                  >
                    Custom Amounts
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>
                {splitType === 'even' ? 'Who is splitting this?' : "Enter each person's share"}
              </Text>

              {memberSplits.length === 0 ? (
                <View style={styles.noMembersCard}>
                  <Text style={styles.noMembersEmoji}>👥</Text>
                  <Text style={styles.noMembersText}>No members in this trip yet</Text>
                  <Text style={styles.noMembersSubtext}>Add members to the trip first</Text>
                </View>
              ) : (
                <View style={styles.membersCard}>
                  {memberSplits.map((member, index) => (
                    <View key={member.userId} style={styles.memberRow}>
                      <Pressable
                        style={[styles.memberCheckbox, member.selected && styles.memberCheckboxSelected]}
                        onPress={() => toggleSimpleMember(index)}
                      >
                        {member.selected && <Text style={styles.checkmark}>✓</Text>}
                      </Pressable>
                      <Text style={[styles.memberName, !member.selected && styles.memberNameDisabled]}>
                        {member.username}
                      </Text>

                      {splitType === 'even' ? (
                        <Text style={styles.memberShare}>
                          {member.selected && amountNum > 0 ? `$${evenSplitAmount.toFixed(2)}` : '-'}
                        </Text>
                      ) : (
                        <View style={styles.shareInputContainer}>
                          <Text style={styles.shareInputSymbol}>$</Text>
                          <TextInput
                            style={[styles.shareInput, !member.selected && styles.shareInputDisabled]}
                            placeholder="0.00"
                            placeholderTextColor={Colors.dark.textSecondary}
                            value={member.share}
                            onChangeText={(val) => updateSimpleShare(index, val)}
                            keyboardType="decimal-pad"
                            editable={member.selected}
                          />
                        </View>
                      )}
                    </View>
                  ))}

                  {splitType === 'custom' && amountNum > 0 && (
                    <View style={styles.splitTotalRow}>
                      <Text style={styles.splitTotalLabel}>Total entered</Text>
                      <Text
                        style={[
                          styles.splitTotalValue,
                          Math.abs(
                            memberSplits
                              .filter((m) => m.selected)
                              .reduce((sum, m) => sum + (parseFloat(m.share) || 0), 0) - amountNum
                          ) < 0.01
                            ? styles.splitTotalMatch
                            : styles.splitTotalMismatch,
                        ]}
                      >
                        $
                        {memberSplits
                          .filter((m) => m.selected)
                          .reduce((sum, m) => sum + (parseFloat(m.share) || 0), 0)
                          .toFixed(2)}{' '}
                        / ${amountNum.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* ITEMS MODE */}
          {mode === 'items' && (
            <>
              <Text style={styles.label}>Receipt Items</Text>

              {items.map((it, idx) => (
                <View key={it.id} style={styles.itemCard}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemNumber}>Item {idx + 1}</Text>
                    {items.length > 1 && (
                      <Pressable onPress={() => removeItemRow(it.id)} style={styles.itemRemoveBtn}>
                        <Text style={styles.itemRemoveText}>✕</Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.itemInputsRow}>
                    <TextInput
                      style={[styles.input, styles.itemNameInput]}
                      placeholder="Item name"
                      placeholderTextColor={Colors.dark.textSecondary}
                      value={it.name}
                      onChangeText={(v) => updateItemField(it.id, 'name', v)}
                    />
                    <View style={styles.itemPriceContainer}>
                      <Text style={styles.itemPriceSymbol}>$</Text>
                      <TextInput
                        style={styles.itemPriceInput}
                        placeholder="0.00"
                        placeholderTextColor={Colors.dark.textSecondary}
                        value={it.price}
                        onChangeText={(v) => updateItemField(it.id, 'price', v)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  <View style={styles.assignSection}>
                    <View style={styles.assignHeader}>
                      <Text style={styles.assignLabel}>Who had this?</Text>
                      <View style={styles.assignActions}>
                        <Pressable onPress={() => assignAllToItem(it.id)} style={styles.assignAllBtn}>
                          <Text style={styles.assignAllText}>All</Text>
                        </Pressable>
                        <Pressable onPress={() => clearAssignees(it.id)} style={styles.assignClearBtn}>
                          <Text style={styles.assignClearText}>Clear</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.chipsWrap}>
                      {members.map((m) => {
                        const selected = it.assignedUserIds.includes(m.userId);
                        return (
                          <Pressable
                            key={m.userId}
                            onPress={() => toggleAssignee(it.id, m.userId)}
                            style={[styles.memberChip, selected && styles.memberChipActive]}
                          >
                            <Text style={[styles.memberChipText, selected && styles.memberChipTextActive]}>
                              {m.username}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {it.assignedUserIds.length === 0 && (
                      <Text style={styles.warnText}>Select at least one person</Text>
                    )}
                  </View>
                </View>
              ))}

              <Pressable onPress={addItemRow} style={styles.addItemBtn}>
                <Text style={styles.addItemBtnText}>+ Add another item</Text>
              </Pressable>

              {/* Tax & Tip */}
              <Text style={[styles.label, { marginTop: Spacing.lg }]}>Tax & Tip</Text>
              <Text style={styles.taxTipHint}>
                These will be split proportionally based on each person's items
              </Text>

              <View style={styles.taxTipRow}>
                <View style={styles.taxTipField}>
                  <Text style={styles.miniLabel}>Tax</Text>
                  <View style={styles.taxTipInputContainer}>
                    <Text style={styles.taxTipSymbol}>$</Text>
                    <TextInput
                      style={styles.taxTipInput}
                      placeholder="0.00"
                      placeholderTextColor={Colors.dark.textSecondary}
                      value={tax}
                      onChangeText={setTax}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={styles.taxTipField}>
                  <Text style={styles.miniLabel}>Tip</Text>

                  <View style={styles.tipTypeToggle}>
                    <Pressable
                      style={[styles.tipTypeBtn, tipType === 'percent' && styles.tipTypeBtnActive]}
                      onPress={() => setTipType('percent')}
                    >
                      <Text style={[styles.tipTypeText, tipType === 'percent' && styles.tipTypeTextActive]}>
                        %
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.tipTypeBtn, tipType === 'amount' && styles.tipTypeBtnActive]}
                      onPress={() => setTipType('amount')}
                    >
                      <Text style={[styles.tipTypeText, tipType === 'amount' && styles.tipTypeTextActive]}>
                        $
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.taxTipInputContainer}>
                    <Text style={styles.taxTipSymbol}>{tipType === 'percent' ? '%' : '$'}</Text>
                    <TextInput
                      style={styles.taxTipInput}
                      placeholder={tipType === 'percent' ? '20' : '0.00'}
                      placeholderTextColor={Colors.dark.textSecondary}
                      value={tipValue}
                      onChangeText={setTipValue}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Preview */}
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Summary</Text>

                <View style={styles.previewTotals}>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Subtotal</Text>
                    <Text style={styles.previewValue}>${itemsCalc.subtotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Tax</Text>
                    <Text style={styles.previewValue}>${itemsCalc.tax.toFixed(2)}</Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Tip</Text>
                    <Text style={styles.previewValue}>${itemsCalc.tip.toFixed(2)}</Text>
                  </View>
                  <View style={styles.previewDivider} />
                  <View style={styles.previewRow}>
                    <Text style={styles.previewTotalLabel}>Total</Text>
                    <Text style={styles.previewTotalValue}>${itemsCalc.total.toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.previewPerPerson}>
                  <Text style={styles.previewPerPersonTitle}>Per Person</Text>
                  {members.map((m) => {
                    const cents = itemsCalc.owedByUser.get(m.userId) || 0;
                    return (
                      <View key={m.userId} style={styles.previewPersonRow}>
                        <Text style={styles.previewPersonName}>{m.username}</Text>
                        <Text style={styles.previewPersonAmount}>${fromCents(cents).toFixed(2)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Add Expense</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
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

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    color: Colors.dark.tint,
    fontSize: FontSizes.base,
    fontWeight: '500',
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },

  // Choose Method Screen
  methodContainer: {
    flex: 1,
    padding: Spacing.lg,
  },
  methodTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  methodSubtitle: {
    fontSize: FontSizes.base,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  methodIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  methodIcon: {
    fontSize: 24,
  },
  methodCardContent: {
    flex: 1,
  },
  methodCardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  methodCardDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  methodArrow: {
    fontSize: FontSizes.xl,
    color: Colors.dark.tint,
    fontWeight: '600',
  },

  // Manual Entry Screen
  content: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
  },
  label: {
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },

  // Mode Selection
  modeSection: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modeCard: {
    flex: 1,
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.border,
  },
  modeCardActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  modeEmoji: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  modeTitle: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  modeTitleActive: {
    color: Colors.dark.text,
  },
  modeDesc: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  modeDescActive: {
    color: Colors.dark.textSecondary,
  },

  // Amount Input
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingLeft: Spacing.md,
  },
  currencySymbol: {
    fontSize: FontSizes.xl,
    color: Colors.dark.textSecondary,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: '600',
  },

  // Split Toggle
  splitToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginTop: Spacing.md,
  },
  splitOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  splitOptionActive: {
    backgroundColor: Colors.dark.tint,
  },
  splitOptionText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  splitOptionTextActive: {
    color: '#fff',
  },

  // Members Card
  noMembersCard: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  noMembersEmoji: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  noMembersText: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  noMembersSubtext: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  membersCard: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  memberCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCheckboxSelected: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  memberName: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    fontWeight: '500',
  },
  memberNameDisabled: {
    color: Colors.dark.textSecondary,
  },
  memberShare: {
    color: Colors.dark.tint,
    fontSize: FontSizes.base,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },
  shareInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingLeft: 8,
  },
  shareInputSymbol: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
  },
  shareInput: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    width: 70,
    textAlign: 'right',
  },
  shareInputDisabled: {
    opacity: 0.4,
  },
  splitTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  splitTotalLabel: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
  },
  splitTotalValue: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  splitTotalMatch: {
    color: Colors.dark.successLight,
  },
  splitTotalMismatch: {
    color: Colors.dark.errorLight || '#fb7185',
  },

  // Items Mode
  itemCard: {
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  itemNumber: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  itemRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRemoveText: {
    color: Colors.dark.errorLight || '#fb7185',
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  itemInputsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  itemNameInput: {
    flex: 1,
  },
  itemPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingLeft: Spacing.sm,
    width: 100,
  },
  itemPriceSymbol: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.base,
  },
  itemPriceInput: {
    flex: 1,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
  },
  assignSection: {
    marginTop: Spacing.md,
  },
  assignHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  assignLabel: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  assignActions: {
    flexDirection: 'row',
    gap: 8,
  },
  assignAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.tint,
  },
  assignAllText: {
    color: '#fff',
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  assignClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  assignClearText: {
    color: Colors.dark.text,
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  memberChipActive: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  memberChipText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  memberChipTextActive: {
    color: '#fff',
  },
  warnText: {
    marginTop: 8,
    color: Colors.dark.errorLight || '#fb7185',
    fontSize: FontSizes.sm,
  },
  addItemBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addItemBtnText: {
    color: Colors.dark.tint,
    fontSize: FontSizes.base,
    fontWeight: '600',
  },

  // Tax & Tip
  taxTipHint: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  taxTipRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  taxTipField: {
    flex: 1,
  },
  miniLabel: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: 6,
    fontWeight: '600',
  },
  taxTipInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingLeft: Spacing.sm,
  },
  taxTipSymbol: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  taxTipInput: {
    flex: 1,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.base,
  },
  tipTypeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.sm,
    padding: 3,
    marginBottom: 8,
  },
  tipTypeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: BorderRadius.xs,
  },
  tipTypeBtnActive: {
    backgroundColor: Colors.dark.tint,
  },
  tipTypeText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  tipTypeTextActive: {
    color: '#fff',
  },

  // Preview
  previewCard: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  previewTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    fontWeight: '700',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  previewTotals: {
    padding: Spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  previewLabel: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
  },
  previewValue: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  previewDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.sm,
  },
  previewTotalLabel: {
    color: Colors.dark.text,
    fontSize: FontSizes.base,
    fontWeight: '700',
  },
  previewTotalValue: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  previewPerPerson: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.background,
  },
  previewPerPersonTitle: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  previewPersonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  previewPersonName: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
  },
  previewPersonAmount: {
    color: Colors.dark.tint,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },

  // Submit
  submitButton: {
    backgroundColor: Colors.dark.tint,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FontSizes.base,
    fontWeight: '700',
  },
});