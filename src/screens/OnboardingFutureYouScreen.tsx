import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "../components/ThemedText";
import { Card } from "../components/Card";
import { colors, spacing, radii } from "../theme";
import useOnboardingStore from "../state/onboardingStore";
import useFuturePhotoStore from "../state/futurePhotoStore";
import useDietStore from "../state/dietStore";
import { generateFuturePhoto } from "../api/future-photo-service";
import { RootStackParamList } from "../navigation/RootNavigator";
import { resolvePhotoUri } from "../utils/photoStorage";

export default function OnboardingFutureYouScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  // Onboarding store selectors
  const goal = useOnboardingStore((s) => s.goal);
  const stats = useOnboardingStore((s) => s.stats);
  const calories = useOnboardingStore((s) => s.calories);
  const workout = useOnboardingStore((s) => s.workout);
  const photo = useOnboardingStore((s) => s.photo);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const prevStep = useOnboardingStore((s) => s.prevStep);

  // Future photo store selectors
  const setUserProfile = useFuturePhotoStore((s) => s.setUserProfile);
  const updateWorkoutStats = useFuturePhotoStore((s) => s.updateWorkoutStats);
  const setBeforePhoto = useFuturePhotoStore((s) => s.setBeforePhoto);
  const setHeadshotPhoto = useFuturePhotoStore((s) => s.setHeadshotPhoto);
  const sealProgram = useFuturePhotoStore((s) => s.sealProgram);
  const setGeneratedPhoto = useFuturePhotoStore((s) => s.setGeneratedPhoto);
  const setGenerationError = useFuturePhotoStore((s) => s.setGenerationError);

  // Diet store selectors
  const updateNutritionGoal = useDietStore((s) => s.updateNutritionGoal);
  const updateCurrentWeight = useDietStore((s) => s.updateCurrentWeight);
  const updateTargetWeight = useDietStore((s) => s.updateTargetWeight);
  const updateMaintenanceCalories = useDietStore((s) => s.updateMaintenanceCalories);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPhotoUrl, setGeneratedPhotoUrl] = useState<string | null>(null);
  const [predictionData, setPredictionData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const buttonScale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    generatePhoto();
  }, []);

  const generatePhoto = async () => {
    if (!goal || !stats || !calories || !workout || !photo?.beforePhotoUri) {
      setError("Missing required data. Please go back and complete all steps.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Build params for generation
      const userProfile = {
        height: `${stats.heightCm}cm`,
        bodyType: "average" as const,
        fitnessLevel: "beginner" as const,
        gender: stats.gender,
        age: stats.age,
      };

      const workoutStats = {
        avgWorkoutsPerWeek: workout.workoutsPerWeek,
        workoutType: workout.workoutType,
        avgWorkoutDuration: workout.minutesPerWorkout,
      };

      const nutritionGoal = {
        dailyCalories: calories.targetCalories,
        dailyProtein: calories.proteinGrams,
        dailyCarbs: calories.carbsGrams,
        dailyFat: calories.fatGrams,
      };

      const weightGoal = {
        currentWeight: goal.currentWeightKg * 2.205, // Convert to lbs for the API
        targetWeight: goal.targetWeightKg * 2.205,
        startDate: Date.now(),
        weightHistory: [],
      };

      const weeklyLogSummary = {
        weekStartDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
        weekEndDate: Date.now(),
        mealsLogged: 0,
        daysWithMeals: 0,
        workoutsLogged: 0,
        avgDailyCalories: calories.targetCalories,
        avgDailyProtein: calories.proteinGrams,
        totalWorkoutMinutes: workout.workoutsPerWeek * workout.minutesPerWorkout,
        isComplete: false,
      };

      const referenceImages: string[] = [resolvePhotoUri(photo.beforePhotoUri)!];
      if (photo.headshotPhotoUri) {
        referenceImages.push(resolvePhotoUri(photo.headshotPhotoUri)!);
      }

      const result = await generateFuturePhoto({
        userProfile,
        workoutStats,
        weeklyProgress: {
          avgDailyCalories: calories.targetCalories,
          avgProteinPercentage: 100,
          avgCarbsPercentage: 100,
          avgFatPercentage: 100,
          mealsLoggedCount: 0,
          daysOnTrack: 0,
          workoutsCompleted: 0,
        },
        nutritionGoal,
        weightGoal,
        maintenanceCalories: calories.maintenanceCalories,
        goalEndDate: goal.goalEndDate,
        weeklyLogSummary,
        consecutiveCompleteWeeks: 0,
        referenceImages,
      });

      if (result.imageUrl) {
        setGeneratedPhotoUrl(result.imageUrl);
        setPredictionData(result.predictionData);
      } else {
        setError(result.predictionData.message || "Failed to generate photo");
      }
    } catch (err) {
      console.error("[OnboardingFutureYou] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate photo. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinish = () => {
    if (!goal || !stats || !calories || !workout || !photo) return;

    // Save to future photo store
    setUserProfile({
      height: `${stats.heightCm}cm`,
      bodyType: "average",
      fitnessLevel: "beginner",
      gender: stats.gender,
      age: stats.age,
    });
    updateWorkoutStats({
      avgWorkoutsPerWeek: workout.workoutsPerWeek,
      workoutType: workout.workoutType,
      avgWorkoutDuration: workout.minutesPerWorkout,
    });
    if (photo.beforePhotoUri) {
      setBeforePhoto(photo.beforePhotoUri);
    }
    if (photo.headshotPhotoUri) {
      setHeadshotPhoto(photo.headshotPhotoUri);
    }
    sealProgram(goal.programStartDate, goal.weeksToGoal, goal.goalEndDate);
    if (generatedPhotoUrl) {
      setGeneratedPhoto(generatedPhotoUrl, { complianceRate: 0, denoisingStrength: 0.3, progressScore: 0 });
    }

    // Save to diet store
    updateNutritionGoal({
      dailyCalories: calories.targetCalories,
      dailyProtein: calories.proteinGrams,
      dailyCarbs: calories.carbsGrams,
      dailyFat: calories.fatGrams,
    });
    updateCurrentWeight(goal.currentWeightKg * 2.205); // Convert to lbs
    updateTargetWeight(goal.targetWeightKg * 2.205);
    updateMaintenanceCalories(calories.maintenanceCalories);

    // Mark onboarding complete
    completeOnboarding();

    // Navigate to main app
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  };

  const handleBack = () => {
    prevStep();
    navigation.goBack();
  };

  const handleRetry = () => {
    generatePhoto();
  };

  const weightChange = goal ? Math.abs(goal.targetWeightKg - goal.currentWeightKg) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "100%" }]} />
          </View>
          <ThemedText variant="caption" muted>
            Step 7 of 7
          </ThemedText>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ThemedText variant="h1" style={styles.title}>
            Your Future Self
          </ThemedText>
          <ThemedText variant="body" muted style={styles.subtitle}>
            {isGenerating
              ? "Creating your transformation preview..."
              : generatedPhotoUrl
              ? "This is what you could look like!"
              : "Preparing your visualization..."}
          </ThemedText>
        </Animated.View>

        {/* Photo Display */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.photoSection}>
          {isGenerating ? (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingIconWrapper}>
                <Animated.View style={[styles.pulseCircle, pulseStyle]} />
                <View style={styles.loadingIconContainer}>
                  <Ionicons name="sparkles" size={48} color={colors.brandPrimary} />
                </View>
              </View>
              <ThemedText variant="body" style={{ marginTop: spacing.xl, textAlign: "center" }}>
                AI is generating your future photo
              </ThemedText>
              <ThemedText variant="bodySmall" muted style={{ marginTop: spacing.sm, textAlign: "center" }}>
                This may take 30-60 seconds
              </ThemedText>
              <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginTop: spacing.lg }} />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="warning" size={48} color={colors.warning} />
              <ThemedText variant="body" style={{ marginTop: spacing.md, textAlign: "center" }}>
                {error}
              </ThemedText>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Ionicons name="refresh" size={20} color="#fff" />
                <ThemedText variant="bodySmall" style={{ color: "#fff", marginLeft: spacing.sm }}>
                  Try Again
                </ThemedText>
              </Pressable>
            </View>
          ) : generatedPhotoUrl ? (
            <Animated.View entering={FadeIn.duration(500)} style={styles.photoContainer}>
              <Image source={{ uri: generatedPhotoUrl }} style={styles.generatedPhoto} resizeMode="cover" />
              <View style={styles.photoOverlay}>
                <View style={styles.futureLabel}>
                  <Ionicons name="sparkles" size={14} color="#14B8A6" />
                  <ThemedText variant="caption" style={{ color: "#14B8A6", marginLeft: 4 }}>
                    Future You
                  </ThemedText>
                </View>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>

        {/* Prediction Stats */}
        {generatedPhotoUrl && predictionData && (
          <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.statsSection}>
            <Card style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <ThemedText variant="h2" style={{ color: colors.brandPrimary }}>
                    {goal?.weeksToGoal}
                  </ThemedText>
                  <ThemedText variant="caption" muted>
                    weeks
                  </ThemedText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <ThemedText variant="h2" style={{ color: colors.success }}>
                    {weightChange.toFixed(1)} kg
                  </ThemedText>
                  <ThemedText variant="caption" muted>
                    {goal?.type === "lose" ? "fat to lose" : goal?.type === "gain" ? "muscle to gain" : "health & performance"}
                  </ThemedText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <ThemedText variant="h2" style={{ color: colors.brandSecondary }}>
                    {workout?.workoutsPerWeek}x
                  </ThemedText>
                  <ThemedText variant="caption" muted>
                    workouts/wk
                  </ThemedText>
                </View>
              </View>
            </Card>

            <Card style={styles.planCard}>
              <View style={styles.planHeader}>
                <Ionicons name="nutrition" size={24} color={colors.brandPrimary} />
                <ThemedText variant="h3" style={{ marginLeft: spacing.sm }}>
                  Your Daily Plan
                </ThemedText>
              </View>
              <View style={styles.planDetails}>
                <View style={styles.planRow}>
                  <ThemedText variant="body" muted>
                    Daily Calories
                  </ThemedText>
                  <ThemedText variant="body" style={{ fontWeight: "600" }}>
                    {calories?.targetCalories} cal
                  </ThemedText>
                </View>
                <View style={styles.planRow}>
                  <ThemedText variant="body" muted>
                    Protein
                  </ThemedText>
                  <ThemedText variant="body" style={{ fontWeight: "600", color: colors.protein }}>
                    {calories?.proteinGrams}g
                  </ThemedText>
                </View>
                <View style={styles.planRow}>
                  <ThemedText variant="body" muted>
                    Daily {goal?.type === "lose" ? "Deficit" : goal?.type === "gain" ? "Surplus" : "Balance"}
                  </ThemedText>
                  <ThemedText
                    variant="body"
                    style={{
                      fontWeight: "600",
                      color: goal?.type === "lose" ? colors.success : goal?.type === "gain" ? colors.warning : colors.textMuted,
                    }}
                  >
                    {Math.abs(calories?.dailyDeficitOrSurplus || 0)} cal
                  </ThemedText>
                </View>
              </View>
            </Card>
          </Animated.View>
        )}
      </ScrollView>

      {/* Finish Button */}
      {(generatedPhotoUrl || error) && (
        <Animated.View
          entering={FadeInUp.delay(500).springify()}
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Animated.View style={animatedButtonStyle}>
            <Pressable
              style={styles.finishButton}
              onPress={handleFinish}
              onPressIn={() => {
                buttonScale.value = withSpring(0.96);
              }}
              onPressOut={() => {
                buttonScale.value = withSpring(1);
              }}
            >
              <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <ThemedText variant="body" style={styles.finishButtonText}>
                {generatedPhotoUrl ? "Start Your Journey" : "Continue Anyway"}
              </ThemedText>
              <Ionicons name="rocket" size={20} color="#fff" />
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: spacing.lg,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    backgroundColor: colors.bgSection,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brandPrimary,
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  photoSection: {
    marginBottom: spacing.xl,
  },
  loadingContainer: {
    height: 400,
    backgroundColor: colors.bgSection,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseCircle: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.brandPrimary,
  },
  loadingIconWrapper: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    height: 300,
    backgroundColor: colors.bgSection,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  photoContainer: {
    position: "relative",
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  generatedPhoto: {
    width: "100%",
    height: 450,
  },
  photoOverlay: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
  },
  futureLabel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  statsSection: {
    gap: spacing.md,
  },
  statsCard: {
    padding: spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderSubtle,
  },
  planCard: {
    padding: spacing.lg,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  planDetails: {
    gap: spacing.sm,
  },
  planRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  finishButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  finishButtonText: {
    color: "#fff",
    fontWeight: "700",
    marginRight: spacing.sm,
  },
});
