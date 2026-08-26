// DictationBar — the shared "speak your exercises" control used by both the
// weekly plan editor and the session logger.

import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, radii, spacing } from "../theme";
import { DictationStage } from "../hooks/useWorkoutDictation";

interface Props {
  stage: DictationStage;
  onToggle: () => void;
  /** Example phrasing shown under the button when idle */
  hint: string;
}

const STAGE_TEXT: Record<DictationStage, string> = {
  idle: "Tap to speak",
  recording: "Listening — tap to finish",
  transcribing: "Writing down what you said...",
  parsing: "Matching exercises...",
};

export function DictationBar({ stage, onToggle, hint }: Props) {
  const isRecording = stage === "recording";
  const isBusy = stage === "transcribing" || stage === "parsing";

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        disabled={isBusy}
        style={[styles.button, isRecording && styles.buttonRecording, isBusy && styles.buttonBusy]}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.brandTeal} />
        ) : (
          <Ionicons
            name={isRecording ? "stop" : "mic"}
            size={19}
            color={isRecording ? "#fff" : colors.brandTeal}
          />
        )}
        <Text style={[styles.buttonText, isRecording && { color: "#fff" }]}>
          {STAGE_TEXT[stage]}
        </Text>
      </Pressable>

      {stage === "idle" ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : (
        <Animated.View entering={FadeIn.duration(180)}>
          <Text style={styles.hint}>
            {isRecording ? "Say each exercise with its sets and reps." : "Hang tight..."}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
    backgroundColor: "rgba(0,206,209,0.08)",
  },
  buttonRecording: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  buttonBusy: { opacity: 0.75 },
  buttonText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.brandTeal,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 7,
    lineHeight: 16,
  },
});
