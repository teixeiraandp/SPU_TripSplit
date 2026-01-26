import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Expense } from '@/types';
import { formatCurrency } from '@/utils/calculations';
import { Colors, BorderRadius, Spacing, FontSizes } from '@/constants/theme';

interface ExpenseRowProps {
  expense: Expense;
  onPress: () => void;
}

export function ExpenseRow({ expense, onPress }: ExpenseRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed
      ]}
      onPress={onPress}
    >
      <View style={styles.main}>
        <Text style={styles.name}>{expense.name}</Text>
        <Text style={styles.meta}>Paid by {expense.paidBy}</Text>
        {expense.tag && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{expense.tag}</Text>
          </View>
        )}
      </View>
      <Text style={styles.amount}>{formatCurrency(expense.amount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 10,
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.background,
    marginBottom: 8,
  },
  pressed: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(15, 23, 42, 1)',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.dark.text,
  },
  meta: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textTertiary,
  },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(55, 65, 81, 0.8)',
  },
  tagText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.text,
  },
  amount: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.text,
    marginLeft: Spacing.md,
  },
});