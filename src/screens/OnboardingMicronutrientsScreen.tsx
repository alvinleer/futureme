import React, { useState, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
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
import { RootStackParamList } from "../navigation/RootNavigator";
import { MICRONUTRIENTS, MicronutrientKey, getDefaultMicronutrients, MicronutrientInfo } from "../data/micronutrients";

const VITAMIN_COLOR = "#7c3aed";
const MINERAL_COLOR = "#0284c7";

export default function OnboardingMicronutrientsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const goal = useOnboardingStore((s) => s.goal);
  const existingSelections = useOnboardingStore((s) => s.trackedMicronutrients);
  const existingTargets = useOnboardingStore((s) => s.micronutrientTargets);
  const setTrackedMicronutrients = useOnboardingStore((s) => s.setTrackedMicronutrients);
  const setMicronutrientTargets = useOnboardingStore((s) => s.setMicronutrientTargets);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const goalType = (goal?.type ?? "other") as "lose" | "gain" | "other";
  const defaults = useMemo(() => getDefaultMicronutrients(goalType), [goalType]);

  const [selected, setSelected] = useState<Set<MicronutrientKey>>(
    () => new Set(existingSelections.length > 0 ? existingSelections : defaults)
  );

  // Custom target overrides: key → string value for editing
  const [customTargets, setCustomTargets] = useState<Partial<Record<MicronutrientKey, string>>>(
    () => Object.fromEntries(
      Object.entries(existingTargets).map(([k, v]) => [k, String(v)])
    ) as Partial<Record<MicronutrientKey, string>>
  );

  // Which nutrient's target is currently being edited
  const [editingKey, setEditingKey] = useState<MicronutrientKey | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const [showMoreVitamins, setShowMoreVitamins] = useState(false);
  const [showMoreMinerals, setShowMoreMinerals] = useState(false);

  const vitamins = MICRONUTRIENTS.filter((m) => m.category === "vitamin");
  const minerals = MICRONUTRIENTS.filter((m) => m.category === "mineral");

  const suggestedVitamins = vitamins.filter((m) => defaults.includes(m.key));
  const extraVitamins = vitamins.filter((m) => !defaults.includes(m.key));
  const suggestedMinerals = minerals.filter((m) => defaults.includes(m.key));
  const extraMinerals = minerals.filter((m) => !defaults.includes(m.key));

  const toggle = (key: MicronutrientKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openEditTarget = (m: MicronutrientInfo) => {
    const current = customTargets[m.key] ?? String(m.rdiByGoal[goalType]);
    setEditingKey(m.key);
    setEditingValue(current);
  };

  const saveEditTarget = () => {
    if (!editingKey) return;
    const num = parseFloat(editingValue);
    if (!isNaN(num) && num > 0) {
      setCustomTargets((prev) => ({ ...prev, [editingKey]: String(num) }));
    }
    setEditingKey(null);
  };

  const handleContinue = () => {
    setTrackedMicronutrients(Array.from(selected));
    const numericTargets: Partial<Record<MicronutrientKey, number>> = {};
    Object.entries(customTargets).forEach(([k, v]) => {
      const n = parseFloat(v as string);
      if (!isNaN(n) && n > 0) numericTargets[k as MicronutrientKey] = n;
    });
    setMicronutrientTargets(numericTargets);
    nextStep();
    navigation.navigate("OnboardingPhoto");
  };

  const handleBack = () => { prevStep(); navigation.goBack(); };
  const handleSkip = () => { skipOnboarding(); navigation.popToTop(); };

  const goalLabel =
    goalType === "lose" ? "Fat Loss" : goalType === "gain" ? "Muscle Gain" : "Performance";

  const renderItem = (m: MicronutrientInfo, accentColor: string) => {
    const isSelected = selected.has(m.key);
    const isSuggested = defaults.includes(m.key);
    const defaultTarget = m.rdiByGoal[goalType];
    const customVal = customTargets[m.key];
    const displayTarget = customVal ?? String(defaultTarget);
    const isCustomized = customVal !== undefined && parseFloat(customVal) !== defaultTarget;

    return (
      <Pressable
        key={m.key}
        style={[styles.item, isSelected && styles.itemSelected]}
        onPress={() => toggle(m.key)}
      >
        <View style={styles.itemLeft}>
          <View style={[styles.colorBar, { backgroundColor: isSelected ? accentColor : colors.borderSubtle }]} />
          <View style={styles.itemText}>
            <View style={styles.nameRow}>
              <ThemedText variant="body" style={[styles.itemName, isSelected && { color: colors.textPrimary }]}>
                {m.name}
              </ThemedText>
              {isSuggested && (
                <View style={styles.suggestedBadge}>
                  <ThemedText variant="caption" style={styles.suggestedText}>Suggested</ThemedText>
                </View>
              )}
            </View>
            <ThemedText variant="caption" muted numberOfLines={1}>{m.reason}</ThemedText>
            <View style={styles.targetRow}>
              <ThemedText variant="caption" style={{ color: accentColor }}>
                {`Daily target: ${displayTarget} ${m.unit}`}
                {isCustomized ? " (custom)" : ""}
              </ThemedText>
              {isSelected && (
                <Pressable
                  hitSlop={8}
                  onPress={(e) => { e.stopPropagation(); openEditTarget(m); }}
                  style={styles.editTargetBtn}
                >
                  <Ionicons name="pencil" size={11} color={accentColor} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </Pressable>
    );
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
            <View style={[styles.progressFill, { width: "71.5%" }]} />
          </View>
          <ThemedText variant="caption" muted>Step 5 of 7</ThemedText>
        </View>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <ThemedText variant="bodySmall" muted>Skip</ThemedText>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <ThemedText variant="caption" muted style={styles.eyebrow}>STEP 5 OF 7</ThemedText>
          <ThemedText variant="h1" style={styles.title}>Micronutrients</ThemedText>
          <ThemedText variant="body" muted style={styles.subtitle}>
            {"Choose which vitamins and minerals to monitor. We've pre-selected the ones most relevant for your "}
            <ThemedText variant="body" style={{ color: colors.buttonPrimary, fontWeight: "700" }}>{goalLabel}</ThemedText>
            {" goal."}
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).springify()}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors.buttonPrimary }]} />
            <ThemedText variant="caption" muted>Suggested</ThemedText>
            <View style={[styles.legendDot, { backgroundColor: VITAMIN_COLOR, marginLeft: spacing.md }]} />
            <ThemedText variant="caption" muted>Vitamin</ThemedText>
            <View style={[styles.legendDot, { backgroundColor: MINERAL_COLOR, marginLeft: spacing.md }]} />
            <ThemedText variant="caption" muted>Mineral</ThemedText>
            <View style={[styles.legendDot, { backgroundColor: colors.textMuted, marginLeft: spacing.md }]} />
            <ThemedText variant="caption" muted>Tap pencil to edit target</ThemedText>
          </View>
        </Animated.View>

        {/* Vitamins */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: VITAMIN_COLOR }]} />
            <ThemedText variant="h3" style={styles.sectionTitle}>Vitamins</ThemedText>
          </View>
          {suggestedVitamins.map((m) => renderItem(m, VITAMIN_COLOR))}
          {showMoreVitamins && extraVitamins.map((m) => renderItem(m, VITAMIN_COLOR))}
          {extraVitamins.length > 0 && (
            <Pressable style={styles.showMoreBtn} onPress={() => setShowMoreVitamins((v) => !v)}>
              <Ionicons name={showMoreVitamins ? "chevron-up" : "chevron-down"} size={14} color={VITAMIN_COLOR} />
              <ThemedText variant="caption" style={{ color: VITAMIN_COLOR, fontWeight: "600", marginLeft: 4 }}>
                {showMoreVitamins ? "Show fewer vitamins" : `Show ${extraVitamins.length} more vitamins`}
              </ThemedText>
            </Pressable>
          )}
        </Animated.View>

        {/* Minerals */}
        <Animated.View entering={FadeInDown.delay(280).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: MINERAL_COLOR }]} />
            <ThemedText variant="h3" style={styles.sectionTitle}>Minerals</ThemedText>
          </View>
          {suggestedMinerals.map((m) => renderItem(m, MINERAL_COLOR))}
          {showMoreMinerals && extraMinerals.map((m) => renderItem(m, MINERAL_COLOR))}
          {extraMinerals.length > 0 && (
            <Pressable style={styles.showMoreBtn} onPress={() => setShowMoreMinerals((v) => !v)}>
              <Ionicons name={showMoreMinerals ? "chevron-up" : "chevron-down"} size={14} color={MINERAL_COLOR} />
              <ThemedText variant="caption" style={{ color: MINERAL_COLOR, fontWeight: "600", marginLeft: 4 }}>
                {showMoreMinerals ? "Show fewer minerals" : `Show ${extraMinerals.length} more minerals`}
              </ThemedText>
            </Pressable>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <ThemedText variant="caption" muted style={styles.footerNote}>
          {`${selected.size} micronutrient${selected.size !== 1 ? "s" : ""} selected`}
        </ThemedText>
        <Pressable style={styles.continueButton} onPress={handleContinue}>
          <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <ThemedText variant="body" style={styles.continueText}>Continue</ThemedText>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Edit target modal */}
      <Modal visible={editingKey !== null} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={saveEditTarget}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              {editingKey && (() => {
                const m = MICRONUTRIENTS.find((x) => x.key === editingKey)!;
                const accentColor = m.category === "vitamin" ? VITAMIN_COLOR : MINERAL_COLOR;
                return (
                  <>
                    <ThemedText variant="h3" style={{ marginBottom: spacing.xs }}>{m.name}</ThemedText>
                    <ThemedText variant="caption" muted style={{ marginBottom: spacing.md }}>
                      {`Set your daily target (default: ${m.rdiByGoal[goalType]} ${m.unit})`}
                    </ThemedText>
                    <View style={[styles.targetInput, { borderColor: accentColor }]}>
                      <TextInput
                        style={[styles.targetInputText, { color: accentColor }]}
                        value={editingValue}
                        onChangeText={setEditingValue}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                        selectionColor={accentColor}
                        cursorColor={accentColor}
                      />
                      <ThemedText variant="body" style={{ color: colors.textMuted, marginLeft: spacing.xs }}>{m.unit}</ThemedText>
                    </View>
                    <View style={styles.modalBtns}>
                      <Pressable
                        style={styles.modalCancelBtn}
                        onPress={() => {
                          if (editingKey) {
                            setCustomTargets((prev) => {
                              const next = { ...prev };
                              delete next[editingKey];
                              return next;
                            });
                          }
                          setEditingKey(null);
                        }}
                      >
                        <ThemedText variant="bodySmall" style={{ color: colors.textMuted }}>Reset to default</ThemedText>
                      </Pressable>
                      <Pressable style={[styles.modalSaveBtn, { backgroundColor: accentColor }]} onPress={saveEditTarget}>
                        <ThemedText variant="bodySmall" style={{ color: "#fff", fontWeight: "700" }}>Save</ThemedText>
                      </Pressable>
                    </View>
                  </>
                );
              })()}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
    backgroundColor: colors.bgSection, alignItems: "center", justifyContent: "center",
  },
  progressContainer: { flex: 1, alignItems: "center", marginHorizontal: spacing.lg },
  progressTrack: {
    width: "100%", height: 3, backgroundColor: colors.bgSection,
    borderRadius: 2, marginBottom: spacing.xs, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.buttonPrimary, borderRadius: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { marginTop: spacing.lg, marginBottom: spacing.xs, letterSpacing: 1.5, fontSize: 11 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.md, lineHeight: 22 },
  legendRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    marginBottom: spacing.lg, flexWrap: "wrap",
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  section: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { marginBottom: 0 },
  item: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgSection, borderRadius: radii.md, marginBottom: spacing.xs,
    borderWidth: 1.5, borderColor: "transparent",
    paddingVertical: spacing.sm, paddingRight: spacing.md, overflow: "hidden",
  },
  itemSelected: { backgroundColor: "rgba(45,52,53,0.07)", borderColor: "rgba(45,52,53,0.3)" },
  itemLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  colorBar: { width: 3, height: "100%", minHeight: 48, marginRight: spacing.md, borderRadius: 2 },
  itemText: { flex: 1, paddingRight: spacing.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  itemName: { fontWeight: "600", color: colors.textMuted },
  suggestedBadge: {
    backgroundColor: "rgba(45,52,53,0.12)", paddingHorizontal: 6,
    paddingVertical: 1, borderRadius: radii.pill,
  },
  suggestedText: { color: colors.buttonPrimary, fontWeight: "600", fontSize: 9 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  editTargetBtn: {
    padding: 3, borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
  showMoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.sm, marginTop: spacing.xs,
    borderRadius: radii.md, backgroundColor: colors.bgSection,
    borderWidth: 1, borderColor: colors.borderSubtle,
    borderStyle: "dashed",
  },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  footerNote: { textAlign: "center", marginBottom: spacing.sm },
  continueButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingVertical: spacing.lg,
    borderRadius: radii.pill, overflow: "hidden",
  },
  continueText: { color: "#fff", fontWeight: "700" },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center", alignItems: "center", padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.bgCard, borderRadius: radii.xl,
    padding: spacing.xl, width: "100%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
  },
  targetInput: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 2, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  targetInputText: {
    flex: 1, fontSize: 28, fontWeight: "700", textAlign: "center",
  },
  modalBtns: { flexDirection: "row", gap: spacing.sm },
  modalCancelBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.md, borderRadius: radii.md,
    backgroundColor: colors.bgSection,
  },
  modalSaveBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.md, borderRadius: radii.md,
  },
});
