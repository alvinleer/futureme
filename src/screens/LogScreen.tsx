import React, { useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useDietStore from "../state/dietStore";
import { TrackerEntry, Meal } from "../types/diet";
import { colors, spacing, radii, shadows } from "../theme";

const isEmoji = (str: string) => {
  const emojiRegex = /\p{Emoji}/u;
  return emojiRegex.test(str) && str.length <= 4;
};

type LogItem = {
  type: "tracker" | "meal";
  id: string;
  timestamp: number;
  data: TrackerEntry | Meal;
};

type DaySection = {
  title: string;
  date: string;
  data: LogItem[];
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) return "Today";
  if (dateOnly.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export default function LogScreen() {
  const insets = useSafeAreaInsets();

  const trackers = useDietStore((s) => s.trackers);
  const trackerEntries = useDietStore((s) => s.trackerEntries);
  const meals = useDietStore((s) => s.meals);

  const sections = useMemo(() => {
    const dateMap: Record<string, LogItem[]> = {};

    trackerEntries.forEach((entry) => {
      if (!dateMap[entry.date]) dateMap[entry.date] = [];
      dateMap[entry.date].push({
        type: "tracker",
        id: entry.id,
        timestamp: entry.timestamp,
        data: entry,
      });
    });

    meals.forEach((meal) => {
      const mealDate = new Date(meal.timestamp).toISOString().split("T")[0];
      if (!dateMap[mealDate]) dateMap[mealDate] = [];
      dateMap[mealDate].push({
        type: "meal",
        id: meal.id,
        timestamp: meal.timestamp,
        data: meal,
      });
    });

    const sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => ({
      title: formatDate(date),
      date,
      data: dateMap[date].sort((a, b) => b.timestamp - a.timestamp),
    })) as DaySection[];
  }, [trackerEntries, meals]);

  const getTrackerById = (trackerId: string) =>
    trackers.find((t) => t.id === trackerId);

  const renderTrackerEntry = (entry: TrackerEntry) => {
    const tracker = getTrackerById(entry.trackerId);
    if (!tracker) return null;
    return (
      <View style={styles.itemRow}>
        <View
          style={[
            styles.itemIcon,
            { backgroundColor: tracker.color + "22" },
          ]}
        >
          {isEmoji(tracker.icon) ? (
            <Text style={{ fontSize: 18 }}>{tracker.icon}</Text>
          ) : (
            <Ionicons
              name={tracker.icon as keyof typeof Ionicons.glyphMap}
              size={18}
              color={tracker.color}
            />
          )}
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle}>{tracker.name}</Text>
          <Text style={styles.itemTime}>{formatTime(entry.timestamp)}</Text>
        </View>
        <View style={styles.itemValue}>
          {tracker.type === "counter" ? (
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={[styles.valueNumber, { color: tracker.color }]}>
                {entry.value}
              </Text>
              {tracker.goal ? (
                <Text style={styles.valueUnit}>/{tracker.goal}</Text>
              ) : null}
            </View>
          ) : (
            <View
              style={[
                styles.checkCircle,
                {
                  backgroundColor:
                    entry.value === 1 ? tracker.color : colors.bgSection,
                },
              ]}
            >
              <Ionicons
                name={entry.value === 1 ? "checkmark" : "close"}
                size={16}
                color={entry.value === 1 ? "#fff" : colors.textMuted}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderMealEntry = (meal: Meal) => (
    <View style={styles.itemRow}>
      <View style={[styles.itemIcon, { backgroundColor: "#ad350a18" }]}>
        <Ionicons name="restaurant" size={18} color={colors.brandOrange} />
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{meal.description}</Text>
        <Text style={styles.itemTime}>{formatTime(meal.timestamp)}</Text>
      </View>
      <View style={styles.itemValue}>
        <Text style={[styles.valueNumber, { color: colors.textPrimary }]}>
          {meal.calories}
        </Text>
        <Text style={styles.valueUnit}>cal</Text>
      </View>
    </View>
  );

  const renderItem = ({ item, index, section }: { item: LogItem; index: number; section: DaySection }) => {
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;
    return (
      <View
        style={[
          styles.card,
          isFirst && styles.cardFirst,
          isLast && styles.cardLast,
          !isFirst && styles.cardMiddle,
        ]}
      >
        {item.type === "tracker"
          ? renderTrackerEntry(item.data as TrackerEntry)
          : renderMealEntry(item.data as Meal)}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: DaySection }) => {
    const dayMeals = section.data
      .filter((item) => item.type === "meal")
      .map((item) => item.data as Meal);
    const dayTrackers = section.data.filter((item) => item.type === "tracker");
    const totalCalories = dayMeals.reduce((sum, meal) => sum + meal.calories, 0);
    const trackersLogged = new Set(
      (section.data
        .filter((i) => i.type === "tracker")
        .map((i) => (i.data as TrackerEntry).trackerId))
    ).size;

    return (
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionDate}>{section.title}</Text>
        </View>
        <View style={styles.sectionMeta}>
          {totalCalories > 0 && (
            <View style={styles.metaPill}>
              <Ionicons name="flame" size={12} color={colors.brandOrange} />
              <Text style={styles.metaText}>{totalCalories} cal</Text>
            </View>
          )}
          {trackersLogged > 0 && (
            <View style={[styles.metaPill, { marginLeft: 6 }]}>
              <Ionicons name="checkbox" size={12} color={colors.brandTeal} />
              <Text style={[styles.metaText, { color: colors.brandTeal }]}>
                {trackersLogged} tracked
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {sections.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Logs Yet</Text>
          <Text style={styles.emptyBody}>
            Start tracking your meals and habits to see your history here.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{
            paddingBottom: 120,
            paddingTop: insets.top + 16,
          }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionDate: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    ...shadows.card,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brandOrange,
  },

  // Cards — grouped look (first/middle/last)
  card: {
    backgroundColor: colors.bgCard,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  cardFirst: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    ...shadows.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
  },
  cardLast: {
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    borderBottomWidth: 0,
    marginBottom: spacing.sm,
  },
  cardMiddle: {},

  // Item row layout
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  itemTime: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemValue: {
    alignItems: "flex-end",
  },
  valueNumber: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  valueUnit: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },

  // Compat alias
  bgSection: {
    backgroundColor: colors.bgSection,
  } as any,
});
