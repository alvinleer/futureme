// EditWorkoutPlanDayScreen — build the recurring workout for a weekday, either
// by speaking the exercises in ("bench press 3 sets of 8 at 185, then lat
// pulldown 4x12") or by picking and typing them.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import { colors, radii, spacing } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { PlannedExercise } from "../types/diet";
import { ExerciseDef, ExerciseMetric, getExerciseDef } from "../data/exerciseLibrary";
import { LB_PER_KG, MI_PER_KM } from "../utils/exerciseProgress";
import { ExercisePickerModal } from "../components/ExercisePickerModal";
import { DictationBar } from "../components/DictationBar";
import { useWorkoutDictation } from "../hooks/useWorkoutDictation";
import { SpokenExercise } from "../api/workout-speech-parser";

type Nav = NativeStackNavigationProp<RootStackParamList, "EditWorkoutPlanDay">;
type Route = RouteProp<RootStackParamList, "EditWorkoutPlanDay">;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

interface PlanDraft {
  id: string;
  exerciseKey: string;
  name: string;
  metric: ExerciseMetric;
  icon: string;
  /** All held as display-unit strings while editing */
  sets: string;
  reps: string;
  weight: string;
  duration: string;
  distance: string;
}

const uid = () => `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const num = (v: string): number | undefined => {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) || n <= 0 ? undefined : n;
};

export default function EditWorkoutPlanDayScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const dayOfWeek = route.params.dayOfWeek;

  const getWorkoutPlanForDay = useDietStore((s) => s.getWorkoutPlanForDay);
  const saveWorkoutPlanDay = useDietStore((s) => s.saveWorkoutPlanDay);
  const deleteWorkoutPlanDay = useDietStore((s) => s.deleteWorkoutPlanDay);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const isMetric = unitSystem === "metric";
  const weightUnit = isMetric ? "kg" : "lb";
  const distanceUnit = isMetric ? "km" : "mi";

  const existing = useMemo(
    () => getWorkoutPlanForDay(dayOfWeek),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayOfWeek]
  );

  const toDisplayWeight = (lb: number) => Math.round((isMetric ? lb / LB_PER_KG : lb) * 10) / 10;
  const toDisplayDistance = (mi: number) =>
    Math.round((isMetric ? mi / MI_PER_KM : mi) * 100) / 100;
  const toCanonicalWeight = (display: number) =>
    Math.round((isMetric ? display * LB_PER_KG : display) * 100) / 100;
  const toCanonicalDistance = (display: number) =>
    Math.round((isMetric ? display * MI_PER_KM : display) * 1000) / 1000;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [repeatDays, setRepeatDays] = useState<number[]>([dayOfWeek]);
  const [showPicker, setShowPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heardMessage, setHeardMessage] = useState<string | null>(null);

  const [exercises, setExercises] = useState<PlanDraft[]>(() =>
    (existing?.exercises ?? []).map((ex) => ({
      id: ex.id,
      exerciseKey: ex.exerciseKey,
      name: ex.name,
      metric: ex.metric,
      icon: getExerciseDef(ex.exerciseKey)?.icon ?? "ellipse-outline",
      sets: ex.sets != null ? String(ex.sets) : "",
      reps: ex.reps != null ? String(ex.reps) : "",
      weight: ex.targetWeight != null ? String(toDisplayWeight(ex.targetWeight)) : "",
      duration: ex.durationMinutes != null ? String(ex.durationMinutes) : "",
      distance: ex.distance != null ? String(toDisplayDistance(ex.distance)) : "",
    }))
  );

  const addedKeys = useMemo(() => exercises.map((e) => e.exerciseKey), [exercises]);

  const draftFromDef = (def: ExerciseDef): PlanDraft => ({
    id: uid(),
    exerciseKey: def.key,
    name: def.name,
    metric: def.metric,
    icon: def.icon,
    sets: "",
    reps: "",
    weight: "",
    duration: "",
    distance: "",
  });

  const addFromPicker = (def: ExerciseDef) => {
    setShowPicker(false);
    if (addedKeys.includes(def.key)) return;
    setExercises((prev) => [...prev, draftFromDef(def)]);
    setError(null);
  };

  // ── Dictation ─────────────────────────────────────────────────────────────
  const applySpoken = (spoken: SpokenExercise[]) => {
    setExercises((prev) => {
      const next = [...prev];
      for (const item of spoken) {
        const { def } = item;
        // Speaking an exercise already in the list updates its targets rather
        // than adding a second copy of it.
        const existingIndex = next.findIndex((e) => e.exerciseKey === def.key);
        const base = existingIndex >= 0 ? next[existingIndex] : draftFromDef(def);

        const weightDisplay =
          item.weight != null
            ? item.weightUnit === "kg"
              ? isMetric
                ? item.weight
                : Math.round(item.weight * LB_PER_KG * 10) / 10
              : isMetric
                ? Math.round((item.weight / LB_PER_KG) * 10) / 10
                : item.weight
            : undefined;

        const distanceDisplay =
          item.distance != null
            ? item.distanceUnit === "km"
              ? isMetric
                ? item.distance
                : Math.round((item.distance * MI_PER_KM) * 100) / 100
              : isMetric
                ? Math.round((item.distance / MI_PER_KM) * 100) / 100
                : item.distance
            : undefined;

        const updated: PlanDraft = {
          ...base,
          sets: item.sets != null ? String(item.sets) : base.sets,
          reps: item.reps != null ? String(item.reps) : base.reps,
          weight: weightDisplay != null ? String(weightDisplay) : base.weight,
          duration: item.durationMinutes != null ? String(item.durationMinutes) : base.duration,
          distance: distanceDisplay != null ? String(distanceDisplay) : base.distance,
        };

        if (existingIndex >= 0) next[existingIndex] = updated;
        else next.push(updated);
      }
      return next;
    });

    const names = spoken.map((s) => s.def.name);
    const unmatched = spoken.filter((s) => s.isCustom).map((s) => s.spokenName);
    setHeardMessage(
      `Added ${names.join(", ")}.` +
        (unmatched.length > 0
          ? ` ${unmatched.join(" and ")} was not in the exercise list, so it was saved as a custom exercise.`
          : "")
    );
    setError(null);
  };

  const dictation = useWorkoutDictation({ onResult: applySpoken });

  // ── Editing ───────────────────────────────────────────────────────────────
  const updateField = (id: string, field: keyof PlanDraft, value: string) =>
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));

  const removeExercise = (id: string) =>
    setExercises((prev) => prev.filter((e) => e.id !== id));

  const moveExercise = (index: number, direction: -1 | 1) =>
    setExercises((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const toggleRepeatDay = (day: number) =>
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (exercises.length === 0) {
      setError("Add at least one exercise before saving this day.");
      return;
    }
    if (repeatDays.length === 0) {
      setError("Pick at least one day of the week for this workout.");
      return;
    }

    const planned: PlannedExercise[] = exercises.map((draft) => {
      const weightDisplay = num(draft.weight);
      const distanceDisplay = num(draft.distance);
      return {
        id: draft.id,
        exerciseKey: draft.exerciseKey,
        name: draft.name,
        metric: draft.metric,
        sets: num(draft.sets) != null ? Math.round(num(draft.sets)!) : undefined,
        reps: num(draft.reps) != null ? Math.round(num(draft.reps)!) : undefined,
        targetWeight: weightDisplay != null ? toCanonicalWeight(weightDisplay) : undefined,
        durationMinutes:
          num(draft.duration) != null ? Math.round(num(draft.duration)!) : undefined,
        distance: distanceDisplay != null ? toCanonicalDistance(distanceDisplay) : undefined,
      };
    });

    for (const day of repeatDays) {
      saveWorkoutPlanDay({
        // Only the day being edited keeps its id; the other repeat days get
        // fresh plans of their own so editing one later does not rewrite the rest.
        id: day === dayOfWeek ? existing?.id : undefined,
        dayOfWeek: day,
        title: title.trim() || undefined,
        exercises: planned.map((p) => (day === dayOfWeek ? p : { ...p, id: uid() })),
      });
    }

    navigation.goBack();
  };

  const hasExisting = !!existing;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{WEEKDAY_NAMES[dayOfWeek]}</Text>
        {hasExisting ? (
          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            style={styles.headerBtnRight}
            hitSlop={12}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        ) : (
          <View style={styles.headerBtnRight} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Voice entry */}
          <View style={styles.voiceCard}>
            <View style={styles.voiceHeaderRow}>
              <Ionicons name="mic-outline" size={16} color={colors.brandTeal} />
              <Text style={styles.voiceTitle}>Speak your workout in</Text>
            </View>
            <DictationBar
              stage={dictation.stage}
              onToggle={dictation.toggle}
              hint={'Try: "Bench press 4 sets of 8 at 185, lat pulldown 3 by 12, then 20 minutes on the treadmill."'}
            />
          </View>

          {heardMessage && (
            <Pressable style={styles.heardBox} onPress={() => setHeardMessage(null)}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brandTeal} />
              <Text style={styles.heardText}>{heardMessage}</Text>
            </Pressable>
          )}

          {/* Title */}
          <Text style={[styles.label, { marginTop: spacing.lg }]}>Workout name (optional)</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Push day, Leg day, Long run"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
          />

          {/* Repeat days */}
          <Text style={[styles.label, { marginTop: spacing.lg }]}>Repeat on</Text>
          <View style={styles.repeatRow}>
            {WEEKDAY_SHORT.map((short, day) => {
              const active = repeatDays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleRepeatDay(day)}
                  style={[styles.repeatChip, active && styles.repeatChipActive]}
                >
                  <Text style={[styles.repeatChipText, active && { color: "#fff" }]}>{short}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.repeatHint}>
            {repeatDays.length > 1
              ? `This workout will be saved to ${repeatDays.length} days.`
              : "Tap more days to use this same workout on them."}
          </Text>

          {/* Exercises */}
          <Text style={[styles.label, { marginTop: spacing.lg }]}>
            Exercises{exercises.length > 0 ? ` · ${exercises.length}` : ""}
          </Text>

          {exercises.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Nothing planned yet</Text>
              <Text style={styles.emptyText}>
                Speak your exercises in with the mic above, or add them by hand. Targets are
                optional — you can plan just the moves and fill in the numbers as you train.
              </Text>
            </View>
          ) : (
            exercises.map((ex, index) => (
              <Animated.View
                key={ex.id}
                entering={FadeInDown.duration(200).delay(index * 25)}
                style={styles.exCard}
              >
                <View style={styles.exCardHeader}>
                  <View style={styles.exIconBox}>
                    <Ionicons name={ex.icon as any} size={15} color={colors.brandTeal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exName}>{ex.name}</Text>
                    <Text style={styles.exMetric}>{summarizeTargets(ex, weightUnit, distanceUnit)}</Text>
                  </View>
                  <Pressable
                    onPress={() => moveExercise(index, -1)}
                    hitSlop={8}
                    disabled={index === 0}
                    style={{ paddingHorizontal: 3 }}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={17}
                      color={index === 0 ? "transparent" : colors.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => moveExercise(index, 1)}
                    hitSlop={8}
                    disabled={index === exercises.length - 1}
                    style={{ paddingHorizontal: 3 }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={index === exercises.length - 1 ? "transparent" : colors.textMuted}
                    />
                  </Pressable>
                  <Pressable onPress={() => removeExercise(ex.id)} hitSlop={10}>
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.targetRow}>
                  {ex.metric === "weight_reps" || ex.metric === "reps" ? (
                    <>
                      <TargetField
                        label="Sets"
                        value={ex.sets}
                        onChange={(t) => updateField(ex.id, "sets", t)}
                      />
                      <TargetField
                        label="Reps"
                        value={ex.reps}
                        onChange={(t) => updateField(ex.id, "reps", t)}
                      />
                      {ex.metric === "weight_reps" && (
                        <TargetField
                          label={weightUnit}
                          value={ex.weight}
                          onChange={(t) => updateField(ex.id, "weight", t)}
                          decimal
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {ex.metric === "distance_duration" && (
                        <TargetField
                          label={distanceUnit}
                          value={ex.distance}
                          onChange={(t) => updateField(ex.id, "distance", t)}
                          decimal
                        />
                      )}
                      <TargetField
                        label="Minutes"
                        value={ex.duration}
                        onChange={(t) => updateField(ex.id, "duration", t)}
                      />
                    </>
                  )}
                </View>
              </Animated.View>
            ))
          )}

          <Pressable style={styles.addExerciseBtn} onPress={() => setShowPicker(true)}>
            <Ionicons name="search" size={17} color="#fff" />
            <Text style={styles.addExerciseText}>Add exercise</Text>
          </Pressable>

          {(error || dictation.error) && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error ?? dictation.error}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={19} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.saveText}>
              {hasExisting ? "Save Changes" : `Save ${WEEKDAY_NAMES[dayOfWeek]}`}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ExercisePickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={addFromPicker}
        addedKeys={addedKeys}
        title="Add to Plan"
      />

      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{`Clear ${WEEKDAY_NAMES[dayOfWeek]}?`}</Text>
            <Text style={styles.confirmText}>
              The plan for this day will be removed. Sessions you already logged are not affected.
            </Text>
            <View style={styles.confirmBtnRow}>
              <Pressable style={styles.confirmCancel} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmDelete}
                onPress={() => {
                  deleteWorkoutPlanDay(dayOfWeek);
                  setShowDeleteConfirm(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.confirmDeleteText}>Clear day</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TargetField({
  label,
  value,
  onChange,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  decimal?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        selectTextOnFocus
      />
    </View>
  );
}

/** One-line summary of the targets set on a planned exercise. */
function summarizeTargets(ex: PlanDraft, weightUnit: string, distanceUnit: string): string {
  if (ex.metric === "weight_reps" || ex.metric === "reps") {
    const setsReps =
      ex.sets && ex.reps
        ? `${ex.sets} × ${ex.reps}`
        : ex.sets
          ? `${ex.sets} sets`
          : ex.reps
            ? `${ex.reps} reps`
            : "No target set";
    return ex.weight ? `${setsReps} at ${ex.weight} ${weightUnit}` : setsReps;
  }
  if (ex.distance && ex.duration) return `${ex.distance} ${distanceUnit} in ${ex.duration} min`;
  if (ex.distance) return `${ex.distance} ${distanceUnit}`;
  if (ex.duration) return `${ex.duration} min`;
  return "No target set";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerBtn: { width: 40, alignItems: "flex-start" },
  headerBtnRight: { width: 40, alignItems: "flex-end" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  voiceCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  voiceHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  voiceTitle: { fontSize: 14.5, fontWeight: "700", color: colors.textPrimary },
  heardBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(0,206,209,0.10)",
  },
  heardText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  repeatRow: { flexDirection: "row", gap: 7 },
  repeatChip: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  repeatChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  repeatChipText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  repeatHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 7 },
  emptyBox: {
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  exCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  exCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  exIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(0,206,209,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  exName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  exMetric: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  targetRow: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "center",
  },
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: spacing.sm,
    paddingVertical: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.brandTeal,
  },
  addExerciseText: { fontSize: 14.5, fontWeight: "700", color: "#fff" },
  errorBox: {
    flexDirection: "row",
    gap: 7,
    alignItems: "flex-start",
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(220,38,38,0.08)",
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error, lineHeight: 18 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: radii.pill,
    backgroundColor: colors.brandOrange,
  },
  saveText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  confirmCard: {
    width: "100%",
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
  },
  confirmTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  confirmText: { fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20 },
  confirmBtnRow: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSection,
    alignItems: "center",
  },
  confirmCancelText: { fontSize: 14.5, fontWeight: "700", color: colors.textPrimary },
  confirmDelete: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.error,
    alignItems: "center",
  },
  confirmDeleteText: { fontSize: 14.5, fontWeight: "700", color: "#fff" },
});
