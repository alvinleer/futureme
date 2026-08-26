import React, { useCallback, useEffect } from "react";
import {
  View,
  Image,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import useFuturePhotoStore from "../state/futurePhotoStore";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";
import {
  generateVisualization,
  shouldGenerateThisWeek,
  getCurrentWeekSundayKey,
  calculateComplianceMetrics,
} from "../api/future-photo-service";
import { ThemedText } from "./ThemedText";
import { colors, spacing, radii } from "../theme";

type RootStackParamList = {
  FuturePhotoSetup: undefined;
  OnboardingGoal: undefined;
  OnboardingStats: undefined;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Logo background pattern — "FutureMe" text tiled in Pacifico above the teal bg
function LogoBgPattern() {
  const rows = 5;
  const cols = 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={logoBgStyles.row}>
          {Array.from({ length: cols }).map((_, c) => (
            <View
              key={c}
              style={[
                logoBgStyles.item,
                r % 2 === 1 && logoBgStyles.itemOffset,
              ]}
            >
              <Text style={logoBgStyles.text}>
                {"Future"}<Text style={logoBgStyles.textAccent}>{"Me"}</Text>
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const logoBgStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-20deg" }],
  },
  itemOffset: {
    marginTop: 24,
  },
  text: {
    fontFamily: "Pacifico-Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.07)",
    letterSpacing: 0,
  },
  textAccent: {
    fontFamily: "Pacifico-Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.07)",
  },
});

// Dense watermark tile pattern
function WatermarkPattern() {
  const rows = 7;
  const cols = 4;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={watermarkStyles.row}>
          {Array.from({ length: cols }).map((_, c) => (
            <View key={c} style={[watermarkStyles.item, r % 2 === 1 && watermarkStyles.itemOffset]}>
              <ThemedText style={watermarkStyles.text}>FutureMe</ThemedText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const watermarkStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-28deg" }],
  },
  itemOffset: {
    marginTop: 14,
  },
  text: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.13)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});

export function FuturePhotoCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const userProfile = useFuturePhotoStore((s) => s.userProfile);
  const workoutStats = useFuturePhotoStore((s) => s.workoutStats);
  const beforePhotoUri = useFuturePhotoStore((s) => s.beforePhotoUri);
  const goalEndDate = useFuturePhotoStore((s) => s.goalEndDate);
  const totalWeeks = useFuturePhotoStore((s) => s.totalWeeks);
  const programStartDate = useFuturePhotoStore((s) => s.programStartDate);
  const generatedPhotoUrl = useFuturePhotoStore((s) => s.generatedPhotoUrl);
  const isGenerating = useFuturePhotoStore((s) => s.isGenerating);
  const generationError = useFuturePhotoStore((s) => s.generationError);
  const lastComplianceRate = useFuturePhotoStore((s) => s.lastComplianceRate);
  const lastProgressScore = useFuturePhotoStore((s) => s.lastProgressScore);
  const deviceId = useFuturePhotoStore((s) => s.deviceId);
  const weeklyGenerationKey = useFuturePhotoStore((s) => s.weeklyGenerationKey);
  const setWeeklyGenerationKey = useFuturePhotoStore((s) => s.setWeeklyGenerationKey);
  const setGeneratedPhoto = useFuturePhotoStore((s) => s.setGeneratedPhoto);
  const setIsGenerating = useFuturePhotoStore((s) => s.setIsGenerating);
  const setGenerationError = useFuturePhotoStore((s) => s.setGenerationError);
  const isProfileComplete = useFuturePhotoStore((s) => s.isProfileComplete);

  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const meals = useDietStore((s) => s.meals);
  const workouts = useDietStore((s) => s.workouts);
  const weightGoal = useDietStore((s) => s.weightGoal);
  const maintenanceCalories = useDietStore((s) => s.maintenanceCalories);
  const isOnboardingComplete = useOnboardingStore((s) => s.isComplete);
  const goalLiftingLevel = useOnboardingStore((s) => s.goal?.liftingLevel);
  const goalTrainingYears = useOnboardingStore((s) => s.goal?.trainingYears);

  // Pulse animation for loading state
  const pulseOpacity = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    if (isGenerating) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      pulseOpacity.value = withTiming(1);
    }
  }, [isGenerating, pulseOpacity]);

  const handleGenerate = useCallback(
    async (force = false) => {
      if (!userProfile || !goalEndDate || !beforePhotoUri || isGenerating) return;

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const result = await generateVisualization({
          userProfile,
          workoutStats,
          beforePhotoUri,
          goalEndDate,
          totalWeeks: totalWeeks ?? 12,
          meals,
          workouts,
          nutritionGoal,
          weightGoal,
          maintenanceCalories,
          deviceId,
          forceRegenerate: force,
          liftingLevel: goalLiftingLevel,
          trainingYears: goalTrainingYears,
        });

        setGeneratedPhoto(result.imageUrl, {
          complianceRate: result.complianceRate,
          denoisingStrength: result.denoisingStrength,
          progressScore: result.progressScore,
        });
      } catch (err) {
        setGenerationError(
          err instanceof Error ? err.message : "Generation failed"
        );
      }
    },
    [
      userProfile,
      workoutStats,
      beforePhotoUri,
      goalEndDate,
      totalWeeks,
      meals,
      workouts,
      nutritionGoal,
      weightGoal,
      maintenanceCalories,
      deviceId,
      isGenerating,
      goalLiftingLevel,
      goalTrainingYears,
      setGeneratedPhoto,
      setIsGenerating,
      setGenerationError,
    ]
  );

  // Auto-generate on mount if due (Sunday 9am schedule)
  useEffect(() => {
    const profileComplete = isProfileComplete();
    const needsRegen = shouldGenerateThisWeek(weeklyGenerationKey);
    if (profileComplete && needsRegen && !isGenerating && !generationError) {
      setWeeklyGenerationKey(getCurrentWeekSundayKey());
      handleGenerate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compliance = userProfile
    ? calculateComplianceMetrics(meals, workouts, nutritionGoal, workoutStats, weightGoal)
    : null;

  const programWeekLabel = () => {
    if (!programStartDate || !totalWeeks) return "";
    const elapsed = Math.floor(
      (Date.now() - programStartDate) / (7 * 24 * 60 * 60 * 1000)
    );
    const week = Math.min(totalWeeks, Math.max(1, elapsed + 1));
    return `Week ${week} of ${totalWeeks}`;
  };

  const formatGoalDate = () => {
    if (!goalEndDate) return "";
    return new Date(goalEndDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const daysUntilUpdate = () => {
    // Next generation is always on Sunday — show days until next Sunday
    const now = new Date();
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntilSunday);
    next.setHours(9, 0, 0, 0);
    if (next.getTime() <= Date.now()) return "Ready to update";
    const days = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return `Updates in ${days}d`;
  };

  const profileIsComplete = isProfileComplete();

  // ── Setup prompt ───────────────────────────────────────────────────────────
  if (!profileIsComplete) {
    return (
      <Pressable
        style={styles.setupContainer}
        onPress={() =>
          isOnboardingComplete
            ? navigation.navigate("FuturePhotoSetup")
            : navigation.navigate("OnboardingStats")
        }
      >
        <LinearGradient
          colors={["#5b67cd", "#1e206a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fillGradient}
        >
          <LogoBgPattern />
          <View style={styles.setupContent}>
            <View style={styles.iconRing}>
              <Ionicons name="body" size={28} color={colors.brandPrimary} />
            </View>
            <ThemedText variant="h3" style={styles.setupTitle}>
              See Your Future Self
            </ThemedText>
            <ThemedText variant="bodySmall" muted style={styles.setupSubtitle}>
              Upload your photo. Every week we show you how you will look on
              your goal date, based on the progress you actually made.
            </ThemedText>
            <View style={styles.ctaRow}>
              <ThemedText
                variant="bodySmall"
                style={{ color: colors.brandPrimary, fontWeight: "700" }}
              >
                Get Started
              </ThemedText>
              <Ionicons
                name="arrow-forward"
                size={14}
                color={colors.brandPrimary}
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isGenerating) {
    return (
      <View style={styles.setupContainer}>
        <LinearGradient
          colors={["#5b67cd", "#1e206a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fillGradient}
        >
          <LogoBgPattern />
          <Animated.View style={[styles.loadingContent, pulseStyle]}>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <ThemedText variant="body" style={styles.loadingTitle}>
              Generating your future self...
            </ThemedText>
            <ThemedText variant="caption" muted style={{ textAlign: "center" }}>
              AI is analyzing your progress and building your transformation
            </ThemedText>
          </Animated.View>
        </LinearGradient>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (generationError && !generatedPhotoUrl) {
    const isMissingKey = generationError.includes("Google API key not configured");
    return (
      <Pressable
        style={styles.setupContainer}
        onPress={() => !isMissingKey && handleGenerate(true)}
      >
        <LinearGradient
          colors={["#5b67cd", "#1e206a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fillGradient}
        >
          <LogoBgPattern />
          <View style={styles.setupContent}>
            <Ionicons
              name={isMissingKey ? "key-outline" : "warning-outline"}
              size={32}
              color={isMissingKey ? "#f59e0b" : colors.error}
            />
            <ThemedText
              variant="bodySmall"
              style={[styles.errorText, { color: isMissingKey ? "#f59e0b" : colors.error }]}
            >
              {isMissingKey
                ? "Google API key required. Add it in the ENV tab."
                : generationError}
            </ThemedText>
            {!isMissingKey && (
              <View style={styles.ctaRow}>
                <Ionicons name="refresh" size={14} color={colors.brandPrimary} />
                <ThemedText
                  variant="caption"
                  style={{ color: colors.brandPrimary, marginLeft: 4 }}
                >
                  Tap to retry
                </ThemedText>
              </View>
            )}
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  // ── Transformation View (before + after side by side) ──────────────────────
  if (generatedPhotoUrl && beforePhotoUri) {
    const complianceDisplay = lastComplianceRate ?? compliance?.complianceRate ?? 0;
    const progressDisplay = lastProgressScore ?? 0;
    const proteinDisplay = compliance?.proteinCompliance ?? 0;

    return (
      <Animated.View entering={FadeIn.duration(600)} style={styles.transformContainer}>
        {/* Logo bg pattern — sits above teal bg, below photos */}
        <LogoBgPattern />
        {/* Side-by-side photos */}
        <View style={styles.photoRow}>
          {/* Before */}
          <View style={styles.photoHalf}>
            <Image
              source={{ uri: beforePhotoUri }}
              style={styles.halfImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.75)"]}
              style={styles.photoLabelGradient}
            >
              <ThemedText variant="caption" style={styles.photoLabelText}>
                NOW
              </ThemedText>
            </LinearGradient>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <LinearGradient
              colors={[colors.brandPrimary, "#ff9f6a"]}
              style={styles.dividerLine}
            />
            <View style={styles.arrowBadge}>
              <Ionicons name="arrow-forward" size={12} color="#fff" />
            </View>
          </View>

          {/* After */}
          <View style={styles.photoHalf}>
            <Image
              source={{ uri: generatedPhotoUrl }}
              style={styles.halfImage}
              resizeMode="cover"
            />
            {/* Watermark pattern */}
            <WatermarkPattern />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.75)"]}
              style={styles.photoLabelGradient}
            >
              <Ionicons
                name="sparkles"
                size={10}
                color={colors.brandPrimary}
                style={{ marginBottom: 1 }}
              />
              <ThemedText variant="caption" style={[styles.photoLabelText, { color: colors.brandPrimary }]}>
                {formatGoalDate()}
              </ThemedText>
            </LinearGradient>
          </View>
        </View>

        {/* Stats bar */}
        <LinearGradient
          colors={["#5b67cd", "#1e206a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsBar}
        >
          <View style={styles.statItem}>
            <ThemedText variant="caption" muted>
              Compliance
            </ThemedText>
            <ThemedText
              variant="bodySmall"
              style={{
                color:
                  complianceDisplay >= 70
                    ? "#22c55e"
                    : complianceDisplay >= 40
                    ? "#f59e0b"
                    : colors.error,
                fontWeight: "700",
              }}
            >
              {Math.round(complianceDisplay)}%
            </ThemedText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <ThemedText variant="caption" muted>
              Protein
            </ThemedText>
            <ThemedText
              variant="bodySmall"
              style={{
                color:
                  proteinDisplay >= 90
                    ? "#22c55e"
                    : proteinDisplay >= 70
                    ? "#f59e0b"
                    : colors.error,
                fontWeight: "700",
              }}
            >
              {Math.round(proteinDisplay)}%
            </ThemedText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <ThemedText variant="caption" muted>
              Progress
            </ThemedText>
            <ThemedText
              variant="bodySmall"
              style={{ color: "#60a5fa", fontWeight: "700" }}
            >
              {Math.round(progressDisplay)}%
            </ThemedText>
          </View>

          <View style={styles.statDivider} />

          <Pressable
            style={styles.statItem}
            onPress={() => handleGenerate(true)}
          >
            <ThemedText variant="caption" muted>
              {daysUntilUpdate() ?? "Update"}
            </ThemedText>
            <Ionicons name="refresh-outline" size={14} color={colors.brandPrimary} />
          </Pressable>

          <Pressable
            style={styles.settingsBtn}
            onPress={() => navigation.navigate("FuturePhotoSetup")}
          >
            <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
          </Pressable>
        </LinearGradient>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={11} color={colors.textMuted} />
          <ThemedText variant="caption" muted style={styles.disclaimerText}>
            {programWeekLabel() ? `${programWeekLabel()} · ` : ""}
            AI projection for {formatGoalDate()}, based on last week&apos;s progress.
          </ThemedText>
        </View>
      </Animated.View>
    );
  }

  // ── Fallback: profile complete but no photo yet ────────────────────────────
  return (
    <Pressable style={styles.setupContainer} onPress={() => handleGenerate(false)}>
      <LinearGradient
        colors={["#5b67cd", "#1e206a"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fillGradient}
      >
        <View style={styles.setupContent}>
          <Ionicons name="image-outline" size={40} color={colors.textMuted} />
          <ThemedText variant="body" muted style={{ marginTop: spacing.md }}>
            Tap to generate your future self
          </ThemedText>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const CARD_HEIGHT = 220;
const HALF_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - 2) / 2;

const styles = StyleSheet.create({
  setupContainer: {
    width: "100%",
    height: CARD_HEIGHT,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  fillGradient: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  setupContent: {
    alignItems: "center",
    gap: spacing.sm,
  },
  iconRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(248,101,47,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,101,47,0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  setupTitle: {
    color: "#fff",
    textAlign: "center",
  },
  setupSubtitle: {
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 18,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: "rgba(248,101,47,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,101,47,0.35)",
  },
  loadingContent: {
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingTitle: {
    color: "#fff",
    marginTop: spacing.sm,
    textAlign: "center",
  },
  errorText: {
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
    maxWidth: 260,
  },
  transformContainer: {
    width: "100%",
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: "#1e206a",
  },
  photoRow: {
    flexDirection: "row",
    height: CARD_HEIGHT,
  },
  photoHalf: {
    width: HALF_WIDTH,
    height: CARD_HEIGHT,
    position: "relative",
  },
  halfImage: {
    width: "100%",
    height: "100%",
  },
  photoLabelGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  photoLabelText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  divider: {
    width: 2,
    height: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    zIndex: 10,
  },
  dividerLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
  },
  arrowBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 11,
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  settingsBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
  },
  disclaimerText: {
    fontSize: 10,
    lineHeight: 14,
  },
});
