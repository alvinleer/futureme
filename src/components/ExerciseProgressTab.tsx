import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Polyline, Circle } from "react-native-svg";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { TodaysPlanCard } from "./TodaysPlanCard";
import {
  ExerciseTrend,
  buildExerciseTrends,
  sessionMinutes,
  sessionVolume,
  summarizeSession,
} from "../utils/exerciseProgress";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SPARK_W = 96;
const SPARK_H = 34;

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const daysAgo = (ts: number) => {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "Last week";
  return `${Math.floor(d / 7)} weeks ago`;
};

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) {
    return <View style={{ width: SPARK_W, height: SPARK_H }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = SPARK_W / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(SPARK_H - 3 - ((v - min) / range) * (SPARK_H - 6)).toFixed(1)}`)
    .join(" ");
  const lastX = (values.length - 1) * stepX;
  const lastY = SPARK_H - 3 - ((values[values.length - 1] - min) / range) * (SPARK_H - 6);
  const stroke = positive ? colors.brandTeal : colors.brandOrange;
  return (
    <Svg width={SPARK_W} height={SPARK_H}>
      <Polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={lastX} cy={lastY} r={3} fill={stroke} />
    </Svg>
  );
}

function ChangeBadge({ pct, size = "md" }: { pct: number | null; size?: "sm" | "md" }) {
  if (pct === null) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.bgSection }]}>
        <Text style={[styles.badgeText, { color: colors.textMuted, fontSize: size === "sm" ? 10 : 12 }]}>
          First log
        </Text>
      </View>
    );
  }
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const tint = flat ? colors.textMuted : up ? colors.brandTeal : colors.brandOrange;
  return (
    <View style={[styles.badge, { backgroundColor: flat ? colors.bgSection : up ? "rgba(0,206,209,0.12)" : "rgba(242,90,35,0.12)" }]}>
      <Ionicons
        name={flat ? "remove" : up ? "trending-up" : "trending-down"}
        size={size === "sm" ? 11 : 13}
        color={tint}
      />
      <Text style={[styles.badgeText, { color: tint, fontSize: size === "sm" ? 10 : 12 }]}>
        {flat ? "Same" : `${up ? "+" : ""}${pct}%`}
      </Text>
    </View>
  );
}

export default function ExerciseProgressTab() {
  const navigation = useNavigation<Nav>();
  const workoutSessions = useDietStore((s) => s.workoutSessions);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const isMetric = unitSystem === "metric";

  const [selected, setSelected] = useState<ExerciseTrend | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "improved">("recent");

  const trends = useMemo(
    () => buildExerciseTrends(workoutSessions, isMetric),
    [workoutSessions, isMetric]
  );

  const sortedTrends = useMemo(() => {
    if (sortBy === "recent") return trends;
    return [...trends].sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  }, [trends, sortBy]);

  const recentSessions = useMemo(
    () => [...workoutSessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8),
    [workoutSessions]
  );

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = workoutSessions.filter((s) => s.timestamp >= weekAgo);
    const improving = trends.filter((t) => (t.changePct ?? 0) > 0).length;
    const tracked = trends.filter((t) => t.sessionCount > 1).length;
    return {
      sessionsThisWeek: thisWeek.length,
      minutesThisWeek: thisWeek.reduce((sum, s) => sum + sessionMinutes(s), 0),
      improving,
      tracked,
      exercises: trends.length,
    };
  }, [workoutSessions, trends]);

  const openLog = (sessionId?: string) =>
    navigation.navigate("LogWorkoutSession", sessionId ? { sessionId } : {});

  if (workoutSessions.length === 0) {
    return (
      <View>
        <TodaysPlanCard />
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="barbell-outline" size={30} color={colors.brandTeal} />
          </View>
          <Text style={styles.emptyTitle}>No sessions logged yet</Text>
          <Text style={styles.emptyText}>
            Log a workout and pick the exercises you did. From your second session on, every
            exercise shows how much you improved since the last time you tracked it.
          </Text>
          <Pressable style={styles.primaryCta} onPress={() => openLog()}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.primaryCtaText}>Log your first session</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <TodaysPlanCard />

      {/* Summary strip */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.sessionsThisWeek}</Text>
          <Text style={styles.statLabel}>sessions{"\n"}this week</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.minutesThisWeek}</Text>
          <Text style={styles.statLabel}>minutes{"\n"}this week</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.brandTeal }]}>{stats.improving}</Text>
          <Text style={styles.statLabel}>exercises{"\n"}improving</Text>
        </View>
      </View>

      <Pressable style={styles.primaryCta} onPress={() => openLog()}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.primaryCtaText}>Log new session</Text>
      </Pressable>

      {/* Per-exercise trends */}
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Exercise Trends</Text>
          <Text style={styles.sectionSub}>
            % change since the last time you tracked each exercise
          </Text>
        </View>
      </View>

      {trends.length > 1 && (
        <View style={styles.sortRow}>
          {(["recent", "improved"] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setSortBy(k)}
              style={[styles.sortChip, sortBy === k && styles.sortChipActive]}
            >
              <Text style={[styles.sortChipText, sortBy === k && { color: "#fff" }]}>
                {k === "recent" ? "Most recent" : "Biggest gains"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {trends.length === 0 ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Your sessions do not have measurable entries yet. Add weight, reps, minutes or distance
            when you log so trends can be calculated.
          </Text>
        </View>
      ) : (
        sortedTrends.map((t, i) => {
          const positive = (t.changePct ?? 0) >= 0;
          const isPr = t.latest.value >= t.best.value && t.sessionCount > 1;
          return (
            <Animated.View key={t.exerciseKey} entering={FadeInDown.duration(240).delay(i * 25)}>
              <Pressable style={styles.trendCard} onPress={() => setSelected(t)}>
                <View style={styles.trendTop}>
                  <View style={styles.trendIcon}>
                    <Ionicons name={t.icon as any} size={15} color={colors.brandTeal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trendName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={styles.trendMeta}>
                      {t.sessionCount} session{t.sessionCount === 1 ? "" : "s"} · {daysAgo(t.lastLogged)}
                    </Text>
                  </View>
                  <ChangeBadge pct={t.changePct} />
                </View>

                <View style={styles.trendBottom}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trendMetricLabel}>{t.metricLabel.toUpperCase()}</Text>
                    <View style={styles.trendValueRow}>
                      <Text style={styles.trendValue}>{t.latest.value}</Text>
                      <Text style={styles.trendUnit}>{t.unit}</Text>
                      {isPr && (
                        <View style={styles.prTag}>
                          <Ionicons name="trophy" size={10} color={colors.brandOrange} />
                          <Text style={styles.prTagText}>PR</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.trendDetail} numberOfLines={1}>
                      {t.latest.detail}
                    </Text>
                  </View>
                  <Sparkline values={t.points.map((p) => p.value)} positive={positive} />
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}

      {/* Recent sessions */}
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          <Text style={styles.sectionSub}>Tap a session to edit what you logged</Text>
        </View>
      </View>

      {recentSessions.map((s) => (
        <Pressable key={s.id} style={styles.sessionRow} onPress={() => openLog(s.id)}>
          <View style={styles.sessionDateBox}>
            <Text style={styles.sessionDateMon}>
              {new Date(s.timestamp).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
            </Text>
            <Text style={styles.sessionDateDay}>{new Date(s.timestamp).getDate()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {s.title?.trim() || summarizeSession(s)}
            </Text>
            <Text style={styles.sessionMeta}>
              {s.exercises.length} exercise{s.exercises.length === 1 ? "" : "s"} · {sessionMinutes(s)} min
              {sessionVolume(s, isMetric) > 0
                ? ` · ${sessionVolume(s, isMetric).toLocaleString()} ${isMetric ? "kg" : "lb"} volume`
                : ""}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </Pressable>
      ))}

      {/* Detail modal */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.trendIcon}>
                    <Ionicons name={selected.icon as any} size={16} color={colors.brandTeal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      {selected.name}
                    </Text>
                    <Text style={styles.trendMeta}>
                      Tracked by {selected.metricLabel.toLowerCase()} ({selected.unit})
                    </Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>SINCE LAST</Text>
                    <ChangeBadge pct={selected.changePct} size="sm" />
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>ALL TIME</Text>
                    <ChangeBadge pct={selected.totalChangePct} size="sm" />
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>BEST</Text>
                    <Text style={styles.modalStatValue}>
                      {selected.best.value} {selected.unit}
                    </Text>
                  </View>
                </View>

                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {[...selected.points].reverse().map((p, idx, arr) => {
                    const prior = arr[idx + 1];
                    const pct =
                      prior && prior.value > 0
                        ? Math.round(((p.value - prior.value) / prior.value) * 1000) / 10
                        : null;
                    return (
                      <View key={p.sessionId} style={styles.historyRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyDate}>{formatDate(p.timestamp)}</Text>
                          <Text style={styles.historyDetail}>{p.detail}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 3 }}>
                          <Text style={styles.historyValue}>
                            {p.value} {selected.unit}
                          </Text>
                          <ChangeBadge pct={pct} size="sm" />
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <Pressable
                  style={styles.primaryCta}
                  onPress={() => {
                    setSelected(null);
                    openLog();
                  }}
                >
                  <Ionicons name="add" size={17} color="#fff" />
                  <Text style={styles.primaryCtaText}>Log this again</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,206,209,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.brandTeal,
    borderRadius: radii.pill,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  primaryCtaText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  statRow: { flexDirection: "row", gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 2,
    lineHeight: 13,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sortRow: { flexDirection: "row", gap: 7, marginBottom: spacing.sm },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  sortChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  sortChipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  infoCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  infoText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  trendCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  trendTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  trendIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(0,206,209,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  trendName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  trendMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  trendBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 10,
  },
  trendMetricLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.7, color: colors.textMuted },
  trendValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 1 },
  trendValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  trendUnit: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  prTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: "rgba(242,90,35,0.12)",
  },
  prTagText: { fontSize: 9, fontWeight: "800", color: colors.brandOrange },
  trendDetail: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeText: { fontWeight: "800" },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.sm,
    marginBottom: 7,
  },
  sessionDateBox: {
    width: 42,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSection,
    alignItems: "center",
  },
  sessionDateMon: { fontSize: 9, fontWeight: "700", color: colors.textMuted },
  sessionDateDay: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  sessionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  sessionMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalStatsRow: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md },
  modalStat: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgSection,
  },
  modalStatLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.6, color: colors.textMuted },
  modalStatValue: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  historyDate: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  historyDetail: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  historyValue: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
});
