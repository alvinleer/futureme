// TodaysPlanCard — "here is what you planned for today, tap to log it".
// Surfaced anywhere the user might start a workout.

import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import useDietStore from "../state/dietStore";
import { colors, radii, spacing } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function TodaysPlanCard() {
  const navigation = useNavigation<Nav>();
  const workoutPlans = useDietStore((s) => s.workoutPlans);
  const workoutSessions = useDietStore((s) => s.workoutSessions);

  const today = new Date().getDay();
  const plan = useMemo(
    () => workoutPlans.find((p) => p.dayOfWeek === today) ?? null,
    [workoutPlans, today]
  );
  const hasAnyPlan = workoutPlans.length > 0;

  const loggedToday = useMemo(() => {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    return workoutSessions.some(
      (s) => s.timestamp >= dayStart && s.timestamp < dayStart + 86400000
    );
  }, [workoutSessions]);

  // Nothing set up yet — invite the user to build a schedule.
  if (!hasAnyPlan) {
    return (
      <Pressable style={styles.setupCard} onPress={() => navigation.navigate("WorkoutPlan")}>
        <View style={styles.setupIcon}>
          <Ionicons name="calendar-outline" size={17} color={colors.brandTeal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.setupTitle}>Set up a weekly workout plan</Text>
          <Text style={styles.setupText}>
            Speak your exercises in once per day, then log them with a tap each week.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </Pressable>
    );
  }

  // Planned days exist, but today is not one of them.
  if (!plan) {
    return (
      <Pressable style={styles.restCard} onPress={() => navigation.navigate("WorkoutPlan")}>
        <Ionicons name="bed-outline" size={16} color={colors.textMuted} />
        <Text style={styles.restText}>
          Rest day — nothing planned for {WEEKDAYS[today]}.
        </Text>
        <Text style={styles.restLink}>View plan</Text>
      </Pressable>
    );
  }

  const setCount = plan.exercises.reduce((sum, e) => sum + (e.sets ?? 0), 0);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>TODAY</Text>
        </View>
        <Pressable onPress={() => navigation.navigate("WorkoutPlan")} hitSlop={10}>
          <Text style={styles.editLink}>Weekly plan</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{plan.title ?? `${WEEKDAYS[today]} workout`}</Text>
      <Text style={styles.summary}>
        {plan.exercises.length} exercise{plan.exercises.length === 1 ? "" : "s"}
        {setCount > 0 ? ` · ${setCount} sets` : ""}
        {loggedToday ? " · logged" : ""}
      </Text>

      <View style={styles.chipRow}>
        {plan.exercises.slice(0, 4).map((ex) => (
          <View key={ex.id} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {ex.name}
              {ex.sets && ex.reps ? ` ${ex.sets}×${ex.reps}` : ""}
            </Text>
          </View>
        ))}
        {plan.exercises.length > 4 && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>+{plan.exercises.length - 4}</Text>
          </View>
        )}
      </View>

      <Pressable
        style={styles.startBtn}
        onPress={() => navigation.navigate("LogWorkoutSession", { planDayOfWeek: today })}
      >
        <Ionicons name={loggedToday ? "add" : "play"} size={15} color="#fff" />
        <Text style={styles.startBtnText}>
          {loggedToday ? "Log it again" : "Start this workout"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,206,209,0.14)",
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: colors.brandTeal },
  editLink: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  title: { fontSize: 17, fontWeight: "700", color: colors.textPrimary, marginTop: 8 },
  summary: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSection,
    maxWidth: "48%",
  },
  chipText: { fontSize: 11.5, fontWeight: "600", color: colors.textSecondary },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.brandOrange,
  },
  startBtnText: { fontSize: 14.5, fontWeight: "700", color: "#fff" },
  setupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  setupIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,206,209,0.10)",
  },
  setupTitle: { fontSize: 14.5, fontWeight: "700", color: colors.textPrimary },
  setupText: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  restCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  restText: { flex: 1, fontSize: 13, color: colors.textMuted },
  restLink: { fontSize: 12.5, fontWeight: "700", color: colors.brandTeal },
});
