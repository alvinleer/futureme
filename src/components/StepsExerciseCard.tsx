import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  FlatList,
} from "react-native";
import { Pedometer } from "expo-sensors";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import { colors, spacing } from "../theme";
import { WorkoutEntry } from "../types/diet";
import { estimateWorkoutCalories } from "../types/onboarding";
import {
  EXERCISE_ACTIVITIES,
  EXERCISE_CATEGORIES,
  QUICK_PICK_ACTIVITIES,
  ExerciseActivity,
  ExerciseCategory,
  activityKcalPerMin,
} from "../data/exerciseActivities";

const toDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const INTENSITIES: { key: WorkoutEntry["intensity"]; label: string; color: string }[] = [
  { key: "low",    label: "Low",    color: "#4CAF50" },
  { key: "medium", label: "Moderate", color: "#FF9800" },
  { key: "high",   label: "High",   color: "#F44336" },
];

const DURATIONS = [15, 20, 30, 45, 60, 75, 90];

interface Props {
  selectedDate: Date;
}

export default function StepsExerciseCard({ selectedDate }: Props) {
  const dateStr = toDateString(selectedDate);

  const setStepsForDate = useDietStore((s) => s.setStepsForDate);
  const getStepsForDate = useDietStore((s) => s.getStepsForDate);
  const getWorkoutsForDate = useDietStore((s) => s.getWorkoutsForDate);
  const addWorkout = useDietStore((s) => s.addWorkout);
  const deleteWorkout = useDietStore((s) => s.deleteWorkout);
  const activityProfile = useOnboardingStore((s) => s.activityProfile);
  const workouts = useDietStore((s) => s.workouts);
  const workoutPlans = useDietStore((s) => s.workoutPlans);

  // The plan for the day being viewed, so logging a past day still offers the
  // right workout rather than today's.
  const planForDay = useMemo(
    () => workoutPlans.find((p) => p.dayOfWeek === selectedDate.getDay()) ?? null,
    [workoutPlans, selectedDate]
  );

  const savedSteps = getStepsForDate(dateStr);
  const defaultSteps = activityProfile?.dailySteps ?? 7000;
  const stepsSource = activityProfile?.stepsSource ?? "manual";

  const [liveSteps, setLiveSteps] = useState<number | null>(null);

  const isToday = useMemo(() => {
    const today = toDateString(new Date());
    return dateStr === today;
  }, [dateStr]);

  const fetchTodaySteps = useCallback(async () => {
    if (stepsSource !== "device" || !isToday) return;
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return;
      const { status } = await Pedometer.requestPermissionsAsync();
      if (status !== "granted") return;
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(start, end);
      setLiveSteps(result.steps);
      setStepsForDate(dateStr, result.steps);
    } catch {
      // silently fall back to stored value
    }
  }, [stepsSource, isToday, dateStr]);

  useEffect(() => {
    fetchTodaySteps();
  }, [fetchTodaySteps]);

  const displaySteps = stepsSource === "device" && isToday && liveSteps !== null
    ? liveSteps
    : savedSteps !== null
      ? savedSteps
      : defaultSteps;
  const stepCalories = Math.round(displaySteps * 0.05);

  const [editingSteps, setEditingSteps] = useState(false);
  const [stepsInput, setStepsInput] = useState("");

  const startEditSteps = () => {
    setStepsInput(String(displaySteps));
    setEditingSteps(true);
  };

  const saveSteps = () => {
    const val = parseInt(stepsInput, 10);
    if (!isNaN(val) && val >= 0) setStepsForDate(dateStr, val);
    setEditingSteps(false);
    Keyboard.dismiss();
  };

  const dayWorkouts = useMemo(
    () => getWorkoutsForDate(dateStr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, dateStr]
  );

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ─── Add Exercise Modal State ────────────────────────────────────────────────
  const defaultIntensityMap: Record<string, WorkoutEntry["intensity"]> = {
    light: "low", moderate: "medium", intense: "high",
  };
  const defaultIntensity: WorkoutEntry["intensity"] =
    defaultIntensityMap[activityProfile?.cardioIntensity ?? "moderate"] ?? "medium";
  const defaultDuration = activityProfile?.cardioMinutesPerSession ?? 30;

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ExerciseActivity | null>(null);
  const [exDuration, setExDuration] = useState(defaultDuration);
  const [exIntensity, setExIntensity] = useState<WorkoutEntry["intensity"]>(defaultIntensity);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ExerciseCategory | null>(null);

  const openAddModal = () => {
    setSelectedActivity(null);
    setExDuration(defaultDuration);
    setExIntensity(defaultIntensity);
    setSearchQuery("");
    setActiveCategory(null);
    setShowAddModal(true);
  };

  const handleSelectActivity = (activity: ExerciseActivity) => {
    setSelectedActivity(activity);
    setExIntensity(activity.defaultIntensity);
    Keyboard.dismiss();
  };

  const saveExercise = () => {
    if (!selectedActivity) return;
    const noon = new Date(dateStr);
    noon.setHours(12, 0, 0, 0);
    addWorkout(
      {
        type: selectedActivity.mapToType,
        activityKey: selectedActivity.key,
        durationMinutes: exDuration,
        intensity: exIntensity,
      },
      noon.getTime()
    );
    setShowAddModal(false);
  };

  // Filtered activity list based on search or active category
  const filteredActivities = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      return EXERCISE_ACTIVITIES.filter((a) => a.label.toLowerCase().includes(q));
    }
    if (activeCategory) {
      return EXERCISE_ACTIVITIES.filter((a) => a.category === activeCategory);
    }
    return [];
  }, [searchQuery, activeCategory]);

  const showBrowse = searchQuery.trim().length > 0 || activeCategory !== null;

  const formatDuration = (min: number) =>
    min >= 60 ? `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}m` : ""}` : `${min}m`;

  // Estimated calories preview
  const previewCalories = selectedActivity
    ? Math.round(activityKcalPerMin(selectedActivity, exIntensity) * exDuration)
    : null;

  return (
    <>
      <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeadline}>MY ACTIVITY</Text>
          <Pressable onPress={openAddModal} style={styles.addBtn}>
            <Ionicons name="add" size={16} color={colors.brandTeal} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.cardBody}>
          {/* Steps section */}
          <View style={styles.stepsSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="footsteps-outline" size={14} color={colors.textMuted} />
              <Text style={styles.sectionLabel}>STEPS</Text>
              {stepsSource === "device" && isToday && liveSteps !== null && (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              )}
            </View>

            <View style={styles.exerciseCalRow}>
              <Text style={styles.exerciseCalNumber}>{stepCalories}</Text>
              <View style={styles.exerciseCalSub}>
                <Text style={styles.exerciseCalLabel}>kcal burned</Text>
              </View>
            </View>

            {editingSteps ? (
              <View style={styles.stepsEditRow}>
                <TextInput
                  style={styles.stepsInput}
                  value={stepsInput}
                  onChangeText={setStepsInput}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={saveSteps}
                  autoFocus
                  selectTextOnFocus
                />
                <Pressable onPress={saveSteps} style={styles.stepsSaveBtn}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={startEditSteps} style={styles.sessionRow}>
                <View style={styles.sessionIconBox}>
                  <Ionicons name="footsteps-outline" size={13} color={colors.brandTeal} />
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionType}>{displaySteps.toLocaleString()} steps</Text>
                </View>
                <Ionicons name="pencil-outline" size={12} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <View style={styles.divider} />

          {/* Exercise section */}
          <View style={styles.exerciseSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="barbell-outline" size={14} color={colors.textMuted} />
              <Text style={styles.sectionLabel}>EXERCISE</Text>
            </View>

            {dayWorkouts.length === 0 ? (
              <Text style={styles.noExercise}>No sessions logged</Text>
            ) : (
              <>
                <View style={styles.exerciseCalRow}>
                  <Text style={styles.exerciseCalNumber}>
                    {dayWorkouts.reduce((sum, w) => sum + estimateWorkoutCalories(w), 0)}
                  </Text>
                  <View style={styles.exerciseCalSub}>
                    <Text style={styles.exerciseCalLabel}>kcal burned</Text>
                  </View>
                </View>
                <View style={styles.sessionList}>
                  {dayWorkouts.map((w) => {
                    const actLabel = w.activityKey
                      ? (EXERCISE_ACTIVITIES.find((a) => a.key === w.activityKey)?.label ?? w.type)
                      : w.type;
                    const actIcon = w.activityKey
                      ? (EXERCISE_ACTIVITIES.find((a) => a.key === w.activityKey)?.icon ?? "body-outline")
                      : "body-outline";
                    return (
                      <Animated.View key={w.id} entering={FadeInUp.duration(250)} style={styles.sessionRow}>
                        <View style={styles.sessionIconBox}>
                          <Ionicons name={actIcon as any} size={13} color={colors.brandTeal} />
                        </View>
                        <View style={styles.sessionInfo}>
                          <Text style={styles.sessionType}>
                            {actLabel} · {formatDuration(w.durationMinutes)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => deleteWorkout(w.id)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="trash-outline" size={13} color={colors.error} />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>
      </Animated.View>

      {/* ─── Add Exercise Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setShowAddModal(false)} />
            <View style={styles.sheet}>
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.sheetTitle}>Add Exercise</Text>
                <Pressable onPress={() => setShowAddModal(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {/* ── Planned workout for this day ────────────────────── */}
                {planForDay && (
                  <Pressable
                    style={[styles.detailedRow, styles.plannedRow]}
                    onPress={() => {
                      setShowAddModal(false);
                      navigation.navigate("LogWorkoutSession", {
                        planDayOfWeek: planForDay.dayOfWeek,
                      });
                    }}
                  >
                    <View style={styles.detailedIcon}>
                      <Ionicons name="calendar" size={17} color={colors.brandTeal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailedTitle}>
                        {planForDay.title ?? "Your planned workout"}
                      </Text>
                      <Text style={styles.detailedSub}>
                        {planForDay.exercises.length} exercise
                        {planForDay.exercises.length === 1 ? "" : "s"} ready to log
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                )}

                {/* ── Detailed session shortcut ───────────────────────── */}
                <Pressable
                  style={styles.detailedRow}
                  onPress={() => {
                    setShowAddModal(false);
                    navigation.navigate("LogWorkoutSession", {});
                  }}
                >
                  <View style={styles.detailedIcon}>
                    <Ionicons name="list-outline" size={17} color={colors.brandTeal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailedTitle}>Log a detailed session</Text>
                    <Text style={styles.detailedSub}>
                      Pick exercises, record sets, reps and weight to track progress
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.5)" />
                </Pressable>

                {/* ── Quick Picks ─────────────────────────────────────── */}
                <Text style={styles.sheetLabel}>Quick Pick</Text>
                <View style={styles.quickPickGrid}>
                  {QUICK_PICK_ACTIVITIES.map((act) => {
                    const isSelected = selectedActivity?.key === act.key;
                    return (
                      <Pressable
                        key={act.key}
                        style={[styles.quickPickItem, isSelected && styles.quickPickItemActive]}
                        onPress={() => handleSelectActivity(act)}
                      >
                        <Ionicons
                          name={act.icon as any}
                          size={22}
                          color={isSelected ? "#fff" : colors.brandTeal}
                        />
                        <Text style={[styles.quickPickLabel, isSelected && styles.quickPickLabelActive]}>
                          {act.label}
                        </Text>
                        <Text style={[styles.quickPickCal, isSelected && { color: "rgba(255,255,255,0.8)" }]}>
                          ~{Math.round(act.kcalPerMinMedium)}/min
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* ── Search ──────────────────────────────────────────── */}
                <Text style={[styles.sheetLabel, { marginTop: 16 }]}>Browse All</Text>
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={(t) => {
                      setSearchQuery(t);
                      setActiveCategory(null);
                    }}
                    placeholder="Search exercises..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                  )}
                </View>

                {/* Category chips (shown when no search text) */}
                {searchQuery.length === 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 10 }}
                  >
                    <View style={styles.categoryRow}>
                      {EXERCISE_CATEGORIES.map((cat) => {
                        const isActive = activeCategory === cat.key;
                        return (
                          <Pressable
                            key={cat.key}
                            style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                            onPress={() => setActiveCategory(isActive ? null : cat.key)}
                          >
                            <Ionicons
                              name={cat.icon as any}
                              size={13}
                              color={isActive ? "#fff" : "rgba(255,255,255,0.5)"}
                            />
                            <Text style={[styles.categoryChipText, isActive && { color: "#fff" }]}>
                              {cat.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                {/* Activity list (shown when searching or category selected) */}
                {showBrowse && (
                  <View style={styles.activityList}>
                    {filteredActivities.length === 0 ? (
                      <Text style={styles.emptyText}>No activities found</Text>
                    ) : (
                      filteredActivities.map((act) => {
                        const isSelected = selectedActivity?.key === act.key;
                        return (
                          <Pressable
                            key={act.key}
                            style={[styles.activityRow, isSelected && styles.activityRowActive]}
                            onPress={() => handleSelectActivity(act)}
                          >
                            <View style={[styles.activityIconBox, isSelected && styles.activityIconBoxActive]}>
                              <Ionicons
                                name={act.icon as any}
                                size={16}
                                color={isSelected ? "#fff" : colors.brandTeal}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.activityName, isSelected && { color: "#fff" }]}>
                                {act.label}
                              </Text>
                            </View>
                            <Text style={[styles.activityCal, isSelected && { color: "rgba(255,255,255,0.8)" }]}>
                              ~{Math.round(act.kcalPerMinMedium)} kcal/min
                            </Text>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 6 }} />
                            )}
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                )}

                {/* ── Duration & Intensity (visible once activity chosen) ── */}
                {selectedActivity && (
                  <>
                    {/* Selected activity banner */}
                    <View style={styles.selectedBanner}>
                      <Ionicons name={selectedActivity.icon as any} size={18} color={colors.brandTeal} />
                      <Text style={styles.selectedBannerText}>{selectedActivity.label}</Text>
                      {previewCalories !== null && (
                        <View style={styles.previewCalBadge}>
                          <Text style={styles.previewCalText}>~{previewCalories} kcal</Text>
                        </View>
                      )}
                      <Pressable onPress={() => setSelectedActivity(null)} hitSlop={8} style={{ marginLeft: "auto" }}>
                        <Ionicons name="close-circle-outline" size={18} color="rgba(255,255,255,0.4)" />
                      </Pressable>
                    </View>

                    {/* Duration */}
                    <Text style={styles.sheetLabel}>Duration</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      <View style={styles.pillRow}>
                        {DURATIONS.map((d) => (
                          <Pressable
                            key={d}
                            style={[styles.pill, exDuration === d && styles.pillActive]}
                            onPress={() => setExDuration(d)}
                          >
                            <Text style={[styles.pillText, exDuration === d && styles.pillTextActive]}>
                              {formatDuration(d)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>

                    {/* Intensity */}
                    <Text style={styles.sheetLabel}>Intensity</Text>
                    <View style={styles.pillRow}>
                      {INTENSITIES.map((i) => (
                        <Pressable
                          key={i.key}
                          style={[
                            styles.pill,
                            styles.pillFlex,
                            exIntensity === i.key && { backgroundColor: i.color, borderColor: i.color },
                          ]}
                          onPress={() => setExIntensity(i.key)}
                        >
                          <Text style={[styles.pillText, exIntensity === i.key && styles.pillTextActive]}>
                            {i.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Pressable style={styles.saveBtn} onPress={saveExercise}>
                      <Ionicons name="checkmark-circle" size={18} color="#1e206a" style={{ marginRight: 8 }} />
                      <Text style={styles.saveBtnText}>Log Session</Text>
                    </Pressable>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "column",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeadline: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  cardBody: {
    flexDirection: "row",
  },
  stepsSection: {
    flex: 1,
    padding: 14,
    paddingRight: 10,
  },
  divider: {
    width: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 12,
  },
  exerciseSection: {
    flex: 1.4,
    padding: 14,
    paddingLeft: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  stepsEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepsInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: colors.brandPrimary,
    borderBottomWidth: 2,
    borderBottomColor: colors.brandTeal,
    paddingVertical: 2,
  },
  stepsSaveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandTeal,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brandTeal,
  },
  noExercise: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  sessionList: {
    gap: 6,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sessionIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: `${colors.brandTeal}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  exerciseCalRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    marginBottom: 8,
  },
  exerciseCalNumber: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.brandTeal,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  exerciseCalSub: {
    marginBottom: 2,
  },
  exerciseCalLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
    lineHeight: 14,
  },
  liveBadge: {
    backgroundColor: "#FF375F",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  // ─── Modal ────────────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#1e206a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "88%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  detailedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.25)",
    marginBottom: 16,
  },
  // The planned workout is the primary action when one exists, so it reads
  // brighter than the generic "log a session" row below it.
  plannedRow: {
    backgroundColor: "rgba(0,206,209,0.12)",
    borderColor: colors.brandTeal,
    marginBottom: 10,
  },
  detailedIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(0,206,209,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailedTitle: { fontSize: 14, fontWeight: "700", color: "#fff" },
  detailedSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2, lineHeight: 15 },
  sheetLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  // Quick pick grid
  quickPickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickPickItem: {
    width: "22%",
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#2a2d7a",
    gap: 4,
  },
  quickPickItemActive: {
    backgroundColor: colors.brandTeal,
    borderColor: colors.brandTeal,
  },
  quickPickLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
  quickPickLabelActive: {
    color: "#fff",
  },
  quickPickCal: {
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
  },
  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2d7a",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  // Category chips
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#2a2d7a",
  },
  categoryChipActive: {
    backgroundColor: colors.brandTeal,
    borderColor: colors.brandTeal,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
  },
  // Activity list
  activityList: {
    marginBottom: 12,
    gap: 4,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#2a2d7a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 4,
  },
  activityRowActive: {
    backgroundColor: colors.brandTeal,
    borderColor: colors.brandTeal,
  },
  activityIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  activityIconBoxActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  activityName: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },
  activityCal: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "500",
  },
  emptyText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    paddingVertical: 16,
  },
  // Selected activity banner
  selectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${colors.brandTeal}55`,
  },
  selectedBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  previewCalBadge: {
    backgroundColor: `${colors.brandTeal}33`,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewCalText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brandTeal,
  },
  // Duration & intensity pills
  pillRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#2a2d7a",
  },
  pillFlex: {
    flex: 1,
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: colors.brandTeal,
    borderColor: colors.brandTeal,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
  },
  pillTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#ffffff",
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#1e206a",
    fontWeight: "700",
    fontSize: 16,
  },
});
