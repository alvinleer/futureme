import React, { useState, useMemo } from "react";
import Svg, { Polyline } from "react-native-svg";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CartesianChart, Line } from "victory-native";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import { removeBackground } from "../api/remove-background";
import { ThemedText } from "../components/ThemedText";
import { Card } from "../components/Card";
import TrackerCalendar from "../components/TrackerCalendar";
import ExerciseProgressTab from "../components/ExerciseProgressTab";
import { colors, spacing, radii } from "../theme";
import { ProgressPhoto, PhotoAngle } from "../types/diet";
import { RootStackParamList } from "../navigation/RootNavigator";
import { resolvePhotoUri } from "../utils/photoStorage";
import { PROTEIN_HIT_RATIO, proteinAdherenceFromAverage, proteinImpactMessage } from "../utils/protein";

const { width } = Dimensions.get("window");
const imageSize = (width - spacing.lg * 3) / 2;

// ── Weekly Review Sub-Component ─────────────────────────────────────────────
type DayStatus = "on-track" | "backtrack" | "none";

interface DayData {
  letter: string;
  key: string;
  calories: number | null;
  protein: number | null;
  hasData: boolean;
  status: DayStatus;
  diff: number | null;
  isToday: boolean;
}

function StatBox({
  label, value, sub, icon, iconColor, valueColor, priority,
}: {
  label: string; value: string; sub?: string; icon: string; iconColor?: string; valueColor?: string; priority?: string;
}) {
  return (
    <View style={[mrStyles.statBox, priority ? mrStyles.statBoxPriority : null]}>
      <View style={mrStyles.statTopRow}>
        <Ionicons name={icon as any} size={15} color={iconColor ?? "#6b7280"} />
        {priority ? (
          <View style={mrStyles.statPriorityTag}>
            <Text style={mrStyles.statPriorityTagText}>{priority}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text style={[mrStyles.statValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
        {sub ? <Text style={mrStyles.statSub}>{sub}</Text> : null}
      </View>
      <Text style={mrStyles.statLabel}>{label}</Text>
    </View>
  );
}

function WeeklyReviewCard() {
  const meals = useDietStore((s) => s.meals);
  const workouts = useDietStore((s) => s.workouts);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const maintenanceCals = useDietStore((s) => s.maintenanceCalories);
  const currentWeight = useDietStore((s) => s.weightGoal.currentWeight);
  const targetWeight = useDietStore((s) => s.weightGoal.targetWeight);

  const goalDirection: "lose" | "gain" | "maintain" =
    targetWeight > 0 && currentWeight > 0
      ? targetWeight < currentWeight ? "lose" : targetWeight > currentWeight ? "gain" : "maintain"
      : "lose";

  const maintenance = maintenanceCals > 0 ? maintenanceCals : nutritionGoal.dailyCalories + 250;

  const { dayData, stats } = useMemo(() => {
    const now = new Date();
    const days: DayData[] = [];
    const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const letter = DAY_LETTERS[d.getDay()];
      const isToday = i === 0;

      const dayMeals = meals.filter((m) => {
        const md = new Date(m.timestamp);
        return `${md.getFullYear()}-${md.getMonth()}-${md.getDate()}` === key;
      });

      if (dayMeals.length === 0) {
        days.push({ letter, key, calories: null, protein: null, hasData: false, status: "none", diff: null, isToday });
        continue;
      }

      const totalCal = dayMeals.reduce((s, m) => s + m.calories, 0);
      const totalProt = dayMeals.reduce((s, m) => s + m.protein, 0);
      const diff = totalCal - maintenance;

      let status: DayStatus;
      if (goalDirection === "lose") {
        status = diff <= 0 ? "on-track" : "backtrack";
      } else if (goalDirection === "gain") {
        status = diff >= 0 ? "on-track" : "backtrack";
      } else {
        status = Math.abs(diff) <= 150 ? "on-track" : "backtrack";
      }
      days.push({ letter, key, calories: totalCal, protein: totalProt, hasData: true, status, diff, isToday });
    }

    const logged = days.filter((d) => d.hasData);
    const loggedCount = logged.length;
    const surplusCount = logged.filter((d) => (d.diff ?? 0) >= 0).length;
    const onTrackCount = logged.filter((d) => d.status === "on-track").length;
    const backtrackedCount = logged.filter((d) => d.status === "backtrack").length;
    const proteinHitCount = logged.filter((d) => (d.protein ?? 0) >= nutritionGoal.dailyProtein * PROTEIN_HIT_RATIO).length;
    const workoutCount = workouts.filter((w) => w.timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000).length;
    const onTrackDays = logged.filter((d) => d.status === "on-track");
    const avgDeficit = onTrackDays.length > 0 ? Math.round(onTrackDays.reduce((sum, d) => sum + Math.abs(d.diff ?? 0), 0) / onTrackDays.length) : 0;

    const avgProtein = loggedCount > 0 ? Math.round(logged.reduce((sum, d) => sum + (d.protein ?? 0), 0) / loggedCount) : 0;

    return { dayData: days, stats: { surplusCount, onTrackCount, backtrackedCount, proteinHitCount, workoutCount, avgDeficit, loggedCount, avgProtein } };
  }, [meals, workouts, nutritionGoal, maintenance, goalDirection]);

  const weekLabel = (() => {
    const end = new Date();
    const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    return `${start.toLocaleString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
  })();

  const proteinReview = proteinImpactMessage(
    proteinAdherenceFromAverage(stats.avgProtein, stats.loggedCount, nutritionGoal.dailyProtein),
    goalDirection !== "gain"
  );

  const goalLabel = goalDirection === "lose" ? "Weight Loss" : goalDirection === "gain" ? "Weight Gain" : "Maintenance";
  const onTrackLabel = goalDirection === "lose" ? "In Deficit" : goalDirection === "gain" ? "In Surplus" : "On Target";

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(50)} style={mrStyles.card}>
      <LinearGradient
        colors={["#1e206a", "#5b67cd"]}
        style={mrStyles.headerGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={mrStyles.headerRow}>
          <View style={mrStyles.headerIconBox}>
            <Ionicons name="stats-chart" size={15} color="#5EEAD4" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={mrStyles.headerEyebrow}>7-DAY OVERVIEW</Text>
            <Text style={mrStyles.headerTitle}>{weekLabel}</Text>
          </View>
          <View style={mrStyles.goalBadge}>
            <Text style={mrStyles.goalBadgeText}>{goalLabel}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={mrStyles.body}>
        {/* 7-Day Strip */}
        <View style={mrStyles.dayStrip}>
          {dayData.map((day) => {
            const dotBg =
              day.status === "on-track" ? "#10b981" :
              day.status === "backtrack" ? "#ef4444" : "#e5e7eb";
            return (
              <View key={day.key} style={mrStyles.dayCol}>
                <Text style={[mrStyles.dayLetter, day.isToday && { color: colors.textPrimary, fontWeight: "700" }]}>
                  {day.letter}
                </Text>
                <View style={[mrStyles.dayDot, { backgroundColor: dotBg }]}>
                  {day.status === "on-track" && <Ionicons name="checkmark" size={9} color="#fff" />}
                  {day.status === "backtrack" && <Ionicons name="close" size={9} color="#fff" />}
                </View>
                <Text style={mrStyles.dayCals} numberOfLines={1}>
                  {day.hasData ? (day.calories! >= 1000 ? `${(day.calories! / 1000).toFixed(1)}k` : `${day.calories}`) : "—"}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={mrStyles.legend}>
          <View style={mrStyles.legendItem}>
            <View style={[mrStyles.legendDot, { backgroundColor: "#10b981" }]} />
            <Text style={mrStyles.legendText}>{onTrackLabel}</Text>
          </View>
          <View style={mrStyles.legendItem}>
            <View style={[mrStyles.legendDot, { backgroundColor: "#ef4444" }]} />
            <Text style={mrStyles.legendText}>Backtracked</Text>
          </View>
          <View style={mrStyles.legendItem}>
            <View style={[mrStyles.legendDot, { backgroundColor: "#e5e7eb" }]} />
            <Text style={mrStyles.legendText}>No data</Text>
          </View>
        </View>

        <View style={mrStyles.sectionDivider} />

        {/* Stats Grid */}
        <View style={mrStyles.statsRow}>
          <StatBox label={onTrackLabel} value={`${stats.onTrackCount}`} sub=" days" icon={goalDirection === "gain" ? "trending-up-outline" : "trending-down-outline"} iconColor="#10b981" valueColor="#10b981" priority="#1" />
          <StatBox label="Hit Protein" value={`${stats.proteinHitCount}`} sub={`/${stats.loggedCount || 7}`} icon="nutrition-outline" iconColor="#10b981" valueColor="#10b981" priority="#2" />
          <StatBox label="Logged" value={`${stats.loggedCount}/7`} sub=" days" icon="calendar-outline" iconColor="#6b7280" />
        </View>
        <View style={[mrStyles.statsRow, { marginTop: spacing.sm }]}>
          <StatBox label={goalDirection === "gain" ? "Avg Surplus" : goalDirection === "lose" ? "Avg Deficit" : "Avg Variance"} value={`${stats.avgDeficit}`} sub=" kcal" icon={goalDirection === "gain" ? "trending-up-outline" : "trending-down-outline"} iconColor="#10b981" valueColor="#10b981" />
          <StatBox label="Avg Protein" value={`${stats.avgProtein}`} sub={`/${nutritionGoal.dailyProtein}g`} icon="barbell-outline" iconColor="#10b981" valueColor="#10b981" />
          <StatBox label="Workouts" value={`${stats.workoutCount}`} sub=" sessions" icon="fitness-outline" iconColor="#10b981" valueColor="#10b981" />
        </View>
        <View style={[mrStyles.statsRow, { marginTop: spacing.sm }]}>
          <StatBox label="Backtracked" value={`${stats.backtrackedCount}`} sub=" days" icon="alert-circle-outline" iconColor={stats.backtrackedCount > 0 ? "#ef4444" : "#6b7280"} valueColor={stats.backtrackedCount > 0 ? "#ef4444" : colors.textPrimary} />
          <View style={{ flex: 2 }} />
        </View>
        <Text style={mrStyles.priorityNote}>{proteinReview}</Text>
      </View>
    </Animated.View>
  );
}

const mrStyles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
    backgroundColor: colors.bgCard,
  },
  headerGrad: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(94,234,212,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.3,
  },
  goalBadge: {
    marginLeft: "auto" as any,
    backgroundColor: "rgba(94,234,212,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(94,234,212,0.25)",
  },
  goalBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#5EEAD4",
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  // 7-day strip
  dayStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  dayCol: {
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  dayLetter: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCals: {
    fontSize: 9,
    fontWeight: "500",
    color: colors.textMuted,
  },
  // Legend
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "500",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginBottom: spacing.md,
  },
  // Stats grid
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    borderRadius: radii.md,
    padding: spacing.sm + 2,
    alignItems: "flex-start",
  },
  priorityNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    fontWeight: "500",
    marginTop: spacing.sm + 2,
  },
  statBoxPriority: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginBottom: 3,
  },
  statPriorityTag: {
    backgroundColor: "#10b981",
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statPriorityTagText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 24,
  },
  statSub: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
    marginBottom: 1,
    alignSelf: "flex-end",
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.2,
  },
});

// ── Body Composition Card ─────────────────────────────────────────────────────

function BodyCompositionCard() {
  const weightHistory = useDietStore((s) => s.weightGoal.weightHistory);
  const currentWeight = useDietStore((s) => s.weightGoal.currentWeight);
  const addWeightEntry = useDietStore((s) => s.addWeightEntry);
  const goal = useOnboardingStore((s) => s.goal);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const isMetric = unitSystem === "metric";
  const weightUnit = isMetric ? "kg" : "lbs";

  const [view, setView] = useState<"goal" | "alltime">("goal");
  const [showModal, setShowModal] = useState(false);
  const [bfInput, setBfInput] = useState("");
  const [weightInput, setWeightInput] = useState("");

  const toDisplayW = (lbs: number) =>
    isMetric ? Math.round((lbs / 2.20462) * 10) / 10 : Math.round(lbs * 10) / 10;
  const toStoredW = (val: number) => (isMetric ? val * 2.20462 : val);

  const goalStartTs = useMemo(() => {
    if (!goal) return 0;
    // Sealed programs record their start day; older goals derive it from the length
    return (
      goal.programStartDate ??
      goal.goalEndDate - goal.weeksToGoal * 7 * 24 * 60 * 60 * 1000
    );
  }, [goal]);

  const filteredHistory = useMemo(() => {
    const sorted = [...weightHistory].sort((a, b) => a.date - b.date);
    if (view === "alltime" || !goal) return sorted;
    return sorted.filter((e) => e.date >= goalStartTs);
  }, [weightHistory, view, goal, goalStartTs]);

  const bfEntries = useMemo(
    () => filteredHistory.filter((e) => e.bodyFatPercent != null),
    [filteredHistory]
  );
  const hasBfData = bfEntries.length > 0;

  // Weight-only chart data (all filtered entries)
  const weightData = useMemo(
    () => filteredHistory.map((e, i) => ({ x: i, y: toDisplayW(e.weight) })),
    [filteredHistory, isMetric]
  );

  // Combo chart: weight + lean mass (entries with BF%)
  const comboData = useMemo(
    () =>
      bfEntries.map((e, i) => ({
        x: i,
        weight: toDisplayW(e.weight),
        leanMass: parseFloat(
          (toDisplayW(e.weight) * (1 - (e.bodyFatPercent ?? 0) / 100)).toFixed(1)
        ),
      })),
    [bfEntries, isMetric]
  );

  // BF% chart data
  const bfChartData = useMemo(
    () => bfEntries.map((e, i) => ({ x: i, y: e.bodyFatPercent ?? 0 })),
    [bfEntries]
  );

  // Current stats
  const latestEntry = filteredHistory[filteredHistory.length - 1];
  const firstEntry = filteredHistory[0];
  const latestBfEntry = bfEntries[bfEntries.length - 1];
  const firstBfEntry = bfEntries[0];

  const currentW = latestEntry ? toDisplayW(latestEntry.weight) : toDisplayW(currentWeight);
  const currentBf = latestBfEntry?.bodyFatPercent ?? null;
  const currentLeanMass =
    currentBf != null && latestBfEntry
      ? parseFloat((toDisplayW(latestBfEntry.weight) * (1 - currentBf / 100)).toFixed(1))
      : null;

  const weightDelta =
    latestEntry && firstEntry && latestEntry !== firstEntry
      ? parseFloat((toDisplayW(latestEntry.weight) - toDisplayW(firstEntry.weight)).toFixed(1))
      : null;

  const bfDelta =
    latestBfEntry && firstBfEntry && latestBfEntry !== firstBfEntry
      ? parseFloat(
          ((latestBfEntry.bodyFatPercent ?? 0) - (firstBfEntry.bodyFatPercent ?? 0)).toFixed(1)
        )
      : null;

  const leanMassDelta =
    latestBfEntry && firstBfEntry && latestBfEntry !== firstBfEntry
      ? parseFloat(
          (
            toDisplayW(latestBfEntry.weight) *
              (1 - (latestBfEntry.bodyFatPercent ?? 0) / 100) -
            toDisplayW(firstBfEntry.weight) *
              (1 - (firstBfEntry.bodyFatPercent ?? 0) / 100)
          ).toFixed(1)
        )
      : null;

  const handleLog = () => {
    const bf = parseFloat(bfInput);
    if (isNaN(bf) || bf < 1 || bf > 70) return;
    const wInput = parseFloat(weightInput);
    const weight = !isNaN(wInput) && wInput > 0 ? toStoredW(wInput) : currentWeight;
    addWeightEntry({ weight, date: Date.now(), bodyFatPercent: bf });
    setBfInput("");
    setWeightInput("");
    setShowModal(false);
  };

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(150)} style={bcStyles.card}>
      {/* Header */}
      <LinearGradient
        colors={["#0f2744", "#091a2e"]}
        style={bcStyles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={bcStyles.headerRow}>
          <View style={bcStyles.headerIcon}>
            <Ionicons name="body-outline" size={15} color="#60a5fa" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={bcStyles.eyebrow}>BODY COMPOSITION</Text>
            <Text style={bcStyles.headerTitle}>Trend Analysis</Text>
          </View>
          <Pressable
            style={bcStyles.logBtn}
            onPress={() => {
              setWeightInput(currentWeight > 0 ? String(toDisplayW(currentWeight)) : "");
              setShowModal(true);
            }}
          >
            <Ionicons name="add" size={15} color="#60a5fa" />
            <Text style={bcStyles.logBtnText}>Log</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={bcStyles.body}>
        {/* Goal Phase / All-Time toggle */}
        {goal && (
          <View style={bcStyles.toggle}>
            <Pressable
              style={[bcStyles.togglePill, view === "goal" && bcStyles.toggleActive]}
              onPress={() => setView("goal")}
            >
              <Text style={[bcStyles.toggleText, view === "goal" && bcStyles.toggleTextActive]}>
                Goal Phase
              </Text>
            </Pressable>
            <Pressable
              style={[bcStyles.togglePill, view === "alltime" && bcStyles.toggleActive]}
              onPress={() => setView("alltime")}
            >
              <Text style={[bcStyles.toggleText, view === "alltime" && bcStyles.toggleTextActive]}>
                All-Time
              </Text>
            </Pressable>
          </View>
        )}

        {/* Stat row */}
        <View style={bcStyles.statsRow}>
          <View style={bcStyles.statBox}>
            <Text style={bcStyles.statVal}>
              {filteredHistory.length > 0 ? currentW.toFixed(1) : "--"}
            </Text>
            <Text style={bcStyles.statUnit}>{weightUnit}</Text>
            <Text style={bcStyles.statLbl}>Weight</Text>
            {weightDelta !== null && (
              <Text style={[bcStyles.statDelta, { color: weightDelta < 0 ? "#10b981" : "#ef4444" }]}>
                {weightDelta > 0 ? "+" : ""}{weightDelta.toFixed(1)}
              </Text>
            )}
          </View>
          <View style={[bcStyles.statBox, bcStyles.statBoxMid]}>
            <Text style={[bcStyles.statVal, { color: "#60a5fa" }]}>
              {currentLeanMass != null ? currentLeanMass.toFixed(1) : "--"}
            </Text>
            <Text style={bcStyles.statUnit}>{currentLeanMass != null ? weightUnit : ""}</Text>
            <Text style={bcStyles.statLbl}>Lean Mass</Text>
            {leanMassDelta !== null && (
              <Text style={[bcStyles.statDelta, { color: leanMassDelta > 0 ? "#10b981" : "#ef4444" }]}>
                {leanMassDelta > 0 ? "+" : ""}{leanMassDelta.toFixed(1)}
              </Text>
            )}
          </View>
          <View style={bcStyles.statBox}>
            <Text style={[bcStyles.statVal, { color: "#f59e0b" }]}>
              {currentBf != null ? currentBf.toFixed(1) : "--"}
            </Text>
            <Text style={bcStyles.statUnit}>{currentBf != null ? "%" : ""}</Text>
            <Text style={bcStyles.statLbl}>Body Fat</Text>
            {bfDelta !== null && (
              <Text style={[bcStyles.statDelta, { color: bfDelta < 0 ? "#10b981" : "#ef4444" }]}>
                {bfDelta > 0 ? "+" : ""}{bfDelta.toFixed(1)}%
              </Text>
            )}
          </View>
        </View>

        {/* Charts */}
        {weightData.length > 1 ? (
          <>
            {/* Weight + Lean Mass chart */}
            <View style={bcStyles.chartHeader}>
              <View style={[bcStyles.legendDot, { backgroundColor: "rgba(255,255,255,0.8)" }]} />
              <Text style={bcStyles.chartLbl}>Weight</Text>
              {hasBfData && comboData.length > 1 && (
                <>
                  <View style={[bcStyles.legendDot, { backgroundColor: "#60a5fa", marginLeft: 12 }]} />
                  <Text style={bcStyles.chartLbl}>Lean Mass</Text>
                </>
              )}
            </View>
            <View style={{ height: 140, marginBottom: spacing.md }}>
              {hasBfData && comboData.length > 1 ? (
                <CartesianChart data={comboData} xKey="x" yKeys={["weight", "leanMass"]}>
                  {({ points }) => (
                    <>
                      <Line points={points.weight} color="rgba(255,255,255,0.65)" strokeWidth={2} />
                      <Line points={points.leanMass} color="#60a5fa" strokeWidth={2.5} />
                    </>
                  )}
                </CartesianChart>
              ) : (
                <CartesianChart data={weightData} xKey="x" yKeys={["y"]}>
                  {({ points }) => (
                    <Line points={points.y} color="rgba(255,255,255,0.85)" strokeWidth={2.5} />
                  )}
                </CartesianChart>
              )}
            </View>

            {/* Body Fat % chart */}
            {bfChartData.length > 1 && (
              <>
                <View style={bcStyles.chartHeader}>
                  <View style={[bcStyles.legendDot, { backgroundColor: "#f59e0b" }]} />
                  <Text style={bcStyles.chartLbl}>Body Fat %</Text>
                </View>
                <View style={{ height: 90 }}>
                  <CartesianChart data={bfChartData} xKey="x" yKeys={["y"]}>
                    {({ points }) => (
                      <Line points={points.y} color="#f59e0b" strokeWidth={2.5} />
                    )}
                  </CartesianChart>
                </View>
              </>
            )}

            {!hasBfData && (
              <View style={bcStyles.bfHint}>
                <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.35)" />
                <Text style={bcStyles.bfHintText}>
                  Tap Log to add body fat % and unlock lean mass tracking
                </Text>
              </View>
            )}
          </>
        ) : filteredHistory.length === 1 ? (
          <View style={bcStyles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.25)" />
            <Text style={bcStyles.emptyTitle}>First entry logged</Text>
            <Text style={bcStyles.emptyText}>
              Log a second entry to start seeing your trend
            </Text>
          </View>
        ) : (
          <View style={bcStyles.emptyState}>
            <Ionicons name="analytics-outline" size={40} color="rgba(255,255,255,0.15)" />
            <Text style={bcStyles.emptyTitle}>No data yet</Text>
            <Text style={bcStyles.emptyText}>
              Log weight entries to see your body composition trends
            </Text>
          </View>
        )}
      </View>

      {/* Log Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={bcStyles.modalOverlay}>
              <View style={bcStyles.modalCard}>
                <Text style={bcStyles.modalTitle}>Log Body Composition</Text>

                <Text style={bcStyles.modalLbl}>Weight ({weightUnit})</Text>
                <TextInput
                  style={bcStyles.modalInput}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  placeholder={currentWeight > 0 ? String(toDisplayW(currentWeight)) : "e.g. 180"}
                  placeholderTextColor="rgba(255,255,255,0.25)"
                />

                <Text style={bcStyles.modalLbl}>Body Fat %</Text>
                <TextInput
                  style={bcStyles.modalInput}
                  value={bfInput}
                  onChangeText={setBfInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 18.5"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  autoFocus
                />

                <Text style={bcStyles.modalHint}>
                  Use a smart scale, DEXA scan, or calipers to measure body fat
                </Text>

                <View style={bcStyles.modalBtns}>
                  <Pressable
                    style={bcStyles.modalCancel}
                    onPress={() => {
                      setShowModal(false);
                      setBfInput("");
                      setWeightInput("");
                    }}
                  >
                    <Text style={bcStyles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={bcStyles.modalSave} onPress={handleLog}>
                    <Text style={bcStyles.modalSaveText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </Animated.View>
  );
}

const bcStyles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: "#0e1a2e",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  header: { padding: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(96,165,250,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "#60a5fa" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginTop: 1 },
  logBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(96,165,250,0.15)",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: "rgba(96,165,250,0.3)",
  },
  logBtnText: { fontSize: 13, fontWeight: "700", color: "#60a5fa" },
  body: { padding: spacing.lg, paddingTop: spacing.md },
  toggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.pill,
    padding: 3,
    marginBottom: spacing.lg,
  },
  togglePill: { flex: 1, paddingVertical: 7, borderRadius: radii.pill, alignItems: "center" },
  toggleActive: { backgroundColor: "rgba(96,165,250,0.18)" },
  toggleText: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.35)" },
  toggleTextActive: { color: "#60a5fa" },
  statsRow: { flexDirection: "row", marginBottom: spacing.lg },
  statBox: { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  statBoxMid: {
    borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  statVal: { fontSize: 22, fontWeight: "700", color: "#fff" },
  statUnit: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  statLbl: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3, fontWeight: "500" },
  statDelta: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  chartHeader: {
    flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.xs,
  },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  chartLbl: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  bfHint: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm,
  },
  bfHintText: { fontSize: 12, color: "rgba(255,255,255,0.3)", flex: 1 },
  emptyState: { alignItems: "center", paddingVertical: spacing.xl },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.35)", marginTop: spacing.sm },
  emptyText: { fontSize: 13, color: "rgba(255,255,255,0.22)", textAlign: "center", marginTop: 4 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center", alignItems: "center", padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: "#1a2438", borderRadius: radii.xl, padding: spacing.lg,
    width: "100%", maxWidth: 380,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: spacing.lg },
  modalLbl: {
    fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.5, marginBottom: spacing.xs, textTransform: "uppercase",
  },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 16, color: "#fff",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)",
    marginBottom: spacing.md,
  },
  modalHint: {
    fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center",
    marginTop: 2, marginBottom: spacing.md,
  },
  modalBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  modalCancel: {
    flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center",
  },
  modalCancelText: { fontWeight: "600", color: "rgba(255,255,255,0.45)" },
  modalSave: {
    flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radii.pill,
    backgroundColor: "#60a5fa", alignItems: "center",
  },
  modalSaveText: { fontWeight: "700", color: "#fff" },
});

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const meals = useDietStore((s) => s.meals);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const weightHistory = useDietStore((s) => s.weightGoal.weightHistory);
  const currentWeight = useDietStore((s) => s.weightGoal.currentWeight);
  const targetWeight = useDietStore((s) => s.weightGoal.targetWeight);
  const startDate = useDietStore((s) => s.weightGoal.startDate);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const isMetric = unitSystem === "metric";
  const weightUnit = isMetric ? "kg" : "lbs";
  const toDisplayW = (lbs: number) => isMetric ? parseFloat((lbs / 2.20462).toFixed(1)) : lbs;
  const progressPhotos = useDietStore((s) => s.progressPhotos);
  const addProgressPhoto = useDietStore((s) => s.addProgressPhoto);
  const deleteProgressPhoto = useDietStore((s) => s.deleteProgressPhoto);
  const bodyMeasurements = useDietStore((s) => s.bodyMeasurements);
  const getTrackedBodyParts = useDietStore((s) => s.getTrackedBodyParts);
  const getMeasurementHistoryForPart = useDietStore((s) => s.getMeasurementHistoryForPart);
  const maintenanceCals = useDietStore((s) => s.maintenanceCalories);
  const maintenance = maintenanceCals > 0 ? maintenanceCals : nutritionGoal.dailyCalories + 250;
  const goalDirection: "lose" | "gain" | "maintain" =
    targetWeight > 0 && currentWeight > 0
      ? targetWeight < currentWeight ? "lose" : targetWeight > currentWeight ? "gain" : "maintain"
      : "lose";

  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<PhotoAngle>("front");
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isGalleryMinimized, setIsGalleryMinimized] = useState(false);
  const addBodyMeasurement = useDietStore((s) => s.addBodyMeasurement);
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);
  const [newMeasurePart, setNewMeasurePart] = useState("");
  const [newMeasureValue, setNewMeasureValue] = useState("");
  const [newMeasureUnit, setNewMeasureUnit] = useState<"cm" | "in">(isMetric ? "cm" : "in");
  const [activeTab, setActiveTab] = useState<"nutrition" | "exercise">("nutrition");

  // Calculate weekly stats
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const thisWeekMeals = meals.filter((m) => m.timestamp >= oneWeekAgo);
  const lastWeekMeals = meals.filter((m) => m.timestamp >= twoWeeksAgo && m.timestamp < oneWeekAgo);

  const daysLoggedThisWeek = new Set(
    thisWeekMeals.map((m) => new Date(m.timestamp).toDateString())
  ).size;

  const daysLoggedLastWeek = new Set(
    lastWeekMeals.map((m) => new Date(m.timestamp).toDateString())
  ).size;

  const hasLastWeekData = daysLoggedLastWeek >= 7;

  const thisWeekTotalCalories = thisWeekMeals.reduce((sum, m) => sum + m.calories, 0);
  const lastWeekTotalCalories = lastWeekMeals.reduce((sum, m) => sum + m.calories, 0);

  // Net balance = calories consumed minus TDEE for each logged day
  const thisWeekBalance = daysLoggedThisWeek > 0
    ? Math.round(thisWeekTotalCalories - maintenance * daysLoggedThisWeek)
    : 0;
  const lastWeekBalance = daysLoggedLastWeek > 0
    ? Math.round(lastWeekTotalCalories - maintenance * daysLoggedLastWeek)
    : 0;

  const thisWeekAvgCalories = daysLoggedThisWeek > 0
    ? Math.round(thisWeekTotalCalories / daysLoggedThisWeek)
    : 0;

  // Weight progress
  const weightChange = weightHistory.length > 0 && currentWeight > 0
    ? weightHistory[0].weight - currentWeight
    : 0;

  const weightRemaining = currentWeight > 0 && targetWeight > 0
    ? Math.abs(currentWeight - targetWeight)
    : 0;

  // Get before and after photos for each angle
  const getBeforeAfterPhotos = (angle: PhotoAngle) => {
    const anglePhotos = progressPhotos
      .filter((p) => p.angle === angle)
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      before: anglePhotos[0] || null,
      after: anglePhotos[anglePhotos.length - 1] || null,
    };
  };

  const processAndAddPhoto = async (uri: string, angle: PhotoAngle, photoTimestamp: number) => {
    setIsProcessingPhoto(true);
    try {
      // Only remove background for front photos
      if (angle === "front") {
        const processedUri = await removeBackground(uri);
        addProgressPhoto({ uri: processedUri, angle, timestamp: photoTimestamp });
      } else {
        addProgressPhoto({ uri, angle, timestamp: photoTimestamp });
      }
    } catch (error) {
      console.error("[ProgressScreen] Error processing photo:", error);
      // Use original if processing fails
      addProgressPhoto({ uri, angle, timestamp: photoTimestamp });
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const takePicture = async (angle: PhotoAngle) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // For camera photos, use current time as the photo was just taken
      const photoTimestamp = Date.now();
      processAndAddPhoto(asset.uri, angle, photoTimestamp);
    }
  };

  const pickFromGallery = async (angle: PhotoAngle) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Try to get the original photo timestamp from EXIF data
      let photoTimestamp = Date.now();

      if (asset.exif) {
        // Check for DateTimeOriginal (when photo was taken)
        const dateTimeOriginal = asset.exif.DateTimeOriginal || asset.exif.DateTimeDigitized || asset.exif.DateTime;
        if (dateTimeOriginal) {
          // EXIF date format is "YYYY:MM:DD HH:MM:SS"
          const parsed = dateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
          const parsedDate = new Date(parsed);
          if (!isNaN(parsedDate.getTime())) {
            photoTimestamp = parsedDate.getTime();
          }
        }
      }

      processAndAddPhoto(asset.uri, angle, photoTimestamp);
    }
  };

  const chartData = weightHistory.length > 1
    ? weightHistory.map((entry, index) => ({ x: index, y: entry.weight }))
    : [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: insets.top }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>PROGRESS</Text>
          <Text style={styles.headerTitle}>Your Journey</Text>
          <Text style={styles.headerSub}>Track milestones and celebrate wins</Text>
        </View>

        {/* Nutrition / Exercise tabs */}
        <View style={styles.tabBar}>
          {([
            { key: "nutrition" as const, label: "Nutrition", icon: "restaurant-outline" },
            { key: "exercise" as const, label: "Exercise", icon: "barbell-outline" },
          ]).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={15}
                  color={active ? colors.brandPrimary : colors.textMuted}
                />
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === "exercise" && (
          <View style={styles.exerciseTabWrap}>
            <ExerciseProgressTab />
          </View>
        )}

        {activeTab === "nutrition" && (
        <>
        {/* Weight Journey Timeline */}
        {(currentWeight > 0 || targetWeight > 0 || weightHistory.length > 0) && (() => {
          const startWeight = weightHistory.length > 0 ? weightHistory[0].weight : currentWeight;
          const nowWeight = currentWeight > 0 ? currentWeight : startWeight;
          const goalWeight = targetWeight > 0 ? targetWeight : nowWeight;
          const isLosing = goalWeight < startWeight;

          // Clamp pct 0–100 in the correct direction
          const totalSpan = Math.abs(startWeight - goalWeight) || 1;
          const covered = Math.abs(startWeight - nowWeight);
          const pct = Math.min(Math.max((covered / totalSpan) * 100, 0), 100);

          const startDisp = toDisplayW(startWeight);
          const nowDisp = toDisplayW(nowWeight);
          const goalDisp = toDisplayW(goalWeight);
          const changeDisp = toDisplayW(Math.abs(startWeight - nowWeight));

          // flex weights for the track split (avoid flex:0 crash)
          const leftFlex = Math.max(pct, 0.5);
          const rightFlex = Math.max(100 - pct, 0.5);

          // Pace: weekly rate from calorie deficit (3500 kcal = 1 lb)
          const weeklyDeficitLbs = ((maintenance - nutritionGoal.dailyCalories) * 7) / 3500;
          const weeklyPaceLbs = Math.abs(weeklyDeficitLbs);
          const weeklyPaceDisp = toDisplayW(weeklyPaceLbs);

          // Weeks elapsed since start
          const journeyStartMs = weightHistory.length > 0 ? weightHistory[0].date : startDate;
          const weeksElapsed = Math.max((Date.now() - journeyStartMs) / (7 * 24 * 60 * 60 * 1000), 0);

          // Expected weight today based on pace
          const expectedLost = weeklyPaceLbs * weeksElapsed;
          const expectedNow = isLosing
            ? Math.max(startWeight - expectedLost, goalWeight)
            : Math.min(startWeight + expectedLost, goalWeight);

          // Delta: positive = ahead of pace, negative = behind
          const deltaLbs = isLosing
            ? expectedNow - nowWeight  // losing: being lower is ahead
            : nowWeight - expectedNow; // gaining: being higher is ahead
          const deltaDisp = toDisplayW(Math.abs(deltaLbs));
          const isAhead = deltaLbs > 0.1;
          const isBehind = deltaLbs < -0.1;
          const paceStatusColor = isAhead ? "#4ade80" : isBehind ? "#f87171" : colors.brandTeal;
          const paceStatusLabel = isAhead ? "ahead" : isBehind ? "behind" : "on pace";
          const paceStatusText = isAhead || isBehind
            ? `${deltaDisp} ${weightUnit} ${paceStatusLabel}`
            : "on pace";

          return (
            <LinearGradient
              colors={["#5b67cd", "#1e206a"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.timelineCard}
            >
              <Text style={styles.timelineEyebrow}>WEIGHT JOURNEY</Text>

              {/* Track */}
              <View style={styles.timelineTrackRow}>
                <View style={{ flex: leftFlex, height: 4, backgroundColor: colors.brandTeal, borderRadius: 2 }} />
                <View style={styles.timelineMarker}>
                  <View style={styles.timelineMarkerCore} />
                </View>
                <View style={{ flex: rightFlex, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2 }} />
              </View>

              {/* Labels */}
              <View style={styles.timelineLabelRow}>
                <View style={styles.timelineLabelLeft}>
                  <Text style={styles.timelineLabelTag}>START</Text>
                  <Text style={styles.timelineLabelValue}>{startDisp}</Text>
                  <Text style={styles.timelineLabelUnit}>{weightUnit}</Text>
                </View>
                <View style={styles.timelineLabelCenter}>
                  <Text style={[styles.timelineLabelTag, { color: colors.brandTeal }]}>YOU</Text>
                  <Text style={[styles.timelineLabelValue, { color: colors.brandTeal }]}>{nowDisp}</Text>
                  <Text style={[styles.timelineLabelUnit, { color: colors.brandTeal }]}>{weightUnit}</Text>
                  {covered > 0.05 && (
                    <Text style={styles.timelineChange}>
                      {isLosing ? "−" : "+"}{changeDisp} {weightUnit}
                    </Text>
                  )}
                </View>
                <View style={styles.timelineLabelRight}>
                  <Text style={styles.timelineLabelTag}>GOAL</Text>
                  <Text style={styles.timelineLabelValue}>{goalDisp}</Text>
                  <Text style={styles.timelineLabelUnit}>{weightUnit}</Text>
                </View>
              </View>

              {/* Pace row */}
              {weeklyPaceLbs > 0.01 && (
                <View style={styles.timelinePaceRow}>
                  <View style={styles.timelinePaceItem}>
                    <Text style={styles.timelinePaceLabel}>YOUR PACE</Text>
                    <Text style={styles.timelinePaceValue}>
                      {isLosing ? "−" : "+"}{weeklyPaceDisp} {weightUnit}/wk
                    </Text>
                  </View>
                  <View style={[styles.timelinePaceDivider]} />
                  <View style={styles.timelinePaceItem}>
                    <Text style={styles.timelinePaceLabel}>VS PACE</Text>
                    <Text style={[styles.timelinePaceValue, { color: paceStatusColor }]}>
                      {paceStatusText}
                    </Text>
                  </View>
                </View>
              )}
            </LinearGradient>
          );
        })()}

        {/* Weekly Review */}
        <WeeklyReviewCard />

        {/* Body Composition Trends */}
        <BodyCompositionCard />

        {/* Body Measurements Card */}
        {bodyMeasurements.length > 0 && (() => {
          const parts = getTrackedBodyParts();
          return (
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBox, { backgroundColor: "#0d6e6e" }]}>
                  <Ionicons name="body-outline" size={16} color="#fff" />
                </View>
                <ThemedText variant="h3" style={styles.cardTitle}>
                  Body Measurements
                </ThemedText>
                <Pressable
                  onPress={() => {
                    setNewMeasurePart("");
                    setNewMeasureValue("");
                    setNewMeasureUnit(isMetric ? "cm" : "in");
                    setShowAddMeasurement(true);
                  }}
                  style={styles.logBtn}
                >
                  <Ionicons name="add" size={13} color={colors.brandTeal} />
                  <Text style={styles.logBtnText}>Add</Text>
                </Pressable>
              </View>

              {parts.map((part, index) => {
                const history = getMeasurementHistoryForPart(part);
                const first = history[0];
                const latest = history[history.length - 1];
                const change = latest && first ? latest.value - first.value : 0;
                const unit = latest?.unit ?? "cm";
                const isDecrease = change < 0;
                const isIncrease = change > 0;
                const trendColor = isDecrease ? colors.success : isIncrease ? "#ef4444" : colors.textMuted;

                // Build sparkline points from history values
                const sparkPoints = history.map((e) => e.value);
                const sparkMin = Math.min(...sparkPoints);
                const sparkMax = Math.max(...sparkPoints);
                const sparkRange = sparkMax - sparkMin || 1;
                const W = 56, H = 28;
                const pts = sparkPoints.map((v, i) => {
                  const x = sparkPoints.length === 1 ? W / 2 : (i / (sparkPoints.length - 1)) * W;
                  const y = H - ((v - sparkMin) / sparkRange) * H;
                  return `${x},${y}`;
                }).join(" ");

                return (
                  <Pressable
                    key={part}
                    style={[
                      styles.measureProgressRow,
                      index < parts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
                    ]}
                    onPress={() => setSelectedBodyPart(part)}
                  >
                    {/* Label */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText variant="body" style={{ fontWeight: "600", color: colors.textPrimary }} numberOfLines={1}>{part}</ThemedText>
                      <ThemedText variant="caption" muted>{history.length} {history.length === 1 ? "entry" : "entries"}</ThemedText>
                    </View>

                    {/* Start → Now */}
                    <View style={styles.measureStatCol}>
                      <View style={styles.measureStatRow}>
                        <View style={styles.measureStatBox}>
                          <ThemedText variant="caption" muted style={{ textAlign: "center" }}>Start</ThemedText>
                          <ThemedText variant="bodySmall" style={{ fontWeight: "700", color: colors.textMuted, textAlign: "center" }}>
                            {first?.value ?? "—"}<ThemedText variant="caption" muted> {unit}</ThemedText>
                          </ThemedText>
                        </View>
                        <Ionicons name="arrow-forward" size={10} color={colors.borderSubtle} style={{ marginTop: 12 }} />
                        <View style={styles.measureStatBox}>
                          <ThemedText variant="caption" muted style={{ textAlign: "center" }}>Now</ThemedText>
                          <ThemedText variant="bodySmall" style={{ fontWeight: "700", color: colors.textPrimary, textAlign: "center" }}>
                            {latest?.value ?? "—"}<ThemedText variant="caption" muted> {unit}</ThemedText>
                          </ThemedText>
                        </View>
                      </View>
                    </View>

                    {/* Sparkline */}
                    {history.length > 1 ? (
                      <View style={styles.sparklineBox}>
                        <Svg width={W} height={H}>
                          <Polyline
                            points={pts}
                            fill="none"
                            stroke={trendColor}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Svg>
                        <ThemedText variant="caption" style={{ color: trendColor, fontWeight: "700", textAlign: "center", marginTop: 2 }}>
                          {isDecrease ? "−" : isIncrease ? "+" : ""}{Math.abs(change).toFixed(1)} {unit}
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.sparklineBox, { justifyContent: "center", alignItems: "center" }]}>
                        <ThemedText variant="caption" muted style={{ textAlign: "center" }}>Log more{"\n"}to trend</ThemedText>
                      </View>
                    )}

                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 4 }} />
                  </Pressable>
                );
              })}
            </Card>
          );
        })()}

        {/* Nutrition Trends Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="stats-chart" size={16} color="#fff" />
            </View>
            <ThemedText variant="h3" style={styles.cardTitle}>
              Nutrition Trends
            </ThemedText>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText
                variant="h2"
                style={{
                  color: daysLoggedThisWeek === 0
                    ? colors.textMuted
                    : goalDirection === "gain"
                      ? (thisWeekBalance >= 0 ? colors.success : colors.error)
                      : (thisWeekBalance <= 0 ? colors.success : colors.error),
                }}
              >
                {daysLoggedThisWeek === 0 ? "—" : (thisWeekBalance > 0 ? "+" : "") + thisWeekBalance.toLocaleString()}
              </ThemedText>
              <ThemedText variant="caption" muted>
                this week
              </ThemedText>
            </View>

            {hasLastWeekData && (
            <View style={[styles.statItem, styles.statDivider]}>
              <ThemedText
                variant="h2"
                style={{
                  color: goalDirection === "gain"
                    ? (lastWeekBalance >= 0 ? colors.success : colors.error)
                    : (lastWeekBalance <= 0 ? colors.success : colors.error),
                }}
              >
                {(lastWeekBalance > 0 ? "+" : "") + lastWeekBalance.toLocaleString()}
              </ThemedText>
              <ThemedText variant="caption" muted>
                last week
              </ThemedText>
            </View>
            )}

            <View style={styles.statItem}>
              <ThemedText variant="h2" style={{ color: colors.textMuted }}>
                {maintenance.toLocaleString()}
              </ThemedText>
              <ThemedText variant="caption" muted>
                TDEE
              </ThemedText>
            </View>
          </View>

          <View style={styles.goalComparisonContainer}>
            <View style={styles.goalComparisonRow}>
              <ThemedText variant="bodySmall" muted>
                Calorie Goal
              </ThemedText>
              <ThemedText variant="bodySmall">
                {nutritionGoal.dailyCalories} cal
              </ThemedText>
            </View>
            <View style={styles.goalComparisonRow}>
              <ThemedText variant="bodySmall" muted>
                Days Logged
              </ThemedText>
              <ThemedText variant="bodySmall">
                {daysLoggedThisWeek}/7
              </ThemedText>
            </View>
          </View>
        </Card>

        {/* Before & After Gallery */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="images" size={16} color="#fff" />
            </View>
            <ThemedText variant="h3" style={styles.cardTitle}>
              Before &amp; After Gallery
            </ThemedText>
            <Pressable
              onPress={() => setIsGalleryMinimized(!isGalleryMinimized)}
              style={{ padding: 4 }}
              hitSlop={8}
            >
              <Ionicons
                name={isGalleryMinimized ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          {isGalleryMinimized ? (
            <ThemedText variant="bodySmall" muted style={{ marginTop: 4, marginBottom: 4 }}>
              Gallery hidden for privacy. Tap the eye icon to show.
            </ThemedText>
          ) : (
            <>
          <ThemedText variant="bodySmall" muted style={styles.gallerySubtitle}>
            Capture your transformation from different angles
          </ThemedText>

          {/* Angle Selector */}
          <View style={styles.angleSelector}>
            <Pressable
              style={[
                styles.angleButton,
                selectedAngle === "front" && styles.angleButtonActive,
              ]}
              onPress={() => setSelectedAngle("front")}
            >
              <ThemedText
                variant="bodySmall"
                style={{
                  color: selectedAngle === "front" ? "#ffffff" : colors.textMuted,
                  fontWeight: selectedAngle === "front" ? "600" : "400",
                }}
              >
                Front
              </ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.angleButton,
                selectedAngle === "side" && styles.angleButtonActive,
              ]}
              onPress={() => setSelectedAngle("side")}
            >
              <ThemedText
                variant="bodySmall"
                style={{
                  color: selectedAngle === "side" ? "#ffffff" : colors.textMuted,
                  fontWeight: selectedAngle === "side" ? "600" : "400",
                }}
              >
                Side
              </ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.angleButton,
                selectedAngle === "back" && styles.angleButtonActive,
              ]}
              onPress={() => setSelectedAngle("back")}
            >
              <ThemedText
                variant="bodySmall"
                style={{
                  color: selectedAngle === "back" ? "#ffffff" : colors.textMuted,
                  fontWeight: selectedAngle === "back" ? "600" : "400",
                }}
              >
                Back
              </ThemedText>
            </Pressable>
          </View>

          {/* Before & After Photos */}
          <View style={styles.beforeAfterContainer}>
            {(() => {
              const { before, after } = getBeforeAfterPhotos(selectedAngle);

              return (
                <>
                  {/* Before Photo */}
                  <View style={styles.photoColumn}>
                    <ThemedText variant="caption" muted style={styles.photoLabel}>
                      BEFORE
                    </ThemedText>
                    {before ? (
                      <Pressable onPress={() => setSelectedPhoto(before)}>
                        <Image source={{ uri: resolvePhotoUri(before.uri) ?? before.uri }} style={styles.photoImage} />
                        <ThemedText variant="caption" muted style={styles.photoDate}>
                          {new Date(before.timestamp).toLocaleDateString()}
                        </ThemedText>
                      </Pressable>
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
                        <ThemedText variant="caption" muted style={styles.placeholderText}>
                          No photo yet
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  {/* After Photo */}
                  <View style={styles.photoColumn}>
                    <ThemedText variant="caption" muted style={styles.photoLabel}>
                      AFTER
                    </ThemedText>
                    {after && after.id !== before?.id ? (
                      <Pressable onPress={() => setSelectedPhoto(after)}>
                        <Image source={{ uri: resolvePhotoUri(after.uri) ?? after.uri }} style={styles.photoImage} />
                        <ThemedText variant="caption" muted style={styles.photoDate}>
                          {new Date(after.timestamp).toLocaleDateString()}
                        </ThemedText>
                      </Pressable>
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
                        <ThemedText variant="caption" muted style={styles.placeholderText}>
                          {before ? "Take another" : "No photo yet"}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </>
              );
            })()}
          </View>

          {/* Add Photo Buttons */}
          {isProcessingPhoto ? (
            <View style={styles.photoProcessingContainer}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <ThemedText variant="bodySmall" muted style={{ marginTop: spacing.md }}>
                Removing background...
              </ThemedText>
            </View>
          ) : (
            <View style={styles.photoActions}>
              <Pressable
                style={styles.photoActionButton}
                onPress={() => takePicture(selectedAngle)}
              >
                <Ionicons name="camera" size={20} color={colors.textMuted} />
                <ThemedText
                  variant="bodySmall"
                  style={{ color: colors.textPrimary, fontWeight: "600", marginLeft: spacing.xs }}
                >
                  Take Photo
                </ThemedText>
              </Pressable>

              <Pressable
                style={styles.photoActionButton}
                onPress={() => pickFromGallery(selectedAngle)}
              >
                <Ionicons name="images" size={20} color={colors.textMuted} />
                <ThemedText
                  variant="bodySmall"
                  style={{ color: colors.textPrimary, fontWeight: "600", marginLeft: spacing.xs }}
                >
                  From Gallery
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* View All Photos Link */}
          {progressPhotos.length > 0 && (
            <Pressable
              style={styles.viewAllPhotosLink}
              onPress={() => navigation.navigate("AllPhotos")}
            >
              <ThemedText variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: "600" }}>
                View All Photos ({progressPhotos.length})
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          )}
            </>
          )}
        </Card>

        {/* Streak & Consistency */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="flame" size={16} color="#fff" />
            </View>
            <ThemedText variant="h3" style={styles.cardTitle}>
              Consistency
            </ThemedText>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText variant="h2" style={{ color: "#F97316" }}>
                {thisWeekMeals.length}
              </ThemedText>
              <ThemedText variant="caption" muted>
                meals this week
              </ThemedText>
            </View>

            <View style={[styles.statItem, styles.statDivider]}>
              <ThemedText variant="h2" style={{ color: colors.success }}>
                {daysLoggedThisWeek}/7
              </ThemedText>
              <ThemedText variant="caption" muted>
                days logged
              </ThemedText>
            </View>
          </View>

          <ThemedText variant="bodySmall" muted style={styles.consistencyNote}>
            Track 3 meals per day to maintain your streak
          </ThemedText>
        </Card>

        {/* Activity Calendar */}
        <View style={styles.trackerSection}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="calendar-outline" size={16} color="#fff" />
            </View>
            <ThemedText variant="h3" style={styles.cardTitle}>
              Activity Calendar
            </ThemedText>
          </View>
          <TrackerCalendar />
        </View>
        </>
        )}
      </ScrollView>

      {/* Full Screen Photo Modal */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setSelectedPhoto(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                {selectedPhoto && (
                  <Image
                    source={{ uri: resolvePhotoUri(selectedPhoto.uri) ?? selectedPhoto.uri }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                )}
                <Pressable
                  style={styles.closeButton}
                  onPress={() => setSelectedPhoto(null)}
                >
                  <Ionicons name="close" size={32} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => setShowDeleteConfirm(true)}
                >
                  <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <ThemedText variant="h3" style={styles.confirmTitle}>
              Delete Photo?
            </ThemedText>
            <ThemedText variant="body" muted style={styles.confirmMessage}>
              This action cannot be undone. Are you sure you want to delete this progress photo?
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <ThemedText variant="body" style={{ color: colors.textPrimary }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.confirmDeleteButton}
                onPress={() => {
                  if (selectedPhoto) {
                    deleteProgressPhoto(selectedPhoto.id);
                  }
                  setShowDeleteConfirm(false);
                  setSelectedPhoto(null);
                }}
              >
                <ThemedText variant="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Body Measurement Modal */}
      <Modal visible={showAddMeasurement} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowAddMeasurement(false)}>
          <View style={styles.confirmOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.confirmDialog}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
                  <ThemedText variant="h3" style={styles.confirmTitle}>Add Measurement</ThemedText>
                  <Pressable onPress={() => setShowAddMeasurement(false)} hitSlop={12}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <ThemedText variant="caption" muted style={{ marginBottom: 4 }}>Body Part</ThemedText>
                <TextInput
                  style={styles.measureInput}
                  placeholder="e.g. Waist, Chest, Biceps"
                  placeholderTextColor={colors.textMuted}
                  value={newMeasurePart}
                  onChangeText={setNewMeasurePart}
                  returnKeyType="next"
                />
                <ThemedText variant="caption" muted style={{ marginBottom: 4, marginTop: spacing.sm }}>Value</ThemedText>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <TextInput
                    style={[styles.measureInput, { flex: 1 }]}
                    placeholder="0.0"
                    placeholderTextColor={colors.textMuted}
                    value={newMeasureValue}
                    onChangeText={setNewMeasureValue}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  <View style={{ flexDirection: "row", borderRadius: radii.md, overflow: "hidden", borderWidth: 1, borderColor: colors.borderSubtle }}>
                    {(["cm", "in"] as const).map((u) => (
                      <Pressable
                        key={u}
                        onPress={() => setNewMeasureUnit(u)}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: newMeasureUnit === u ? colors.brandTeal : colors.bgCard }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: newMeasureUnit === u ? "#fff" : colors.textMuted }}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  style={[styles.confirmBtn, { marginTop: spacing.lg, opacity: newMeasurePart.trim() && newMeasureValue ? 1 : 0.4 }]}
                  onPress={() => {
                    const val = parseFloat(newMeasureValue);
                    if (!newMeasurePart.trim() || isNaN(val)) return;
                    addBodyMeasurement({ bodyPart: newMeasurePart.trim(), value: val, unit: newMeasureUnit, timestamp: Date.now() });
                    setShowAddMeasurement(false);
                  }}
                  disabled={!newMeasurePart.trim() || !newMeasureValue}
                >
                  <Text style={styles.confirmBtnText}>Save</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Body Part History Modal */}
      <Modal visible={!!selectedBodyPart} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setSelectedBodyPart(null)}>
          <View style={styles.confirmOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.confirmDialog, { maxHeight: "70%", width: "100%" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
                  <ThemedText variant="h3" style={styles.confirmTitle}>{selectedBodyPart}</ThemedText>
                  <Pressable onPress={() => setSelectedBodyPart(null)} hitSlop={12}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                {selectedBodyPart && (() => {
                  const history = getMeasurementHistoryForPart(selectedBodyPart);
                  if (history.length === 0) return <ThemedText variant="body" muted>No entries yet.</ThemedText>;
                  const first = history[0];
                  const latest = history[history.length - 1];
                  const totalChange = latest.value - first.value;
                  const unit = latest.unit;
                  return (
                    <>
                      {history.length > 1 && (
                        <View style={{ flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.bgMain, borderRadius: 12, padding: 14, marginBottom: spacing.md }}>
                          <View style={{ alignItems: "center" }}>
                            <ThemedText variant="caption" muted>Start</ThemedText>
                            <ThemedText variant="h3">{first.value} {unit}</ThemedText>
                          </View>
                          <View style={{ alignItems: "center" }}>
                            <ThemedText variant="caption" muted>Change</ThemedText>
                            <ThemedText variant="h3" style={{ color: totalChange < 0 ? colors.success : totalChange > 0 ? colors.error : colors.textMuted }}>
                              {totalChange > 0 ? "+" : ""}{totalChange.toFixed(1)} {unit}
                            </ThemedText>
                          </View>
                          <View style={{ alignItems: "center" }}>
                            <ThemedText variant="caption" muted>Now</ThemedText>
                            <ThemedText variant="h3">{latest.value} {unit}</ThemedText>
                          </View>
                        </View>
                      )}
                      {[...history].reverse().map((entry, i) => (
                        <View
                          key={entry.id}
                          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderBottomColor: colors.borderSubtle }}
                        >
                          <ThemedText variant="bodySmall" muted>
                            {new Date(entry.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </ThemedText>
                          <ThemedText variant="body" style={{ fontWeight: "600", color: colors.textPrimary }}>
                            {entry.value} {entry.unit}
                          </ThemedText>
                        </View>
                      ))}
                    </>
                  );
                })()}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + 16,
    paddingBottom: spacing.lg,
  },
  tabBar: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSection,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  tabBtnActive: {
    backgroundColor: colors.bgCard,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabBtnText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  tabBtnTextActive: { color: colors.brandPrimary, fontWeight: "700" },
  exerciseTabWrap: { paddingHorizontal: spacing.lg },
  headerLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  headerSub: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  cardTitle: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statDivider: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chartContainer: {
    height: 200,
    marginTop: spacing.md,
  },
  goalComparisonContainer: {
    backgroundColor: colors.bgSection,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  goalComparisonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gallerySubtitle: {
    marginBottom: spacing.lg,
  },
  angleSelector: {
    flexDirection: "row",
    backgroundColor: colors.bgSection,
    borderRadius: radii.pill,
    padding: spacing.xxs,
    marginBottom: spacing.lg,
  },
  angleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radii.pill,
  },
  angleButtonActive: {
    backgroundColor: "#0f766e",
    borderRadius: radii.pill,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  beforeAfterContainer: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  photoColumn: {
    flex: 1,
  },
  photoLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  photoImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    backgroundColor: colors.bgSection,
  },
  photoDate: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
  photoPlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    backgroundColor: colors.bgSection,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    marginTop: spacing.sm,
  },
  photoProcessingContainer: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  photoActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSection,
  },
  viewAllPhotosLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  consistencyNote: {
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: "90%",
    height: "80%",
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  trackerSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  trackerSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSection,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  trackerSectionTitle: {
    flexDirection: "row",
    alignItems: "center",
  },
  deleteButton: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    gap: spacing.sm,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  confirmDialog: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  confirmTitle: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  confirmMessage: {
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgSection,
    alignItems: "center",
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
  measureProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  measureStatCol: {
    marginHorizontal: spacing.sm,
  },
  measureStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  measureStatBox: {
    alignItems: "center",
    minWidth: 44,
  },
  sparklineBox: {
    width: 56,
    alignItems: "center",
    marginLeft: spacing.xs,
  },
  timelineCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: "#1e206a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  timelineEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.5)",
    marginBottom: spacing.sm,
  },
  timelineTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  timelineMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.brandTeal,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brandTeal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  timelineMarkerCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandTeal,
  },
  timelineLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  timelineLabelLeft: {
    alignItems: "flex-start",
    flex: 1,
  },
  timelineLabelCenter: {
    alignItems: "center",
    flex: 1,
  },
  timelineLabelRight: {
    alignItems: "flex-end",
    flex: 1,
  },
  timelineLabelTag: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  timelineLabelValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  timelineLabelUnit: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "500",
  },
  timelineChange: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.brandTeal,
    marginTop: 2,
  },
  timelinePaceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  timelinePaceItem: {
    flex: 1,
    alignItems: "center",
  },
  timelinePaceDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  timelinePaceLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  timelinePaceValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,206,209,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.3)",
    marginLeft: "auto",
  },
  logBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandTeal,
  },
  measureInput: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  confirmBtn: {
    backgroundColor: colors.brandTeal,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
