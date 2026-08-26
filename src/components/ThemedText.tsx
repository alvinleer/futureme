// components/ThemedText.tsx
import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import { colors, typography } from "../theme";

type Variant =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "label"
  | "body"
  | "bodySmall"
  | "caption";

interface Props extends TextProps {
  variant?: Variant;
  muted?: boolean;
}

export const ThemedText: React.FC<Props> = ({
  variant = "body",
  muted,
  style,
  children,
  ...rest
}) => {
  const baseStyle = styles[variant];
  const colorStyle = muted
    ? { color: colors.textMuted }
    : { color: colors.textPrimary };

  return (
    <Text style={[baseStyle, colorStyle, style]} {...rest}>
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  display: {
    ...typography.display,
    color: colors.textPrimary,
  },
  h1: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  h2: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  h3: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  label: {
    ...typography.label,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
  },
  bodySmall: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
