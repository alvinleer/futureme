import React, { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "../components/ThemedText";
import { colors, spacing, radii } from "../theme";
import useOnboardingStore from "../state/onboardingStore";
import { LifestyleActivity, OnboardingStats } from "../types/onboarding";
import { RootStackParamList } from "../navigation/RootNavigator";

type Gender = "male" | "female" | "other";

const GENDER_OPTIONS: { value: Gender; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "male", label: "Male", icon: "male-outline" },
  { value: "female", label: "Female", icon: "female-outline" },
  { value: "other", label: "Other", icon: "people-outline" },
];

const LIFESTYLE_OPTIONS: { value: LifestyleActivity; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "sedentary", label: "Sedentary", description: "Little or no exercise, desk job", icon: "laptop-outline" },
  { value: "light", label: "Light", description: "Light exercise 1-3 days/week", icon: "walk-outline" },
  { value: "moderate", label: "Moderate", description: "Moderate exercise 3-5 days/week", icon: "bicycle-outline" },
  { value: "active", label: "Active", description: "Hard exercise 6-7 days/week", icon: "barbell-outline" },
  { value: "very_active", label: "Very Active", description: "Very hard exercise, physical job", icon: "flame-outline" },
];

export default function OnboardingStatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const existingStats = useOnboardingStore((s) => s.stats);
  const goal = useOnboardingStore((s) => s.goal);
  const setStats = useOnboardingStore((s) => s.setStats);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const [gender, setGender] = useState<Gender>(existingStats?.gender || "male");
  const [heightCm, setHeightCm] = useState(existingStats?.heightCm?.toString() || "");
  const [weightKg, setWeightKg] = useState(
    existingStats?.weightKg?.toString() || goal?.currentWeightKg?.toString() || ""
  );
  const [age, setAge] = useState(existingStats?.age?.toString() || "");
  const [lifestyle, setLifestyle] = useState<LifestyleActivity>(existingStats?.lifestyle || "moderate");

  const missingFields: string[] = [];
  if (!heightCm || isNaN(parseFloat(heightCm)) || parseFloat(heightCm) <= 0) missingFields.push("height");
  if (!weightKg || isNaN(parseFloat(weightKg)) || parseFloat(weightKg) <= 0) missingFields.push("weight");
  if (!age || isNaN(parseInt(age, 10)) || parseInt(age, 10) <= 0) missingFields.push("age");
  const canContinue = missingFields.length === 0;

  const draftStats: OnboardingStats = {
    gender,
    heightCm: parseFloat(heightCm) || 170,
    weightKg: parseFloat(weightKg) || 70,
    age: parseInt(age, 10) || 25,
    lifestyle,
  };

  const handleContinue = () => {
    setStats(draftStats);
    nextStep();
    navigation.navigate("OnboardingGoal");
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
            <View style={[styles.progressFill, { width: "14.3%" }]} />
          </View>
          <ThemedText variant="caption" muted>Step 1 of 7</ThemedText>
        </View>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <ThemedText variant="bodySmall" muted>Skip</ThemedText>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.delay(80).springify()}>
            <ThemedText variant="caption" muted style={styles.eyebrow}>STEP 1 OF 7</ThemedText>
            <ThemedText variant="h1" style={styles.title}>About You</ThemedText>
            <ThemedText variant="body" muted style={styles.subtitle}>Help us personalize your plan</ThemedText>
          </Animated.View>

          {/* Gender */}
          <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.section}>
            <ThemedText variant="h3" style={styles.sectionTitle}>Gender</ThemedText>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.genderOption, gender === option.value && styles.genderOptionActive]}
                  onPress={() => setGender(option.value)}
                >
                  <View style={[styles.genderIconCircle, gender === option.value && styles.genderIconCircleActive]}>
                    <Ionicons name={option.icon} size={26} color={gender === option.value ? colors.buttonPrimary : colors.textMuted} />
                  </View>
                  <ThemedText
                    variant="bodySmall"
                    style={[
                      { marginTop: spacing.xs, fontWeight: "500" },
                      gender === option.value
                        ? { color: colors.textPrimary, fontWeight: "700" }
                        : { color: colors.textMuted },
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Measurements */}
          <Animated.View entering={FadeInDown.delay(240).springify()} style={styles.section}>
            <ThemedText variant="h3" style={styles.sectionTitle}>Measurements</ThemedText>
            <View style={styles.statsRow}>
              <View style={styles.statInput}>
                <ThemedText variant="caption" muted style={styles.inputLabel}>HEIGHT (cm)</ThemedText>
                <TextInput
                  style={[styles.textInput, !heightCm && styles.textInputEmpty]}
                  value={heightCm}
                  onChangeText={setHeightCm}
                  placeholder="175"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={styles.statInput}>
                <ThemedText variant="caption" muted style={styles.inputLabel}>WEIGHT (kg)</ThemedText>
                <TextInput
                  style={[styles.textInput, !weightKg && styles.textInputEmpty]}
                  value={weightKg}
                  onChangeText={setWeightKg}
                  placeholder="80"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={styles.statInput}>
                <ThemedText variant="caption" muted style={styles.inputLabel}>AGE</ThemedText>
                <TextInput
                  style={[styles.textInput, !age && styles.textInputEmpty]}
                  value={age}
                  onChangeText={setAge}
                  placeholder="28"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
            {missingFields.length > 0 && (
              <View style={styles.hintRow}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <ThemedText variant="caption" muted style={{ marginLeft: 4 }}>
                  {"Fill in your " + missingFields.join(", ") + " to continue"}
                </ThemedText>
              </View>
            )}
          </Animated.View>

          {/* Activity Level */}
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.section}>
            <ThemedText variant="h3" style={styles.sectionTitle}>Activity Level</ThemedText>
            {LIFESTYLE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.lifestyleOption, lifestyle === option.value && styles.lifestyleOptionActive]}
                onPress={() => setLifestyle(option.value)}
              >
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={lifestyle === option.value ? colors.buttonPrimary : colors.textMuted}
                  style={{ marginRight: spacing.md }}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText
                    variant="body"
                    style={[
                      { fontWeight: "600" },
                      lifestyle === option.value ? { color: colors.textPrimary } : { color: colors.textMuted },
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                  <ThemedText variant="caption" muted>{option.description}</ThemedText>
                </View>
                <View style={[styles.checkCircle, lifestyle === option.value && styles.checkCircleActive]}>
                  {lifestyle === option.value && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </Pressable>
            ))}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
              paddingVertical: spacing.lg,
              borderRadius: radii.pill,
              overflow: "hidden",
              opacity: canContinue ? 1 : 0.5,
            }}
            onPress={handleContinue}
          >
            <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <ThemedText variant="body" style={styles.continueText}>Continue</ThemedText>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgSection,
    alignItems: "center", justifyContent: "center",
  },
  progressContainer: { flex: 1, alignItems: "center", marginHorizontal: spacing.lg },
  progressTrack: {
    width: "100%", height: 3, backgroundColor: colors.bgSection,
    borderRadius: 2, marginBottom: spacing.xs, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.brandPrimary, borderRadius: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { marginTop: spacing.lg, marginBottom: spacing.xs, letterSpacing: 1.5, fontSize: 11 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.xl },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.md },
  genderRow: { flexDirection: "row", gap: spacing.md },
  genderOption: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.lg,
    backgroundColor: colors.bgCard, borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  genderOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: colors.bgCard },
  genderIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "transparent",
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.xs,
  },
  genderIconCircleActive: { backgroundColor: "transparent" },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statInput: { flex: 1 },
  inputLabel: { marginBottom: spacing.xs, letterSpacing: 1, fontSize: 10 },
  textInput: {
    backgroundColor: colors.bgSection, borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
    color: colors.textPrimary, fontSize: 18, fontWeight: "700",
    textAlign: "center", borderWidth: 1, borderColor: colors.borderSubtle,
  },
  textInputEmpty: { borderColor: colors.warning + "66" },
  hintRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: spacing.sm, paddingHorizontal: spacing.xs,
  },
  planCard: {
    backgroundColor: "rgba(0,206,209,0.06)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.3)",
    padding: spacing.lg,
    gap: spacing.md,
  },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  planEyebrow: {
    color: colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 1.2,
    fontSize: 10,
  },
  planRow: { flexDirection: "row", alignItems: "center" },
  planItem: { flex: 1, alignItems: "center" },
  planValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  planDivider: { width: 1, height: 34, backgroundColor: colors.borderSubtle },
  planFootnote: { lineHeight: 16 },
  lifestyleOption: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, backgroundColor: colors.bgCard,
    borderRadius: radii.md, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  lifestyleOptionActive: { borderColor: colors.buttonPrimary, backgroundColor: colors.bgCard },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    alignItems: "center", justifyContent: "center",
  },
  checkCircleActive: { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  continueButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingVertical: spacing.lg,
    backgroundColor: colors.brandTeal, borderRadius: radii.pill,
  },
  continueButtonDim: { opacity: 0.5 },
  continueText: { color: "#fff", fontWeight: "700" },
});
