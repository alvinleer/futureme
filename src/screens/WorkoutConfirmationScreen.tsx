import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import useDietStore from "../state/dietStore";
import { WorkoutEntry } from "../types/diet";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { EXERCISE_ACTIVITIES } from "../data/exerciseActivities";

type WorkoutConfirmationRouteProp = RouteProp<RootStackParamList, "WorkoutConfirmation">;
type WorkoutConfirmationNavProp = NativeStackNavigationProp<RootStackParamList, "WorkoutConfirmation">;

export interface ParsedWorkoutData {
  type: WorkoutEntry["type"];
  activityKey?: string;
  durationMinutes: number;
  intensity: WorkoutEntry["intensity"];
  description: string;
}

const WORKOUT_TYPES: { value: WorkoutEntry["type"]; label: string; icon: string }[] = [
  { value: "cardio", label: "Cardio", icon: "walk" },
  { value: "strength", label: "Strength", icon: "barbell" },
  { value: "hiit", label: "HIIT", icon: "flame" },
  { value: "yoga", label: "Yoga", icon: "leaf" },
  { value: "mixed", label: "Mixed", icon: "fitness" },
];

const INTENSITY_OPTIONS: { value: WorkoutEntry["intensity"]; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#10b981" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "high", label: "High", color: "#ef4444" },
];

export default function WorkoutConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<WorkoutConfirmationNavProp>();
  const route = useRoute<WorkoutConfirmationRouteProp>();
  const addWorkout = useDietStore((s) => s.addWorkout);
  const deleteWorkout = useDietStore((s) => s.deleteWorkout);

  const { initialDataJson, initialDateMs, existingWorkoutId } = route.params;
  const parsed: ParsedWorkoutData = JSON.parse(initialDataJson);

  const [workoutType, setWorkoutType] = useState<WorkoutEntry["type"]>(parsed.type);
  const [durationMinutes, setDurationMinutes] = useState(parsed.durationMinutes);
  const [intensity, setIntensity] = useState<WorkoutEntry["intensity"]>(parsed.intensity);
  const [description, setDescription] = useState(parsed.description);
  const [durationText, setDurationText] = useState(String(parsed.durationMinutes));

  // Resolve display label — use specific activity name when available
  const activityLabel = parsed.activityKey
    ? (EXERCISE_ACTIVITIES.find((a) => a.key === parsed.activityKey)?.label ?? null)
    : null;

  const selectedType = WORKOUT_TYPES.find((t) => t.value === workoutType) ?? WORKOUT_TYPES[0];
  const selectedIntensity = INTENSITY_OPTIONS.find((i) => i.value === intensity) ?? INTENSITY_OPTIONS[1];

  const handleConfirm = () => {
    const timestamp = initialDateMs ?? Date.now();
    if (existingWorkoutId) deleteWorkout(existingWorkoutId);
    addWorkout(
      {
        type: workoutType,
        activityKey: parsed.activityKey,
        durationMinutes,
        intensity,
        description,
      },
      timestamp
    );
    navigation.navigate("MainTabs");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Confirm Workout</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.body}>
            {/* Compact hero */}
            <View style={[styles.heroCard, { borderColor: selectedIntensity.color + "44" }]}>
              <View style={[styles.iconCircle, { backgroundColor: selectedIntensity.color + "22" }]}>
                <Ionicons name={selectedType.icon as any} size={28} color={selectedIntensity.color} />
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroLabel}>{activityLabel ?? selectedType.label}</Text>
                <Text style={styles.heroDuration}>{durationMinutes} min</Text>
              </View>
              <View style={[styles.intensityBadge, { backgroundColor: selectedIntensity.color + "22" }]}>
                <Text style={[styles.intensityBadgeText, { color: selectedIntensity.color }]}>
                  {selectedIntensity.label}
                </Text>
              </View>
            </View>

            {/* Description */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Description</Text>
              <TextInput
                style={styles.descriptionInput}
                value={description}
                onChangeText={setDescription}
                placeholder="What did you do?"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            {/* Workout type */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Type</Text>
              <View style={styles.typeRow}>
                {WORKOUT_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    style={[styles.typeChip, workoutType === t.value && styles.typeChipActive]}
                    onPress={() => setWorkoutType(t.value)}
                  >
                    <Ionicons
                      name={t.icon as any}
                      size={14}
                      color={workoutType === t.value ? "#fff" : colors.textMuted}
                    />
                    <Text style={[styles.typeChipText, workoutType === t.value && styles.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Duration */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Duration (minutes)</Text>
              <View style={styles.durationRow}>
                <Pressable
                  style={styles.durationBtn}
                  onPress={() => {
                    const v = Math.max(1, durationMinutes - 5);
                    setDurationMinutes(v);
                    setDurationText(String(v));
                  }}
                >
                  <Ionicons name="remove" size={20} color={colors.textPrimary} />
                </Pressable>
                <TextInput
                  style={styles.durationInput}
                  value={durationText}
                  onChangeText={(t) => {
                    setDurationText(t);
                    const n = parseInt(t, 10);
                    if (!isNaN(n) && n > 0) setDurationMinutes(n);
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Pressable
                  style={styles.durationBtn}
                  onPress={() => {
                    const v = durationMinutes + 5;
                    setDurationMinutes(v);
                    setDurationText(String(v));
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.textPrimary} />
                </Pressable>
              </View>
            </View>

            {/* Intensity */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Intensity</Text>
              <View style={styles.intensityRow}>
                {INTENSITY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.intensityChip,
                      intensity === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
                    ]}
                    onPress={() => setIntensity(opt.value)}
                  >
                    <Text
                      style={[
                        styles.intensityChipText,
                        intensity === opt.value && { color: "#fff" },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Confirm */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmText}>Log Workout</Text>
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  heroInfo: { flex: 1 },
  heroLabel: { fontSize: 13, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  heroDuration: { fontSize: 28, fontWeight: "800", color: colors.textPrimary, lineHeight: 34 },
  intensityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  intensityBadgeText: { fontSize: 12, fontWeight: "700" },
  section: { marginBottom: spacing.md },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  descriptionInput: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeChipText: { fontSize: 12, fontWeight: "500", color: colors.textMuted },
  typeChipTextActive: { color: "#fff" },
  durationRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  durationBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  durationInput: {
    flex: 1,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  intensityRow: { flexDirection: "row", gap: spacing.sm },
  intensityChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  intensityChipText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTeal,
    borderRadius: radii.pill,
    paddingVertical: 14,
  },
  confirmText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
