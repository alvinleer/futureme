// components/Card.tsx
import React from "react";
import { View, StyleSheet, ViewProps } from "react-native";
import { colors, radii, spacing, shadows } from "../theme";

interface Props extends ViewProps {
  elevated?: boolean;
}

export const Card: React.FC<Props> = ({
  elevated = true,
  style,
  children,
  ...rest
}) => {
  return (
    <View
      style={[
        styles.base,
        elevated && shadows.card,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
});
