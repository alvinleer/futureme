import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ImageBackground,
  Text,
  Switch,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  FlatList,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pedometer } from "expo-sensors";
import * as FileSystem from "expo-file-system/legacy";
import { RootStackParamList } from "../navigation/RootNavigator";
import useOnboardingStore from "../state/onboardingStore";
import useFuturePhotoStore from "../state/futurePhotoStore";
import { resolvePhotoUri } from "../utils/photoStorage";
import { ThemedText } from "../components/ThemedText";
import { colors, spacing, radii } from "../theme";
import {
  ActivityProfile,
  CardioIntensity,
  OnboardingStats,
  calculateTDEEFromProfile,
  DEFAULT_ACTIVITY_PROFILE,
} from "../types/onboarding";
import useDietStore from "../state/dietStore";
import { BodyMeasurementEntry } from "../types/diet";
import { useAuthStore } from "../state/authStore";
import { authService } from "../api/auth-service";

type AccountScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

function CardBanner({ uri, icon, title, gradient, sectionLabel, onAddNew }: {
  uri: string | number; icon: string; title: string; gradient: [string, string, string];
  sectionLabel?: string; onAddNew?: () => void;
}) {
  const source = typeof uri === "number" ? uri : { uri };
  return (
    <ImageBackground source={source} style={{ width: "100%", height: 120, overflow: "hidden" }} resizeMode="cover">
      <LinearGradient
        colors={gradient}
        style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 12, justifyContent: "flex-end" }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        {sectionLabel ? (
          <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)", letterSpacing: 1.6, marginBottom: 7 }}>
            {sectionLabel}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon as any} size={20} color="#fff" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, flex: 1, includeFontPadding: false, textAlignVertical: "center" }}>{title}</Text>
          {onAddNew ? (
            <Pressable onPress={onAddNew} style={{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{"+ Add"}</Text>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

type Gender = "male" | "female" | "other";

const GENDER_OPTIONS: { value: Gender | null; label: string; emoji: string }[] = [
  { value: "male", label: "Male", emoji: "♂" },
  { value: "female", label: "Female", emoji: "♀" },
  { value: "other", label: "Other", emoji: "—" },
];

const STRENGTH_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const CARDIO_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const DURATION_OPTIONS = [15, 20, 30, 45, 60, 75, 90];
const INTENSITY_OPTIONS: { value: CardioIntensity; label: string }[] = [
  { value: "light", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "intense", label: "Hard" },
];

// ─── Small reusable components ────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText variant="caption" muted style={styles.sectionLabel}>{children}</ThemedText>
  );
}

function InlineField({
  label,
  value,
  onChangeText,
  placeholder,
  unit,
  keyboardType = "decimal-pad",
  maxLength = 5,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  unit?: string;
  keyboardType?: "decimal-pad" | "number-pad";
  maxLength?: number;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={styles.inlineField}>
      <ThemedText variant="caption" muted style={styles.inlineFieldLabel}>{label}</ThemedText>
      <View style={[styles.inlineFieldBox, focused && { borderColor: colors.brandPrimary }]}>
        <TextInput
          style={styles.inlineFieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "—"}
          placeholderTextColor="#ADADAD"
          keyboardType={keyboardType}
          maxLength={maxLength}
          selectTextOnFocus
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {unit ? <ThemedText variant="caption" style={{ marginLeft: 2, color: "#6B7280" }}>{unit}</ThemedText> : null}
      </View>
    </View>
  );
}

function PillSelector<T extends number | string>({
  options,
  selected,
  onSelect,
  getLabel,
}: {
  options: T[];
  selected: T;
  onSelect: (v: T) => void;
  getLabel?: (v: T) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.pillRow}>
        {options.map((opt) => {
          const active = opt === selected;
          return (
            <Pressable
              key={String(opt)}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => onSelect(opt)}
            >
              <ThemedText
                variant="caption"
                style={[styles.pillText, active && styles.pillTextActive]}
              >
                {getLabel ? getLabel(opt) : String(opt)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const navigation = useNavigation<AccountScreenNavigationProp>();
  const insets = useSafeAreaInsets();

  const beforePhotoUri = resolvePhotoUri(useFuturePhotoStore((s) => s.profilePhotoUri));
  const setBeforePhoto = useFuturePhotoStore((s) => s.setProfilePhoto);

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const sourceUri = result.assets[0].uri;
      const destUri = `${FileSystem.documentDirectory}profile-photo-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
      setBeforePhoto(destUri);
    }
  };

  const isOnboardingComplete = useOnboardingStore((s) => s.isComplete);
  const skippedAt = useOnboardingStore((s) => s.skippedAt);
  const unitSystem = useOnboardingStore((s) => s.unitSystem);
  const setUnitSystem = useOnboardingStore((s) => s.setUnitSystem);
  const stats = useOnboardingStore((s) => s.stats);
  const setStats = useOnboardingStore((s) => s.setStats);
  const goal = useOnboardingStore((s) => s.goal);
  const activityProfile = useOnboardingStore((s) => s.activityProfile);
  const setActivityProfile = useOnboardingStore((s) => s.setActivityProfile);
  const setCalories = useOnboardingStore((s) => s.setCalories);
  const updateNutritionGoal = useDietStore((s) => s.updateNutritionGoal);
  const coachMessagesEnabled = useDietStore((s) => s.coachMessagesEnabled);
  const toggleCoachMessages = useDietStore((s) => s.toggleCoachMessages);
  const bodyMeasurements = useDietStore((s) => s.bodyMeasurements);
  const addBodyMeasurement = useDietStore((s) => s.addBodyMeasurement);
  const deleteBodyMeasurement = useDietStore((s) => s.deleteBodyMeasurement);
  const getTrackedBodyParts = useDietStore((s) => s.getTrackedBodyParts);
  const getLatestMeasurementForPart = useDietStore((s) => s.getLatestMeasurementForPart);
  const getMeasurementHistoryForPart = useDietStore((s) => s.getMeasurementHistoryForPart);

  const token = useAuthStore((s) => s.token);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logout = useAuthStore((s) => s.logout);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (refreshToken) await authService.logout(refreshToken).catch(() => {});
    logout();
    setShowLogoutModal(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const result = await authService.deleteAccount(token ?? "");
      if (result.success) {
        logout();
      } else {
        setDeleteError(result.error ?? "Could not delete account. Please try again.");
      }
    } catch {
      setDeleteError("Could not reach the server. Check your connection.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const isImperial = unitSystem === "imperial";
  const saved_profile = activityProfile ?? DEFAULT_ACTIVITY_PROFILE;

  // ── Personal info state ────────────────────────────────────────────────────
  const [gender, setGender] = useState<Gender>("other");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [age, setAge] = useState("");

  // Initialise from store on mount
  useEffect(() => {
    if (stats) {
      setGender(stats.gender);
      setAge(String(stats.age));
      setWeightKg(String(stats.weightKg));
      const cm = stats.heightCm;
      setHeightCm(String(cm));
      const totalInches = cm / 2.54;
      setHeightFt(String(Math.floor(totalInches / 12)));
      setHeightIn(String(Math.round(totalInches % 12)));
    }
  }, []);

  // Resolve cm from whichever unit is active
  const resolvedHeightCm = isImperial
    ? (parseInt(heightFt, 10) * 12 + parseInt(heightIn, 10)) * 2.54
    : parseFloat(heightCm);

  // ── Activity profile state ─────────────────────────────────────────────────
  const [draft, setDraft] = useState<ActivityProfile>(saved_profile);
  const [stepsInput, setStepsInput] = useState(String(saved_profile.dailySteps));
  const [bfInput, setBfInput] = useState(
    saved_profile.bodyFatPercent != null ? String(saved_profile.bodyFatPercent) : ""
  );

  // ── Body Measurements state ────────────────────────────────────────────────
  const SUGGESTED_PARTS = ["Waist", "Chest", "Hips", "Biceps (L)", "Biceps (R)", "Thighs", "Neck", "Shoulders", "Calves", "Forearms"];

  const getMeasurementIcon = (part: string): { icon: string; color: string; bg: string; label: string } => {
    const p = part.toLowerCase();
    if (p.includes("waist")) return { icon: "body-outline", color: "#fff", bg: "#3B82F6", label: "Core circumference" };
    if (p.includes("chest")) return { icon: "body-outline", color: "#fff", bg: "#8B5CF6", label: "Upper body" };
    if (p.includes("hip")) return { icon: "body-outline", color: "#fff", bg: "#EC4899", label: "Hip circumference" };
    if (p.includes("bicep")) return { icon: "barbell-outline", color: "#fff", bg: "#F59E0B", label: p.includes("(l)") ? "Left arm" : p.includes("(r)") ? "Right arm" : "Arm" };
    if (p.includes("thigh")) return { icon: "walk-outline", color: "#fff", bg: "#10B981", label: "Upper leg" };
    if (p.includes("neck")) return { icon: "person-outline", color: "#fff", bg: "#6366F1", label: "Neck circumference" };
    if (p.includes("shoulder")) return { icon: "body-outline", color: "#fff", bg: "#0891B2", label: "Shoulder width" };
    if (p.includes("calf") || p.includes("calve")) return { icon: "footsteps-outline", color: "#fff", bg: "#84CC16", label: "Lower leg" };
    if (p.includes("forearm")) return { icon: "barbell-outline", color: "#fff", bg: "#F97316", label: "Lower arm" };
    return { icon: "fitness-outline", color: "#fff", bg: colors.brandTeal, label: "Body measurement" };
  };
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [selectedHistoryPart, setSelectedHistoryPart] = useState<string | null>(null);
  const [measurePart, setMeasurePart] = useState("");
  const [measureCustomPart, setMeasureCustomPart] = useState("");
  const [measureValue, setMeasureValue] = useState("");
  const [measureUnit, setMeasureUnit] = useState<"cm" | "in">(unitSystem === "imperial" ? "in" : "cm");

  const trackedParts = getTrackedBodyParts();

  const openAddMeasurement = (prefillPart?: string) => {
    if (prefillPart && !SUGGESTED_PARTS.includes(prefillPart)) {
      setMeasurePart("__custom__");
      setMeasureCustomPart(prefillPart);
    } else {
      setMeasurePart(prefillPart ?? "");
      setMeasureCustomPart("");
    }
    setMeasureValue("");
    setShowMeasurementModal(true);
  };

  const handleSaveMeasurement = () => {
    const part = measurePart === "__custom__" ? measureCustomPart.trim() : measurePart;
    const val = parseFloat(measureValue);
    if (!part || isNaN(val) || val <= 0) return;
    addBodyMeasurement({ bodyPart: part, value: val, unit: measureUnit, timestamp: Date.now() });
    setShowMeasurementModal(false);
  };

  // ── Pedometer ─────────────────────────────────────────────────────────────
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const [pedometerPermission, setPedometerPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [deviceSteps, setDeviceSteps] = useState<number | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);

  const stepsSource = draft.stepsSource;

  const fetchDeviceSteps = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const { status } = await Pedometer.requestPermissionsAsync();
      if (status !== "granted") { setPedometerPermission("denied"); return; }
      setPedometerPermission("granted");
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      const result = await Pedometer.getStepCountAsync(start, end);
      const avgDaily = Math.round(result.steps / 7);
      setDeviceSteps(avgDaily);
      setStepsInput(String(avgDaily));
      setDraft((d) => ({ ...d, dailySteps: avgDaily }));
    } catch {
      setPedometerPermission("denied");
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  useEffect(() => {
    Pedometer.isAvailableAsync().then(setPedometerAvailable).catch(() => setPedometerAvailable(false));
  }, []);

  useEffect(() => {
    if (stepsSource === "device" && pedometerAvailable) fetchDeviceSteps();
  }, [stepsSource, pedometerAvailable]);

  // ── Derived TDEE ──────────────────────────────────────────────────────────
  const currentProfile: ActivityProfile = {
    ...draft,
    dailySteps: stepsSource === "device" && deviceSteps != null ? deviceSteps : parseInt(stepsInput, 10) || 7000,
    bodyFatPercent: bfInput ? parseFloat(bfInput) : null,
  };

  const effectiveStats: OnboardingStats = {
    gender,
    heightCm: resolvedHeightCm > 0 ? resolvedHeightCm : (stats?.heightCm ?? 170),
    weightKg: parseFloat(weightKg) || stats?.weightKg || 75,
    age: parseInt(age, 10) || stats?.age || 30,
    lifestyle: stats?.lifestyle ?? "moderate",
  };

  const breakdown = calculateTDEEFromProfile(effectiveStats, currentProfile);
  const hasPersonalInfo = !!(heightCm || (heightFt && heightIn)) && !!age;

  const menuItems = [
    {
      id: "onboarding",
      title: isOnboardingComplete ? "Edit Fitness Plan" : "Set Up Fitness Plan",
      subtitle: isOnboardingComplete ? "Update your goals and targets" : "Create your personalized plan",
      icon: "rocket" as const,
      highlight: !isOnboardingComplete && !skippedAt,
      onPress: () =>
        navigation.navigate(isOnboardingComplete ? "OnboardingGoal" : "OnboardingStats"),
    },
    {
      id: "goals",
      title: "Goals",
      subtitle: "Track weight and nutrition targets",
      icon: "trophy" as const,
      image: require("../../assets/images/target-icon.png") as number,
      highlight: false,
      onPress: () => navigation.navigate("GoalTracker"),
    },
    {
      id: "about",
      title: "About",
      subtitle: "App information",
      icon: "information-circle-outline" as const,
      highlight: false,
      onPress: () => {},
    },
  ];

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={[styles.profileHeader, { paddingTop: insets.top + spacing.lg }]}>
            <Pressable onPress={pickProfilePhoto} style={styles.avatarWrapper}>
              <View style={styles.avatarCircle}>
                {beforePhotoUri ? (
                  <Image source={{ uri: beforePhotoUri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={44} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </Pressable>
            <ThemedText variant="h2" style={styles.profileTitle}>Your Account</ThemedText>
            <ThemedText variant="caption" muted>Manage your profile and settings</ThemedText>
          </View>

          {/* ── Preferences ───────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.card}>
              <CardBanner
                uri="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=70&fit=crop"
                icon="options-outline"
                title="Preferences"
                sectionLabel="PREFERENCES"
                gradient={["rgba(15,74,69,0.92)", "rgba(15,74,69,0.55)", "rgba(15,74,69,0.1)"]}
              />
              <View style={styles.rowInner}>
                <View style={styles.iconWrap}>
                  <Ionicons name="resize-outline" size={20} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="body" style={styles.rowTitle}>Measurement Units</ThemedText>
                  <ThemedText variant="caption" muted>
                    {isImperial ? "Imperial (lbs, ft/in)" : "Metric (kg, cm)"}
                  </ThemedText>
                </View>
                <View style={styles.toggleTrack}>
                  <Pressable style={[styles.togglePill, !isImperial && styles.togglePillActive]} onPress={() => setUnitSystem("metric")}>
                    <ThemedText variant="caption" style={[styles.toggleText, !isImperial && styles.toggleTextActive]}>kg</ThemedText>
                  </Pressable>
                  <Pressable style={[styles.togglePill, isImperial && styles.togglePillActive]} onPress={() => setUnitSystem("imperial")}>
                    <ThemedText variant="caption" style={[styles.toggleText, isImperial && styles.toggleTextActive]}>lbs</ThemedText>
                  </Pressable>
                </View>
              </View>
              <View style={[styles.rowInner, { borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.md }]}>
                <View style={styles.iconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="body" style={styles.rowTitle}>AI Recommendations</ThemedText>
                  <ThemedText variant="caption" muted>
                    {coachMessagesEnabled ? "Coach tips shown after logging meals" : "Coach tips are turned off"}
                  </ThemedText>
                </View>
                <Switch
                  value={coachMessagesEnabled}
                  onValueChange={toggleCoachMessages}
                  trackColor={{ false: colors.borderSubtle, true: "#14B8A6" }}
                  thumbColor="#fff"
                  ios_backgroundColor={colors.borderSubtle}
                />
              </View>
            </View>
          </View>
          <View style={styles.section}>
            <View style={styles.card}>
              <CardBanner
                uri="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=70&fit=crop"
                icon="person-outline"
                title="Personal Info"
                sectionLabel="PERSONAL INFO"
                gradient={["rgba(30,60,114,0.9)", "rgba(30,60,114,0.55)", "rgba(30,60,114,0.05)"]}
              />

              {/* Gender */}
              <View style={[styles.columnInner, styles.rowBorder]}>
                <View style={[styles.rowInner, { paddingBottom: spacing.xs }]}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="person-outline" size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={styles.rowTitle}>Gender</ThemedText>
                    <ThemedText variant="caption" muted>Optional — affects BMR formula</ThemedText>
                  </View>
                </View>
                <View style={styles.genderRow}>
                  {GENDER_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value ?? "null"}
                      style={[styles.genderPill, gender === opt.value && styles.genderPillActive]}
                      onPress={() => opt.value && setGender(opt.value)}
                    >
                      <ThemedText
                        variant="caption"
                        style={[styles.genderText, gender === opt.value && styles.genderTextActive]}
                      >
                        {opt.emoji}{"  "}{opt.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Height + Age on same row */}
              <View style={[styles.rowInner, styles.rowBorder]}>
                <View style={styles.iconWrap}>
                  <Ionicons name="body-outline" size={20} color={colors.textPrimary} />
                </View>
                {isImperial ? (
                  <View style={styles.multiFieldRow}>
                    <InlineField label="HEIGHT" value={heightFt} onChangeText={setHeightFt} placeholder="5" unit="ft" maxLength={1} />
                    <InlineField label="" value={heightIn} onChangeText={setHeightIn} placeholder="9" unit="in" maxLength={2} />
                    <InlineField label="AGE" value={age} onChangeText={setAge} placeholder="28" unit="yr" keyboardType="number-pad" maxLength={3} />
                  </View>
                ) : (
                  <View style={styles.multiFieldRow}>
                    <InlineField label="HEIGHT" value={heightCm} onChangeText={setHeightCm} placeholder="175" unit="cm" />
                    <InlineField label="AGE" value={age} onChangeText={setAge} placeholder="28" unit="yr" keyboardType="number-pad" maxLength={3} />
                  </View>
                )}
              </View>

              {/* Weight */}
              <View style={styles.rowInner}>
                <View style={styles.iconWrap}>
                  <Ionicons name="scale-outline" size={20} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="body" style={styles.rowTitle}>Current Weight</ThemedText>
                  <ThemedText variant="caption" muted>Used for macro targets</ThemedText>
                </View>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inlineInput}
                    value={weightKg}
                    onChangeText={setWeightKg}
                    placeholder="75"
                    placeholderTextColor="#ADADAD"
                    keyboardType="decimal-pad"
                    maxLength={5}
                    selectTextOnFocus
                  />
                  <ThemedText variant="caption" muted>{isImperial ? "lbs" : "kg"}</ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* ── Activity & Exercise ───────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.card}>
              <CardBanner
                uri={require("../../assets/activity-banner.jpg")}
                icon="barbell-outline"
                title="Activity & Exercise"
                sectionLabel="ACTIVITY & EXERCISE"
                gradient={["rgba(60,20,80,0.9)", "rgba(60,20,80,0.55)", "rgba(60,20,80,0.05)"]}
              />
              {/* Steps source toggle */}
              <View style={[styles.columnInner, styles.rowBorder]}>
                <View style={styles.rowInner}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="footsteps-outline" size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={styles.rowTitle}>Daily Steps</ThemedText>
                    <ThemedText variant="caption" muted>Excluding exercise — affects NEAT calories</ThemedText>
                  </View>
                </View>
                <View style={styles.sourceToggleRow}>
                  <Pressable
                    style={[styles.sourceTogglePill, stepsSource === "manual" && styles.sourceTogglePillActive]}
                    onPress={() => setDraft((d) => ({ ...d, stepsSource: "manual" }))}
                  >
                    <Ionicons name="pencil-outline" size={14} color={stepsSource === "manual" ? colors.textPrimary : colors.textMuted} />
                    <ThemedText variant="caption" style={[styles.sourceToggleText, stepsSource === "manual" && styles.sourceToggleTextActive]}>
                      Manual
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.sourceTogglePill, stepsSource === "device" && styles.sourceTogglePillActive]}
                    onPress={() => setDraft((d) => ({ ...d, stepsSource: "device" }))}
                  >
                    <Ionicons name="heart-outline" size={14} color={stepsSource === "device" ? colors.textPrimary : colors.textMuted} />
                    <ThemedText variant="caption" style={[styles.sourceToggleText, stepsSource === "device" && styles.sourceToggleTextActive]}>
                      Apple Health
                    </ThemedText>
                  </Pressable>
                </View>

                {stepsSource === "manual" && (
                  <View style={styles.manualStepsRow}>
                    <View style={styles.stepsInputWrapper}>
                      <TextInput
                        style={styles.stepsInput}
                        value={stepsInput}
                        onChangeText={setStepsInput}
                        keyboardType="number-pad"
                        maxLength={6}
                        selectTextOnFocus
                        placeholder="7000"
                        placeholderTextColor={colors.textMuted}
                      />
                      <Ionicons name="pencil" size={13} color={colors.brandPrimary} style={{ marginBottom: 4 }} />
                    </View>
                    <ThemedText variant="bodySmall" muted> steps / day</ThemedText>
                  </View>
                )}

                {stepsSource === "device" && (
                  <View style={styles.devicePanel}>
                    {pedometerAvailable ? (
                      <Pressable style={[styles.deviceRow, styles.deviceRowActive]} onPress={fetchDeviceSteps}>
                        <View style={styles.deviceIcon}>
                          <Ionicons name={Platform.OS === "ios" ? "heart" : "fitness"} size={20} color={Platform.OS === "ios" ? "#FF375F" : "#4CAF50"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText variant="bodySmall" style={{ fontWeight: "600" }}>
                            {Platform.OS === "ios" ? "Apple Health" : "Google Fit"}
                          </ThemedText>
                          {deviceLoading ? (
                            <ThemedText variant="caption" muted>Reading steps...</ThemedText>
                          ) : pedometerPermission === "denied" ? (
                            <ThemedText variant="caption" style={{ color: colors.warning }}>Permission denied — tap to retry</ThemedText>
                          ) : deviceSteps != null ? (
                            <ThemedText variant="caption" style={{ color: colors.success }}>
                              {deviceSteps.toLocaleString()} avg steps/day (last 7 days)
                            </ThemedText>
                          ) : (
                            <ThemedText variant="caption" muted>Tap to connect</ThemedText>
                          )}
                        </View>
                        <View style={[styles.connectedDot, deviceSteps != null && pedometerPermission === "granted" && styles.connectedDotActive]} />
                      </Pressable>
                    ) : (
                      <View style={styles.deviceRow}>
                        <View style={styles.deviceIcon}>
                          <Ionicons name="warning-outline" size={18} color={colors.textMuted} />
                        </View>
                        <ThemedText variant="caption" muted>Pedometer not available on this device</ThemedText>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Body fat % */}
              <View style={[styles.rowInner, styles.rowBorder]}>
                <View style={styles.iconWrap}>
                  <Ionicons name="analytics-outline" size={20} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="body" style={styles.rowTitle}>Body Fat %</ThemedText>
                  <ThemedText variant="caption" muted>
                    {bfInput ? "Katch-McArdle BMR active" : "Optional — improves BMR accuracy"}
                  </ThemedText>
                </View>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inlineInput}
                    value={bfInput}
                    onChangeText={setBfInput}
                    keyboardType="decimal-pad"
                    maxLength={4}
                    placeholder="—"
                    placeholderTextColor="#ADADAD"
                    selectTextOnFocus
                  />
                  {bfInput ? <ThemedText variant="caption" muted>%</ThemedText> : null}
                </View>
              </View>

              {/* Strength */}
              <View style={[styles.columnInner, styles.rowBorder]}>
                <View style={styles.rowInner}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="barbell-outline" size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={styles.rowTitle}>Strength Training</ThemedText>
                    <ThemedText variant="caption" muted>Sessions per week (~300 kcal each)</ThemedText>
                  </View>
                  <ThemedText variant="h3">{draft.strengthSessionsPerWeek}x</ThemedText>
                </View>
                <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                  <PillSelector options={STRENGTH_OPTIONS} selected={draft.strengthSessionsPerWeek}
                    onSelect={(v) => setDraft((d) => ({ ...d, strengthSessionsPerWeek: v }))}
                    getLabel={(v) => v === 0 ? "None" : String(v)} />
                </View>
              </View>

              {/* Cardio */}
              <View style={[styles.columnInner, draft.cardioSessionsPerWeek > 0 ? styles.rowBorder : undefined]}>
                <View style={styles.rowInner}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="bicycle-outline" size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={styles.rowTitle}>Cardio</ThemedText>
                    <ThemedText variant="caption" muted>Sessions per week</ThemedText>
                  </View>
                  <ThemedText variant="h3">{draft.cardioSessionsPerWeek}x</ThemedText>
                </View>
                <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                  <PillSelector options={CARDIO_OPTIONS} selected={draft.cardioSessionsPerWeek}
                    onSelect={(v) => setDraft((d) => ({ ...d, cardioSessionsPerWeek: v }))}
                    getLabel={(v) => v === 0 ? "None" : String(v)} />
                </View>
              </View>

              {draft.cardioSessionsPerWeek > 0 && (
                <>
                  <View style={[styles.columnInner, styles.rowBorder]}>
                    <View style={[styles.rowInner, { paddingBottom: spacing.xs }]}>
                      <View style={[styles.iconWrap, { backgroundColor: "transparent" }]} />
                      <ThemedText variant="bodySmall" style={{ fontWeight: "600" }}>Duration per session</ThemedText>
                    </View>
                    <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                      <PillSelector options={DURATION_OPTIONS} selected={draft.cardioMinutesPerSession}
                        onSelect={(v) => setDraft((d) => ({ ...d, cardioMinutesPerSession: v }))}
                        getLabel={(v) => `${v}m`} />
                    </View>
                  </View>
                  <View style={styles.columnInner}>
                    <View style={[styles.rowInner, { paddingBottom: spacing.xs }]}>
                      <View style={[styles.iconWrap, { backgroundColor: "transparent" }]} />
                      <ThemedText variant="bodySmall" style={{ fontWeight: "600" }}>Intensity</ThemedText>
                    </View>
                    <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                      <PillSelector options={INTENSITY_OPTIONS.map((o) => o.value)} selected={draft.cardioIntensity}
                        onSelect={(v) => setDraft((d) => ({ ...d, cardioIntensity: v }))}
                        getLabel={(v) => INTENSITY_OPTIONS.find((o) => o.value === v)?.label ?? v} />
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* TDEE Preview */}
            <View style={styles.tdeeCard}>
              <View style={styles.tdeeHeader}>
                <ThemedText variant="bodySmall" style={{ fontWeight: "600" }}>Estimated Daily Calories</ThemedText>
                <ThemedText variant="caption" muted>
                  {breakdown.bmrMethod === "katch-mcardle" ? "Katch-McArdle" : "Mifflin-St Jeor"}
                </ThemedText>
              </View>
              <View style={styles.tdeeRow}>
                <View style={styles.tdeeStat}>
                  <ThemedText variant="caption" muted>BMR</ThemedText>
                  <ThemedText variant="h3">{breakdown.bmr.toLocaleString()}</ThemedText>
                </View>
                <ThemedText variant="caption" muted>+</ThemedText>
                <View style={styles.tdeeStat}>
                  <ThemedText variant="caption" muted>Steps</ThemedText>
                  <ThemedText variant="h3">{breakdown.stepCalories.toLocaleString()}</ThemedText>
                </View>
                <ThemedText variant="caption" muted>+</ThemedText>
                <View style={styles.tdeeStat}>
                  <ThemedText variant="caption" muted>Exercise</ThemedText>
                  <ThemedText variant="h3">{breakdown.exerciseCalories.toLocaleString()}</ThemedText>
                </View>
                <View style={styles.tdeeDivider} />
                <View style={[styles.tdeeStat, { alignItems: "flex-end" }]}>
                  <ThemedText variant="caption" muted>TDEE</ThemedText>
                  <ThemedText variant="h2" style={{ color: colors.brandPrimary }}>{breakdown.tdee.toLocaleString()}</ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* ── Body Measurements ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.card}>
              <CardBanner
                uri={require("../../assets/measurements-banner.jpg")}
                icon="body-outline"
                title="Body Measurements"
                sectionLabel="BODY MEASUREMENTS"
                onAddNew={() => openAddMeasurement()}
                gradient={["rgba(14,100,80,0.9)", "rgba(14,100,80,0.55)", "rgba(14,100,80,0.05)"]}
              />
              {trackedParts.length === 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.rowInner, { justifyContent: "space-between" }, pressed && { opacity: 0.6 }]}
                  onPress={() => openAddMeasurement()}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                    <View style={styles.iconWrap}>
                      <Ionicons name="add" size={20} color={colors.brandTeal} />
                    </View>
                    <View>
                      <ThemedText variant="body" style={styles.rowTitle}>{"Track measurements"}</ThemedText>
                      <ThemedText variant="caption" muted>{"Waist, chest, hips & more"}</ThemedText>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ) : (
                <>
                  {trackedParts.map((part, index) => {
                    const latest = getLatestMeasurementForPart(part);
                    const iconInfo = getMeasurementIcon(part);
                    return (
                      <Pressable
                        key={part}
                        style={({ pressed }) => [
                          styles.rowInner,
                          { justifyContent: "space-between" },
                          index < trackedParts.length - 1 && styles.rowBorder,
                          pressed && { opacity: 0.6 },
                        ]}
                        onPress={() => setSelectedHistoryPart(part)}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                          <View style={styles.iconWrap}>
                            <Ionicons name={iconInfo.icon as any} size={20} color={colors.textPrimary} />
                          </View>
                          <View>
                            <ThemedText variant="body" style={styles.rowTitle}>{part}</ThemedText>
                            <ThemedText variant="caption" muted>{iconInfo.label}</ThemedText>
                          </View>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          {latest ? (
                            <ThemedText variant="body" muted>{latest.value} {latest.unit}</ThemedText>
                          ) : (
                            <ThemedText variant="caption" muted>{"No data"}</ThemedText>
                          )}
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>
          </View>

          {/* ── Account Menu ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.card}>
              <CardBanner
                uri={require("../../assets/account-banner.jpg")}
                icon="person-circle-outline"
                title="Account"
                sectionLabel="ACCOUNT"
                gradient={["rgba(40,40,40,0.92)", "rgba(40,40,40,0.55)", "rgba(40,40,40,0.05)"]}
              />
              {menuItems.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={item.onPress}
                  style={({ pressed }) => pressed ? { opacity: 0.6 } : {}}
                >
                  <View
                    className="flex-row items-center px-4 py-4 gap-3"
                    style={index < menuItems.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle } : undefined}
                  >
                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: colors.bgMain }}>
                      {(item as any).image ? (
                        <Image source={(item as any).image} style={{ width: 22, height: 22, tintColor: colors.textPrimary }} resizeMode="contain" />
                      ) : (
                        <Ionicons name={item.icon} size={20} color={colors.textPrimary} />
                      )}
                    </View>
                    <View className="flex-1">
                      <ThemedText variant="body" style={styles.rowTitle}>{item.title}</ThemedText>
                      <ThemedText variant="caption" muted>{item.subtitle}</ThemedText>
                    </View>
                    {item.highlight && (
                      <View style={styles.newBadge}>
                        <ThemedText variant="caption" style={styles.newBadgeText}>New</ThemedText>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── Account Actions ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.card}>
              <Pressable
                onPress={() => setShowLogoutModal(true)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <View style={[styles.rowInner, { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}>
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: colors.bgMain }}>
                    <Ionicons name="log-out-outline" size={20} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountActionText}>Log Out</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
              <Pressable
                onPress={() => { setDeleteConfirmText(""); setDeleteError(null); setShowDeleteModal(true); }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <View style={styles.rowInner}>
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: "rgba(220,38,38,0.08)" }}>
                    <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountActionText, { color: "#dc2626" }]}>Delete Account</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Add Measurement Modal ──────────────────────────────────────── */}
      <Modal visible={showMeasurementModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Log Measurement</Text>

                <Text style={styles.modalLabel}>Body Part</Text>
                <View style={styles.partGrid}>
                  {SUGGESTED_PARTS.map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.partChip, measurePart === p && styles.partChipActive]}
                      onPress={() => setMeasurePart(p)}
                    >
                      <Text style={[styles.partChipText, measurePart === p && styles.partChipTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.partChip, measurePart === "__custom__" && styles.partChipActive]}
                    onPress={() => setMeasurePart("__custom__")}
                  >
                    <Text style={[styles.partChipText, measurePart === "__custom__" && styles.partChipTextActive]}>{"+ Custom"}</Text>
                  </Pressable>
                </View>

                {measurePart === "__custom__" && (
                  <TextInput
                    style={styles.customPartInput}
                    placeholder={"e.g. Left Quad"}
                    placeholderTextColor={colors.textMuted}
                    value={measureCustomPart}
                    onChangeText={setMeasureCustomPart}
                  />
                )}

                <Text style={styles.modalLabel}>Measurement</Text>
                <View style={styles.measureInputRow}>
                  <TextInput
                    style={styles.measureInput}
                    placeholder={"0.0"}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    value={measureValue}
                    onChangeText={setMeasureValue}
                  />
                  <View style={styles.unitToggle}>
                    <Pressable
                      style={[styles.unitBtn, measureUnit === "cm" && styles.unitBtnActive]}
                      onPress={() => setMeasureUnit("cm")}
                    >
                      <Text style={[styles.unitBtnText, measureUnit === "cm" && styles.unitBtnTextActive]}>cm</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.unitBtn, measureUnit === "in" && styles.unitBtnActive]}
                      onPress={() => setMeasureUnit("in")}
                    >
                      <Text style={[styles.unitBtnText, measureUnit === "in" && styles.unitBtnTextActive]}>in</Text>
                    </Pressable>
                  </View>
                </View>

                <Pressable style={styles.modalSaveBtn} onPress={handleSaveMeasurement}>
                  <Text style={styles.modalSaveBtnText}>Save</Text>
                </Pressable>

                <Pressable
                  style={{ alignItems: "center", marginTop: 12 }}
                  onPress={() => setShowMeasurementModal(false)}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Measurement History Modal ────────────────────────────────── */}
      <Modal visible={!!selectedHistoryPart} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setSelectedHistoryPart(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, { maxHeight: "75%" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
                  <Text style={styles.modalTitle}>{selectedHistoryPart}</Text>
                  <Pressable onPress={() => setSelectedHistoryPart(null)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
                {selectedHistoryPart && (() => {
                  const history = getMeasurementHistoryForPart(selectedHistoryPart);
                  if (history.length === 0) {
                    return <Text style={{ color: colors.textMuted, textAlign: "center", marginVertical: spacing.xl }}>No entries yet.</Text>;
                  }
                  const first = history[0];
                  const latest = history[history.length - 1];
                  const totalChange = latest.value - first.value;
                  const unit = latest.unit;
                  return (
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {history.length > 1 && (
                        <View style={{ flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.bgMain, borderRadius: 12, padding: 14, marginBottom: spacing.md }}>
                          <View style={{ alignItems: "center" }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>START</Text>
                            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textPrimary }}>{first.value} {unit}</Text>
                          </View>
                          <View style={{ alignItems: "center" }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>CHANGE</Text>
                            <Text style={{ fontSize: 18, fontWeight: "700", color: totalChange < 0 ? colors.success : totalChange > 0 ? colors.error : colors.textMuted }}>
                              {totalChange > 0 ? "+" : ""}{totalChange.toFixed(1)} {unit}
                            </Text>
                          </View>
                          <View style={{ alignItems: "center" }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>NOW</Text>
                            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textPrimary }}>{latest.value} {unit}</Text>
                          </View>
                        </View>
                      )}
                      {[...history].reverse().map((entry, i) => (
                        <View
                          key={entry.id}
                          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderBottomColor: colors.borderSubtle }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                            {new Date(entry.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </Text>
                          <Text style={{ fontWeight: "600", fontSize: 16, color: colors.textPrimary }}>
                            {entry.value} {entry.unit}
                          </Text>
                        </View>
                      ))}
                      <Pressable
                        style={[styles.modalSaveBtn, { marginTop: spacing.lg }]}
                        onPress={() => openAddMeasurement(selectedHistoryPart)}
                      >
                        <Text style={styles.modalSaveBtnText}>{"+ Add Entry"}</Text>
                      </Pressable>
                    </ScrollView>
                  );
                })()}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Logout Confirmation Modal ────────────────────────────────── */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { gap: spacing.md }]}>
            <View style={{ alignItems: "center", gap: spacing.xs }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgMain, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <Ionicons name="log-out-outline" size={24} color={colors.textPrimary} />
              </View>
              <Text style={styles.modalTitle}>Log Out</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center" }}>{"Are you sure you want to log out of your account?"}</Text>
            </View>
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [styles.modalSaveBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.modalSaveBtnText}>Log Out</Text>
            </Pressable>
            <Pressable onPress={() => setShowLogoutModal(false)} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account Modal ─────────────────────────────────────── */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, { gap: spacing.md }]}>
                <View style={{ alignItems: "center", gap: spacing.xs }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(220,38,38,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                    <Ionicons name="trash-outline" size={24} color="#dc2626" />
                  </View>
                  <Text style={[styles.modalTitle, { color: "#dc2626" }]}>Delete Account</Text>
                  <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center" }}>{"This will permanently delete your account and all your data. This cannot be undone."}</Text>
                </View>
                <View>
                  <Text style={[styles.modalLabel, { marginTop: 0 }]}>{"Type DELETE to confirm"}</Text>
                  <TextInput
                    style={styles.measureInput}
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    placeholder="DELETE"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
                {deleteError && (
                  <Text style={{ fontSize: 13, color: "#dc2626" }}>{deleteError}</Text>
                )}
                <Pressable
                  onPress={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deleteLoading}
                  style={({ pressed }) => [
                    styles.modalSaveBtn,
                    { backgroundColor: "#dc2626", opacity: deleteConfirmText !== "DELETE" || deleteLoading ? 0.4 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={styles.modalSaveBtnText}>{deleteLoading ? "Deleting..." : "Delete My Account"}</Text>
                </Pressable>
                <Pressable onPress={() => setShowDeleteModal(false)} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  profileHeader: { alignItems: "center", paddingBottom: spacing.xl },
  avatarWrapper: {
    width: 88, height: 88, marginBottom: spacing.md,
  },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.bgSection,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
    overflow: "hidden",
  },
  avatarImage: {
    width: 88, height: 88, borderRadius: 44,
  },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.brandOrange,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  profileTitle: { marginBottom: spacing.xxs },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  sectionLabel: { letterSpacing: 1.2, marginBottom: spacing.xs, paddingLeft: spacing.xxs },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: spacing.xxs, marginBottom: spacing.xs },
  sectionHint: { marginBottom: spacing.sm, paddingLeft: spacing.xxs },
  card: { backgroundColor: "#ffffff", borderRadius: radii.lg, overflow: "hidden" },
  rowInner: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm,
  },
  columnInner: { flexDirection: "column" },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgMain,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontWeight: "600", marginBottom: 2 },
  // Gender
  genderRow: {
    flexDirection: "row", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  genderPill: {
    flex: 1, alignItems: "center", paddingVertical: spacing.sm,
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    borderWidth: 1.5, borderColor: "transparent",
  },
  genderPillActive: { borderColor: colors.brandPrimary },
  genderText: { fontWeight: "600", color: colors.textMuted, fontSize: 13 },
  genderTextActive: { color: colors.textPrimary },
  // Multi-field row (height + age)
  multiFieldRow: { flex: 1, flexDirection: "row", gap: spacing.sm },
  inlineField: { flex: 1 },
  inlineFieldLabel: { fontSize: 10, letterSpacing: 1, marginBottom: spacing.xxs },
  inlineFieldBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgMain,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: "#ADADAD",
    minHeight: 44,
  },
  inlineFieldInput: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    minWidth: 44,
  },
  // Inline input box (weight, BF%)
  inputBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderWidth: 1.5, borderColor: "#ADADAD",
    minWidth: 72, minHeight: 44, justifyContent: "center",
  },
  inlineInput: {
    fontSize: 16, fontWeight: "700", color: colors.textPrimary, textAlign: "center", minWidth: 40,
  },
  // Steps
  sourceToggleRow: {
    flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  sourceTogglePill: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.xs, paddingVertical: spacing.sm,
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    borderWidth: 1.5, borderColor: "transparent",
  },
  sourceTogglePillActive: { borderColor: colors.brandPrimary, backgroundColor: colors.bgMain },
  sourceToggleText: { fontWeight: "600", color: colors.textMuted },
  sourceToggleTextActive: { color: colors.textPrimary },
  manualStepsRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingBottom: spacing.lg,
  },
  stepsInputWrapper: {
    flexDirection: "row", alignItems: "flex-end", gap: 4,
    borderBottomWidth: 2, borderBottomColor: colors.brandPrimary, paddingBottom: 2,
  },
  stepsInput: {
    fontSize: 28, fontWeight: "800", color: colors.brandPrimary, minWidth: 90, textAlign: "right",
  },
  // Device
  devicePanel: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  deviceRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.bgMain, borderRadius: radii.md,
  },
  deviceRowActive: { borderWidth: 1.5, borderColor: colors.borderSubtle },
  deviceIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgSection,
    alignItems: "center", justifyContent: "center",
  },
  connectedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderSubtle },
  connectedDotActive: { backgroundColor: colors.success },
  thirdPartySection: {
    padding: spacing.md, backgroundColor: colors.bgMain, borderRadius: radii.md, gap: spacing.xs,
  },
  thirdPartyTitle: { fontWeight: "600" },
  // Pills
  pillRow: { flexDirection: "row", gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.bgMain, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: "transparent",
  },
  pillActive: { borderColor: colors.brandPrimary },
  pillText: { fontWeight: "600", color: colors.textMuted },
  pillTextActive: { color: colors.textPrimary },
  // TDEE card
  tdeeCard: {
    marginTop: spacing.md, backgroundColor: "#ffffff",
    borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md,
  },
  tdeeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tdeeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  tdeeStat: { alignItems: "center", flex: 1 },
  tdeeDivider: { width: 1, height: 40, backgroundColor: colors.borderSubtle },
  // Toggles
  toggleTrack: { flexDirection: "row", backgroundColor: colors.bgMain, borderRadius: radii.pill, padding: 3 },
  togglePill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xxs + 2, borderRadius: radii.pill },
  togglePillActive: { backgroundColor: colors.brandPrimary },
  toggleText: { fontWeight: "600", color: colors.textMuted },
  toggleTextActive: { color: "#fff" },
  menuRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  // Menu
  newBadge: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill },
  newBadgeText: { color: "#fff", fontWeight: "600" },
  // Body measurements (reuses rowInner, iconWrap, rowBorder from shared styles)
  measureDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandTeal },
  measureAddNewRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  // Measurement modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.lg },
  modalLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginTop: spacing.md },
  partGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  partChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgMain },
  partChipActive: { backgroundColor: colors.brandTeal, borderColor: colors.brandTeal },
  partChipText: { fontSize: 13, color: colors.textPrimary, fontWeight: "500" },
  partChipTextActive: { color: "#fff", fontWeight: "600" },
  measureInputRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 4 },
  measureInput: { flex: 1, backgroundColor: colors.bgMain, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.borderSubtle },
  unitToggle: { flexDirection: "row", backgroundColor: colors.bgMain, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.borderSubtle },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  unitBtnActive: { backgroundColor: "#0d6e6e" },
  unitBtnText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  unitBtnTextActive: { color: "#fff" },
  modalSaveBtn: { backgroundColor: "#0d6e6e", borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: spacing.lg },
  modalSaveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  customPartInput: { backgroundColor: colors.bgMain, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 8 },
  accountActionBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm,
    backgroundColor: "#ffffff", borderRadius: radii.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  accountActionDanger: { borderColor: "rgba(220,38,38,0.2)", backgroundColor: "rgba(220,38,38,0.04)" },
  accountActionText: { fontSize: 15, fontWeight: "600" as const, color: colors.textPrimary },
});
