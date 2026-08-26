// WorkoutPlanScreen — the weekly schedule. Shows what is planned for each
// weekday, with today pulled to the top so starting the right session is one tap.

import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";
import useDietStore from "../state/dietStore";
import { colors, radii, spacing } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { WorkoutPlanDay } from "../types/diet";
import { WEEKDAY_NAMES } from "./EditWorkoutPlanDayScreen";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** "4 exercises · 16 sets" — the at-a-glance weight of a planned day. */
export function planSummary(plan: WorkoutPlanDay): string {
  const count = plan.exercises.length;
  const sets = plan.exercises.reduce((sum, e) => sum + (e.sets ?? 0), 0);
  const parts = [`${count} exercise${count === 1 ? "" : "s"}`];
  if (sets > 0) parts.push(`${sets} sets`);
  return parts.join(" · ");
}

export default function WorkoutPlanScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const workoutPlans = useDietStore((s) => s.workoutPlans);
  const workoutSessions = useDietStore((s) => s.workoutSessions);

  const today = new Date().getDay();

  const planByDay = useMemo(() => {
    const map = new Map<number, WorkoutPlanDay>();
    for (const plan of workoutPlans) map.set(plan.dayOfWeek, plan);
    return map;
  }, [workoutPlans]);

  const loggedToday = useMemo(() => {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    return workoutSessions.some((s) => s.timestamp >= dayStart && s.timestamp < dayStart + 86400000);
  }, [workoutSessions]);

  const todayPlan = planByDay.get(today) ?? null;
  // Week runs from today so the next few days are what you see first.
  const orderedDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => (today + i) % 7),
    [today]
  );

  const startToday = () => {
    if (!todayPlan) return;
    navigation.navigate("LogWorkoutSession", { planDayOfWeek: today });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Weekly Plan</Text>
        <View style={styles.headerBtnRight} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Today */}
        <Text style={styles.sectionLabel}>TODAY · {WEEKDAY_NAMES[today].toUpperCase()}</Text>
        {todayPlan ? (
          <Animated.View entering={FadeInDown.duration(220)} style={styles.todayCard}>
            <View style={styles.todayHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.todayTitle}>{todayPlan.title ?? "Today's workout"}</Text>
                <Text style={styles.todaySummary}>{planSummary(todayPlan)}</Text>
              </View>
              {loggedToday && (
                <View style={styles.doneBadge}>
                  <Ionicons name="checkmark" size={12} color={colors.brandTeal} />
                  <Text style={styles.doneBadgeText}>Logged</Text>
                </View>
              )}
            </View>

            <View style={styles.exerciseList}>
              {todayPlan.exercises.slice(0, 6).map((ex) => (
                <View key={ex.id} style={styles.exerciseLine}>
                  <View style={styles.dot} />
                  <Text style={styles.exerciseName} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  {ex.sets && ex.reps && (
                    <Text style={styles.exerciseTarget}>
                      {ex.sets} × {ex.reps}
                    </Text>
                  )}
                </View>
              ))}
              {todayPlan.exercises.length > 6 && (
                <Text style={styles.moreText}>
                  +{todayPlan.exercises.length - 6} more
                </Text>
              )}
            </View>

            <Pressable style={styles.startBtn} onPress={startToday}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.startBtnText}>
                {loggedToday ? "Log this workout again" : "Start today's workout"}
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View style={styles.restCard}>
            <Ionicons name="bed-outline" size={26} color={colors.textMuted} />
            <Text style={styles.restTitle}>No workout planned for today</Text>
            <Text style={styles.restText}>
              Set one up below, or log a one-off session any time.
            </Text>
            <View style={styles.restBtnRow}>
              <Pressable
                style={styles.restPrimaryBtn}
                onPress={() => navigation.navigate("EditWorkoutPlanDay", { dayOfWeek: today })}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.restPrimaryText}>Plan today</Text>
              </Pressable>
              <Pressable
                style={styles.restSecondaryBtn}
                onPress={() => navigation.navigate("LogWorkoutSession", {})}
              >
                <Text style={styles.restSecondaryText}>Log a session</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* The rest of the week */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>THE WEEK</Text>
        {orderedDays.map((day, index) => {
          const plan = planByDay.get(day);
          const isToday = day === today;
          return (
            <Animated.View key={day} entering={FadeInDown.duration(200).delay(index * 25)}>
              <Pressable
                style={[styles.dayRow, isToday && styles.dayRowToday]}
                onPress={() => navigation.navigate("EditWorkoutPlanDay", { dayOfWeek: day })}
              >
                <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
                  <Text style={[styles.dayBadgeText, isToday && { color: "#fff" }]}>
                    {WEEKDAY_NAMES[day].slice(0, 3).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayTitle}>
                    {plan ? (plan.title ?? WEEKDAY_NAMES[day]) : "Rest day"}
                  </Text>
                  <Text style={styles.daySubtitle}>
                    {plan ? planSummary(plan) : "Tap to plan a workout"}
                  </Text>
                </View>
                <Ionicons
                  name={plan ? "chevron-forward" : "add-circle-outline"}
                  size={19}
                  color={colors.textMuted}
                />
              </Pressable>
            </Animated.View>
          );
        })}

        <Text style={styles.footNote}>
          Plans repeat every week. Starting a workout opens the log with your exercises and targets
          already filled in — adjust anything that changed on the day.
        </Text>
      </ScrollView>
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
  headerBtnRight: { width: 40 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 8,
  },
  todayCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
  },
  todayHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  todayTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  todaySummary: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,206,209,0.12)",
  },
  doneBadgeText: { fontSize: 11, fontWeight: "700", color: colors.brandTeal },
  exerciseList: { marginTop: spacing.sm, gap: 6 },
  exerciseLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brandTeal },
  exerciseName: { flex: 1, fontSize: 14, color: colors.textSecondary },
  exerciseTarget: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  moreText: { fontSize: 12, color: colors.textMuted, marginLeft: 13 },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: spacing.md,
    paddingVertical: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.brandOrange,
  },
  startBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  restCard: {
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 5,
  },
  restTitle: { fontSize: 15.5, fontWeight: "700", color: colors.textPrimary, marginTop: 4 },
  restText: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  restBtnRow: { flexDirection: "row", gap: 10, marginTop: spacing.md, alignSelf: "stretch" },
  restPrimaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.brandTeal,
  },
  restPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  restSecondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSection,
  },
  restSecondaryText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: 8,
  },
  dayRowToday: { borderColor: colors.brandTeal },
  dayBadge: {
    width: 46,
    paddingVertical: 7,
    borderRadius: radii.sm,
    alignItems: "center",
    backgroundColor: colors.bgSection,
  },
  dayBadgeToday: { backgroundColor: colors.brandTeal },
  dayBadgeText: { fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5 },
  dayTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  daySubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  footNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
