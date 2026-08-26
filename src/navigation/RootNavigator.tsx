import React, { useState, useRef, useEffect } from "react";
import { View, Pressable, StyleSheet, ActivityIndicator, Modal, Text, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import HomeScreen from "../screens/HomeScreen";
import ProgressScreen from "../screens/ProgressScreen";
import GoalTrackerScreen from "../screens/GoalTrackerScreen";
import FuturePhotoSetupScreen from "../screens/FuturePhotoSetupScreen";
import AccountScreen from "../screens/AccountScreen";
import LogScreen from "../screens/LogScreen";
import FoodCameraScreen from "../screens/FoodCameraScreen";
import AllPhotosScreen from "../screens/AllPhotosScreen";
import PledgesScreen from "../screens/PledgesScreen";
import OnboardingGoalScreen from "../screens/OnboardingGoalScreen";
import OnboardingStatsScreen from "../screens/OnboardingStatsScreen";
import OnboardingCaloriesScreen from "../screens/OnboardingCaloriesScreen";
import OnboardingWorkoutScreen from "../screens/OnboardingWorkoutScreen";
import OnboardingMicronutrientsScreen from "../screens/OnboardingMicronutrientsScreen";
import OnboardingPhotoScreen from "../screens/OnboardingPhotoScreen";
import OnboardingFutureYouScreen from "../screens/OnboardingFutureYouScreen";
import BarcodeScannerScreen from "../screens/BarcodeScannerScreen";
import FutureMeChatScreen from "../screens/FutureMeChatScreen";
import DiaryScreen from "../screens/DiaryScreen";
import EditFoodEntryScreen from "../screens/EditFoodEntryScreen";
import FreeTextFoodScreen from "../screens/FreeTextFoodScreen";
import MealConfirmationScreen from "../screens/MealConfirmationScreen";
import WorkoutConfirmationScreen from "../screens/WorkoutConfirmationScreen";
import LogWorkoutSessionScreen from "../screens/LogWorkoutSessionScreen";
import WorkoutPlanScreen from "../screens/WorkoutPlanScreen";
import EditWorkoutPlanDayScreen from "../screens/EditWorkoutPlanDayScreen";
import VoiceActionConfirmScreen from "../screens/VoiceActionConfirmScreen";
import FavoriteMealsScreen from "../screens/FavoriteMealsScreen";
import LandingScreen from "../screens/auth/LandingScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import useDietStore from "../state/dietStore";
import { useAuthStore } from "../state/authStore";
import useOnboardingStore from "../state/onboardingStore";
import { calculateMacros } from "../types/onboarding";
import {
  CURRENT_MACROS_VERSION,
  buildRecommendedPlan,
} from "../utils/recommendations";
import { transcribeAudio } from "../api/transcribe-audio";
import { getOpenAITextResponse } from "../api/chat-service";
import { analyzeNutritionAdvanced, toMealConfirmationData, enrichMicronutrientsForMeals } from "../api/nutrition-router";
import { colors } from "../theme";

export type RootTabParamList = {
  Home: undefined;
  Camera: undefined;
  Record: undefined;
  Progress: undefined;
  Log: undefined;
};

export type RootStackParamList = {
  // Auth
  Landing: undefined;
  Login: undefined;
  Signup: undefined;
  // App
  MainTabs: undefined;
  FuturePhotoSetup: undefined;
  GoalTracker: undefined;
  Pledges: undefined;
  FoodCamera: { mode?: "camera" | "library" } | undefined;
  BarcodeScanner: { appendToMealJson?: string } | undefined;
  AllPhotos: undefined;
  // Onboarding screens
  OnboardingGoal: undefined;
  OnboardingStats: undefined;
  OnboardingCalories: undefined;
  OnboardingWorkout: undefined;
  OnboardingMicronutrients: undefined;
  OnboardingPhoto: undefined;
  OnboardingFutureYou: undefined;
  FutureMeChat: undefined;
  Diary: undefined;
  EditFoodEntry: { mealId: string };
  FreeTextFood: undefined;
  MealConfirmation: { initialDataJson: string; initialDateMs?: number; existingMealId?: string };
  WorkoutConfirmation: { initialDataJson: string; initialDateMs?: number; existingWorkoutId?: string };
  VoiceActionConfirm: { actionJson: string };
  FavoriteMeals: undefined;
  LogWorkoutSession: { sessionId?: string; planDayOfWeek?: number } | undefined;
  WorkoutPlan: undefined;
  EditWorkoutPlanDay: { dayOfWeek: number };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Dummy screen for the Record tab (we handle recording via the custom button)
function RecordPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />;
}


function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingEditInfo, setPendingEditInfo] = useState<{
    type: "weight" | "measurement";
    value: number;
    unit: string;
    bodyPart?: string;
  } | null>(null);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [editInputValue, setEditInputValue] = useState("");
  const recordingStartTimeRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorMessage("Microphone permission denied. Please enable it in Settings.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Recording failed: ${msg}`);
    }
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — check your connection and try again`)), ms)
      ),
    ]);

  const stopRecording = async () => {
    if (!recording) return;
    const currentRecording = recording;
    const startTime = recordingStartTimeRef.current;
    setIsRecording(false);
    setRecording(null);
    recordingStartTimeRef.current = null;
    try {
      await currentRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      // If recording was under 1.5s, treat as accidental/cancelled — discard silently
      if (startTime && Date.now() - startTime < 1500) {
        return;
      }

      const uri = currentRecording.getURI();
      if (!uri) throw new Error("No audio file was captured — please try again");
      setIsProcessing(true);

      const transcription = await withTimeout(transcribeAudio(uri), 30000, "Transcription");

      // Single combined call: classify intent AND parse food items (saves one full round-trip)
      const combinedResponse = await withTimeout(getOpenAITextResponse([
        {
          role: "user",
          content: `You are a voice log classifier and food parser.

User said: "${transcription}"

Respond with ONLY valid JSON (no explanation, no markdown).

If FOOD:
{"intent":"food","description":"brief meal name","relativeDate":null,"items":[{"original_text":string,"normalized_query":string,"quantity":number,"unit":string,"estimated_grams":number|null,"is_branded":boolean,"confidence":number}]}

If EXERCISE:
{"intent":"exercise","workoutType":"cardio"|"strength"|"hiit"|"yoga"|"mixed","durationMinutes":number,"intensity":"low"|"medium"|"high","description":string,"relativeDate":null}

If WEIGHT UPDATE (e.g. "I weigh 80 kg", "my weight is 175 lbs", "I'm 85 kilos"):
{"intent":"body_stat","statType":"weight","value":number,"unit":"kg"|"lbs"}

If BODY MEASUREMENT (e.g. "my waist is 32 inches", "bicep is 38 cm"):
{"intent":"body_stat","statType":"measurement","value":number,"unit":"cm"|"in","bodyPart":"Waist"|"Chest"|"Hips"|"Bicep"|"Thigh"|"Neck"|"Shoulder"|"Calf"|"Forearm"|string}

Food item rules:
- Split compound meals into individual items, one object each
- normalized_query: simple searchable name ("coke zero"→"coca cola zero")
- unit: "g","ml","serving","slice","piece","cup","tbsp","tsp","medium","large","small","scoop"
- estimated_grams: infer if possible, else null
- is_branded: true for packaged/brand-name products
- confidence: 0-1 (omit items below 0.5)

Exercise rules:
- cardio=running/cycling/swimming/walking, strength=weights/lifting, hiit=intervals, yoga=yoga/stretching
- intensity: low=walk/yoga, medium=jog/gym, high=sprint/HIIT/heavy
- relativeDate: "yesterday" if yesterday/last night, "2 days ago" etc., null=today
- Default to food if unclear`,
        },
      ], { model: "gpt-4o-mini", temperature: 0.1, maxTokens: 1024 }), 30000, "AI parsing");

      let cleanedResponse = combinedResponse.content.trim()
        .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      const parsedMeta = JSON.parse(cleanedResponse);

      // Resolve target date
      const relativeDate: string | null = parsedMeta.relativeDate ?? null;
      let targetDate = new Date();
      if (relativeDate) {
        const lowerDate = relativeDate.toLowerCase();
        if (lowerDate.includes("yesterday") || lowerDate.includes("last night")) {
          targetDate.setDate(targetDate.getDate() - 1);
        } else {
          const daysAgoMatch = lowerDate.match(/(\d+)\s*days?\s*ago/);
          if (daysAgoMatch) targetDate.setDate(targetDate.getDate() - parseInt(daysAgoMatch[1], 10));
        }
      }
      targetDate.setHours(12, 0, 0, 0);
      const targetDateMs = targetDate.getTime();

      const { intent } = parsedMeta;

      // ── Exercise ─────────────────────────────────────────────────────────
      if (intent === "exercise") {
        const workoutData = {
          type: parsedMeta.workoutType ?? "mixed",
          durationMinutes: parsedMeta.durationMinutes ?? 30,
          intensity: parsedMeta.intensity ?? "medium",
          description: parsedMeta.description ?? transcription,
        };
        setIsProcessing(false);
        navigation.navigate("WorkoutConfirmation", {
          initialDataJson: JSON.stringify(workoutData),
          initialDateMs: targetDateMs,
        });
        return;
      }

      // ── Body stat ─────────────────────────────────────────────────────────
      if (intent === "body_stat" && parsedMeta.value != null) {
        const { updateCurrentWeight, addWeightEntry, addBodyMeasurement } = useDietStore.getState();
        if (parsedMeta.statType === "weight") {
          const valueInLbs = parsedMeta.unit === "kg"
            ? parsedMeta.value * 2.205
            : parsedMeta.value;
          const rounded = Math.round(valueInLbs * 10) / 10;
          updateCurrentWeight(rounded);
          addWeightEntry({ weight: rounded, date: Date.now() });
          setIsProcessing(false);
          const display = parsedMeta.unit === "kg"
            ? `${parsedMeta.value} kg`
            : `${parsedMeta.value} lbs`;
          setPendingEditInfo({ type: "weight", value: parsedMeta.value, unit: parsedMeta.unit ?? "kg" });
          setSuccessMessage(`Weight updated to ${display}`);
        } else if (parsedMeta.statType === "measurement" && parsedMeta.bodyPart) {
          const unit = parsedMeta.unit === "in" ? "in" : "cm";
          addBodyMeasurement({ bodyPart: parsedMeta.bodyPart, value: parsedMeta.value, unit, timestamp: Date.now() });
          setIsProcessing(false);
          setPendingEditInfo({ type: "measurement", value: parsedMeta.value, unit, bodyPart: parsedMeta.bodyPart });
          setSuccessMessage(`${parsedMeta.bodyPart} updated to ${parsedMeta.value} ${unit}`);
        } else {
          setIsProcessing(false);
        }
        return;
      }

      // ── Food (new, default) ───────────────────────────────────────────────
      const mealDescription: string = parsedMeta.description || transcription;

      // Extract precomputed food items from the combined call (skip parseFoodInput)
      const precomputedItems = Array.isArray(parsedMeta.items) && parsedMeta.items.length > 0
        ? parsedMeta.items
            .filter((item: Record<string, unknown>) => (Number(item.confidence) || 0) >= 0.5)
            .map((item: Record<string, unknown>) => ({
              original_text: String(item.original_text),
              normalized_query: String(item.normalized_query),
              quantity: Number(item.quantity) || 1,
              unit: String(item.unit),
              estimated_grams: item.estimated_grams != null ? Number(item.estimated_grams) : null,
              is_branded: Boolean(item.is_branded),
              parse_confidence: Number(item.confidence) || 0.7,
            }))
        : undefined;

      // Check favorites first — if name matches, skip API and use saved data
      const matchedFav = useDietStore.getState().findMatchingFavorite(mealDescription);
      if (matchedFav) {
        const favMealData = {
          description: matchedFav.name,
          ingredients: matchedFav.ingredients,
          ingredientNutrition: matchedFav.ingredientNutrition,
          calories: matchedFav.calories,
          protein: matchedFav.protein,
          carbs: matchedFav.carbs,
          fat: matchedFav.fat,
          micronutrients: matchedFav.micronutrients,
        };
        setIsProcessing(false);
        navigation.navigate("MealConfirmation", {
          initialDataJson: JSON.stringify(favMealData),
          initialDateMs: targetDateMs,
        });
        return;
      }

      const nutritionResult = await withTimeout(analyzeNutritionAdvanced(transcription, precomputedItems), 60000, "Nutrition analysis");
      const mealData = toMealConfirmationData(nutritionResult, mealDescription);
      setIsProcessing(false);
      navigation.navigate("MealConfirmation", {
        initialDataJson: JSON.stringify(mealData),
        initialDateMs: targetDateMs,
      });
    } catch (error) {
      setIsProcessing(false);
      const msg = error instanceof Error ? error.message : String(error);
      setErrorMessage(msg);
    }
  };

  const handleRecordPress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: "#FFFFFF",
          tabBarInactiveTintColor: "rgba(255,255,255,0.4)",
          tabBarShowLabel: false,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            bottom: 28,
            marginHorizontal: 24,
            backgroundColor: "transparent",
            borderRadius: 44,
            height: 72,
            borderTopWidth: 0,
            paddingTop: 0,
            paddingBottom: 0,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 24,
            elevation: 16,
          },
          tabBarBackground: () => (
            <LinearGradient
              colors={[colors.brandPurpleMid, colors.brandPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, borderRadius: 44 }}
            />
          ),
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarButton: ({ onPress, accessibilityState }) => (
              <Pressable
                onPress={onPress}
                style={{ flex: 1, height: 72, justifyContent: "center", alignItems: "center", gap: 4 }}
              >
                <Ionicons name="home-outline" size={22} color={accessibilityState?.selected ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
              </Pressable>
            ),
          }}
        />
        <Tab.Screen
          name="Camera"
          component={AccountScreen}
          options={{
            tabBarButton: ({ onPress, accessibilityState }) => (
              <Pressable
                onPress={onPress}
                style={{ flex: 1, height: 72, justifyContent: "center", alignItems: "center", gap: 4 }}
              >
                <Ionicons name="person-outline" size={22} color={accessibilityState?.selected ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
              </Pressable>
            ),
          }}
        />
        <Tab.Screen
          name="Record"
          component={RecordPlaceholder}
          options={{
            tabBarIcon: () => (
              <View
                style={[
                  styles.recordBtn,
                  isRecording && styles.recordBtnActive,
                  isProcessing && styles.recordBtnProcessing,
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons
                    name={isRecording ? "stop-circle-outline" : "mic-outline"}
                    size={26}
                    color={isRecording ? "#fff" : colors.brandPrimary}
                  />
                )}
              </View>
            ),
            tabBarButton: (props) => (
              <Pressable
                style={{ flex: 1, height: 72, alignItems: "center", justifyContent: "center" }}
                onPress={() => handleRecordPress()}
              >
                {props.children}
              </Pressable>
            ),
          }}
        />
        <Tab.Screen
          name="Log"
          component={GoalTrackerScreen}
          options={{
            tabBarButton: ({ onPress, accessibilityState }) => (
              <Pressable
                onPress={onPress}
                style={{ flex: 1, height: 72, justifyContent: "center", alignItems: "center", gap: 4 }}
              >
                <Ionicons name="trophy-outline" size={22} color={accessibilityState?.selected ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
              </Pressable>
            ),
          }}
        />
        <Tab.Screen
          name="Progress"
          component={ProgressScreen}
          options={{
            tabBarButton: ({ onPress, accessibilityState }) => (
              <Pressable
                onPress={onPress}
                style={{ flex: 1, height: 72, justifyContent: "center", alignItems: "center", gap: 4 }}
              >
                <Ionicons name="pulse-outline" size={22} color={accessibilityState?.selected ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
              </Pressable>
            ),
          }}
        />
      </Tab.Navigator>

      <Modal
        visible={!!errorMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorMessage(null)}
      >
        <Pressable style={styles.errorModalOverlay} onPress={() => setErrorMessage(null)}>
          <Pressable style={styles.errorModalContent} onPress={() => {}}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" style={{ marginBottom: 12 }} />
            <Text style={styles.errorModalTitle}>Recording Error</Text>
            <Text style={styles.errorModalMessage}>{errorMessage}</Text>
            <Pressable
              onPress={() => setErrorMessage(null)}
              style={styles.errorModalButton}
            >
              <Text style={styles.errorModalButtonText}>Try Again</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!successMessage}
        transparent
        animationType="fade"
        onRequestClose={() => { setSuccessMessage(null); setPendingEditInfo(null); setIsEditingValue(false); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.successModalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setSuccessMessage(null); setPendingEditInfo(null); setIsEditingValue(false); }} />
          <View style={styles.successModalContent}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={22} color="#1e206a" />
            </View>
            <Text style={styles.successModalTitle}>Updated!</Text>
            {isEditingValue ? (
              <>
                <TextInput
                  style={styles.successEditInput}
                  value={editInputValue}
                  onChangeText={setEditInputValue}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Pressable
                  onPress={() => {
                    const newVal = parseFloat(editInputValue);
                    if (!isNaN(newVal) && pendingEditInfo) {
                      const { updateCurrentWeight, addWeightEntry, addBodyMeasurement } = useDietStore.getState();
                      if (pendingEditInfo.type === "weight") {
                        const inLbs = pendingEditInfo.unit === "kg" ? newVal * 2.205 : newVal;
                        const rounded = Math.round(inLbs * 10) / 10;
                        updateCurrentWeight(rounded);
                        addWeightEntry({ weight: rounded, date: Date.now() });
                        const display = `${newVal} ${pendingEditInfo.unit}`;
                        setPendingEditInfo({ ...pendingEditInfo, value: newVal });
                        setSuccessMessage(`Weight updated to ${display}`);
                      } else if (pendingEditInfo.type === "measurement" && pendingEditInfo.bodyPart) {
                        addBodyMeasurement({ bodyPart: pendingEditInfo.bodyPart, value: newVal, unit: pendingEditInfo.unit as "in" | "cm", timestamp: Date.now() });
                        setPendingEditInfo({ ...pendingEditInfo, value: newVal });
                        setSuccessMessage(`${pendingEditInfo.bodyPart} updated to ${newVal} ${pendingEditInfo.unit}`);
                      }
                      setIsEditingValue(false);
                    }
                  }}
                  style={styles.successPrimaryBtn}
                >
                  <Text style={styles.successPrimaryBtnText}>Confirm</Text>
                </Pressable>
                <Pressable onPress={() => setIsEditingValue(false)} style={styles.successGhostBtn}>
                  <Text style={styles.successGhostBtnText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.successModalMessage}>{successMessage}</Text>
                <Pressable
                  onPress={() => {
                    setEditInputValue(String(pendingEditInfo?.value ?? ""));
                    setIsEditingValue(true);
                  }}
                  style={styles.successPrimaryBtn}
                >
                  <Text style={styles.successPrimaryBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setSuccessMessage(null); setPendingEditInfo(null); setIsEditingValue(false); }}
                  style={styles.successGhostBtn}
                >
                  <Text style={styles.successGhostBtnText}>Done</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  // Micronutrient backfill — enrich any stored meals that are missing micronutrient data
  const meals = useDietStore((s) => s.meals);
  const updateMeal = useDietStore((s) => s.updateMeal);
  useEffect(() => {
    enrichMicronutrientsForMeals(meals).then((updates) => {
      for (const { id, micronutrients } of updates) {
        updateMeal(id, { micronutrients: micronutrients as any });
      }
    }).catch(() => {});
  }, []);

  // Macro migration
  const macrosVersion = useOnboardingStore((s) => s.macrosCalculationVersion);
  const setMacrosVersion = useOnboardingStore((s) => s.setMacrosCalculationVersion);
  const onboardingGoal = useOnboardingStore((s) => s.goal);
  const onboardingStats = useOnboardingStore((s) => s.stats);
  const onboardingCalories = useOnboardingStore((s) => s.calories);
  const setCalories = useOnboardingStore((s) => s.setCalories);
  const updateNutritionGoal = useDietStore((s) => s.updateNutritionGoal);

  useEffect(() => {
    if (macrosVersion === CURRENT_MACROS_VERSION) return;
    if (!onboardingStats || !onboardingGoal || !onboardingCalories) return;

    // Plans left on the old flat formula get rebuilt from the user's stats.
    // Anything the user tuned themselves is left exactly where they put it —
    // only stamp the version so this never runs again.
    const legacy = calculateMacros(
      onboardingCalories.targetCalories,
      onboardingStats.weightKg,
      onboardingGoal.type
    );
    const untouched =
      onboardingCalories.proteinGrams === legacy.protein &&
      onboardingCalories.carbsGrams === legacy.carbs &&
      onboardingCalories.fatGrams === legacy.fat;

    if (untouched) {
      const plan = buildRecommendedPlan(onboardingStats, onboardingGoal);
      setCalories({
        ...onboardingCalories,
        maintenanceCalories: plan.tdee,
        targetCalories: plan.targetCalories,
        proteinGrams: plan.proteinG,
        carbsGrams: plan.carbsG,
        fatGrams: plan.fatG,
        dailyDeficitOrSurplus: plan.targetCalories - plan.tdee,
      });

      updateNutritionGoal({
        dailyCalories: plan.targetCalories,
        dailyProtein: plan.proteinG,
        dailyCarbs: plan.carbsG,
        dailyFat: plan.fatG,
      });
    }

    setMacrosVersion(CURRENT_MACROS_VERSION);
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f0f4f0" },
      }}
    >
      {!isAuthenticated ? (
        // ── Auth screens ────────────────────────────────────────────────────
        <>
          <Stack.Screen name="Landing" component={LandingScreen} options={{ animation: "fade" }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ animation: "slide_from_right" }} />
        </>
      ) : (
        // ── Main app ─────────────────────────────────────────────────────────
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="FuturePhotoSetup"
            component={FuturePhotoSetupScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="GoalTracker"
            component={GoalTrackerScreen}
            options={{
              headerShown: true, title: "Goals",
              headerStyle: { backgroundColor: "#FFFFFF" },
              headerTintColor: "#111111",
              headerTitleStyle: { fontWeight: "600" },
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Pledges"
            component={PledgesScreen}
            options={{ headerShown: false, animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="BarcodeScanner"
            component={BarcodeScannerScreen}
            options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="FoodCamera"
            component={FoodCameraScreen}
            options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="AllPhotos"
            component={AllPhotosScreen}
            options={{
              headerShown: true, title: "All Photos",
              headerStyle: { backgroundColor: "#FFFFFF" },
              headerTintColor: "#111111",
              headerTitleStyle: { fontWeight: "600" },
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen name="OnboardingGoal" component={OnboardingGoalScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="OnboardingStats" component={OnboardingStatsScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="OnboardingCalories" component={OnboardingCaloriesScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="OnboardingWorkout" component={OnboardingWorkoutScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="OnboardingMicronutrients" component={OnboardingMicronutrientsScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="OnboardingPhoto" component={OnboardingPhotoScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="OnboardingFutureYou" component={OnboardingFutureYouScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="FutureMeChat" component={FutureMeChatScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="Diary" component={DiaryScreen} options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="EditFoodEntry" component={EditFoodEntryScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="FreeTextFood" component={FreeTextFoodScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="MealConfirmation" component={MealConfirmationScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="WorkoutConfirmation" component={WorkoutConfirmationScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="LogWorkoutSession" component={LogWorkoutSessionScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="WorkoutPlan" component={WorkoutPlanScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="EditWorkoutPlanDay" component={EditWorkoutPlanDayScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="VoiceActionConfirm" component={VoiceActionConfirmScreen} options={{ headerShown: false, animation: "slide_from_bottom" }} />
          <Stack.Screen name="FavoriteMeals" component={FavoriteMealsScreen} options={{ headerShown: false, animation: "slide_from_right" }} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  activeIcon: {
    backgroundColor: "rgba(242,90,35,0.10)",
    borderRadius: 12,
    padding: 4,
  },
  activeTab: {
    backgroundColor: "#0d6e6e",
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  inactiveTab: {
    width: 44,
    height: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  recordBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  recordBtnActive: {
    backgroundColor: "#ef4444",
  },
  recordBtnProcessing: {
    backgroundColor: "#6b7280",
  },
  recordButtonOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 28,
  },
  recordButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandTeal,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  recordButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  recordButtonRecording: {
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
  },
  recordButtonProcessing: {
    backgroundColor: "#6b7280",
    shadowColor: "#6b7280",
  },
  errorModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  errorModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111111",
    marginBottom: 8,
  },
  errorModalMessage: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  errorModalButton: {
    backgroundColor: colors.brandTeal,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignSelf: "stretch",
    alignItems: "center",
  },
  errorModalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successModalContent: {
    backgroundColor: "#0f2d2a",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.15)",
  },
  successIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2DD4BF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  successModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 6,
  },
  successModalMessage: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginBottom: 22,
    lineHeight: 20,
  },
  successEditInput: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.35)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: "600",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 16,
  },
  successPrimaryBtn: {
    backgroundColor: "#2DD4BF",
    paddingVertical: 13,
    borderRadius: 12,
    alignSelf: "stretch",
    alignItems: "center",
    marginBottom: 10,
  },
  successPrimaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e206a",
  },
  successGhostBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignSelf: "stretch",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  successGhostBtnText: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
  },
});
