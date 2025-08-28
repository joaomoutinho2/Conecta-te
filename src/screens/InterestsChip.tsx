// src/components/InterestChip.tsx
import React from 'react';
import {
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';

type Size = 'sm' | 'md';

export type InterestChipProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: Size;
  showHash?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

/**
 * Chip de interesse reutilizável:
 * - Estados: active/disabled/loading
 * - Tamanhos: sm/md
 * - Mostra #label por padrão (showHash)
 */
export default function InterestChip({
  label,
  active = false,
  disabled = false,
  loading = false,
  onPress,
  onLongPress,
  size = 'md',
  showHash = true,
  style,
  textStyle,
}: InterestChipProps) {
  const S = sizeStyles[size];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, selected: active }}
      style={[
        styles.base,
        S.container,
        {
          borderColor: active ? COLORS.brand : COLORS.border,
          backgroundColor: active ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text
          style={[
            styles.text,
            { color: active ? '#fff' : COLORS.text },
            S.text,
            textStyle,
          ]}
          numberOfLines={1}
        >
          {showHash ? '#' : ''}
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const COLORS = {
  text: '#e5e7eb',
  border: 'rgba(255,255,255,0.15)',
  brand: '#7c3aed',
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
  },
});

const sizeStyles: Record<Size, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { paddingVertical: 6 },
    text: { fontSize: 11 },
  },
  md: {
    container: { paddingVertical: 8 },
    text: { fontSize: 12 },
  },
};
