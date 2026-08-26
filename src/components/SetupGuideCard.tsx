import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import useOnboardingStore from "../state/onboardingStore";
import { RootStackParamList, RootTabParamList } from "../navigation/RootNavigator";
import { colors, spacing, radii } from "../theme";

type NavProp = BottomTabNavigationProp<RootTabParamList> &
  NativeStackNavigationProp<RootStackParamList>;

interface Step {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  screen: keyof RootStackParamList;
  done: boolean;
}

export default function SetupGuideCard() {
  const navigation = useNavigation<NavProp>();

  const stats = useOnboardingStore((s) => s.stats);
  const goal = useOnboardingStore((s) => s.goal);
  const calories = useOnboardingStore((s) => s.calories);

  const steps: Step[] = [
    {
      key: "body",
      icon: "body-outline",
      title: "Your body stats",
      subtitle: "Height, weight, age & activity",
      screen: "OnboardingStats",
      done: stats !== null && (stats.heightCm ?? 0) > 0 && (stats.weightKg ?? 0) > 0,
    },
    {
      key: "goal",
      icon: "flag-outline",
      title: "Set your goal",
      subtitle: "Lose fat, gain muscle, or maintain",
      screen: "OnboardingGoal",
      done: goal !== null,
    },
    {
      key: "calories",
      icon: "flame-outline",
      title: "Calorie targets",
      subtitle: "Review your daily nutrition targets",
      screen: "OnboardingCalories",
      done: calories !== null && (calories.targetCalories ?? 0) > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  const progressWidth = useSharedValue(0);
  const progressAnim = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%` as any,
  }));

  useEffect(() => {
    progressWidth.value = withTiming((completedCount / steps.length) * 100, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [completedCount]);

  // Don't render when all steps complete
  if (allDone) return null;

  const nextStep = steps.find((s) => !s.done);

  return (
    <Animated.View entering={FadeInDown.duration(450).delay(80)} style={styles.wrapper}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>GET STARTED</Text>
            <Text style={styles.title}>Complete your setup</Text>
          </View>
          <View style={styles.badgeWrap}>
            <Text style={styles.badgeText}>{completedCount}/{steps.length}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressAnim]} />
        </View>

        {/* Steps */}
        <View style={styles.stepList}>
          {steps.map((step, i) => (
            <Pressable
              key={step.key}
              style={({ pressed }) => [
                styles.stepRow,
                i < steps.length - 1 && styles.stepRowBorder,
                pressed && !step.done && { opacity: 0.7 },
              ]}
              onPress={() => !step.done && navigation.navigate(step.screen as any)}
            >
              {/* Icon circle */}
              <View style={[styles.iconCircle, step.done && styles.iconCircleDone]}>
                {step.done ? (
                  <Ionicons name="checkmark" size={14} color="#1e206a" />
                ) : (
                  <Ionicons name={step.icon as any} size={15} color={colors.brandTeal} />
                )}
              </View>

              {/* Text */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>
                  {step.title}
                </Text>
                <Text style={styles.stepSub}>{step.subtitle}</Text>
              </View>

              {/* Right indicator */}
              {step.done ? (
                <Text style={styles.doneLabel}>Done</Text>
              ) : (
                <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.3)" />
              )}
            </Pressable>
          ))}
        </View>

        {/* CTA button */}
        {nextStep && (
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate(nextStep.screen as any)}
          >
            <LinearGradient
              colors={[colors.brandTeal, "#00b4b7"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>Continue setup</Text>
              <Ionicons name="arrow-forward" size={16} color="#1e206a" />
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    overflow: "hidden",
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: colors.brandTeal,
    marginBottom: 3,
    fontFamily: "Inter_700Bold",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  badgeWrap: {
    backgroundColor: "rgba(0,206,209,0.15)",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.25)",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandTeal,
    fontFamily: "Inter_700Bold",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brandTeal,
    borderRadius: 2,
  },
  stepList: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  stepRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,206,209,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.2)",
  },
  iconCircleDone: {
    backgroundColor: colors.brandTeal,
    borderColor: colors.brandTeal,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Inter_700Bold",
    marginBottom: 1,
  },
  stepTitleDone: {
    color: "rgba(255,255,255,0.45)",
  },
  stepSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
  },
  doneLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brandTeal,
    fontFamily: "Inter_700Bold",
    opacity: 0.8,
  },
  ctaBtn: {
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    gap: 6,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e206a",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
});
