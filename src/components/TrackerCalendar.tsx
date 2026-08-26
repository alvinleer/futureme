import React, { useState, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import useDietStore from "../state/dietStore";
import { TrackerConfig, TrackerEntry } from "../types/diet";
import { colors, spacing, radii } from "../theme";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// These colors are intentionally NOT in the TRACKER_COLORS picker array
// so user-created trackers can never clash with the built-in items.
const DIET_COLOR = "#059669";     // emerald — distinct from picker's #10B981
const EXERCISE_COLOR = "#FF9040"; // orange — lighter for contrast with pink trackers

const getDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const wasTrackerGoalMet = (
  tracker: TrackerConfig,
  entries: TrackerEntry[],
  dateStr: string
): boolean => {
  const dayEntries = entries.filter(
    (e) => e.trackerId === tracker.id && e.date === dateStr
  );
  if (tracker.type === "boolean") return dayEntries.some((e) => e.value === 1);
  const totalValue = dayEntries.reduce((sum, e) => sum + e.value, 0);
  if (tracker.goalDirection === "min") {
    // "No more than X" — dot shows when totalValue is at or below the limit.
    // If nothing was logged (totalValue = 0) that also counts as meeting the goal.
    const limit = tracker.goal ?? 0;
    return totalValue <= limit;
  }
  // "More than X" direction — require at least one entry logged.
  if (dayEntries.length === 0) return false;
  if (tracker.goal == null || tracker.goal === 0) return totalValue > 0;
  return totalValue >= tracker.goal;
};

const isEmoji = (str: string) => {
  const emojiRegex = /\p{Emoji}/u;
  return emojiRegex.test(str) && str.length <= 4;
};

const wasDietGoalMet = (
  meals: { calories: number; timestamp: number }[],
  dailyCalorieGoal: number,
  dateStr: string
): boolean => {
  const dayStart = new Date(dateStr).setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateStr).setHours(23, 59, 59, 999);
  const dayMeals = meals.filter((m) => m.timestamp >= dayStart && m.timestamp <= dayEnd);
  if (dayMeals.length === 0) return false;
  const totalCalories = dayMeals.reduce((sum, m) => sum + m.calories, 0);
  const lowerBound = dailyCalorieGoal * 0.8;
  const upperBound = dailyCalorieGoal * 1.1;
  return totalCalories >= lowerBound && totalCalories <= upperBound;
};

const wasExerciseGoalMet = (
  workouts: { timestamp: number }[],
  dateStr: string
): boolean => {
  const dayStart = new Date(dateStr).setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateStr).setHours(23, 59, 59, 999);
  return workouts.some((w) => w.timestamp >= dayStart && w.timestamp <= dayEnd);
};

export default function TrackerCalendar() {
  const trackers = useDietStore((s) => s.trackers);
  const trackerEntries = useDietStore((s) => s.trackerEntries);
  const meals = useDietStore((s) => s.meals);
  const workouts = useDietStore((s) => s.workouts);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);

  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const days: { date: Date | null; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, isCurrentMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ date: new Date(year, month, day), isCurrentMonth: true });
    }
    while (days.length % 7 !== 0) {
      days.push({ date: null, isCurrentMonth: false });
    }
    return days;
  }, [currentMonth]);

  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    let dietDays = 0;
    let exerciseDays = 0;
    const trackerDays: Record<string, number> = {};
    trackers.forEach((t) => { trackerDays[t.id] = 0; });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      if (date > today) continue;
      const dateStr = getDateString(date);
      if (wasDietGoalMet(meals, nutritionGoal.dailyCalories, dateStr)) dietDays++;
      if (wasExerciseGoalMet(workouts, dateStr)) exerciseDays++;
      trackers.forEach((tracker) => {
        if (wasTrackerGoalMet(tracker, trackerEntries, dateStr)) trackerDays[tracker.id]++;
      });
    }
    return { dietDays, exerciseDays, trackerDays };
  }, [currentMonth, trackers, trackerEntries, meals, workouts, nutritionGoal]);

  const goToPreviousMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const monthYearString = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const today = new Date();
  const todayStr = getDateString(today);

  return (
    <View style={styles.container}>
      {/* Month Navigation */}
      <View style={styles.monthNav}>
        <Pressable onPress={goToPreviousMonth} style={styles.navButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.monthTitle}>{monthYearString}</Text>
        <Pressable onPress={goToNextMonth} style={styles.navButton} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Days of Week Header */}
      <View style={styles.weekHeader}>
        {DAYS_OF_WEEK.map((day) => (
          <View key={day} style={styles.weekDayCell}>
            <Text style={styles.weekDayText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarData.map((dayData, index) => {
          if (!dayData.date) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          const dateStr = getDateString(dayData.date);
          const isToday = dateStr === todayStr;
          const isFuture = dayData.date > today;

          const dietMet = !isFuture && wasDietGoalMet(meals, nutritionGoal.dailyCalories, dateStr);
          const exerciseMet = !isFuture && wasExerciseGoalMet(workouts, dateStr);
          const trackersMet = !isFuture
            ? trackers.filter((t) => wasTrackerGoalMet(t, trackerEntries, dateStr))
            : [];

          const indicators: { color: string; type: "dot" | "icon"; icon?: string }[] = [];
          if (dietMet) indicators.push({ color: DIET_COLOR, type: "icon", icon: "nutrition" });
          if (exerciseMet) indicators.push({ color: EXERCISE_COLOR, type: "icon", icon: "fitness" });
          trackersMet.forEach((t) => indicators.push({ color: t.color, type: "dot" }));

          const hasActivity = indicators.length > 0;

          return (
            <View key={dateStr} style={styles.dayCell}>
              <View
                style={[
                  styles.dayContent,
                  isToday && styles.todayCell,
                  hasActivity && !isToday && styles.activeCell,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    isToday && styles.todayDayNumber,
                    isFuture && styles.futureDayNumber,
                  ]}
                >
                  {dayData.date.getDate()}
                </Text>
                {indicators.length > 0 && (
                  <View style={styles.indicatorRow}>
                    {indicators.slice(0, 3).map((ind, i) =>
                      ind.type === "icon" ? (
                        <View key={i} style={[styles.dotIndicator, { backgroundColor: ind.color }]} />
                      ) : (
                        <View key={i} style={[styles.dotIndicator, { backgroundColor: ind.color }]} />
                      )
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Pledge Color Legend */}
      {trackers.length > 0 && (
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>PLEDGE LEGEND</Text>
          <View style={styles.legendRow}>
            {trackers.map((tracker) => (
              <View key={tracker.id} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: tracker.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{tracker.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Monthly Streaks */}
      <View style={styles.streaksContainer}>
        <Text style={styles.streaksTitle}>{"THIS MONTH'S STREAKS"}</Text>
        <View style={styles.streaksGrid}>
          {/* Diet Goal */}
          <View style={styles.streakItem}>
            <View style={[styles.streakIconBox, { backgroundColor: DIET_COLOR + "22" }]}>
              <Ionicons name="nutrition-outline" size={16} color={DIET_COLOR} />
            </View>
            <View style={styles.streakTextContainer}>
              <Text style={styles.streakLabel}>Diet Goal</Text>
              <Text style={[styles.streakStat, { color: DIET_COLOR }]}>
                {monthStats.dietDays} {monthStats.dietDays === 1 ? "day" : "days"}
              </Text>
            </View>
          </View>

          {/* Exercise */}
          <View style={styles.streakItem}>
            <View style={[styles.streakIconBox, { backgroundColor: EXERCISE_COLOR + "22" }]}>
              <Ionicons name="fitness-outline" size={16} color={EXERCISE_COLOR} />
            </View>
            <View style={styles.streakTextContainer}>
              <Text style={styles.streakLabel}>Exercise</Text>
              <Text style={[styles.streakStat, { color: EXERCISE_COLOR }]}>
                {monthStats.exerciseDays} {monthStats.exerciseDays === 1 ? "day" : "days"}
              </Text>
            </View>
          </View>

          {/* Custom Trackers */}
          {trackers.map((tracker) => (
            <View key={tracker.id} style={styles.streakItem}>
              <View style={[styles.streakIconBox, { backgroundColor: tracker.color + "22" }]}>
                {isEmoji(tracker.icon) ? (
                  <Text style={styles.streakEmoji}>{tracker.icon}</Text>
                ) : (
                  <Ionicons
                    name={tracker.icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={tracker.color}
                  />
                )}
              </View>
              <View style={styles.streakTextContainer}>
                <Text style={styles.streakLabel} numberOfLines={1}>{tracker.name}</Text>
                <Text style={[styles.streakStat, { color: tracker.color }]}>
                  {monthStats.trackerDays[tracker.id] || 0}{" "}
                  {(monthStats.trackerDays[tracker.id] ?? 0) === 1 ? "day" : "days"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgMain,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  weekHeader: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  weekDayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  weekDayText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  dayContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  todayCell: {
    backgroundColor: colors.brandTeal,
    borderRadius: 8,
  },
  activeCell: {
    backgroundColor: colors.bgMain,
    borderRadius: 8,
  },
  dayNumber: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  todayDayNumber: {
    color: "#fff",
    fontWeight: "700",
  },
  futureDayNumber: {
    color: colors.borderSubtle,
    opacity: 0.4,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    gap: 2,
  },
  dotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  streaksContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  streaksTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  streaksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  streakItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "48%",
    backgroundColor: colors.bgMain,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  streakIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  streakEmoji: {
    fontSize: 14,
  },
  streakTextContainer: {
    flex: 1,
  },
  streakLabel: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  streakStat: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  legendContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  legendTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.bgMain,
    borderRadius: radii.pill,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary,
    maxWidth: 100,
  },
});
