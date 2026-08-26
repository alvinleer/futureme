import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  Image,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Sharing from "expo-sharing";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import useFuturePhotoStore from "../state/futurePhotoStore";
import StepsExerciseCard from "../components/StepsExerciseCard";
import SetupGuideCard from "../components/SetupGuideCard";
import { RootTabParamList, RootStackParamList } from "../navigation/RootNavigator";
import { colors, spacing, radii, shadows } from "../theme";
import { calculateComplianceMetrics } from "../api/future-photo-service";
import { calculateDailyActivityAdjustment, calculateWaterGoalLiters, convertWaterLitersToUnit } from "../types/onboarding";
import { getOpenAITextResponse } from "../api/chat-service";
import { MICRONUTRIENTS } from "../data/micronutrients";
import { resolvePhotoUri } from "../utils/photoStorage";
import { PROTEIN_HIT_RATIO } from "../utils/protein";

const { width: SCREEN_W } = Dimensions.get("window");

const toDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const isEmoji = (str: string) => /\p{Emoji}/u.test(str) && str.length <= 4;

type NavProp = BottomTabNavigationProp<RootTabParamList, "Home"> &
  NativeStackNavigationProp<RootStackParamList>;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getSundayKey(now: Date): string {
  const d = new Date(now);
  if (d.getDay() === 1) d.setDate(d.getDate() - 1); // Monday → back to Sunday
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isWeeklyReviewWindow(now: Date): boolean {
  const day = now.getDay();
  const h = now.getHours();
  return (day === 0 && h >= 20) || (day === 1 && h < 8);
}

// ── Weekly Review Card ────────────────────────────────────────────────────────
function WeeklyReviewCard() {
  const navigation = useNavigation<NavProp>();
  const meals = useDietStore((s) => s.meals);
  const workouts = useDietStore((s) => s.workouts);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const trackers = useDietStore((s) => s.trackers);
  const trackerEntries = useDietStore((s) => s.trackerEntries);
  const dismissedKey = useDietStore((s) => s.weeklyReviewDismissedKey);
  const dismissWeeklyReview = useDietStore((s) => s.dismissWeeklyReview);
  const weeklyPhotoRevealedKey = useDietStore((s) => s.weeklyPhotoRevealedKey);
  const progressPhotos = useDietStore((s) => s.progressPhotos);
  const weightGoal = useDietStore((s) => s.weightGoal);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const revealWeeklyPhoto = useDietStore((s) => s.revealWeeklyPhoto);
  const generatedPhotoUrl = resolvePhotoUri(useFuturePhotoStore((s) => s.generatedPhotoUrl));
  const goalEndDate = useFuturePhotoStore((s) => s.goalEndDate);

  const [now] = useState(() => new Date());
  const inWindow = isWeeklyReviewWindow(now);
  const currentKey = getSundayKey(now);
  const alreadyDismissed = dismissedKey === currentKey;
  const photoAlreadyRevealed = weeklyPhotoRevealedKey === currentKey;

  const [weightConfirmed, setWeightConfirmed] = useState<boolean | null>(null);
  const [photoConfirmed, setPhotoConfirmed] = useState<boolean | null>(null);

  // Derived check-in data
  const currentWeight = weightGoal?.currentWeight ?? 0;
  // currentWeight is stored internally in lbs
  const displayWeight = unitSystem === "imperial"
    ? `${Math.round(currentWeight)} lbs`
    : `${(currentWeight / 2.20462).toFixed(1)} kg`;
  const latestPhotos = useMemo(() => {
    return [...progressPhotos]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3);
  }, [progressPhotos]);

  const stats = useMemo(() => {
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const dayMap: Record<string, { cal: number; protein: number }> = {};
    const recentMeals = meals.filter((m) => m.timestamp >= sevenDaysAgo);
    for (const m of recentMeals) {
      const d = new Date(m.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!dayMap[key]) dayMap[key] = { cal: 0, protein: 0 };
      dayMap[key].cal += m.calories;
      dayMap[key].protein += m.protein;
    }
    const loggedDays = Object.keys(dayMap).length;
    const calGoal = nutritionGoal.dailyCalories;
    const protGoal = nutritionGoal.dailyProtein;
    const daysOnCal = Object.values(dayMap).filter((d) => d.cal >= calGoal * 0.85 && d.cal <= calGoal * 1.15).length;
    const daysOnProt = Object.values(dayMap).filter((d) => d.protein >= protGoal * 0.8).length;
    const calPct = loggedDays > 0 ? Math.round((daysOnCal / loggedDays) * 100) : 0;
    const protPct = loggedDays > 0 ? Math.round((daysOnProt / loggedDays) * 100) : 0;
    const weekWorkouts = workouts.filter((w) => w.timestamp >= sevenDaysAgo).length;

    let pledgePct = 0;
    const activePledges = trackers.filter((t) => t.showOnHome);
    if (activePledges.length > 0) {
      let total = 0; let hit = 0;
      for (const t of activePledges) {
        const entries = trackerEntries.filter((e) => e.trackerId === t.id);
        total += entries.length;
        for (const e of entries) {
          if (t.type === "boolean") hit += e.value === 1 ? 1 : 0;
          else if (t.goal) hit += e.value >= t.goal ? 1 : 0;
        }
      }
      pledgePct = total > 0 ? Math.round((hit / total) * 100) : 0;
    }

    const sunday = new Date(now);
    if (sunday.getDay() === 1) sunday.setDate(sunday.getDate() - 1);
    const mondayOfWeek = new Date(sunday);
    mondayOfWeek.setDate(mondayOfWeek.getDate() - 6);
    const dateRange = `${mondayOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    return { loggedDays, calPct, protPct, weekWorkouts, pledgePct, hasPledges: activePledges.length > 0, dateRange };
  }, [meals, workouts, nutritionGoal, trackers, trackerEntries]);

  const handleReveal = useCallback(() => {
    revealWeeklyPhoto();
    dismissWeeklyReview();
  }, [revealWeeklyPhoto, dismissWeeklyReview]);

  if (!inWindow || alreadyDismissed) return null;

  return (
    <Animated.View entering={FadeInDown.duration(500).springify()} style={wrStyles.wrapper}>
      {/* Header */}
      <LinearGradient
        colors={["#0a3d39", "#0d4f49"]}
        style={wrStyles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={wrStyles.headerLeft}>
          <View style={wrStyles.headerIconBox}>
            <Ionicons name="trophy" size={14} color="#5eead4" />
          </View>
          <View>
            <Text style={wrStyles.eyebrow}>WEEK IN REVIEW</Text>
            <Text style={wrStyles.dateRange}>{stats.dateRange}</Text>
          </View>
        </View>
        <Pressable onPress={dismissWeeklyReview} hitSlop={12} style={wrStyles.closeBtn}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </LinearGradient>

      {/* Stats pills row */}
      <View style={wrStyles.statsPillRow}>
        <View style={wrStyles.statPill}>
          <Ionicons name="calendar-outline" size={12} color="#5eead4" />
          <Text style={wrStyles.statPillText}>{stats.loggedDays}/7 days</Text>
        </View>
        <View style={wrStyles.statPill}>
          <Ionicons name="barbell-outline" size={12} color="#5eead4" />
          <Text style={wrStyles.statPillText}>{stats.weekWorkouts} workouts</Text>
        </View>
        <View style={wrStyles.statPill}>
          <Ionicons name="flame-outline" size={12} color="#5eead4" />
          <Text style={wrStyles.statPillText}>{stats.calPct}% on target</Text>
        </View>
        <View style={wrStyles.statPill}>
          <Ionicons name="nutrition-outline" size={12} color="#5eead4" />
          <Text style={wrStyles.statPillText}>{stats.protPct}% protein</Text>
        </View>
      </View>

      {/* FutureMe Check-in */}
      {(currentWeight > 0 || latestPhotos.length > 0) && (
        <View style={wrStyles.checkinSection}>
          <View style={wrStyles.checkinHeader}>
            <View style={wrStyles.checkinAvatarDot} />
            <Text style={wrStyles.checkinLabel}>FUTURE ME ASKS</Text>
          </View>

          {/* Weight check */}
          {currentWeight > 0 && (
            <View style={wrStyles.checkinRow}>
              <Text style={wrStyles.checkinQuestion}>
                {"Do you still weigh "}
                <Text style={wrStyles.checkinHighlight}>{displayWeight}</Text>
                {"?"}
              </Text>
              {weightConfirmed === null ? (
                <View style={wrStyles.checkinBtnRow}>
                  <Pressable
                    style={wrStyles.checkinYesBtn}
                    onPress={() => setWeightConfirmed(true)}
                  >
                    <Text style={wrStyles.checkinYesBtnText}>Yes</Text>
                  </Pressable>
                  <Pressable
                    style={wrStyles.checkinNoBtn}
                    onPress={() => {
                      setWeightConfirmed(false);
                      navigation.navigate("Camera");
                    }}
                  >
                    <Text style={wrStyles.checkinNoBtnText}>No, change</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={wrStyles.checkinConfirmed}>
                  <Ionicons
                    name={weightConfirmed ? "checkmark-circle" : "arrow-forward-circle"}
                    size={16}
                    color={weightConfirmed ? "#22c55e" : "#5eead4"}
                  />
                  <Text style={[wrStyles.checkinConfirmedText, { color: weightConfirmed ? "#22c55e" : "#5eead4" }]}>
                    {weightConfirmed ? "Confirmed" : "Updating..."}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Photo check */}
          {latestPhotos.length > 0 && (
            <View style={[wrStyles.checkinRow, { marginTop: currentWeight > 0 ? 14 : 0 }]}>
              <Text style={wrStyles.checkinQuestion}>{"Do you still look like this?"}</Text>
              <View style={wrStyles.checkinPhotoRow}>
                {latestPhotos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: resolvePhotoUri(photo.uri) ?? photo.uri }}
                    style={wrStyles.checkinThumb}
                  />
                ))}
              </View>
              {photoConfirmed === null ? (
                <View style={[wrStyles.checkinBtnRow, { marginTop: 10 }]}>
                  <Pressable
                    style={wrStyles.checkinYesBtn}
                    onPress={() => setPhotoConfirmed(true)}
                  >
                    <Text style={wrStyles.checkinYesBtnText}>Yes</Text>
                  </Pressable>
                  <Pressable
                    style={wrStyles.checkinNoBtn}
                    onPress={() => {
                      setPhotoConfirmed(false);
                      navigation.navigate("Progress");
                    }}
                  >
                    <Text style={wrStyles.checkinNoBtnText}>No, update photo</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={[wrStyles.checkinConfirmed, { marginTop: 10 }]}>
                  <Ionicons
                    name={photoConfirmed ? "checkmark-circle" : "arrow-forward-circle"}
                    size={16}
                    color={photoConfirmed ? "#22c55e" : "#5eead4"}
                  />
                  <Text style={[wrStyles.checkinConfirmedText, { color: photoConfirmed ? "#22c55e" : "#5eead4" }]}>
                    {photoConfirmed ? "Confirmed" : "Adding new photo..."}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* FutureMe Photo Reveal */}
      {generatedPhotoUrl && !photoAlreadyRevealed && (
        <View style={wrStyles.revealSection}>
          <Pressable onPress={handleReveal} style={wrStyles.revealBtn}>
            <Ionicons name="eye-outline" size={16} color="#0a3d39" />
            <Text style={wrStyles.revealBtnText}>Reveal your weekly update</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const wrStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    overflow: "hidden",
    shadowColor: "#1e206a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
    backgroundColor: colors.bgCard,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(94,234,212,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
  },
  dateRange: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 4,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(94,234,212,0.08)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(94,234,212,0.15)",
  },
  statPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5eead4",
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  section: {},
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: 6,
    paddingLeft: 2,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  noDataText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  // Photo reveal section
  photoSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  photoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
  },
  photoLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.3,
    color: "#5eead4",
    textTransform: "uppercase",
  },
  photoContainer: {
    width: "100%",
    height: 320,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  revealOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  revealTextBox: {
    alignItems: "center",
    gap: 8,
  },
  revealHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  revealSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: "center",
  },
  revealBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#5eead4",
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 30,
  },
  revealBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0a3d39",
    letterSpacing: 0.3,
  },
  checkinSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(13,110,110,0.1)",
  },
  checkinHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  checkinAvatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0d6e6e",
  },
  checkinLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#0d6e6e",
    textTransform: "uppercase",
  },
  checkinRow: {},
  checkinQuestion: {
    fontSize: 14,
    fontWeight: "500",
    color: "#3d4a3a",
    marginBottom: 8,
  },
  checkinHighlight: {
    fontWeight: "700",
    color: "#0d6e6e",
  },
  checkinBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  checkinYesBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "rgba(13,110,110,0.1)",
    borderWidth: 1,
    borderColor: "rgba(13,110,110,0.2)",
    alignItems: "center",
  },
  checkinYesBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0d6e6e",
  },
  checkinNoBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
  },
  checkinNoBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5a6061",
  },
  checkinConfirmed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkinConfirmedText: {
    fontSize: 13,
    fontWeight: "600",
  },
  checkinPhotoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  checkinThumb: {
    width: 64,
    height: 80,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
});

// ── Post-Reveal Weekly Summary Card ──────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const isToday = toDateString(selectedDate) === toDateString(new Date());
  const selectedDateStr = toDateString(selectedDate);

  // Diet store
  const meals = useDietStore((s) => s.meals);
  const workouts = useDietStore((s) => s.workouts);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const trackers = useDietStore((s) => s.trackers);
  const trackerEntries = useDietStore((s) => s.trackerEntries);
  const incrementTracker = useDietStore((s) => s.incrementTracker);
  const decrementTracker = useDietStore((s) => s.decrementTracker);
  const toggleBooleanTracker = useDietStore((s) => s.toggleBooleanTracker);
  const getTrackerValueForDate = useDietStore((s) => s.getTrackerValueForDate);

  const maintenanceCalories = useDietStore((s) => s.maintenanceCalories);
  const weightGoal = useDietStore((s) => s.weightGoal);
  const stepEntries = useDietStore((s) => s.stepEntries);
  const getStepsForDate = useDietStore((s) => s.getStepsForDate);
  const getWorkoutsForDate = useDietStore((s) => s.getWorkoutsForDate);
  const activityProfile = useOnboardingStore((s) => s.activityProfile);
  const onboardingStats = useOnboardingStore((s) => s.stats);
  const trackedMicronutrients = useOnboardingStore((s) => s.trackedMicronutrients);
  const micronutrientTargets = useOnboardingStore((s) => s.micronutrientTargets);
  const onboardingGoal = useOnboardingStore((s) => s.goal);
  const getDailyMicronutrientsForDate = useDietStore((s) => s.getDailyMicronutrientsForDate);
  const coachMessagesEnabled = useDietStore((s) => s.coachMessagesEnabled);

  // Meal edit — navigate to full-page screen
  const openEditMeal = (meal: { id: string }) => {
    navigation.navigate("EditFoodEntry", { mealId: meal.id });
  };

  // Onboarding
  const isOnboardingComplete = useOnboardingStore((s) => s.isComplete);

  // Future photo
  const goalEndDate = useFuturePhotoStore((s) => s.goalEndDate);
  const generatedPhotoUrl = resolvePhotoUri(useFuturePhotoStore((s) => s.generatedPhotoUrl));
  const beforePhotoUri = resolvePhotoUri(useFuturePhotoStore((s) => s.beforePhotoUri));
  const workoutStats = useFuturePhotoStore((s) => s.workoutStats);
  const lastComplianceRate = useFuturePhotoStore((s) => s.lastComplianceRate);
  const weeklyPhotoRevealedKey = useDietStore((s) => s.weeklyPhotoRevealedKey);
  const revealWeeklyPhoto = useDietStore((s) => s.revealWeeklyPhoto);

  const handleHeroShare = useCallback(async () => {
    const photoUri = generatedPhotoUrl || beforePhotoUri;
    if (!photoUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(photoUri);
    } catch {}
  }, [generatedPhotoUrl, beforePhotoUri]);

  // Hero reveal: blurred until user taps "Reveal"
  const heroWeekKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }, []);
  const heroPhotoRevealed = weeklyPhotoRevealedKey === heroWeekKey;

  // Day meals
  const dayStart = selectedDate.getTime();
  const dayEnd = dayStart + 86400000;
  const dayMeals = useMemo(
    () => meals.filter((m) => m.timestamp >= dayStart && m.timestamp < dayEnd),
    [meals, dayStart, dayEnd]
  );

  const totalCal = dayMeals.reduce((s, m) => s + m.calories, 0);
  const totalPro = dayMeals.reduce((s, m) => s + m.protein, 0);
  const totalCarb = dayMeals.reduce((s, m) => s + m.carbs, 0);
  const totalFat = dayMeals.reduce((s, m) => s + m.fat, 0);

  // Activity-adjusted calorie goal: bakes in actual steps + workouts vs. profile baseline
  const activityAdjustment = useMemo(() => {
    if (!activityProfile) return 0;
    const actualSteps = getStepsForDate(selectedDateStr);
    const dayWorkoutsForAdj = getWorkoutsForDate(selectedDateStr);
    return calculateDailyActivityAdjustment(activityProfile, actualSteps, dayWorkoutsForAdj);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityProfile, stepEntries, workouts, selectedDateStr]);

  const adjustedCalorieGoal = nutritionGoal.dailyCalories + activityAdjustment;

  const remaining = adjustedCalorieGoal - totalCal;
  const calPct = Math.min((totalCal / adjustedCalorieGoal) * 100, 100);
  const proPct = Math.min((totalPro / nutritionGoal.dailyProtein) * 100, 100);
  const carbPct = Math.min((totalCarb / nutritionGoal.dailyCarbs) * 100, 100);
  const fatPct = Math.min((totalFat / nutritionGoal.dailyFat) * 100, 100);

  const proteinHit = nutritionGoal.dailyProtein > 0
    && totalPro >= nutritionGoal.dailyProtein * PROTEIN_HIT_RATIO;

  const isLosingWeight = weightGoal.targetWeight < weightGoal.currentWeight && weightGoal.currentWeight > 0;
  const isGainingWeight = weightGoal.targetWeight > weightGoal.currentWeight && weightGoal.currentWeight > 0;

  // Calories decide how much moves, protein decides whether it is muscle
  const proteinNote = proteinHit
    ? isGainingWeight
      ? "Target hit — your surplus has what it needs to build muscle."
      : "Target hit — this is what keeps the loss off your fat, not your muscle."
    : isGainingWeight
      ? "Hit this or the surplus turns into fat instead of muscle."
      : "Hit this or part of what you lose comes off as muscle.";

  // For gaining: under calories is "bad" (red), over is "good" (teal). Flip for losing.
  const remainingIsBad = isGainingWeight ? remaining > 0 : remaining < 0;
  const remainingLabel = remaining < 0
    ? "OVER"
    : isGainingWeight
      ? "UNDER"
      : "REMAINING";

  // Contextual over-calorie message
  const overCalorieNote = useMemo(() => {
    if (remaining >= 0) return null;
    const overMaintenance = totalCal > maintenanceCalories;
    const overBy = Math.round(totalCal - maintenanceCalories);
    if (isLosingWeight) {
      return overMaintenance
        ? `${overBy} kcal over maintenance.`
        : "Still in a deficit today.";
    }
    if (isGainingWeight) {
      return overMaintenance
        ? `${overBy} kcal over maintenance.`
        : "Still below maintenance today.";
    }
    return null;
  }, [remaining, totalCal, maintenanceCalories, isLosingWeight, isGainingWeight]);

  // Home trackers (max 3)
  const homeTrackers = useMemo(
    () =>
      trackers
        .filter((t) => t.showOnHome)
        .sort((a, b) => a.order - b.order)
        .slice(0, 3),
    [trackers]
  );

  // Dynamic water goal based on user profile + today's workouts
  const dynamicWaterGoal = useMemo(() => {
    if (!onboardingStats || onboardingStats.weightKg <= 0) return null;
    const todayWorkouts = getWorkoutsForDate(selectedDateStr);
    const liters = calculateWaterGoalLiters(onboardingStats.weightKg, onboardingStats.gender, todayWorkouts);
    const waterTracker = trackers.find((t) => t.id === "builtin-water");
    const unit = waterTracker?.unit ?? "glasses";
    return convertWaterLitersToUnit(liters, unit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStats, workouts, selectedDateStr, trackers]);

  // ── Coach Notification (speech bubble after meal log) ──
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [showFoodAddSheet, setShowFoodAddSheet] = useState(false);
  const coachHistoryRef = useRef<{ timestamp: number }[]>([]);
  const prevMealCountForCoachRef = useRef(-1);

  useEffect(() => {
    if (!isToday) return;
    if (!coachMessagesEnabled) return;
    if (dayMeals.length === 0) { prevMealCountForCoachRef.current = 0; return; }
    if (dayMeals.length === prevMealCountForCoachRef.current) return;
    prevMealCountForCoachRef.current = dayMeals.length;

    // Rate limiting: max 2/day, min 3h apart
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayNotifs = coachHistoryRef.current.filter(n => n.timestamp >= todayStart.getTime());
    if (todayNotifs.length >= 2) return;
    if (todayNotifs.length > 0 && now - todayNotifs[todayNotifs.length - 1].timestamp < 3 * 60 * 60 * 1000) return;

    // Skip if too early in the day
    const hour = new Date().getHours();
    const dayProgress = Math.max(0, (hour - 8) / 16);
    if (dayProgress < 0.2) return;

    const cal = Math.round(totalCal);
    const calGoal = nutritionGoal.dailyCalories;
    const pro = Math.round(totalPro);
    const proGoal = nutritionGoal.dailyProtein;
    const carb = Math.round(totalCarb);
    const carbGoal = nutritionGoal.dailyCarbs;
    const fat = Math.round(totalFat);
    const fatGoal = nutritionGoal.dailyFat;
    const remaining = calGoal - cal;
    const mealType = hour < 10 ? "breakfast" : hour < 14 ? "lunch" : hour < 17 ? "snack" : "dinner";

    // Day-level ratios
    const calPct = cal / calGoal;
    const proPct = pro / proGoal;
    const carbPct = carb / carbGoal;
    const fatPct = fat / fatGoal;

    // Only notify when there is a real day-level situation worth mentioning
    const dayLowProtein = proPct < dayProgress - 0.2 && calPct > 0.25;
    const dayFatHigh = fatPct > 0.8;
    const dayCalBudgetTight = remaining < calGoal * 0.25 && dayProgress < 0.8;
    const dayProteinBehind = (proGoal - pro) / proGoal > 0.5 && dayProgress > 0.5;
    const dayOnTrack = proPct >= calPct * 0.8 && fatPct < 0.85 && calPct < 0.95;

    if (!dayLowProtein && !dayFatHigh && !dayCalBudgetTight && !dayProteinBehind && !dayOnTrack) return;

    getOpenAITextResponse([{
      role: "user",
      content: `You are a concise nutrition coach giving a quick tip based on the user's overall day of eating so far.

Daily nutrition progress:
- Calories: ${cal}/${calGoal} (${remaining > 0 ? remaining + " remaining" : Math.abs(remaining) + " over"})
- Protein: ${pro}g / ${proGoal}g (${Math.round(proPct * 100)}% of goal)
- Carbs: ${carb}g / ${carbGoal}g (${Math.round(carbPct * 100)}% of goal)
- Fat: ${fat}g / ${fatGoal}g (${Math.round(fatPct * 100)}% of goal)
- Time of day: ${mealType} time, ${Math.round(dayProgress * 100)}% through the eating day

Write ONE short tip (max 18 words) about what to focus on for the REST of the day based on the overall daily nutrition balance. Be specific — mention which macros to prioritize or limit in remaining meals. Casual tone. No quotes, no trailing punctuation.`
    }], { model: "gpt-4o-mini", temperature: 0.75, maxTokens: 45 }).then(res => {
      const msg = res.content.trim().replace(/^["']|["']$/g, "");
      setCoachMessage(msg);
      coachHistoryRef.current.push({ timestamp: Date.now() });
      setTimeout(() => setCoachMessage(null), 8000);
    }).catch(() => {});
  }, [dayMeals.length, isToday]);

  const goalDateFormatted = useMemo(() => {
    if (!goalEndDate) return null;
    return new Date(goalEndDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [goalEndDate]);

  const onTrackText = "My goal date:";

  return (
    <>
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 },
        ]}
      >
        {/* ── Hero Photo Card — edge-to-edge, top flush, rounded bottom ── */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(50)}
          style={[styles.heroCard, { height: 460 + insets.top }]}
        >
          {/* Layer 1: Always-visible teal gradient */}
          <LinearGradient
            colors={["#5b67cd", "#1e206a"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Layer 2: FutureMe logo text pattern */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {Array.from({ length: 5 }).map((_, r) => (
              <View key={r} style={{ flexDirection: "row", flex: 1, alignItems: "center" }}>
                {Array.from({ length: 2 }).map((_, c) => (
                  <View
                    key={c}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      transform: [{ rotate: "-20deg" }],
                      marginTop: r % 2 === 1 ? 24 : 0,
                    }}
                  >
                    <Text style={{ fontFamily: "Pacifico-Regular", fontSize: 18, color: "rgba(255,255,255,0.07)" }}>
                      {"Future"}
                      <Text style={{ fontFamily: "Pacifico-Regular", fontSize: 18, color: "rgba(255,255,255,0.07)" }}>{"Me"}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* Layer 3: Photo — sits on top of gradient when available */}
          {(generatedPhotoUrl || beforePhotoUri) && (
            <Image
              source={{ uri: (generatedPhotoUrl || beforePhotoUri)! }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          )}

          {/* Layer 4: Goal date gradient overlay */}
          {isOnboardingComplete && goalDateFormatted &&
            (generatedPhotoUrl ? heroPhotoRevealed : !!beforePhotoUri) && (
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]}
              style={styles.heroOverlay}
            >
              <Text style={styles.onTrackLabelOverlay}>{onTrackText}</Text>
              <Text style={styles.goalDateOverlay}>{goalDateFormatted}</Text>
              <View style={styles.goalUnderline} />
            </LinearGradient>
          )}

          {/* Layer 5: Blur — weekly update not yet revealed */}
          {generatedPhotoUrl && !heroPhotoRevealed && (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.heroBlurOverlay}>
                <Ionicons name="eye-off-outline" size={28} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroBlurTitle}>Your weekly update is ready</Text>
                <Pressable onPress={revealWeeklyPhoto} style={styles.heroRevealBtn}>
                  <Ionicons name="eye-outline" size={16} color="#0a3d39" />
                  <Text style={styles.heroRevealBtnText}>Reveal</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Layer 6: Empty state CTA */}
          {!generatedPhotoUrl && !beforePhotoUri && (
            <Pressable
              style={styles.heroEmpty}
              onPress={() =>
                isOnboardingComplete
                  ? navigation.navigate("FuturePhotoSetup")
                  : navigation.navigate("OnboardingStats")
              }
            >
              <View style={styles.heroEmptyIcon}>
                <Ionicons name="body" size={32} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={styles.heroEmptyTitle}>See Your Future Self</Text>
              <Text style={styles.heroEmptySubtitle}>
                {isOnboardingComplete
                  ? "Upload a photo to begin your AI transformation"
                  : "Complete the onboarding to see your Future Self"}
              </Text>
              {!isOnboardingComplete && (
                <Ionicons
                  name="arrow-down"
                  size={20}
                  color="rgba(255,255,255,0.5)"
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </Pressable>
          )}

          {/* Layer 7: Header — floats over everything */}
          <View
            style={[
              styles.header,
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                paddingTop: insets.top + 8,
                paddingHorizontal: spacing.lg,
                marginBottom: 0,
              },
            ]}
          >
            <Pressable
              style={styles.chatIconBtn}
              onPress={() => navigation.navigate("FutureMeChat")}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
            </Pressable>
            <Text
              style={[styles.appTitle, { color: "#fff", flex: 1, textAlign: "center" }]}
              pointerEvents="none"
            >
              {"Future"}<Text style={[styles.appTitleAccent, { color: "#fff" }]}>{"Me"}</Text>
            </Text>
            <Pressable
              style={styles.chatIconBtn}
              onPress={() => setShowFoodAddSheet(true)}
            >
              <Ionicons name="add-circle-outline" size={29} color="#fff" />
            </Pressable>
          </View>

          {/* Layer 8: Share button — bottom right */}
          {(generatedPhotoUrl || beforePhotoUri) && (
            <Pressable style={styles.heroShareBtn} onPress={handleHeroShare}>
              <Ionicons name="share-outline" size={18} color="#fff" />
            </Pressable>
          )}
        </Animated.View>

        {/* ── Content below hero (padded) ───────────────────────── */}
        <View style={{ paddingHorizontal: spacing.lg }}>

        {/* ── Weekly Review Card (Sunday 8pm – Monday 8am) ─────── */}
        <WeeklyReviewCard />

        {/* ── Goal Date Section (no photo state) ────────────────── */}
        {isOnboardingComplete && !generatedPhotoUrl && !beforePhotoUri ? (
          <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.goalSection}>
            <Text style={styles.onTrackLabel}>{onTrackText}</Text>
            {goalDateFormatted ? (
              <>
                <Text style={styles.goalDate}>{goalDateFormatted}</Text>
                <View style={styles.goalUnderline} />
              </>
            ) : null}
          </Animated.View>
        ) : null}

        {/* ── Setup Guide Card (shown until all 3 steps complete) ── */}
        <SetupGuideCard />

        {/* ── Date Switcher ─────────────────────────────────────── */}
        <View style={styles.dateNav}>
          <Pressable onPress={() => {
            setSelectedDate((p) => {
              const d = new Date(p);
              d.setDate(d.getDate() - 1);
              return d;
            });
          }} style={styles.dateArrow}>
            <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={!isToday ? () => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              setSelectedDate(d);
            } : undefined}
            style={styles.dateLabelBtn}
          >
            <Text style={styles.dateNavLabel}>
              {isToday
                ? "Today"
                : selectedDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!isToday) {
                setSelectedDate((p) => {
                  const d = new Date(p);
                  d.setDate(d.getDate() + 1);
                  return d;
                });
              }
            }}
            style={[styles.dateArrow, isToday && { opacity: 0.25 }]}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* ── Pledges Card ─────────────────────────────────────── */}
        {(homeTrackers.length > 0 || isToday) && (
          <Animated.View entering={FadeInDown.duration(500).delay(150)} style={styles.card}>
            {homeTrackers.length === 0 ? (
              <Pressable
                style={styles.pledgesEmpty}
                onPress={() => navigation.navigate("Pledges")}
              >
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.textMuted} />
                <Text style={styles.pledgesEmptyText}>Set up your daily pledges</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={styles.pledgesHeader}
                  onPress={() => navigation.navigate("Pledges")}
                >
                  <Text style={styles.pledgesHeaderTitle}>My Pledges</Text>
                  <View style={styles.pledgesManageBtn}>
                    <Text style={styles.pledgesManageText}>Manage</Text>
                    <Ionicons name="chevron-forward" size={12} color="#00CED1" />
                  </View>
                </Pressable>

                {homeTrackers.map((tracker, idx) => {
                  const value = trackerEntries.find(
                    (e) => e.trackerId === tracker.id && e.date === selectedDateStr
                  )?.value ?? 0;
                  const isWater = tracker.id === "builtin-water";
                  const goal = isWater && dynamicWaterGoal !== null ? dynamicWaterGoal : (tracker.goal ?? 0);
                  const isComplete =
                    tracker.type === "boolean"
                      ? value === 1
                      : goal > 0
                      ? value >= goal
                      : false;

                  return (
                    <View
                      key={tracker.id}
                      style={[
                        styles.pledgeRow,
                        idx < homeTrackers.length - 1 && styles.pledgeRowDivider,
                      ]}
                    >
                      {/* Icon */}
                      <View style={[styles.pledgeIconCircle, tracker.type === "counter" && isComplete && styles.pledgeIconCircleDone]}>
                        {isEmoji(tracker.icon) ? (
                          <Text style={{ fontSize: 18 }}>{tracker.icon}</Text>
                        ) : (
                          <Ionicons
                            name={tracker.icon as keyof typeof Ionicons.glyphMap}
                            size={18}
                            color={tracker.type === "counter" && isComplete ? "#fff" : colors.textPrimary}
                          />
                        )}
                      </View>

                      {/* Label */}
                      <View style={styles.pledgeLabelCol}>
                        <Text style={[styles.pledgeName, isComplete && styles.pledgeNameDone]} numberOfLines={1}>
                          {tracker.name}
                        </Text>
                        {tracker.type === "counter" ? (() => {
                          if (value === 0) return null;
                          const isOverLimit = tracker.goalDirection === "min" && value > goal;
                          const overBy = value - goal;
                          const unit = tracker.unit ? ` ${tracker.unit}` : "";
                          if (isOverLimit) {
                            return <Text style={[styles.pledgeSubtext, { color: "#EF4444" }]}>{overBy}{unit} over target</Text>;
                          }
                          if (goal > 0) {
                            return <Text style={styles.pledgeSubtext}>{value} of {goal}{unit}</Text>;
                          }
                          return <Text style={styles.pledgeSubtext}>{value}{unit} today</Text>;
                        })() : tracker.type === "boolean" && isComplete ? (
                          <Text style={[styles.pledgeSubtext, { color: "#00CED1" }]}>{"Great, target reached!"}</Text>
                        ) : null}
                      </View>

                      {/* Counter: minus + plus buttons. Boolean: single toggle */}
                      {tracker.type === "counter" ? (
                        <View style={styles.pledgeCounterRow}>
                          {value > 0 ? (
                            <Pressable
                              style={styles.pledgeMinusBtn}
                              onPress={() => decrementTracker(tracker.id, selectedDateStr)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="remove" size={16} color="#9CA3AF" />
                            </Pressable>
                          ) : (
                            <View style={{ width: 30 }} />
                          )}
                          <Pressable
                            style={[styles.pledgeCircleBtn, isComplete ? styles.pledgeCircleBtnDone : styles.pledgeCircleBtnOrange]}
                            onPress={() => incrementTracker(tracker.id, selectedDateStr)}
                          >
                            <Ionicons name={isComplete ? "checkmark" : "add"} size={22} color="#fff" />
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.pledgeActionCol}>
                          <Pressable
                            style={[styles.pledgeCircleBtn, styles.pledgeCircleBtnOrange]}
                            onPress={() => toggleBooleanTracker(tracker.id, selectedDateStr)}
                          >
                            <Ionicons
                              name={isComplete ? "checkmark" : "add"}
                              size={22}
                              color="#fff"
                            />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </Animated.View>
        )}

        {/* ── Energy Balance Card ───────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.card}>
          {/* Header row */}
          <View style={styles.energyHeader}>
            <Text style={styles.energyLabel}>MY ENERGY</Text>
            <Pressable onPress={() => navigation.navigate("FavoriteMeals")} hitSlop={8}>
              <Text style={styles.savedMealsLink}>Saved Meals</Text>
            </Pressable>
          </View>

          {/* Large calorie display — eaten left, remaining right */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View style={styles.calorieDisplay}>
              <Text style={styles.calorieNum}>{Math.round(totalCal).toLocaleString()}</Text>
              <View style={styles.calorieSubBlock}>
                <Text style={styles.kcalLabel}>kcal</Text>
                <Text style={styles.eatenLabel}>eaten</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <Text style={[styles.calorieNum, { color: remainingIsBad ? "#FF4444" : colors.brandTeal }]}>
                  {Math.abs(Math.round(remaining)).toLocaleString()}
                </Text>
                <View style={styles.calorieSubBlock}>
                  <Text style={[styles.kcalLabel, { color: remainingIsBad ? "#FF4444" : colors.brandTeal }]}>kcal</Text>
                  <Text style={[styles.eatenLabel, { color: remainingIsBad ? "#FF4444" : colors.brandTeal }]}>{remainingLabel.toLowerCase()}</Text>
                </View>
              </View>
              {overCalorieNote && (
                <Text style={[styles.overCalorieNote, { textAlign: "right", maxWidth: 160 }]}>{overCalorieNote}</Text>
              )}
            </View>
          </View>

          {/* Main progress bar */}
          <View style={styles.mainBar}>
            <View style={[styles.mainBarFill, { width: `${calPct}%` as any }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabelLeft}>0 KCAL</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.barLabelRight}>
                {adjustedCalorieGoal.toLocaleString()} KCAL GOAL
              </Text>
              {activityAdjustment !== 0 && (
                <Text style={[styles.barLabelRight, { color: activityAdjustment > 0 ? colors.brandTeal : "#FF9800", fontSize: 9, marginTop: 1 }]}>
                  {activityAdjustment > 0 ? "+" : ""}{activityAdjustment} from activity
                </Text>
              )}
            </View>
          </View>

          {/* Protein — the second lever after the calorie balance */}
          <View style={styles.proteinBlock}>
            <View style={styles.proteinHeader}>
              <View style={styles.proteinTitleRow}>
                <Ionicons name="nutrition" size={13} color={colors.protein} />
                <Text style={styles.proteinLabel}>PROTEIN</Text>
                <View style={styles.priorityTag}>
                  <Text style={styles.priorityTagText}>PRIORITY #2</Text>
                </View>
              </View>
              {proteinHit ? (
                <View style={styles.proteinTitleRow}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.protein} />
                  <Text style={styles.proteinHitText}>Hit</Text>
                </View>
              ) : (
                <Text style={styles.proteinToGo}>
                  {Math.max(0, Math.round(nutritionGoal.dailyProtein - totalPro))}g to go
                </Text>
              )}
            </View>

            <View style={styles.proteinNumbers}>
              <Text style={styles.proteinBigNum}>{Math.round(totalPro)}</Text>
              <Text style={styles.proteinBigUnit}>
                / {nutritionGoal.dailyProtein}g
              </Text>
            </View>

            <View style={styles.proteinBar}>
              <View
                style={[
                  styles.proteinBarFill,
                  { width: `${proPct}%` as any, backgroundColor: colors.protein },
                ]}
              />
            </View>

            <Text style={styles.proteinNote}>{proteinNote}</Text>
          </View>

          {/* Remaining macros */}
          <View style={styles.macros}>
            <MacroRow
              label="CARBS"
              current={Math.round(totalCarb)}
              goal={nutritionGoal.dailyCarbs}
              pct={carbPct}
              barColor={colors.carbs}
            />
            <MacroRow
              label="FATS"
              current={Math.round(totalFat)}
              goal={nutritionGoal.dailyFat}
              pct={fatPct}
              barColor={colors.fat}
            />
          </View>

          {/* Micronutrients */}
          {trackedMicronutrients.length > 0 && (
            <View style={styles.microSection}>
              <Text style={styles.microSectionLabel}>MICRONUTRIENTS</Text>
              <View style={styles.microChips}>
                {(() => {
                  const goalType = onboardingGoal?.type ?? "other";
                  const dailyTotals = getDailyMicronutrientsForDate(toDateString(new Date(selectedDate)));
                  return trackedMicronutrients.map((key) => {
                    const info = MICRONUTRIENTS.find((m) => m.key === key);
                    if (!info) return null;
                    const target = micronutrientTargets[key] ?? info.rdiByGoal[goalType] ?? info.rdi;
                    const intake = dailyTotals[key] ?? 0;
                    const isMet = target > 0 && intake >= target;
                    const pct = target > 0 ? Math.min(100, Math.round((intake / target) * 100)) : 0;
                    return (
                      <View key={key} style={[styles.microChip, isMet && styles.microChipMet]}>
                        <Text style={[styles.microChipText, isMet && styles.microChipTextMet]}>{info.abbr}</Text>
                        {isMet ? (
                          <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                        ) : pct > 0 ? (
                          <Text style={styles.microChipPct}>{pct}%</Text>
                        ) : null}
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── Steps + Exercise Card ────────────────────────────── */}
        <StepsExerciseCard selectedDate={selectedDate} />

        {/* ── Meals list ────────────────────────────────────────── */}
        {(dayMeals.length > 0 || isToday) && (
          <Animated.View entering={FadeInUp.duration(400).delay(50)} style={styles.mealsCard}>
            <Text style={styles.mealsCardTitle}>{"Today's Log"}</Text>
            {dayMeals.length > 0 ? (
              dayMeals.map((meal, idx) => (
                <Pressable
                  key={meal.id}
                  style={[styles.mealRow, idx < dayMeals.length - 1 && styles.mealRowBorder]}
                  onPress={() => openEditMeal(meal)}
                >
                  <View style={styles.mealInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                      <Text style={styles.mealName} numberOfLines={1}>{meal.description}</Text>
                      {(meal.servings ?? 1) !== 1 && (
                        <View style={{ backgroundColor: "rgba(20,184,166,0.12)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#14B8A6" }}>
                            {meal.servings}×
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.mealTime}>
                      {new Date(meal.timestamp).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={styles.mealRight}>
                    <Text style={styles.mealCal}>{meal.calories} cal</Text>
                    <Text style={styles.mealMacroDetail}>
                      P{meal.protein}g · C{meal.carbs}g · F{meal.fat}g
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyMeals}>
                <Ionicons name="restaurant-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyMealsText}>No meals logged today</Text>
                <Text style={styles.emptyMealsSub}>Use the mic button to log a meal</Text>
              </View>
            )}
          </Animated.View>
        )}
        </View>{/* end padded content */}
      </ScrollView>
    </View>

      {/* ── Coach bubble — absolute overlay, never affects layout ── */}
      {coachMessage && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          exiting={FadeOutUp.duration(200)}
          style={{
            position: "absolute",
            top: insets.top + 52,
            left: spacing.lg,
            right: spacing.lg,
            zIndex: 9999,
            pointerEvents: "box-none",
          }}
        >
          {/* Arrow pointing up-left toward the chat icon */}
          <View style={styles.coachBubbleTail} />
          <Pressable onPress={() => setCoachMessage(null)} style={styles.coachBubble}>
            <Ionicons name="sparkles" size={11} color="rgba(255,255,255,0.7)" style={{ marginBottom: 2 }} />
            <Text style={styles.coachBubbleText} numberOfLines={3}>{coachMessage}</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Food Add Choice Sheet */}
      <Modal
        visible={showFoodAddSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFoodAddSheet(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          onPress={() => setShowFoodAddSheet(false)}
        >
          <Pressable style={styles.foodAddSheet} onPress={() => {}}>
            <View style={styles.foodAddHandle} />
            <Text style={styles.foodAddTitle}>Add Food</Text>
            <Text style={styles.foodAddSubtitle}>Choose how to log your meal</Text>

            <Pressable
              style={styles.foodAddOption}
              onPress={() => {
                setShowFoodAddSheet(false);
                navigation.navigate("BarcodeScanner");
              }}
            >
              <View style={styles.foodAddIconBox}>
                <Ionicons name="barcode-outline" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodAddOptionTitle}>Scan Barcode</Text>
                <Text style={styles.foodAddOptionSubtitle}>Instant lookup from packaged foods</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            <Pressable
              style={styles.foodAddOption}
              onPress={() => {
                setShowFoodAddSheet(false);
                navigation.navigate("FoodCamera");
              }}
            >
              <View style={[styles.foodAddIconBox, { backgroundColor: colors.brandTeal }]}>
                <Ionicons name="camera-outline" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodAddOptionTitle}>Take Photo</Text>
                <Text style={styles.foodAddOptionSubtitle}>AI identifies foods and estimates nutrition</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            <Pressable
              style={styles.foodAddOption}
              onPress={() => {
                setShowFoodAddSheet(false);
                navigation.navigate("FoodCamera", { mode: "library" });
              }}
            >
              <View style={[styles.foodAddIconBox, { backgroundColor: "#D97706" }]}>
                <Ionicons name="images-outline" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodAddOptionTitle}>Upload Photo</Text>
                <Text style={styles.foodAddOptionSubtitle}>Choose a photo from your library</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable
              style={[styles.foodAddOption, { marginBottom: 0 }]}
              onPress={() => {
                setShowFoodAddSheet(false);
                navigation.navigate("FreeTextFood");
              }}
            >
              <View style={[styles.foodAddIconBox, { backgroundColor: "#5B5BD6" }]}>
                <Ionicons name="create-outline" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodAddOptionTitle}>Write it Down</Text>
                <Text style={styles.foodAddOptionSubtitle}>Describe what you ate in plain text</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Macro row sub-component ──────────────────────────────────────────────────
function MacroRow({
  label,
  current,
  goal,
  pct,
  barColor,
}: {
  label: string;
  current: number;
  goal: number;
  pct: number;
  barColor: string;
}) {
  return (
    <View style={styles.macroItem}>
      <View style={styles.macroLabelRow}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {current}/{goal}G
        </Text>
      </View>
      <View style={styles.macroBar}>
        <View style={[styles.macroBarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  avatarGradient: {
    flex: 1,
  },
  appTitle: {
    flex: 1,
    textAlign: "center",
    paddingLeft: 0,
    fontSize: 22,
    fontFamily: "Pacifico-Regular",
    color: colors.textPrimary,
    letterSpacing: 0,
  },
  appTitleAccent: {
    color: colors.textPrimary,
  },
  sparklesBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  // Hero card
  heroCard: {
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    alignItems: "center",
  },
  heroBlurOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  heroBlurTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginTop: spacing.sm,
  },
  heroBlurSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 19,
  },
  heroRevealBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#5eead4",
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 30,
    marginTop: 12,
  },
  heroRevealBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0a3d39",
  },
  onTrackLabelOverlay: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
    marginBottom: spacing.xs,
  },
  goalDateOverlay: {
    fontSize: 40,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -1.5,
    lineHeight: 46,
  },
  heroEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  heroEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  heroEmptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    marginBottom: spacing.xs,
  },
  heroEmptySubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 19,
  },

  // Goal section
  goalSection: {
    alignItems: "center",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  onTrackLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  goalDate: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: -1.5,
    lineHeight: 46,
  },
  goalUnderline: {
    width: 80,
    height: 3,
    backgroundColor: colors.brandTeal,
    borderRadius: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  goalSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },

  // Card base
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },

  pledgesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pledgesHeaderTitle: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  pledgesManageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pledgesManageText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#00CED1",
  },
  pledgeIconCircleDone: {
    backgroundColor: "#14B8A6",
  },
  pledgeNameDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through" as const,
  },
  pledgeSubtext: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  pledgeTapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#00CED1",
  },
  pledgeTapBtnDone: {
    backgroundColor: "#14B8A6",
  },
  pledgeTapBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  pledgeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#00CED1",
    backgroundColor: "rgba(255,102,0,0.06)",
  },
  pledgeToggleDone: {
    backgroundColor: "#14B8A6",
    borderColor: "#14B8A6",
  },
  pledgeToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00CED1",
  },
  pledgesEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pledgesEmptyText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  pledgeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: spacing.md,
  },
  pledgeRowBorder: {
    borderBottomWidth: 0,
  },
  pledgeRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bgMain,
  },
  pledgeActionCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pledgeMinusBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeCircleBtnOrange: {
    backgroundColor: "#00CED1",
  },
  pledgeCircleBtnDone: {
    backgroundColor: "#14B8A6",
  },
  pledgeCircleBtnBooleanDone: {
    backgroundColor: "#00CED1",
  },
  pledgeCircleBtnOutline: {
    borderWidth: 2,
    borderColor: "#00CED1",
    backgroundColor: "transparent",
  },
  pledgeCircleBtnToggle: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "transparent",
  },
  pledgeEditBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bgMain,
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  pledgeLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  pledgeActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pledgeActionBtnOrange: {
    backgroundColor: "#00CED1",
  },
  pledgeActionBtnDone: {
    backgroundColor: "#14B8A6",
  },
  pledgeActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  pledgeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pledgeToggleBtnIdle: {
    borderColor: "#00CED1",
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  pledgeToggleBtnDone: {
    borderColor: "#14B8A6",
    backgroundColor: "#14B8A6",
  },
  pledgeToggleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00CED1",
  },
  pledgeToggleBtnTextDone: {
    color: "#fff",
  },
  pledgeCounter: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  pledgeCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeCheckDone: {
    backgroundColor: colors.brandTeal,
    borderColor: colors.brandTeal,
  },

  // Energy balance
  energyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  energyLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  savedMealsLink: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brandPrimary,
  },
  remainingBlock: {
    alignItems: "flex-end",
  },
  remainingNum: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.brandTeal,
    lineHeight: 22,
  },
  remainingText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.brandTeal,
  },
  overCalorieNote: {
    fontSize: 9,
    fontWeight: "500",
    color: colors.textMuted,
    textAlign: "right",
    marginTop: 3,
    maxWidth: 120,
  },
  calorieDisplay: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  calorieNum: {
    fontSize: 43,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 49,
    letterSpacing: -2,
  },
  calorieSubBlock: {
    marginBottom: 8,
    marginLeft: 6,
  },
  kcalLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
    lineHeight: 17,
  },
  eatenLabel: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 17,
  },
  mainBar: {
    height: 8,
    backgroundColor: "#e8ece8",
    borderRadius: radii.pill,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  mainBarFill: {
    height: "100%",
    backgroundColor: colors.brandTeal,
    borderRadius: radii.pill,
  },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  barLabelLeft: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  barLabelRight: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  macros: {
    gap: spacing.md,
  },

  // Protein — promoted above the other macros
  proteinBlock: {
    backgroundColor: "rgba(0,206,209,0.07)",
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.25)",
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  proteinHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  proteinTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  proteinLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.textPrimary,
  },
  priorityTag: {
    backgroundColor: colors.protein,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priorityTagText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#04302f",
  },
  proteinHitText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.protein,
  },
  proteinToGo: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  proteinNumbers: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  proteinBigNum: {
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 32,
    color: colors.textPrimary,
  },
  proteinBigUnit: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    paddingBottom: 3,
  },
  proteinBar: {
    height: 8,
    backgroundColor: "#e8ece8",
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  proteinBarFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
  proteinNote: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
  },
  microSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  microSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.textPrimary,
  },
  microChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  microChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSection,
  },
  microChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  microChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  microChipMet: {
    backgroundColor: "#f0fdf4",
    borderColor: "#22c55e",
  },
  microChipTextMet: {
    color: colors.textPrimary,
  },
  microChipPct: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0d9488",
  },
  macroItem: {
    gap: 6,
  },
  macroLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.textPrimary,
  },
  macroValue: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  macroBar: {
    height: 4,
    backgroundColor: "#e8ece8",
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  macroBarFill: {
    height: "100%",
    borderRadius: radii.pill,
  },

  // Insight card
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  insightIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.brandTeal,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  insightBody: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
  },

  // Date nav
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.lg,
  },
  dateArrow: {
    padding: spacing.xs,
  },
  dateLabelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    ...shadows.card,
  },
  dateNavLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },

  // Meals
  mealsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  mealsCardTitle: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  mealRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  mealInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  mealName: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  mealTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  mealRight: {
    alignItems: "flex-end",
  },
  mealCal: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  mealMacroDetail: {
    fontSize: 11,
    color: colors.textMuted,
  },

  emptyMeals: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyMealsText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  emptyMealsSub: {
    fontSize: 13,
    color: colors.textMuted,
  },
  setGoalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  setGoalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  setGoalTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  setGoalSub: {
    fontSize: 13,
    color: colors.textMuted,
  },
  chatIconBtn: {
    width: 51,
    height: 51,
    alignItems: "center",
    justifyContent: "center",
  },
  heroShareBtn: {
    position: "absolute",
    bottom: 20,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  chatOnlineDot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22C55E",
    borderWidth: 1.5,
    borderColor: colors.bgMain,
  },
  futureMeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1C2226",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#14B8A633",
  },
  futureMeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  futureMeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#252C31",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#14B8A6",
  },
  futureMeOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#1C2226",
  },
  futureMeTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  futureMeSub: {
    fontSize: 12,
    color: "#5A6A72",
    marginTop: 1,
  },
  futureMeChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#252C31",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  editSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  editHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: "center",
    marginBottom: 16,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  editInput: {
    backgroundColor: colors.bgMain,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  editMacroRow: {
    flexDirection: "row",
    gap: 12,
  },
  editMacroField: {
    flex: 1,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  deleteBtnText: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.pill,
    alignItems: "center",
    backgroundColor: colors.brandOrange,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  breakdownCard: {
    backgroundColor: colors.bgMain,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  breakdownCalRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
    gap: 6,
  },
  breakdownCalNum: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 40,
  },
  breakdownCalUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textMuted,
    marginBottom: 4,
  },
  breakdownBarTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    gap: 2,
    marginBottom: 14,
  },
  breakdownBarSegment: {
    height: 6,
    borderRadius: 3,
  },
  breakdownMacroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakdownMacroItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  breakdownDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  breakdownMacroLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownMacroGrams: {
    fontSize: 15,
    fontWeight: "700",
  },
  breakdownMacroPct: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },

  // ── Coach speech bubble ──────────────────────────────────────────────────
  coachBubbleWrap: {
    alignSelf: "flex-end",
    marginRight: spacing.lg,
    marginTop: 4,
    marginBottom: 8,
  },
  coachBubbleTail: {
    alignSelf: "flex-start",
    marginLeft: 17,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#1e206a",
  },
  coachBubble: {
    backgroundColor: "#1e206a",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  coachBubbleText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    flex: 1,
  },
  foodAddSheet: {
    backgroundColor: "#1e206a",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  foodAddHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center" as const,
    marginBottom: 20,
  },
  foodAddTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  foodAddSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    marginBottom: 24,
  },
  foodAddOption: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  foodAddIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#0f5954",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  foodAddOptionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  foodAddOptionSubtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    lineHeight: 18,
  },
});
