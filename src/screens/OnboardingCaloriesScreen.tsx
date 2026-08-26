import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "../components/ThemedText";
import { Card } from "../components/Card";
import { colors, spacing, radii } from "../theme";
import useOnboardingStore from "../state/onboardingStore";
import { OnboardingStats } from "../types/onboarding";
import {
  buildRecommendedPlan,
  evaluatePlan,
  CURRENT_MACROS_VERSION,
  macrosFromCaloriesAndProtein,
  recommendedProteinPerKg,
  ADVISORY_COLORS,
  Advisory,
} from "../utils/recommendations";
import { RootStackParamList } from "../navigation/RootNavigator";

const FALLBACK_STATS: OnboardingStats = {
  gender: "male",
  heightCm: 175,
  weightKg: 75,
  age: 30,
  lifestyle: "moderate",
};

const CALORIE_STEP = 50;
const PROTEIN_STEP = 5;

function AdvisoryRow({ advisory }: { advisory: Advisory }) {
  const tint = ADVISORY_COLORS[advisory.level];
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={[styles.advisoryRow, { backgroundColor: tint + "12", borderColor: tint + "33" }]}
    >
      <Ionicons name={advisory.icon as any} size={16} color={tint} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <ThemedText variant="bodySmall" style={[styles.advisoryTitle, { color: tint }]}>
          {advisory.title}
        </ThemedText>
        <ThemedText variant="caption" muted style={styles.advisoryDetail}>
          {advisory.detail}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

function Stepper({
  value,
  unit,
  onChange,
  step,
  tint,
}: {
  value: number;
  unit: string;
  onChange: (next: number) => void;
  step: number;
  tint: string;
}) {
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={styles.stepperButton}
        onPress={() => onChange(value - step)}
        hitSlop={8}
      >
        <Ionicons name="remove" size={20} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.stepperValueWrap}>
        <ThemedText style={[styles.stepperValue, { color: tint }]}>
          {value.toLocaleString()}
        </ThemedText>
        <ThemedText variant="caption" muted>{unit}</ThemedText>
      </View>
      <Pressable
        style={styles.stepperButton}
        onPress={() => onChange(value + step)}
        hitSlop={8}
      >
        <Ionicons name="add" size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export default function OnboardingCaloriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const goal = useOnboardingStore((s) => s.goal);
  const storedStats = useOnboardingStore((s) => s.stats);
  const storedCalories = useOnboardingStore((s) => s.calories);
  const setCalories = useOnboardingStore((s) => s.setCalories);
  const setMacrosVersion = useOnboardingStore((s) => s.setMacrosCalculationVersion);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const stats = storedStats ?? FALLBACK_STATS;

  const plan = useMemo(() => buildRecommendedPlan(stats, goal), [stats, goal]);

  // Open on whatever was auto-set from the stats screen, falling back to the
  // freshly computed recommendation.
  const [targetCalories, setTargetCalories] = useState(
    storedCalories?.targetCalories ?? plan.targetCalories
  );
  const [proteinG, setProteinG] = useState(storedCalories?.proteinGrams ?? plan.proteinG);
  const [showTuning, setShowTuning] = useState(false);

  const evaluation = useMemo(
    () => evaluatePlan({ targetCalories, proteinG }, stats, goal, plan),
    [targetCalories, proteinG, stats, goal, plan]
  );

  const macros = macrosFromCaloriesAndProtein(targetCalories, proteinG, stats.weightKg);
  const dailyDelta = targetCalories - plan.tdee;

  const activePace = plan.paces.find((p) => p.targetCalories === targetCalories) ?? null;
  const isEdited =
    targetCalories !== plan.targetCalories || proteinG !== plan.proteinG;

  const proteinPerKg = stats.weightKg > 0 ? proteinG / stats.weightKg : 0;
  const recommendedPerKg = recommendedProteinPerKg(plan.goalType, plan.bmi, stats.age);

  const accent = activePace?.accentColor ?? (evaluation.isSensible ? ADVISORY_COLORS.info : ADVISORY_COLORS.warn);

  const selectPace = (paceCalories: number) => {
    setTargetCalories(paceCalories);
  };

  const resetToRecommended = () => {
    setTargetCalories(plan.targetCalories);
    setProteinG(plan.proteinG);
  };

  const handleContinue = () => {
    setCalories({
      maintenanceCalories: plan.tdee,
      targetCalories,
      proteinGrams: macros.protein,
      carbsGrams: macros.carbs,
      fatGrams: macros.fat,
      dailyDeficitOrSurplus: dailyDelta,
    });
    // These numbers came from this engine — keep the startup migration off them
    setMacrosVersion(CURRENT_MACROS_VERSION);
    nextStep();
    navigation.navigate("OnboardingWorkout");
  };

  const handleBack = () => {
    prevStep();
    navigation.goBack();
  };

  const handleSkip = () => {
    skipOnboarding();
    navigation.popToTop();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "42.9%" }]} />
          </View>
          <ThemedText variant="caption" muted>Step 3 of 7</ThemedText>
        </View>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <ThemedText variant="bodySmall" muted>Skip</ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <ThemedText variant="caption" muted style={styles.eyebrow}>STEP 3 OF 6</ThemedText>
          <ThemedText variant="h1" style={styles.title}>Your Plan</ThemedText>
          <ThemedText variant="body" muted style={styles.subtitle}>
            {"Set from your age, height, weight and activity. Change anything you like — we'll tell you what it costs you."}
          </ThemedText>
        </Animated.View>

        {/* Why these numbers */}
        <Animated.View entering={FadeInDown.delay(140).springify()}>
          <View style={styles.rationaleCard}>
            <View style={styles.rationaleHeader}>
              <Ionicons name="sparkles" size={15} color={colors.brandTeal} />
              <ThemedText variant="caption" style={styles.rationaleEyebrow}>
                WHY THESE NUMBERS
              </ThemedText>
            </View>
            {plan.rationale.map((line, i) => (
              <View key={i} style={styles.rationaleLine}>
                <View style={styles.rationaleDot} />
                <ThemedText variant="caption" muted style={styles.rationaleText}>
                  {line}
                </ThemedText>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Pace options */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.optionsContainer}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            {plan.goalType === "lose" ? "Speed of Loss" : plan.goalType === "gain" ? "Speed of Gain" : "Your Pace"}
          </ThemedText>
          {plan.paces.map((option, index) => {
            const isSelected = activePace?.id === option.id;
            const isRecommended = option.id === plan.recommendedPaceId;

            return (
              <Animated.View
                key={option.id}
                entering={FadeInDown.delay(200 + index * 60).springify()}
              >
                <Pressable
                  onPress={() => selectPace(option.targetCalories)}
                  style={[
                    styles.optionCard,
                    isSelected && { borderColor: option.accentColor, borderWidth: 2 },
                    !isSelected && styles.optionCardUnselected,
                  ]}
                >
                  <View style={styles.optionLeft}>
                    <View style={styles.optionLabelRow}>
                      <Ionicons
                        name={option.icon as any}
                        size={15}
                        color={isSelected ? option.accentColor : colors.textMuted}
                      />
                      <ThemedText
                        variant="h3"
                        style={[styles.optionLabel, isSelected && { color: option.accentColor }]}
                      >
                        {option.label}
                      </ThemedText>
                      {isRecommended && (
                        <View style={[styles.recommendedBadge, { backgroundColor: option.accentColor + "20" }]}>
                          <ThemedText variant="caption" style={{ color: option.accentColor, fontWeight: "700", fontSize: 10 }}>
                            Recommended for you
                          </ThemedText>
                        </View>
                      )}
                    </View>

                    <View style={styles.calRow}>
                      <ThemedText style={[styles.calNumber, isSelected && { color: option.accentColor }]}>
                        {option.targetCalories.toLocaleString()}
                      </ThemedText>
                      <ThemedText variant="bodySmall" muted style={styles.calLabel}> cal/day</ThemedText>
                    </View>

                    <ThemedText variant="caption" muted style={styles.deficitText}>
                      {option.dailyDelta === 0
                        ? "No deficit or surplus"
                        : `${Math.abs(option.dailyDelta)} cal/day ${option.dailyDelta < 0 ? "deficit" : "surplus"} · ${Math.abs(option.weeklyChangeKg).toFixed(2)} kg/week`}
                    </ThemedText>

                    <View style={[styles.impactRow, { backgroundColor: option.accentColor + "15" }]}>
                      <Ionicons name="information-circle" size={13} color={option.accentColor} />
                      <ThemedText
                        variant="caption"
                        style={{ marginLeft: 5, color: option.accentColor, fontWeight: "600", flex: 1 }}
                      >
                        {option.compositionNote}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={[styles.radioOuter, isSelected && { borderColor: option.accentColor }]}>
                    {isSelected && <View style={[styles.radioInner, { backgroundColor: option.accentColor }]} />}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}

          {activePace === null && (
            <View style={styles.customChip}>
              <Ionicons name="options-outline" size={14} color={colors.brandOrange} />
              <ThemedText variant="caption" style={styles.customChipText}>
                {"Custom pace — " + targetCalories.toLocaleString() + " cal/day"}
              </ThemedText>
            </View>
          )}
        </Animated.View>

        {/* Fine-tune */}
        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Pressable style={styles.tuneToggle} onPress={() => setShowTuning((v) => !v)}>
            <Ionicons name="options-outline" size={18} color={colors.textPrimary} />
            <ThemedText variant="body" style={styles.tuneToggleText}>
              Fine-tune my numbers
            </ThemedText>
            <Ionicons
              name={showTuning ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>

          {showTuning && (
            <Animated.View entering={FadeIn.duration(180)} style={styles.tunePanel}>
              <View style={styles.tuneBlock}>
                <View style={styles.tuneLabelRow}>
                  <ThemedText variant="bodySmall" style={styles.tuneLabel}>Daily calories</ThemedText>
                  <ThemedText variant="caption" muted>
                    {"Recommended " + plan.targetCalories.toLocaleString()}
                  </ThemedText>
                </View>
                <Stepper
                  value={targetCalories}
                  unit="cal/day"
                  step={CALORIE_STEP}
                  tint={accent}
                  onChange={(next) => setTargetCalories(Math.max(800, Math.min(6000, next)))}
                />
              </View>

              <View style={styles.tuneBlock}>
                <View style={styles.tuneLabelRow}>
                  <ThemedText variant="bodySmall" style={styles.tuneLabel}>Protein</ThemedText>
                  <ThemedText variant="caption" muted>
                    {"Recommended " + plan.proteinG + " g · " + recommendedPerKg + " g/kg"}
                  </ThemedText>
                </View>
                <Stepper
                  value={proteinG}
                  unit={proteinPerKg.toFixed(1) + " g/kg"}
                  step={PROTEIN_STEP}
                  tint={colors.protein}
                  onChange={(next) => setProteinG(Math.max(0, Math.min(400, next)))}
                />
              </View>

              {isEdited && (
                <Pressable style={styles.resetButton} onPress={resetToRecommended}>
                  <Ionicons name="refresh" size={15} color={colors.textPrimary} />
                  <ThemedText variant="bodySmall" style={styles.resetText}>
                    Back to recommended
                  </ThemedText>
                </Pressable>
              )}
            </Animated.View>
          )}
        </Animated.View>

        {/* Live hints, tips and warnings */}
        {evaluation.advisories.length > 0 && (
          <Animated.View entering={FadeInDown.delay(440).springify()} style={styles.advisoryList}>
            {evaluation.advisories.map((a) => (
              <AdvisoryRow key={a.id} advisory={a} />
            ))}
          </Animated.View>
        )}

        {/* Summary */}
        <Animated.View entering={FadeInDown.delay(480).springify()}>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <ThemedText variant="caption" muted>Maintenance</ThemedText>
                <ThemedText variant="h3" style={styles.summaryValue}>{plan.tdee.toLocaleString()}</ThemedText>
                <ThemedText variant="caption" muted>cal/day</ThemedText>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <ThemedText variant="caption" muted>Your Target</ThemedText>
                <ThemedText variant="h3" style={[styles.summaryValue, { color: accent }]}>
                  {targetCalories.toLocaleString()}
                </ThemedText>
                <ThemedText variant="caption" muted>cal/day</ThemedText>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <ThemedText variant="caption" muted>
                  {dailyDelta < 0 ? "Deficit" : dailyDelta > 0 ? "Surplus" : "Balanced"}
                </ThemedText>
                <ThemedText variant="h3" style={[styles.summaryValue, { color: accent }]}>
                  {Math.abs(dailyDelta).toLocaleString()}
                </ThemedText>
                <ThemedText variant="caption" muted>cal/day</ThemedText>
              </View>
            </View>

            <View style={styles.weeklyRow}>
              <Ionicons
                name={
                  evaluation.projectedWeeklyKg < 0
                    ? "trending-down"
                    : evaluation.projectedWeeklyKg > 0
                    ? "trending-up"
                    : "remove"
                }
                size={15}
                color={accent}
              />
              <ThemedText variant="bodySmall" style={{ marginLeft: spacing.xs, color: accent, fontWeight: "600" }}>
                {"~" + Math.abs(evaluation.projectedWeeklyKg).toFixed(2) + " kg/week"}
              </ThemedText>
              {goal && plan.goalType !== "other" ? (
                <ThemedText variant="caption" muted style={{ marginLeft: spacing.sm }}>
                  {"→ " + evaluation.projectedEndWeightKg + " kg in " + goal.weeksToGoal + " weeks"}
                </ThemedText>
              ) : null}
            </View>
          </Card>
        </Animated.View>

        {/* Protein — the second lever after the calorie balance */}
        <Animated.View entering={FadeInDown.delay(520).springify()}>
          <Card style={styles.proteinCard}>
            <View style={styles.proteinHeader}>
              <View style={styles.proteinTitleRow}>
                <Ionicons name="nutrition" size={16} color={colors.protein} />
                <ThemedText variant="bodySmall" style={styles.proteinTitle}>
                  Protein
                </ThemedText>
                <View style={styles.priorityTag}>
                  <ThemedText style={styles.priorityTagText}>PRIORITY #2</ThemedText>
                </View>
              </View>
              <View style={styles.proteinValueRow}>
                <ThemedText style={styles.proteinValue}>{macros.protein}</ThemedText>
                <ThemedText variant="caption" muted style={{ paddingBottom: 3 }}> g/day</ThemedText>
              </View>
            </View>
            <ThemedText variant="caption" muted style={styles.proteinCopy}>
              {plan.goalType === "gain"
                ? "Your calorie surplus decides how much weight you gain. Protein decides how much of it is muscle instead of fat — hit this every day."
                : "Your calorie deficit decides how much weight you lose. Protein decides whether it comes off your fat or your muscle — hit this every day."}
            </ThemedText>
            <View style={styles.macroSplitRow}>
              <View style={styles.macroSplitItem}>
                <ThemedText variant="caption" muted>Carbs</ThemedText>
                <ThemedText variant="bodySmall" style={[styles.macroSplitValue, { color: colors.carbs }]}>
                  {macros.carbs} g
                </ThemedText>
              </View>
              <View style={styles.macroSplitItem}>
                <ThemedText variant="caption" muted>Fat</ThemedText>
                <ThemedText variant="bodySmall" style={[styles.macroSplitValue, { color: colors.fat }]}>
                  {macros.fat} g
                </ThemedText>
              </View>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={styles.continueBtn} onPress={handleContinue}>
          <LinearGradient
            colors={["#5b67cd", "#1e206a"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
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
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgSection,
    alignItems: "center", justifyContent: "center",
  },
  progressContainer: { flex: 1, alignItems: "center", marginHorizontal: spacing.lg },
  progressTrack: {
    width: "100%", height: 3, backgroundColor: colors.bgSection,
    borderRadius: 2, marginBottom: spacing.xs, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.brandPrimary, borderRadius: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },
  eyebrow: { marginTop: spacing.lg, marginBottom: spacing.xs, letterSpacing: 1.5, fontSize: 11 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.lg, lineHeight: 20 },
  sectionTitle: { marginBottom: spacing.md },

  rationaleCard: {
    backgroundColor: "rgba(0,206,209,0.06)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.3)",
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  rationaleHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  rationaleEyebrow: {
    color: colors.textPrimary, fontWeight: "800", letterSpacing: 1.2, fontSize: 10,
  },
  rationaleLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  rationaleDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: colors.brandTeal, marginTop: 7,
  },
  rationaleText: { flex: 1, lineHeight: 17 },

  optionsContainer: { gap: spacing.md, marginBottom: spacing.xl },
  optionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  optionCardUnselected: { borderColor: colors.borderSubtle },
  optionLeft: { flex: 1 },
  optionLabelRow: {
    flexDirection: "row", alignItems: "center",
    gap: 6, marginBottom: 6, flexWrap: "wrap",
  },
  optionLabel: { fontWeight: "700", fontSize: 17 },
  recommendedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  calRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 2 },
  calNumber: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.5 },
  calLabel: { fontSize: 14 },
  deficitText: { marginBottom: spacing.sm },
  impactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.md,
    alignSelf: "flex-start",
  },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.borderSubtle,
    alignItems: "center", justifyContent: "center",
    marginLeft: spacing.md,
  },
  radioInner: { width: 11, height: 11, borderRadius: 6 },
  customChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: "rgba(242,90,35,0.08)", borderRadius: radii.pill,
  },
  customChipText: { color: colors.brandOrange, fontWeight: "700" },

  tuneToggle: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.bgSection,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  tuneToggleText: { flex: 1, fontWeight: "700" },
  tunePanel: {
    marginTop: spacing.sm, padding: spacing.lg,
    backgroundColor: colors.bgCard, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderSubtle,
    gap: spacing.lg,
  },
  tuneBlock: { gap: spacing.sm },
  tuneLabelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  tuneLabel: { fontWeight: "700" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepperButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgSection,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  stepperValueWrap: { flex: 1, alignItems: "center" },
  stepperValue: { fontSize: 26, lineHeight: 32, fontWeight: "800" },
  resetButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: spacing.sm,
    backgroundColor: colors.bgSection, borderRadius: radii.pill,
  },
  resetText: { fontWeight: "700" },

  advisoryList: { gap: spacing.sm, marginTop: spacing.lg },
  advisoryRow: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    padding: spacing.md, borderRadius: radii.md, borderWidth: 1,
  },
  advisoryTitle: { fontWeight: "700", marginBottom: 2 },
  advisoryDetail: { lineHeight: 17 },

  summaryCard: { padding: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 20, fontWeight: "700", marginVertical: 2 },
  summaryDivider: { width: 1, height: 48, backgroundColor: colors.borderSubtle },
  weeklyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },

  proteinCard: {
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.3)",
    backgroundColor: "rgba(0,206,209,0.06)",
    gap: spacing.sm,
  },
  proteinHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  proteinTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  proteinTitle: { fontWeight: "800" },
  priorityTag: {
    backgroundColor: colors.protein,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priorityTagText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6, color: "#04302f" },
  proteinValueRow: { flexDirection: "row", alignItems: "flex-end" },
  proteinValue: { fontSize: 26, lineHeight: 32, fontWeight: "800", color: colors.textPrimary },
  proteinCopy: { lineHeight: 16 },
  macroSplitRow: {
    flexDirection: "row", gap: spacing.xl,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  macroSplitItem: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  macroSplitValue: { fontWeight: "800" },

  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  continueText: { color: "#fff", fontWeight: "700" },
});
