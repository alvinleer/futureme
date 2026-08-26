import React, { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "../components/ThemedText";
import { colors, spacing, radii } from "../theme";
import useOnboardingStore from "../state/onboardingStore";
import { RootStackParamList } from "../navigation/RootNavigator";
import {
  OnboardingGoal,
  LiftingLevel,
  ProgramLengthWeeks,
  PROGRAM_LENGTH_OPTIONS,
  sealGoalDate,
} from "../types/onboarding";
import { buildRecommendedPlan, CURRENT_MACROS_VERSION } from "../utils/recommendations";
import useFuturePhotoStore from "../state/futurePhotoStore";

type GoalType = "lose" | "gain" | "other";

const GOAL_OPTIONS: { value: GoalType; label: string; icon: string; description: string }[] = [
  { value: "lose", label: "Lose Fat", icon: "trending-down-outline", description: "Caloric deficit — burn fat and get leaner" },
  { value: "gain", label: "Gain Muscle", icon: "barbell-outline", description: "Caloric surplus — build strength and mass" },
  { value: "other", label: "Health / Performance", icon: "pulse-outline", description: "Maintenance calories — optimize health and performance" },
];

const GOAL_META: Record<GoalType, { label: string; colors: [string, string]; icon: string }> = {
  lose: { label: "Lose Fat", colors: ["#0f766e", "#0d9488"], icon: "trending-down-outline" },
  gain: { label: "Gain Muscle", colors: ["#1d4ed8", "#2563eb"], icon: "barbell-outline" },
  other: { label: "Health & Performance", colors: ["#7c3aed", "#8b5cf6"], icon: "pulse-outline" },
};

function CurrentGoalCard({ goal }: { goal: OnboardingGoal }) {
  const meta = GOAL_META[goal.type as GoalType] ?? GOAL_META.other;
  const endDate = goal.goalEndDate ? new Date(goal.goalEndDate) : null;
  const endDateStr = endDate
    ? endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Animated.View entering={FadeInDown.delay(40).springify()} style={summaryStyles.wrapper}>
      <LinearGradient
        colors={["#5b67cd", "#1e206a"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={summaryStyles.card}
      >
        <View style={summaryStyles.topRow}>
          <View style={summaryStyles.labelRow}>
            <View style={summaryStyles.dot} />
            <Text style={summaryStyles.eyebrow}>CURRENT GOAL</Text>
          </View>
          <Text style={summaryStyles.goalLabel}>{meta.label}</Text>
        </View>

        <View style={summaryStyles.statsRow}>
          {goal.currentWeightKg != null && goal.type !== "other" ? (
            <View style={summaryStyles.statItem}>
              <Text style={summaryStyles.statValue}>
                {goal.currentWeightKg}
                <Text style={summaryStyles.statUnit}> kg</Text>
              </Text>
              <Text style={summaryStyles.statLabel}>Current</Text>
            </View>
          ) : null}

          {goal.targetWeightKg != null && goal.type !== "other" ? (
            <>
              <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.35)" style={{ marginBottom: 14 }} />
              <View style={summaryStyles.statItem}>
                <Text style={[summaryStyles.statValue, { color: colors.brandTeal }]}>
                  {goal.targetWeightKg}
                  <Text style={summaryStyles.statUnit}> kg</Text>
                </Text>
                <Text style={summaryStyles.statLabel}>Target</Text>
              </View>
              <View style={summaryStyles.divider} />
            </>
          ) : null}

          {goal.weeksToGoal != null ? (
            <View style={summaryStyles.statItem}>
              <Text style={summaryStyles.statValue}>
                {goal.weeksToGoal}
                <Text style={summaryStyles.statUnit}> wks</Text>
              </Text>
              <Text style={summaryStyles.statLabel}>Timeline</Text>
            </View>
          ) : null}

          {endDateStr ? (
            <>
              <View style={summaryStyles.divider} />
              <View style={summaryStyles.statItem}>
                <Text style={summaryStyles.statValue}>{endDateStr}</Text>
                <Text style={summaryStyles.statLabel}>Goal date</Text>
              </View>
            </>
          ) : null}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const summaryStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
    borderRadius: radii.xl,
    overflow: "hidden",
    shadowColor: "#1e206a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandTeal,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: colors.brandTeal,
  },
  goalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  statItem: {
    alignItems: "flex-start",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255,255,255,0.5)",
  },
  statLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 14,
  },
});

const formatSealedDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function OnboardingGoalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const existingGoal = useOnboardingStore((s) => s.goal);
  const profileStats = useOnboardingStore((s) => s.stats);
  const setGoal = useOnboardingStore((s) => s.setGoal);
  const existingCalories = useOnboardingStore((s) => s.calories);
  const setCalories = useOnboardingStore((s) => s.setCalories);
  const setMacrosVersion = useOnboardingStore((s) => s.setMacrosCalculationVersion);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const savedWeight = profileStats?.weightKg ?? null;

  const sealProgram = useFuturePhotoStore((s) => s.sealProgram);
  const sealedGoalEndDate = useFuturePhotoStore((s) => s.goalEndDate);
  const sealedTotalWeeks = useFuturePhotoStore((s) => s.totalWeeks);
  // Once the program is running its length and goal date are fixed
  const programIsSealed = sealedGoalEndDate !== null && sealedGoalEndDate > Date.now();

  const [goalType, setGoalType] = useState<GoalType>(existingGoal?.type || "lose");
  const [selectedWeeks, setSelectedWeeks] = useState<ProgramLengthWeeks>(
    programIsSealed && (sealedTotalWeeks === 12 || sealedTotalWeeks === 24)
      ? sealedTotalWeeks
      : existingGoal?.weeksToGoal === 24
      ? 24
      : 12
  );
  const [liftingLevel, setLiftingLevel] = useState<LiftingLevel>(existingGoal?.liftingLevel || "beginner");
  const [trainingYears, setTrainingYears] = useState(existingGoal?.trainingYears?.toString() || "");

  // Auto-derive lifting level from years typed, but let the user override
  const handleTrainingYearsChange = (val: string) => {
    setTrainingYears(val);
    const yrs = parseFloat(val);
    if (!isNaN(yrs)) {
      if (yrs < 1) setLiftingLevel("beginner");
      else if (yrs <= 3) setLiftingLevel("intermediate");
      else setLiftingLevel("advanced");
    }
  };

  const currentWeightDisplay = savedWeight ? `${savedWeight}` : "--";

  const [navError, setNavError] = useState<string | null>(null);

  const handleContinue = () => {
    try {
      const cw = savedWeight ?? 75;

      // A running program keeps the day it was sealed on; a new one starts today.
      const programStartDate =
        programIsSealed && existingGoal?.programStartDate
          ? existingGoal.programStartDate
          : new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      const weeks = programIsSealed ? ((sealedTotalWeeks as ProgramLengthWeeks) ?? selectedWeeks) : selectedWeeks;
      const goalEndDate =
        programIsSealed && sealedGoalEndDate
          ? sealedGoalEndDate
          : sealGoalDate(programStartDate, weeks);

      const liftingLevelForGoal = goalType === "gain" ? liftingLevel : undefined;
      const goalChanged =
        !existingGoal ||
        existingGoal.type !== goalType ||
        existingGoal.weeksToGoal !== weeks ||
        existingGoal.liftingLevel !== liftingLevelForGoal;

      // Body stats are already known (Step 1) — suggest the target weight and
      // calorie plan for this goal right now, the moment both are in place.
      // Everything here stays editable on the next screen.
      const plan = profileStats ? buildRecommendedPlan(profileStats, {
        type: goalType,
        otherDetail: undefined,
        currentWeightKg: cw,
        targetWeightKg: cw,
        weeksToGoal: weeks,
        programStartDate,
        goalEndDate,
        liftingLevel: liftingLevelForGoal,
        trainingYears: goalType === "gain" && trainingYears ? parseFloat(trainingYears) : undefined,
      }) : null;
      const tw = plan
        ? Math.round((cw + plan.weeklyChangeKg * weeks) * 10) / 10
        : existingGoal?.targetWeightKg ?? cw;

      const goal: OnboardingGoal = {
        type: goalType,
        otherDetail: undefined,
        currentWeightKg: cw,
        targetWeightKg: tw,
        weeksToGoal: weeks,
        programStartDate,
        goalEndDate,
        liftingLevel: liftingLevelForGoal,
        trainingYears: goalType === "gain" && trainingYears ? parseFloat(trainingYears) : undefined,
      };

      setGoal(goal);
      // Seal it now — from here on the goal date is fixed for the whole program
      sealProgram(programStartDate, weeks, goalEndDate);

      if (plan && (goalChanged || !existingCalories)) {
        setCalories({
          maintenanceCalories: plan.tdee,
          targetCalories: plan.targetCalories,
          proteinGrams: plan.proteinG,
          carbsGrams: plan.carbsG,
          fatGrams: plan.fatG,
          dailyDeficitOrSurplus: plan.targetCalories - plan.tdee,
        });
        setMacrosVersion(CURRENT_MACROS_VERSION);
      }

      navigation.navigate("OnboardingCalories");
    } catch (e) {
      setNavError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSkip = () => {
    skipOnboarding();
    navigation.goBack();
  };

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "28.6%" }]} />
          </View>
          <ThemedText variant="caption" muted>Step 2 of 7</ThemedText>
        </View>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <ThemedText variant="bodySmall" muted>Skip</ThemedText>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.delay(80).springify()}>
            <ThemedText variant="caption" muted style={styles.eyebrow}>STEP 2 OF 7</ThemedText>
            <ThemedText variant="h1" style={styles.title}>Set Your Goal</ThemedText>
            <ThemedText variant="body" muted style={styles.subtitle}>What do you want to achieve?</ThemedText>
          </Animated.View>

          {/* Current goal summary — only shown when a goal already exists */}
          {existingGoal ? <CurrentGoalCard goal={existingGoal} /> : null}

          {/* Goal Type */}
          <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.section}>
            {GOAL_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.goalOption, goalType === option.value && styles.goalOptionActive]}
                onPress={() => setGoalType(option.value)}
              >
                <View style={styles.goalEmoji}>
                  <Ionicons name={option.icon as any} size={20} color={goalType === option.value ? colors.buttonPrimary : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="body" style={[styles.goalLabel, goalType === option.value && { color: colors.textPrimary }]}>
                    {option.label}
                  </ThemedText>
                  <ThemedText variant="caption" muted>{option.description}</ThemedText>
                </View>
                <View style={[styles.checkCircle, goalType === option.value && styles.checkCircleActive]}>
                  {goalType === option.value && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </Pressable>
            ))}
          </Animated.View>

          {/* Lifting Level — only for Gain Muscle */}
          {goalType === "gain" && (
            <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
              <ThemedText variant="h3" style={styles.sectionTitle}>Training Experience</ThemedText>

              {/* Years input */}
              <View style={styles.yearsInputRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodySmall" style={styles.yearsLabel}>
                    {"Years training actively (2+ times/week, no long breaks)"}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={{ marginTop: 2 }}>
                    {"This is the biggest factor in how fast you can gain muscle."}
                  </ThemedText>
                </View>
                <TextInput
                  style={styles.yearsInput}
                  value={trainingYears}
                  onChangeText={handleTrainingYearsChange}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              {(["beginner", "intermediate", "advanced"] as LiftingLevel[]).map((level) => {
                const meta = {
                  beginner: { label: "Beginner", sub: "Less than 1 year lifting", rate: "Up to 1.5% body weight / month", icon: "leaf-outline" },
                  intermediate: { label: "Intermediate", sub: "1–3 years of consistent lifting", rate: "Up to 1% body weight / month", icon: "fitness-outline" },
                  advanced: { label: "Advanced", sub: "3+ years of serious training", rate: "Up to 0.5% body weight / month", icon: "trophy-outline" },
                }[level];
                const active = liftingLevel === level;
                return (
                  <Pressable
                    key={level}
                    style={[styles.goalOption, active && styles.goalOptionActive]}
                    onPress={() => setLiftingLevel(level)}
                  >
                    <View style={styles.goalEmoji}>
                      <Ionicons name={meta.icon as any} size={20} color={active ? colors.buttonPrimary : colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="body" style={[styles.goalLabel, active && { color: colors.textPrimary }]}>
                        {meta.label}
                      </ThemedText>
                      <ThemedText variant="caption" muted>{meta.sub}</ThemedText>
                      <ThemedText variant="caption" style={{ color: active ? colors.buttonPrimary : colors.textMuted, marginTop: 2, fontSize: 11 }}>
                        {meta.rate}
                      </ThemedText>
                    </View>
                    <View style={[styles.checkCircle, active && styles.checkCircleActive]}>
                      {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </Animated.View>
          )}

          {/* Weight */}
          <Animated.View entering={FadeInDown.delay(240).springify()} style={styles.section}>
            <ThemedText variant="h3" style={styles.sectionTitle}>Your Weight (kg)</ThemedText>
            <View style={styles.weightRow}>
              <View style={styles.weightInputGroup}>
                <ThemedText variant="caption" muted style={styles.inputLabel}>CURRENT</ThemedText>
                <View style={styles.weightInputReadOnly}>
                  <Text style={styles.weightReadOnlyNum}>{currentWeightDisplay}</Text>
                </View>
                <Text style={styles.weightReadOnlyHint}>Update in Profile</Text>
              </View>

              {goalType !== "other" && (
                <>
                  <View style={styles.arrowContainer}>
                    <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
                  </View>
                  <View style={styles.weightInputGroup}>
                    <ThemedText variant="caption" muted style={styles.inputLabel}>TARGET</ThemedText>
                    <View style={styles.weightInputReadOnly}>
                      <Text style={styles.weightReadOnlyNum}>
                        {existingGoal?.targetWeightKg != null && existingGoal.type === goalType
                          ? existingGoal.targetWeightKg
                          : "--"}
                      </Text>
                    </View>
                    <Text style={styles.weightReadOnlyHint}>Calculated from your stats</Text>
                  </View>
                </>
              )}
            </View>
          </Animated.View>

          {/* Program length — chosen once, then sealed */}
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.section}>
            <ThemedText variant="h3" style={styles.sectionTitle}>Program Length</ThemedText>
            <ThemedText variant="bodySmall" muted style={styles.sectionSubtitle}>
              {programIsSealed
                ? "Your program is under way — the length and goal date are locked in."
                : "Pick your commitment. We seal your goal date the moment you start, and it does not move."}
            </ThemedText>

            {PROGRAM_LENGTH_OPTIONS.map((option) => {
              const active = selectedWeeks === option.weeks;
              const locked = programIsSealed && !active;
              return (
                <Pressable
                  key={option.weeks}
                  style={[
                    styles.programOption,
                    active && styles.programOptionActive,
                    locked && styles.programOptionLocked,
                  ]}
                  onPress={() => !programIsSealed && setSelectedWeeks(option.weeks)}
                  disabled={programIsSealed}
                >
                  <View style={styles.programWeeksBadge}>
                    <Text style={[styles.programWeeksNum, active && { color: colors.buttonPrimary }]}>
                      {option.weeks / 4}
                    </Text>
                    <Text style={styles.programWeeksUnit}>mo</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      variant="body"
                      style={[styles.goalLabel, active && { color: colors.textPrimary }]}
                    >
                      {option.tagline}
                    </ThemedText>
                    <ThemedText variant="caption" muted>{option.description}</ThemedText>
                    {!programIsSealed && (
                      <ThemedText variant="caption" style={styles.programDateHint}>
                        {"Goal date: "}{formatSealedDate(sealGoalDate(Date.now(), option.weeks))}
                      </ThemedText>
                    )}
                  </View>
                  <View style={[styles.checkCircle, active && styles.checkCircleActive]}>
                    {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}

            {programIsSealed && sealedGoalEndDate ? (
              <View style={styles.sealedBanner}>
                <Ionicons name="lock-closed" size={14} color={colors.buttonPrimary} />
                <ThemedText variant="caption" style={styles.sealedBannerText}>
                  {"Goal date sealed for "}{formatSealedDate(sealedGoalEndDate)}
                </ThemedText>
              </View>
            ) : null}
          </Animated.View>

          {/* Science Facts */}
          <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.section}>
            <ThemedText variant="caption" muted style={styles.factsLabel}>DID YOU KNOW?</ThemedText>
            <View style={styles.factCard}>
              <View style={styles.factIconWrap}>
                <Ionicons name="trending-down-outline" size={18} color={colors.buttonPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="bodySmall" style={styles.factTitle}>The 1% Rule</ThemedText>
                <ThemedText variant="caption" muted style={styles.factBody}>
                  {"Losing more than 1% of your body weight per week causes your metabolism to slow down and you'll hit a plateau. Slow and steady wins."}
                </ThemedText>
              </View>
            </View>
            <View style={styles.factCard}>
              <View style={styles.factIconWrap}>
                <Ionicons name="flame-outline" size={18} color="#f97316" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="bodySmall" style={styles.factTitle}>Protein Burns Itself</ThemedText>
                <ThemedText variant="caption" muted style={styles.factBody}>
                  {"Your body burns up to 30% of protein calories just to digest it — so a high-protein diet gives you a hidden calorie advantage."}
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {navError ? (
          <Text style={styles.errorText}>{navError}</Text>
        ) : null}
        <Pressable style={styles.continueButton} onPress={handleContinue}>
          <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <ThemedText variant="body" style={styles.continueText}>Continue</ThemedText>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  closeButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgSection, alignItems: "center", justifyContent: "center",
  },
  progressContainer: { flex: 1, alignItems: "center", marginHorizontal: spacing.lg },
  progressTrack: {
    width: "100%", height: 3, backgroundColor: colors.bgSection,
    borderRadius: 2, marginBottom: spacing.xs, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.buttonPrimary, borderRadius: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { marginTop: spacing.lg, marginBottom: spacing.xs, letterSpacing: 1.5, fontSize: 11 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.xl },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.md },
  goalOption: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    backgroundColor: colors.bgSection, borderRadius: radii.md, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: "transparent",
  },
  goalOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: "#FAFAFA" },
  goalEmoji: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginRight: spacing.md,
  },
  goalLabel: { fontWeight: "600", color: colors.textMuted, marginBottom: 2 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    alignItems: "center", justifyContent: "center",
  },
  checkCircleActive: { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
  detailOption: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    backgroundColor: colors.bgSection, borderRadius: radii.md, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: "transparent", gap: spacing.md,
  },
  detailOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: "rgba(45,52,53,0.06)" },
  detailEmoji: { fontSize: 22 },
  detailLabel: { flex: 1, color: colors.textMuted },
  weightRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bgSection, borderRadius: radii.lg,
    padding: spacing.lg, gap: spacing.md,
  },
  weightInputGroup: { flex: 1 },
  inputLabel: { marginBottom: spacing.xs, letterSpacing: 1, fontSize: 10 },
  weightInput: {
    backgroundColor: "#fff", borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.textPrimary, fontSize: 22, fontWeight: "700",
    textAlign: "center", borderWidth: 1, borderColor: colors.borderSubtle,
  },
  weightInputReadOnly: {
    backgroundColor: "rgba(0,0,0,0.04)", borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    alignItems: "center", borderWidth: 1, borderColor: colors.borderSubtle,
    opacity: 0.7,
  },
  weightReadOnlyNum: {
    fontSize: 22, fontWeight: "700", color: colors.textPrimary,
  },
  weightReadOnlyHint: {
    fontSize: 10, color: colors.brandOrange, textAlign: "center", marginTop: 4,
  },
  arrowContainer: { paddingTop: spacing.lg },
  rateRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: spacing.md, padding: spacing.sm,
    backgroundColor: "rgba(22, 163, 74, 0.08)", borderRadius: radii.md,
  },
  rateRowWarning: { backgroundColor: "rgba(217, 119, 6, 0.08)" },
  sectionSubtitle: { marginBottom: spacing.md, lineHeight: 18 },
  programOption: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    backgroundColor: colors.bgSection, borderRadius: radii.md, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: "transparent", gap: spacing.md,
  },
  programOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: "#FAFAFA" },
  programOptionLocked: { opacity: 0.45 },
  programWeeksBadge: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  programWeeksNum: { fontSize: 19, fontWeight: "700", color: colors.textMuted, lineHeight: 22 },
  programWeeksUnit: { fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },
  programDateHint: { color: colors.brandOrange, marginTop: 4, fontSize: 11 },
  sealedBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: "rgba(45,52,53,0.06)", borderRadius: radii.md,
  },
  sealedBannerText: { color: colors.textPrimary, fontWeight: "600" },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  continueButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingVertical: spacing.lg,
    borderRadius: radii.pill, overflow: "hidden",
  },
  continueText: { color: "#fff", fontWeight: "700" },
  errorText: { fontSize: 13, color: "#ef4444", textAlign: "center", marginBottom: spacing.sm },
  factsLabel: { marginBottom: spacing.sm, letterSpacing: 1.5, fontSize: 11 },
  factCard: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    backgroundColor: colors.bgSection, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  factIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    marginTop: 1,
  },
  factTitle: { fontWeight: "700", color: colors.textPrimary, marginBottom: 3 },
  factBody: { lineHeight: 18 },
  yearsInputRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgSection, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  yearsLabel: { fontWeight: "600", color: colors.textPrimary },
  yearsInput: {
    width: 64, backgroundColor: "#fff", borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    color: colors.textPrimary, fontSize: 20, fontWeight: "700",
    textAlign: "center", borderWidth: 1, borderColor: colors.borderSubtle,
  },
});
