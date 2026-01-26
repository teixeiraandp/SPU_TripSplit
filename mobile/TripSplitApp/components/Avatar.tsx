import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, FontSizes } from '@/constants/theme';

interface AvatarProps {
  initials: string;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ initials, size = 32, style }: AvatarProps) {
  return (
    <View style={[
      styles.container,
      {
        width: size,
        height: size,
        borderRadius: BorderRadius.full,
      },
      style
    ]}>
      <Text style={[
        styles.text,
        { fontSize: size * 0.4 }
      ]}>
        {initials.substring(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    background: `linear-gradient(135deg, ${Colors.dark.tint}, ${Colors.dark.tintSecondary})`,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.dark.text,
    fontWeight: '600',
  },
});