// components/CTAButton.tsx
import React from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { radii, spacing } from "../theme";

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const CTAButton: React.FC<Props> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
}) => {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
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
        <>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.iconContainer}>
            <Ionicons name="mic" size={24} color="#FFFFFF" />
          </View>
        </>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 64,
    borderRadius: radii.pill,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    flex: 1,
    letterSpacing: 0,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
