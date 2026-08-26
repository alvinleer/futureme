import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CartesianChart, Line } from "victory-native";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import { TrackerConfig, TrackerType, GoalDirection } from "../types/diet";
import EmojiPicker from "../components/EmojiPicker";
import { colors, spacing, radii, shadows } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";

type GoalType = "lose" | "gain" | "other";

const GOAL_META: Record<GoalType, { label: string; icon: string; tint: string }> = {
  lose:  { label: "Lose Fat",              icon: "trending-down-outline", tint: "#2DD4BF" },
  gain:  { label: "Gain Muscle",           icon: "barbell-outline",       tint: "#60a5fa" },
  other: { label: "Health & Performance",  icon: "pulse-outline",         tint: "#a78bfa" },
};

const TRACKER_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#BE185D",
  "#00CED1",
  "#F25A23",
];

const isEmoji = (str: string) => /\p{Emoji}/u.test(str) && str.length <= 4;

export default function GoalTrackerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isOnboardingComplete = useOnboardingStore((s) => s.isComplete);
  const goal = useOnboardingStore((s) => s.goal);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const profileWeightKg = useOnboardingStore((s) => s.stats?.weightKg ?? 0);
  const isMetric = unitSystem === "metric";
  const weightUnit = isMetric ? "kg" : "lbs";
  const toDisplay = (lbs: number) => isMetric ? lbs / 2.20462 : lbs;
  const toStored = (val: number) => isMetric ? val * 2.20462 : val;

  // Current weight always comes from the profile (in kg → convert to lbs for internal use)
  const currentWeight = profileWeightKg * 2.20462;

  const targetWeight = useDietStore((s) => s.weightGoal.targetWeight);
  const weightHistory = useDietStore((s) => s.weightGoal.weightHistory);
  const updateTargetWeight = useDietStore((s) => s.updateTargetWeight);
  const updateNutritionGoal = useDietStore((s) => s.updateNutritionGoal);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const trackers = useDietStore((s) => s.trackers);
  const addTracker = useDietStore((s) => s.addTracker);
  const updateTracker = useDietStore((s) => s.updateTracker);
  const deleteTracker = useDietStore((s) => s.deleteTracker);

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingTracker, setEditingTracker] = useState<TrackerConfig | null>(null);
  const [targetInput, setTargetInput] = useState("");

  const [trackerName, setTrackerName] = useState("");
  const [trackerType, setTrackerType] = useState<TrackerType>("counter");
  const [trackerIcon, setTrackerIcon] = useState("💧");
  const [trackerColor, setTrackerColor] = useState(TRACKER_COLORS[0]);
  const [trackerGoal, setTrackerGoal] = useState("");
  const [trackerGoalDirection, setTrackerGoalDirection] = useState<GoalDirection>("max");
  const [trackerShowOnHome, setTrackerShowOnHome] = useState(true);

  const [caloriesInput, setCaloriesInput] = useState(nutritionGoal.dailyCalories.toString());
  const [proteinInput, setProteinInput] = useState(nutritionGoal.dailyProtein.toString());
  const [carbsInput, setCarbsInput] = useState(nutritionGoal.dailyCarbs.toString());
  const [fatInput, setFatInput] = useState(nutritionGoal.dailyFat.toString());

  const handleUpdateTarget = () => {
    const val = parseFloat(targetInput);
    if (isNaN(val) || val <= 0) return;
    updateTargetWeight(toStored(val));
    setTargetInput("");
    setShowTargetModal(false);
  };

  const handleUpdateNutrition = () => {
    const calories = parseFloat(caloriesInput);
    const protein = parseFloat(proteinInput);
    const carbs = parseFloat(carbsInput);
    const fat = parseFloat(fatInput);
    if (isNaN(calories) || isNaN(protein) || isNaN(carbs) || isNaN(fat)) return;
    updateNutritionGoal({ dailyCalories: calories, dailyProtein: protein, dailyCarbs: carbs, dailyFat: fat });
    setShowNutritionModal(false);
  };

  const resetTrackerForm = () => {
    setTrackerName("");
    setTrackerType("counter");
    setTrackerIcon("💧");
    setTrackerColor(TRACKER_COLORS[0]);
    setTrackerGoal("");
    setTrackerGoalDirection("max");
    setTrackerShowOnHome(true);
    setEditingTracker(null);
  };

  const openEditTrackerModal = (tracker: TrackerConfig) => {
    setEditingTracker(tracker);
    setTrackerName(tracker.name);
    setTrackerType(tracker.type);
    setTrackerIcon(tracker.icon);
    setTrackerColor(tracker.color);
    setTrackerGoal(tracker.goal?.toString() || "");
    setTrackerGoalDirection(tracker.goalDirection || "max");
    setTrackerShowOnHome(tracker.showOnHome);
    setShowTrackerModal(true);
  };

  const handleSaveTracker = () => {
    if (!trackerName.trim()) return;
    const goal = trackerType === "counter" ? parseInt(trackerGoal) || undefined : undefined;
    const goalDirection = trackerType === "counter" && goal ? trackerGoalDirection : undefined;
    if (editingTracker) {
      updateTracker(editingTracker.id, { name: trackerName.trim(), type: trackerType, icon: trackerIcon, color: trackerColor, goal, goalDirection, showOnHome: trackerShowOnHome });
    } else {
      addTracker({ name: trackerName.trim(), type: trackerType, icon: trackerIcon, color: trackerColor, goal, goalDirection, showOnHome: trackerShowOnHome });
    }
    setShowTrackerModal(false);
    resetTrackerForm();
  };

  const weightDifference = currentWeight && targetWeight ? currentWeight - targetWeight : 0;
  const goalDirection: "lose" | "gain" =
    targetWeight > 0 && currentWeight > 0 && targetWeight > currentWeight ? "gain" : "lose";
  const progressPercentage =
    currentWeight && targetWeight && weightHistory.length > 0
      ? Math.min(((weightHistory[0].weight - currentWeight) / (weightHistory[0].weight - targetWeight)) * 100, 100)
      : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: insets.top + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Text style={styles.pageTitle}>Goals</Text>
          <Pressable
            onPress={() => navigation.navigate("OnboardingGoal")}
            style={{ borderRadius: radii.pill, overflow: "hidden" }}
          >
            <LinearGradient
              colors={["#5b67cd", "#1e206a"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: spacing.md,
                paddingVertical: 9,
                borderRadius: radii.pill,
              }}
            >
              <Ionicons name="pencil" size={13} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>
                {isOnboardingComplete ? "Edit Plan" : "Set Up Plan"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Current Goal Summary Card */}
        {goal && (() => {
          const meta = GOAL_META[goal.type as GoalType] ?? GOAL_META.other;
          const endDate = goal.goalEndDate ? new Date(goal.goalEndDate) : null;
          const endDateStr = endDate
            ? endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : null;

          // Progress pct for the mini bar
          const hasWeights = goal.currentWeightKg != null && goal.targetWeightKg != null;
          const totalSpan = hasWeights ? Math.abs(goal.currentWeightKg! - goal.targetWeightKg!) || 1 : 1;
          const startW = hasWeights ? goal.currentWeightKg! : 0;
          const targetW = hasWeights ? goal.targetWeightKg! : 0;
          const isLosing = targetW < startW;
          const currentW = currentWeight; // lbs
          const currentWKg = currentW / 2.20462;
          const covered = hasWeights ? Math.abs(startW - currentWKg) : 0;
          const progressPct = hasWeights ? Math.min(Math.max((covered / totalSpan) * 100, 0), 100) : 0;

          return (
            <View style={styles.goalCard}>
              <LinearGradient
                colors={["#5b67cd", "#1e206a"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.goalCardInner}
              >
                {/* Top row: label + goal type */}
                <View style={styles.goalCardTop}>
                  <View style={styles.goalCardLabel}>
                    <View style={[styles.goalCardDot, { backgroundColor: meta.tint }]} />
                    <Text style={[styles.goalCardEyebrow, { color: meta.tint }]}>CURRENT GOAL</Text>
                  </View>
                  <View style={styles.goalCardTypePill}>
                    <Ionicons name={meta.icon as any} size={11} color={meta.tint} />
                    <Text style={[styles.goalCardType, { color: meta.tint }]}>{meta.label}</Text>
                  </View>
                </View>

                {/* Weight hero row */}
                {hasWeights && goal.type !== "other" && (
                  <View style={styles.goalCardWeightRow}>
                    <View style={styles.goalCardWeightBlock}>
                      <Text style={styles.goalCardWeightNum}>{goal.currentWeightKg}</Text>
                      <Text style={styles.goalCardWeightUnit}>kg</Text>
                    </View>
                    <View style={styles.goalCardArrowWrap}>
                      <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.25)" />
                    </View>
                    <View style={styles.goalCardWeightBlock}>
                      <Text style={[styles.goalCardWeightNum, { color: meta.tint }]}>{goal.targetWeightKg}</Text>
                      <Text style={[styles.goalCardWeightUnit, { color: meta.tint }]}>kg</Text>
                    </View>
                    <View style={styles.goalCardWeightLabelCol}>
                      <Text style={styles.goalCardWeightSmallLabel}>Start weight</Text>
                      <Text style={[styles.goalCardWeightSmallLabel, { color: meta.tint }]}>Target weight</Text>
                    </View>
                  </View>
                )}

                {/* Stats grid */}
                <View style={styles.goalCardGrid}>
                  {goal.weeksToGoal != null && (
                    <View style={styles.goalCardGridItem}>
                      <Text style={styles.goalCardGridValue}>{goal.weeksToGoal}<Text style={styles.goalCardGridUnit}> wks</Text></Text>
                      <Text style={styles.goalCardGridLabel}>Timeline</Text>
                    </View>
                  )}
                  {endDateStr && (
                    <View style={[styles.goalCardGridItem, goal.weeksToGoal != null && styles.goalCardGridItemBorder]}>
                      <Text style={styles.goalCardGridValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{endDateStr}</Text>
                      <Text style={styles.goalCardGridLabel}>Goal date</Text>
                    </View>
                  )}
                </View>

                {/* Progress bar */}
                {hasWeights && goal.type !== "other" && (
                  <View style={styles.goalCardProgressWrap}>
                    <View style={styles.goalCardProgressBg}>
                      <View style={[styles.goalCardProgressFill, { width: `${progressPct}%` as any, backgroundColor: meta.tint }]} />
                    </View>
                    <Text style={styles.goalCardProgressLabel}>
                      {progressPct.toFixed(0)}% complete
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          );
        })()}

        {/* Weight Goal Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="scale-outline" size={16} color="#fff" />
            </View>
            <Text style={styles.cardTitle}>Weight Goal</Text>
          </View>

          <View style={styles.weightRow}>
            <View style={styles.weightBox}>
              <Text style={styles.weightNum}>{currentWeight > 0 ? `${toDisplay(currentWeight).toFixed(1)}` : "--"}</Text>
              <Text style={styles.weightLabel}>Current ({weightUnit})</Text>
              <View style={styles.editChip}>
                <Ionicons name="person-outline" size={10} color={colors.textMuted} />
                <Text style={[styles.editChipText, { color: colors.textMuted }]}>Profile</Text>
              </View>
            </View>
            <View style={styles.weightArrow}>
              <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
            </View>
            <Pressable style={styles.weightBox} onPress={() => setShowTargetModal(true)}>
              <Text style={[styles.weightNum, { color: colors.brandOrange }]}>
                {targetWeight > 0 ? `${toDisplay(targetWeight).toFixed(1)}` : "--"}
              </Text>
              <Text style={styles.weightLabel}>Target ({weightUnit})</Text>
              <View style={styles.editChip}>
                <Ionicons name="pencil" size={10} color={colors.brandOrange} />
                <Text style={styles.editChipText}>Edit</Text>
              </View>
            </Pressable>
          </View>

          {currentWeight > 0 && targetWeight > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Progress</Text>
                <Text style={styles.progressSub}>{toDisplay(Math.abs(weightDifference)).toFixed(1)} {weightUnit} to go</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.max(progressPercentage, 0)}%` as any }]} />
              </View>
            </View>
          )}
        </View>

        {/* Nutrition Goals */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconBox, { backgroundColor: colors.brandPrimary }]}>
              <Ionicons name="nutrition-outline" size={16} color="#fff" />
            </View>
            <Text style={styles.cardTitle}>Nutrition Goals</Text>
            <Pressable style={styles.editBtn} onPress={() => setShowNutritionModal(true)}>
              <Ionicons name="create-outline" size={24} color={colors.brandPrimary} />
            </Pressable>
          </View>

          {[
            { label: "Calories", value: `${nutritionGoal.dailyCalories}`, unit: "kcal", color: colors.textPrimary, priority: "#1" },
            { label: "Protein", value: `${nutritionGoal.dailyProtein}`, unit: "g", color: colors.brandTeal, priority: "#2" },
            { label: "Carbs", value: `${nutritionGoal.dailyCarbs}`, unit: "g", color: "#a78bfa", priority: null },
            { label: "Fat", value: `${nutritionGoal.dailyFat}`, unit: "g", color: colors.brandOrange, priority: null },
          ].map((item, idx, arr) => (
            <View key={item.label} style={[styles.macroRow, idx < arr.length - 1 && styles.macroRowBorder]}>
              <View style={styles.macroLabelRow}>
                <Text style={styles.macroLabel}>{item.label}</Text>
                {item.priority ? (
                  <View style={[styles.priorityTag, { backgroundColor: item.color }]}>
                    <Text style={styles.priorityTagText}>{item.priority}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.macroValue, { color: item.color }]}>
                {item.value}<Text style={styles.macroUnit}> {item.unit}</Text>
              </Text>
            </View>
          ))}

          <Text style={styles.priorityHint}>
            {goalDirection === "gain"
              ? "Calories decide how much you gain. Protein decides how much of it is muscle."
              : "Calories decide how much you lose. Protein decides whether it comes off fat or muscle."}
          </Text>
        </View>
      </ScrollView>

      {/* Weight Modal */}
      {[
        { visible: showTargetModal, title: "Set Target Weight", value: targetInput, setValue: setTargetInput, onSave: handleUpdateTarget, onCancel: () => { setShowTargetModal(false); setTargetInput(""); }, placeholder: `Target in ${weightUnit}` },
      ].map((m) => (
        <Modal key={m.title} visible={m.visible} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>{m.title}</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder={m.placeholder}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    value={m.value}
                    onChangeText={m.setValue}
                    autoFocus
                  />
                  <View style={styles.modalBtnRow}>
                    <Pressable style={styles.modalCancelBtn} onPress={m.onCancel}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.modalSaveBtn} onPress={m.onSave}>
                      <Text style={styles.modalSaveText}>Save</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      ))}

      {/* Nutrition Modal */}
      <Modal visible={showNutritionModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Nutrition Goals</Text>
                {[
                  { label: "Daily Calories", value: caloriesInput, set: setCaloriesInput },
                  { label: "Protein (g)", value: proteinInput, set: setProteinInput },
                  { label: "Carbs (g)", value: carbsInput, set: setCarbsInput },
                  { label: "Fat (g)", value: fatInput, set: setFatInput },
                ].map((f) => (
                  <View key={f.label} style={{ marginBottom: spacing.sm }}>
                    <Text style={styles.inputLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder={f.label}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      value={f.value}
                      onChangeText={f.set}
                    />
                  </View>
                ))}
                <View style={styles.modalBtnRow}>
                  <Pressable style={styles.modalCancelBtn} onPress={() => setShowNutritionModal(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.modalSaveBtn} onPress={handleUpdateNutrition}>
                    <Text style={styles.modalSaveText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tracker Modal */}
      <Modal visible={showTrackerModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { maxHeight: "85%" }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalTitle}>{editingTracker ? "Edit Pledge" : "New Pledge"}</Text>

                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    style={[styles.modalInput, { marginBottom: spacing.md }]}
                    placeholder="e.g., Water glasses"
                    placeholderTextColor={colors.textMuted}
                    value={trackerName}
                    onChangeText={setTrackerName}
                  />

                  <Text style={styles.inputLabel}>Type</Text>
                  <View style={styles.segmentRow}>
                    {(["counter", "boolean"] as TrackerType[]).map((t) => (
                      <Pressable
                        key={t}
                        style={[styles.segmentPill, trackerType === t && styles.segmentPillActive]}
                        onPress={() => setTrackerType(t)}
                      >
                        <Text style={[styles.segmentText, trackerType === t && styles.segmentTextActive]}>
                          {t === "counter" ? "Counter" : "Yes/No"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {trackerType === "counter" && (
                    <>
                      <Text style={styles.inputLabel}>Daily Goal (optional)</Text>
                      <TextInput
                        style={[styles.modalInput, { marginBottom: spacing.md }]}
                        placeholder="e.g., 8"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        value={trackerGoal}
                        onChangeText={setTrackerGoal}
                      />
                    </>
                  )}

                  {trackerType === "counter" && trackerGoal.trim() !== "" && (
                    <>
                      <Text style={styles.inputLabel}>Goal Direction</Text>
                      <View style={styles.segmentRow}>
                        {(["max", "min"] as GoalDirection[]).map((d) => (
                          <Pressable
                            key={d}
                            style={[styles.segmentPill, trackerGoalDirection === d && styles.segmentPillActive]}
                            onPress={() => setTrackerGoalDirection(d)}
                          >
                            <Text style={[styles.segmentText, trackerGoalDirection === d && styles.segmentTextActive]}>
                              {d === "max" ? "At least" : "Less than"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  <Text style={styles.inputLabel}>Icon</Text>
                  <Pressable style={styles.iconPickerBtn} onPress={() => setShowEmojiPicker(true)}>
                    <View style={[styles.iconPreview, { backgroundColor: trackerColor + "22" }]}>
                      <Text style={{ fontSize: 22 }}>{trackerIcon}</Text>
                    </View>
                    <Text style={styles.iconPickerText}>Tap to choose icon</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>

                  <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Color</Text>
                  <View style={styles.colorRow}>
                    {TRACKER_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        style={[styles.colorSwatch, { backgroundColor: c }, trackerColor === c && styles.colorSwatchActive]}
                        onPress={() => setTrackerColor(c)}
                      >
                        {trackerColor === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </Pressable>
                    ))}
                  </View>

                  <Pressable style={styles.homeToggleRow} onPress={() => setTrackerShowOnHome(!trackerShowOnHome)}>
                    <Text style={styles.homeToggleLabel}>Show on Home Screen</Text>
                    <View style={[styles.toggle, trackerShowOnHome && styles.toggleOn]}>
                      <View style={[styles.toggleThumb, trackerShowOnHome && styles.toggleThumbOn]} />
                    </View>
                  </Pressable>

                  <View style={[styles.modalBtnRow, { marginTop: spacing.sm }]}>
                    <Pressable style={styles.modalCancelBtn} onPress={() => { setShowTrackerModal(false); resetTrackerForm(); }}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.modalSaveBtn} onPress={handleSaveTracker}>
                      <Text style={styles.modalSaveText}>Save</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={(emoji) => setTrackerIcon(emoji)}
        selectedEmoji={trackerIcon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  pageTitle: { fontSize: 28, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md, gap: spacing.sm },
  cardIconBox: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  editBtn: { padding: 8 },
  addBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.brandOrange,
    alignItems: "center", justifyContent: "center",
  },

  weightRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  weightBox: {
    flex: 1, backgroundColor: colors.bgMain,
    borderRadius: radii.lg, padding: spacing.md, alignItems: "center",
  },
  weightNum: { fontSize: 32, fontWeight: "700", color: colors.textPrimary },
  weightLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  editChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    marginTop: spacing.xs, backgroundColor: "rgba(242,90,35,0.08)",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill,
  },
  editChipText: { fontSize: 11, color: colors.brandOrange, fontWeight: "600" },
  weightArrow: { alignItems: "center" },

  progressSection: { marginTop: spacing.xs },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  progressLabel: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  progressSub: { fontSize: 12, color: colors.textMuted },
  progressBar: { height: 8, backgroundColor: colors.bgMain, borderRadius: radii.pill, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brandOrange, borderRadius: radii.pill },

  chartNote: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },

  macroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  macroRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  macroLabel: { fontSize: 15, color: colors.textMuted },
  macroLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  priorityTag: { borderRadius: radii.sm, paddingHorizontal: 5, paddingVertical: 1 },
  priorityTagText: { fontSize: 9, fontWeight: "800", color: "#ffffff", letterSpacing: 0.3 },
  priorityHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    fontWeight: "500",
    marginTop: spacing.sm,
  },
  macroValue: { fontSize: 16, fontWeight: "700" },
  macroUnit: { fontSize: 13, fontWeight: "400" },

  emptyState: { alignItems: "center", paddingVertical: spacing.xl },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, marginTop: spacing.sm },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4 },

  trackerRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm },
  trackerRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  trackerIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  trackerName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  trackerMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  trackerAction: { padding: 6 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modalCard: { backgroundColor: "#ffffff", borderRadius: radii.xl, padding: spacing.lg, width: "100%", maxWidth: 380 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.lg },
  inputLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.xs, textTransform: "uppercase" },
  modalInput: {
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 16, color: colors.textPrimary,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  modalBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radii.pill, backgroundColor: colors.bgMain, alignItems: "center" },
  modalCancelText: { fontWeight: "600", color: colors.textMuted },
  modalSaveBtn: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radii.pill, backgroundColor: colors.brandOrange, alignItems: "center" },
  modalSaveText: { fontWeight: "700", color: "#fff" },

  segmentRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  segmentPill: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md,
    backgroundColor: colors.bgMain, alignItems: "center",
    borderWidth: 1.5, borderColor: "transparent",
  },
  segmentPillActive: { borderColor: colors.brandOrange, backgroundColor: "rgba(242,90,35,0.08)" },
  segmentText: { fontWeight: "600", color: colors.textMuted },
  segmentTextActive: { color: colors.brandOrange },

  iconPickerBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  iconPreview: { width: 44, height: 44, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  iconPickerText: { flex: 1, fontSize: 15, color: colors.textPrimary },

  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  colorSwatch: { width: 40, height: 40, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  colorSwatchActive: { borderWidth: 2.5, borderColor: "#fff", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },

  homeToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  homeToggleLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.bgMain, justifyContent: "center", borderWidth: 1, borderColor: colors.borderSubtle },
  toggleOn: { backgroundColor: colors.brandOrange, borderColor: colors.brandOrange },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#ccc", marginLeft: 2 },
  toggleThumbOn: { backgroundColor: "#fff", marginLeft: 24 },
  goalCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.xl,
    overflow: "hidden",
    shadowColor: "#1e206a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  goalCardInner: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  goalCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  goalCardLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  goalCardDot: { width: 6, height: 6, borderRadius: 3 },
  goalCardEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.6 },
  goalCardIconRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  goalCardType: { fontSize: 12, fontWeight: "700" },
  goalCardTypePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  goalCardStats: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  goalCardStat: { alignItems: "flex-start" },
  goalCardStatValue: { fontSize: 24, fontWeight: "700", color: "#fff" },
  goalCardStatUnit: { fontSize: 13, fontWeight: "400", color: "rgba(255,255,255,0.6)" },
  goalCardStatLabel: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  goalCardDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.12)", marginHorizontal: spacing.xs, marginBottom: 14 },
  goalCardWeightRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  goalCardWeightBlock: { alignItems: "flex-start" },
  goalCardWeightNum: { fontSize: 36, fontWeight: "800", color: "#fff", letterSpacing: -1 },
  goalCardWeightUnit: { fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  goalCardArrowWrap: { paddingHorizontal: spacing.md },
  goalCardWeightLabelCol: { flex: 1, marginLeft: spacing.sm, gap: 2 },
  goalCardWeightSmallLabel: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  goalCardGrid: { flexDirection: "row", marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: spacing.md },
  goalCardGridItem: { flex: 1, gap: 2 },
  goalCardGridItemBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.08)", paddingLeft: spacing.md },
  goalCardGridValue: { fontSize: 18, fontWeight: "700", color: "#fff", letterSpacing: -0.3 },
  goalCardGridUnit: { fontSize: 12, fontWeight: "400", color: "rgba(255,255,255,0.5)" },
  goalCardGridLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.8, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" },
  goalCardProgressWrap: { marginTop: spacing.md, gap: 6 },
  goalCardProgressBg: { height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" },
  goalCardProgressFill: { height: 4, borderRadius: 2 },
  goalCardProgressLabel: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 },

  goalSettingsCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: "#1e206a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  goalSettingsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  goalSettingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  goalSettingsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  goalSettingsSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 1,
  },
});
