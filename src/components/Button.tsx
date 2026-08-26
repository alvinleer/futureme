// components/Button.tsx
import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii, spacing } from "../theme";

type Variant = "primary" | "secondary" | "ghost";

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<Props> = ({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}) => {
  const isDisabled = disabled || loading;

  if (variant === "primary") {
    return (
      <TouchableOpacity
        style={[styles.base, { overflow: "hidden" }, isDisabled && styles.primaryDisabled, style]}
        onPress={onPress}
        activeOpacity={0.85}
        disabled={isDisabled}
      >
        <LinearGradient
          colors={["#5b67cd", "#1e206a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={[styles.text, styles.primaryText]}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }

  const getContainerStyle = () => {
    switch (variant) {
      case "secondary":
        return [styles.base, styles.secondary, isDisabled && styles.secondaryDisabled];
      case "ghost":
      default:
        return [styles.base, styles.ghost];
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case "secondary":
        return [styles.text, styles.secondaryText];
      case "ghost":
      default:
        return [styles.text, styles.ghostText];
    }
  };

  return (
    <TouchableOpacity
      style={[getContainerStyle(), style]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={getTextStyle()}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
  primaryText: {
    color: "#FFFFFF",
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  // Secondary
  secondary: {
    borderWidth: 1,
    borderColor: colors.brandTeal,
    backgroundColor: "transparent",
  },
  secondaryText: {
    color: colors.brandTeal,
  },
  secondaryDisabled: {
    borderColor: colors.borderSubtle,
  },
  // Ghost
  ghost: {
    backgroundColor: "transparent",
  },
  ghostText: {
    color: colors.textSecondary,
  },
});
