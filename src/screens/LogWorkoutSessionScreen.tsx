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
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { LoggedExercise, PlannedExercise, WorkoutSession } from "../types/diet";
import {
  ExerciseDef,
  ExerciseMetric,
  METRIC_LABELS,
  getExerciseDef,
} from "../data/exerciseLibrary";
import { LB_PER_KG, MI_PER_KM } from "../utils/exerciseProgress";
import { ExercisePickerModal } from "../components/ExercisePickerModal";
import { DictationBar } from "../components/DictationBar";
import { useWorkoutDictation } from "../hooks/useWorkoutDictation";
import { SpokenExercise } from "../api/workout-speech-parser";
import { WEEKDAY_NAMES } from "./EditWorkoutPlanDayScreen";

type Nav = NativeStackNavigationProp<RootStackParamList, "LogWorkoutSession">;
type Route = RouteProp<RootStackParamList, "LogWorkoutSession">;

interface DraftSet {
  id: string;
  weight: string;
  reps: string;
}

interface DraftExercise {
  id: string;
  exerciseKey: string;
  name: string;
  metric: ExerciseMetric;
  icon: string;
  sets: DraftSet[];
  duration: string;
  distance: string;
}

const uid = () => `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const newSet = (weight = "", reps = ""): DraftSet => ({ id: uid(), weight, reps });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function LogWorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const editingId = route.params?.sessionId;
  const planDayOfWeek = route.params?.planDayOfWeek;

  const saveWorkoutSession = useDietStore((s) => s.saveWorkoutSession);
  const getWorkoutPlanForDay = useDietStore((s) => s.getWorkoutPlanForDay);
  const deleteWorkoutSession = useDietStore((s) => s.deleteWorkoutSession);
  const getWorkoutSession = useDietStore((s) => s.getWorkoutSession);
  const getLastLoggedExercise = useDietStore((s) => s.getLastLoggedExercise);
  const getRecentExerciseKeys = useDietStore((s) => s.getRecentExerciseKeys);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const isMetric = unitSystem === "metric";
  const weightUnit = isMetric ? "kg" : "lb";
  const distanceUnit = isMetric ? "km" : "mi";

  const existing = useMemo<WorkoutSession | null>(
    () => (editingId ? getWorkoutSession(editingId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId]
  );

  // A plan only seeds a brand new session — editing an old one must never have
  // this week's plan pushed back into it.
  const plan = useMemo(
    () => (!editingId && planDayOfWeek != null ? getWorkoutPlanForDay(planDayOfWeek) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, planDayOfWeek]
  );

  const toDisplayWeight = (lb: number) =>
    Math.round((isMetric ? lb / LB_PER_KG : lb) * 10) / 10;
  const toDisplayDistance = (mi: number) =>
    Math.round((isMetric ? mi / MI_PER_KM : mi) * 100) / 100;

  /**
   * Turn a planned exercise into editable rows: one row per planned set, reps
   * pre-filled from the target and weight seeded from what was actually lifted
   * last time (falling back to the planned target) so the common case is
   * confirming numbers rather than typing them.
   */
  const draftFromPlanned = (planned: PlannedExercise): DraftExercise => {
    const def = getExerciseDef(planned.exerciseKey);
    const last = getLastLoggedExercise(planned.exerciseKey);
    const heaviest = last?.sets.reduce((max, s) => Math.max(max, s.weight ?? 0), 0) ?? 0;
    const seedWeight =
      heaviest > 0
        ? toDisplayWeight(heaviest)
        : planned.targetWeight != null
          ? toDisplayWeight(planned.targetWeight)
          : null;
    const setCount = Math.min(Math.max(planned.sets ?? 1, 1), 12);

    return {
      id: `${planned.id}_${uid()}`,
      exerciseKey: planned.exerciseKey,
      name: planned.name,
      metric: planned.metric,
      icon: def?.icon ?? "ellipse-outline",
      sets: Array.from({ length: setCount }, () =>
        newSet(
          planned.metric === "weight_reps" && seedWeight != null ? String(seedWeight) : "",
          planned.reps != null ? String(planned.reps) : ""
        )
      ),
      duration: planned.durationMinutes != null ? String(planned.durationMinutes) : "",
      distance: planned.distance != null ? String(toDisplayDistance(planned.distance)) : "",
    };
  };

  const [sessionDate, setSessionDate] = useState<Date>(
    existing ? new Date(existing.timestamp) : new Date()
  );
  const [title, setTitle] = useState(existing?.title ?? plan?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [exercises, setExercises] = useState<DraftExercise[]>(() => {
    if (!existing && plan) return plan.exercises.map(draftFromPlanned);
    return (existing?.exercises ?? []).map((ex) => ({
      id: ex.id,
      exerciseKey: ex.exerciseKey,
      name: ex.name,
      metric: ex.metric,
      icon: getExerciseDef(ex.exerciseKey)?.icon ?? "ellipse-outline",
      sets:
        ex.sets.length > 0
          ? ex.sets.map((s) => ({
              id: uid(),
              weight: s.weight != null ? String(toDisplayWeight(s.weight)) : "",
              reps: s.reps != null ? String(s.reps) : "",
            }))
          : [newSet()],
      duration: ex.durationMinutes ? String(ex.durationMinutes) : "",
      distance: ex.distance != null ? String(toDisplayDistance(ex.distance)) : "",
    }));
  });
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [heardMessage, setHeardMessage] = useState<string | null>(null);

  const addedKeys = useMemo(() => exercises.map((e) => e.exerciseKey), [exercises]);

  const recentDefs = useMemo(() => {
    return getRecentExerciseKeys(10)
      .map((k) => getExerciseDef(k))
      .filter((d): d is ExerciseDef => !!d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker]);

  const openPicker = () => setShowPicker(true);

  const addExercise = (def: ExerciseDef) => {
    if (addedKeys.includes(def.key)) {
      setShowPicker(false);
      return;
    }
    const last = getLastLoggedExercise(def.key, editingId);
    const prefillWeight =
      last && def.metric === "weight_reps"
        ? (() => {
            const heaviest = last.sets.reduce(
              (max, s) => Math.max(max, s.weight ?? 0),
              0
            );
            return heaviest > 0 ? String(toDisplayWeight(heaviest)) : "";
          })()
        : "";

    setExercises((prev) => [
      ...prev,
      {
        id: uid(),
        exerciseKey: def.key,
        name: def.name,
        metric: def.metric,
        icon: def.icon,
        sets: [newSet(prefillWeight)],
        duration: "",
        distance: "",
      },
    ]);
    setError(null);
    setShowPicker(false);
    Keyboard.dismiss();
  };

  // ── Dictation ─────────────────────────────────────────────────────────────
  /** Convert a spoken weight into the unit currently on screen. */
  const spokenWeightToDisplay = (weight: number, unit: "lb" | "kg" | undefined) => {
    const lb = unit === "kg" ? weight * LB_PER_KG : weight;
    return toDisplayWeight(lb);
  };

  const spokenDistanceToDisplay = (distance: number, unit: "mi" | "km" | undefined) => {
    const mi = unit === "km" ? distance * MI_PER_KM : distance;
    return toDisplayDistance(mi);
  };

  const applySpoken = (spoken: SpokenExercise[]) => {
    setExercises((prev) => {
      const next = [...prev];

      for (const item of spoken) {
        const { def } = item;
        const weightText =
          item.weight != null ? String(spokenWeightToDisplay(item.weight, item.weightUnit)) : "";
        const repsText = item.reps != null ? String(item.reps) : "";
        const spokenSets = Math.min(Math.max(item.sets ?? 1, 1), 12);
        const newRows = Array.from({ length: spokenSets }, () => newSet(weightText, repsText));

        const index = next.findIndex((e) => e.exerciseKey === def.key);
        if (index >= 0) {
          const target = next[index];
          // Blank rows are placeholders, not data — spoken sets replace them and
          // are appended to anything already filled in.
          const filled = target.sets.filter(
            (s) => s.weight.trim().length > 0 || s.reps.trim().length > 0
          );
          next[index] = {
            ...target,
            sets: [...filled, ...newRows],
            duration:
              item.durationMinutes != null ? String(item.durationMinutes) : target.duration,
            distance:
              item.distance != null
                ? String(spokenDistanceToDisplay(item.distance, item.distanceUnit))
                : target.distance,
          };
          continue;
        }

        next.push({
          id: uid(),
          exerciseKey: def.key,
          name: def.name,
          metric: def.metric,
          icon: def.icon,
          sets: newRows,
          duration: item.durationMinutes != null ? String(item.durationMinutes) : "",
          distance:
            item.distance != null
              ? String(spokenDistanceToDisplay(item.distance, item.distanceUnit))
              : "",
        });
      }

      return next;
    });

    const unmatched = spoken.filter((s) => s.isCustom).map((s) => s.spokenName);
    setHeardMessage(
      `Logged ${spoken.map((s) => s.def.name).join(", ")}.` +
        (unmatched.length > 0
          ? ` ${unmatched.join(" and ")} was not in the exercise list, so it was saved as a custom exercise.`
          : "")
    );
    setError(null);
  };

  const dictation = useWorkoutDictation({ onResult: applySpoken });

  const removeExercise = (id: string) =>
    setExercises((prev) => prev.filter((e) => e.id !== id));

  const updateSet = (exId: string, setId: string, field: "weight" | "reps", value: string) =>
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exId
          ? {
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)),
            }
          : e
      )
    );

  const addSet = (exId: string) =>
    setExercises((prev) =>
      prev.map((e) => {
        if (e.id !== exId) return e;
        const last = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, newSet(last?.weight ?? "", last?.reps ?? "")] };
      })
    );

  const removeSet = (exId: string, setId: string) =>
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exId
          ? { ...e, sets: e.sets.length > 1 ? e.sets.filter((s) => s.id !== setId) : e.sets }
          : e
      )
    );

  const updateField = (exId: string, field: "duration" | "distance", value: string) =>
    setExercises((prev) =>
      prev.map((e) => (e.id === exId ? { ...e, [field]: value } : e))
    );

  // ── Save ──────────────────────────────────────────────────────────────────
  const buildLoggedExercises = (): LoggedExercise[] => {
    const out: LoggedExercise[] = [];
    for (const draft of exercises) {
      const num = (v: string) => {
        const n = parseFloat(v.replace(",", "."));
        return isNaN(n) ? undefined : n;
      };

      if (draft.metric === "weight_reps" || draft.metric === "reps") {
        const sets = draft.sets
          .map((s) => {
            const weightDisplay = num(s.weight);
            const reps = num(s.reps);
            return {
              weight:
                weightDisplay != null && weightDisplay > 0
                  ? Math.round((isMetric ? weightDisplay * LB_PER_KG : weightDisplay) * 100) / 100
                  : undefined,
              reps: reps != null && reps > 0 ? Math.round(reps) : undefined,
            };
          })
          .filter((s) => s.reps != null || s.weight != null);
        if (sets.length === 0) continue;
        out.push({
          id: draft.id,
          exerciseKey: draft.exerciseKey,
          name: draft.name,
          metric: draft.metric,
          sets,
        });
        continue;
      }

      const duration = num(draft.duration);
      const distanceDisplay = num(draft.distance);
      const distance =
        distanceDisplay != null && distanceDisplay > 0
          ? Math.round((isMetric ? distanceDisplay * MI_PER_KM : distanceDisplay) * 1000) / 1000
          : undefined;

      if ((duration == null || duration <= 0) && distance == null) continue;

      out.push({
        id: draft.id,
        exerciseKey: draft.exerciseKey,
        name: draft.name,
        metric: draft.metric,
        sets: [],
        durationMinutes: duration != null && duration > 0 ? Math.round(duration) : undefined,
        distance,
      });
    }
    return out;
  };

  const handleSave = () => {
    if (exercises.length === 0) {
      setError("Add at least one exercise to log this session.");
      return;
    }
    const logged = buildLoggedExercises();
    if (logged.length === 0) {
      setError("Fill in your reps, minutes or distance so the session can be tracked.");
      return;
    }

    // Keep the time of day when editing, otherwise stamp midday for past dates
    const now = new Date();
    const ts = new Date(sessionDate);
    if (dayKey(ts) === dayKey(now)) {
      ts.setHours(now.getHours(), now.getMinutes(), 0, 0);
    } else {
      ts.setHours(12, 0, 0, 0);
    }

    saveWorkoutSession({
      id: editingId,
      timestamp: ts.getTime(),
      title: title.trim() || undefined,
      notes: notes.trim() || undefined,
      exercises: logged,
    });
    navigation.goBack();
  };

  const dayOptions = useMemo(() => {
    const days: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  }, []);

  const totalSets = exercises.reduce(
    (sum, e) =>
      sum +
      (e.metric === "weight_reps" || e.metric === "reps"
        ? e.sets.filter((s) => s.reps.trim().length > 0 || s.weight.trim().length > 0).length
        : 0),
    0
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{editingId ? "Edit Session" : "Log Session"}</Text>
        {editingId ? (
          <Pressable onPress={() => setShowDeleteConfirm(true)} style={styles.headerBtnRight} hitSlop={12}>
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
          {plan && (
            <View style={styles.planBanner}>
              <Ionicons name="calendar-outline" size={15} color={colors.brandTeal} />
              <Text style={styles.planBannerText}>
                Loaded from your {WEEKDAY_NAMES[plan.dayOfWeek]} plan — adjust anything that
                changed today.
              </Text>
            </View>
          )}

          {/* Date strip */}
          <Text style={styles.label}>Date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          >
            {dayOptions.map((d) => {
              const active = dayKey(d) === dayKey(sessionDate);
              const isToday = dayKey(d) === dayKey(new Date());
              return (
                <Pressable
                  key={dayKey(d)}
                  onPress={() => setSessionDate(d)}
                  style={[styles.dayPill, active && styles.dayPillActive]}
                >
                  <Text style={[styles.dayPillDow, active && styles.dayPillTextActive]}>
                    {isToday ? "TODAY" : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                  </Text>
                  <Text style={[styles.dayPillNum, active && styles.dayPillTextActive]}>
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Title */}
          <Text style={[styles.label, { marginTop: spacing.lg }]}>Session name (optional)</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Push day, Leg day, Morning run"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
          />

          {/* Exercises */}
          <View style={styles.exerciseHeaderRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>
              Exercises{exercises.length > 0 ? ` · ${exercises.length}` : ""}
            </Text>
            {totalSets > 0 && <Text style={styles.setCount}>{totalSets} sets</Text>}
          </View>

          {exercises.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="barbell-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No exercises yet</Text>
              <Text style={styles.emptyText}>
                Search the exercise list and record what you did — weight and reps, minutes, or distance.
              </Text>
            </View>
          ) : (
            exercises.map((ex, index) => {
              const last = getLastLoggedExercise(ex.exerciseKey, editingId);
              const lastHint = (() => {
                if (!last) return null;
                if (last.sets.length > 0) {
                  const best = last.sets.reduce(
                    (a, b) =>
                      (b.weight ?? 0) * (b.reps ?? 1) > (a.weight ?? 0) * (a.reps ?? 1) ? b : a,
                    last.sets[0]
                  );
                  if (best.weight)
                    return `Last time: ${toDisplayWeight(best.weight)} ${weightUnit} × ${best.reps ?? 0} · ${last.sets.length} sets`;
                  return `Last time: ${best.reps ?? 0} reps · ${last.sets.length} sets`;
                }
                if (last.distance && last.durationMinutes)
                  return `Last time: ${toDisplayDistance(last.distance)} ${distanceUnit} in ${last.durationMinutes} min`;
                if (last.durationMinutes) return `Last time: ${last.durationMinutes} min`;
                return null;
              })();

              return (
                <Animated.View
                  key={ex.id}
                  entering={FadeInDown.duration(220).delay(index * 30)}
                  style={styles.exCard}
                >
                  <View style={styles.exCardHeader}>
                    <View style={styles.exIconBox}>
                      <Ionicons name={ex.icon as any} size={15} color={colors.brandTeal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.exName}>{ex.name}</Text>
                      <Text style={styles.exMetric}>{METRIC_LABELS[ex.metric]}</Text>
                    </View>
                    <Pressable onPress={() => removeExercise(ex.id)} hitSlop={10}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>

                  {lastHint && <Text style={styles.lastHint}>{lastHint}</Text>}

                  {ex.metric === "weight_reps" || ex.metric === "reps" ? (
                    <View style={styles.setTable}>
                      <View style={styles.setRowHeader}>
                        <Text style={[styles.setHeaderText, { width: 34 }]}>SET</Text>
                        {ex.metric === "weight_reps" && (
                          <Text style={[styles.setHeaderText, { flex: 1 }]}>
                            {weightUnit.toUpperCase()}
                          </Text>
                        )}
                        <Text style={[styles.setHeaderText, { flex: 1 }]}>REPS</Text>
                        <View style={{ width: 26 }} />
                      </View>

                      {ex.sets.map((s, i) => (
                        <View key={s.id} style={styles.setRow}>
                          <Text style={styles.setIndex}>{i + 1}</Text>
                          {ex.metric === "weight_reps" && (
                            <TextInput
                              style={styles.setInput}
                              value={s.weight}
                              onChangeText={(t) => updateSet(ex.id, s.id, "weight", t)}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              selectTextOnFocus
                            />
                          )}
                          <TextInput
                            style={styles.setInput}
                            value={s.reps}
                            onChangeText={(t) => updateSet(ex.id, s.id, "reps", t)}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                          />
                          <Pressable
                            onPress={() => removeSet(ex.id, s.id)}
                            hitSlop={8}
                            style={{ width: 26, alignItems: "flex-end" }}
                          >
                            <Ionicons
                              name="remove-circle-outline"
                              size={18}
                              color={ex.sets.length > 1 ? colors.textMuted : "transparent"}
                            />
                          </Pressable>
                        </View>
                      ))}

                      <Pressable style={styles.addSetBtn} onPress={() => addSet(ex.id)}>
                        <Ionicons name="add" size={15} color={colors.brandTeal} />
                        <Text style={styles.addSetText}>Add set</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.metricRow}>
                      {ex.metric === "distance_duration" && (
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Distance ({distanceUnit})</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={ex.distance}
                            onChangeText={(t) => updateField(ex.id, "distance", t)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Minutes</Text>
                        <TextInput
                          style={styles.fieldInput}
                          value={ex.duration}
                          onChangeText={(t) => updateField(ex.id, "duration", t)}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                    </View>
                  )}
                </Animated.View>
              );
            })
          )}

          <Pressable style={styles.addExerciseBtn} onPress={openPicker}>
            <Ionicons name="search" size={17} color="#fff" />
            <Text style={styles.addExerciseText}>Add exercise</Text>
          </Pressable>

          {/* Voice entry */}
          <View style={styles.voiceCard}>
            <View style={styles.voiceHeaderRow}>
              <Ionicons name="mic-outline" size={16} color={colors.brandTeal} />
              <Text style={styles.voiceTitle}>Or say what you did</Text>
            </View>
            <DictationBar
              stage={dictation.stage}
              onToggle={dictation.toggle}
              hint={'Try: "Bench press 3 sets of 8 at 185, then 12 pull-ups."'}
            />
          </View>

          {heardMessage && (
            <Pressable style={styles.heardBox} onPress={() => setHeardMessage(null)}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brandTeal} />
              <Text style={styles.heardText}>{heardMessage}</Text>
            </Pressable>
          )}

          {/* Notes */}
          <Text style={[styles.label, { marginTop: spacing.lg }]}>How did it go? (optional)</Text>
          <TextInput
            style={[styles.input, { height: 84, textAlignVertical: "top", paddingTop: 10 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Felt strong, bumped bench up 5 lb, knee twinge on squats..."
            placeholderTextColor={colors.textMuted}
            multiline
          />

          {(error || dictation.error) && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error ?? dictation.error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Save */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={19} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.saveText}>{editingId ? "Save Changes" : "Save Session"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Exercise picker ─────────────────────────────────────────────────── */}
      <ExercisePickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={addExercise}
        addedKeys={addedKeys}
        recentDefs={recentDefs}
      />

      {/* Delete confirmation */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete this session?</Text>
            <Text style={styles.confirmText}>
              The exercises logged in it will no longer count towards your trends.
            </Text>
            <View style={styles.confirmBtnRow}>
              <Pressable style={styles.confirmCancel} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmDelete}
                onPress={() => {
                  if (editingId) deleteWorkoutSession(editingId);
                  setShowDeleteConfirm(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
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
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.textPrimary,
  },
  dayPill: {
    width: 58,
    paddingVertical: 9,
    borderRadius: radii.md,
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dayPillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  dayPillDow: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, color: colors.textMuted },
  dayPillNum: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 1 },
  dayPillTextActive: { color: "#fff" },
  exerciseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: 8,
  },
  setCount: { fontSize: 11, fontWeight: "700", color: colors.brandTeal },
  emptyBox: {
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: "dashed",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 8 },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  exCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  exCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  exIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(0,206,209,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  exName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  exMetric: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  lastHint: {
    fontSize: 11,
    color: colors.brandTeal,
    fontWeight: "600",
    marginTop: 8,
  },
  setTable: { marginTop: 10 },
  setRowHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  setHeaderText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  setIndex: {
    width: 34,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  setInput: {
    flex: 1,
    backgroundColor: colors.bgSection,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 8,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  addSetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: "rgba(0,206,209,0.08)",
    marginTop: 2,
  },
  addSetText: { fontSize: 13, fontWeight: "700", color: colors.brandTeal },
  metricRow: { flexDirection: "row", gap: spacing.sm, marginTop: 10 },
  fieldLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  fieldInput: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 9,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.brandTeal,
    borderRadius: radii.pill,
    paddingVertical: 13,
    marginTop: spacing.sm,
  },
  addExerciseText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  planBanner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(0,206,209,0.10)",
  },
  planBannerText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  voiceCard: {
    marginTop: spacing.sm,
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
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: "rgba(220,38,38,0.08)",
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error, fontWeight: "500" },
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
    backgroundColor: colors.brandTeal,
    borderRadius: radii.pill,
    paddingVertical: 15,
  },
  saveText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  // Confirm
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  confirmCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 340,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  confirmText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    marginBottom: spacing.lg,
    lineHeight: 19,
  },
  confirmBtnRow: { flexDirection: "row", gap: spacing.sm },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSection,
    alignItems: "center",
  },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  confirmDelete: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.error,
    alignItems: "center",
  },
  confirmDeleteText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
