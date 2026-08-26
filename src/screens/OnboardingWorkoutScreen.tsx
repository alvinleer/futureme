import React, { useState } from "react";
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
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "../components/ThemedText";
import { Card } from "../components/Card";
import { colors, spacing, radii } from "../theme";
import useOnboardingStore from "../state/onboardingStore";
import { RootStackParamList } from "../navigation/RootNavigator";

type WorkoutType = "strength" | "cardio" | "mixed" | "hiit" | "yoga";

const WORKOUT_TYPES: { value: WorkoutType; label: string; icon: string; description: string }[] = [
  { value: "strength", label: "Strength", icon: "barbell-outline", description: "Build muscle & strength" },
  { value: "cardio", label: "Cardio", icon: "heart-outline", description: "Improve endurance" },
  { value: "mixed", label: "Mixed", icon: "fitness-outline", description: "Best of both worlds" },
  { value: "hiit", label: "HIIT", icon: "flash-outline", description: "High intensity intervals" },
  { value: "yoga", label: "Yoga", icon: "leaf-outline", description: "Flexibility & balance" },
];

const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const DURATION_OPTIONS = [
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
];

export default function OnboardingWorkoutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const existingWorkout = useOnboardingStore((s) => s.workout);
  const setWorkout = useOnboardingStore((s) => s.setWorkout);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const [workoutType, setWorkoutType] = useState<WorkoutType>(
    existingWorkout?.workoutType || "mixed"
  );
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(
    existingWorkout?.workoutsPerWeek || 4
  );
  const [minutesPerWorkout, setMinutesPerWorkout] = useState(
    existingWorkout?.minutesPerWorkout || 45
  );

  const buttonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const weeklyMinutes = workoutsPerWeek * minutesPerWorkout;
  const weeklyHours = (weeklyMinutes / 60).toFixed(1);

  const handleContinue = () => {
    setWorkout({
      workoutType,
      workoutsPerWeek,
      minutesPerWorkout,
    });

    nextStep();
    navigation.navigate("OnboardingMicronutrients");
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
            <View style={[styles.progressFill, { width: "57.1%" }]} />
          </View>
          <ThemedText variant="caption" muted>
            Step 4 of 7
          </ThemedText>
        </View>
        <Pressable onPress={handleSkip}>
          <ThemedText variant="bodySmall" muted>
            Skip
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ThemedText variant="h1" style={styles.title}>
            Workout Plan
          </ThemedText>
          <ThemedText variant="body" muted style={styles.subtitle}>
            Set your exercise goals
          </ThemedText>
        </Animated.View>

        {/* Workout Type */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Workout Type
          </ThemedText>

          <View style={styles.workoutTypeGrid}>
            {WORKOUT_TYPES.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.workoutTypeOption,
                  workoutType === option.value && styles.workoutTypeOptionActive,
                ]}
                onPress={() => setWorkoutType(option.value)}
              >
                <View
                  style={[
                    styles.workoutIconContainer,
                    workoutType === option.value && styles.workoutIconContainerActive,
                  ]}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={24}
                    color={workoutType === option.value ? colors.brandPrimary : colors.textMuted}
                  />
                </View>
                <ThemedText
                  variant="bodySmall"
                  style={{
                    fontWeight: "600",
                    color: workoutType === option.value ? colors.textPrimary : colors.textMuted,
                    marginTop: spacing.xs,
                  }}
                >
                  {option.label}
                </ThemedText>
                <ThemedText variant="caption" muted style={{ textAlign: "center" }}>
                  {option.description}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Frequency */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.section}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Workouts Per Week
          </ThemedText>

          <View style={styles.frequencyRow}>
            {FREQUENCY_OPTIONS.map((freq) => (
              <Pressable
                key={freq}
                style={[
                  styles.frequencyOption,
                  workoutsPerWeek === freq && styles.frequencyOptionActive,
                ]}
                onPress={() => setWorkoutsPerWeek(freq)}
              >
                <ThemedText
                  variant="h3"
                  style={{
                    color: workoutsPerWeek === freq ? colors.textPrimary : colors.textMuted,
                  }}
                >
                  {freq}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Duration */}
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.section}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Minutes Per Workout
          </ThemedText>

          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.durationOption,
                  minutesPerWorkout === option.value && styles.durationOptionActive,
                ]}
                onPress={() => setMinutesPerWorkout(option.value)}
              >
                <ThemedText
                  variant="body"
                  style={{
                    fontWeight: "600",
                    color: minutesPerWorkout === option.value ? colors.textPrimary : colors.textPrimary,
                  }}
                >
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Weekly Summary */}
        <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.section}>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="calendar-outline" size={24} color={colors.textMuted} />
                <ThemedText variant="h2" style={{ marginTop: spacing.xs }}>
                  {workoutsPerWeek}
                </ThemedText>
                <ThemedText variant="caption" muted>
                  sessions/week
                </ThemedText>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Ionicons name="time-outline" size={24} color={colors.textMuted} />
                <ThemedText variant="h2" style={{ marginTop: spacing.xs }}>
                  {weeklyHours}
                </ThemedText>
                <ThemedText variant="caption" muted>
                  hours/week
                </ThemedText>
              </View>
            </View>

            <View style={styles.commitmentBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <ThemedText variant="bodySmall" style={{ marginLeft: spacing.xs, color: colors.success }}>
                Great commitment level!
              </ThemedText>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

      {/* Continue Button */}
      <Animated.View
        entering={FadeInUp.delay(600).springify()}
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <Animated.View style={animatedButtonStyle}>
          <Pressable
            style={styles.continueButton}
            onPress={handleContinue}
            onPressIn={() => {
              buttonScale.value = withSpring(0.96);
            }}
            onPressOut={() => {
              buttonScale.value = withSpring(1);
            }}
          >
            <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <ThemedText variant="body" style={styles.continueButtonText}>
              Continue
            </ThemedText>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      </Animated.View>
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
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  workoutTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  workoutTypeOption: {
    width: "31%",
    aspectRatio: 0.85,
    padding: spacing.sm,
    backgroundColor: colors.bgSection,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  workoutTypeOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: "rgba(45,52,53,0.06)" },
  workoutIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  workoutIconContainerActive: {
    backgroundColor: colors.bgSection,
  },
  frequencyRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  frequencyOption: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.bgSection,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  frequencyOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: "rgba(45,52,53,0.09)", borderWidth: 2 },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  durationOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSection,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  durationOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: "rgba(45,52,53,0.09)", borderWidth: 2 },
  summaryCard: {
    padding: spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 60,
    backgroundColor: colors.borderSubtle,
  },
  commitmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  continueButtonText: {
    color: "#fff",
    fontWeight: "700",
    marginRight: spacing.sm,
  },
});
