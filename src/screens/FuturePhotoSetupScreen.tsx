import React, { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Linking,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import useFuturePhotoStore from "../state/futurePhotoStore";
import useDietStore from "../state/dietStore";
import { generateFuturePhoto } from "../api/future-photo-service";
import { removeBackground } from "../api/remove-background";
import { ThemedText } from "../components/ThemedText";
import { Card } from "../components/Card";
import { colors, spacing, radii } from "../theme";
import { UserProfile, WorkoutStats } from "../types/futurePhoto";
import { LinearGradient } from "expo-linear-gradient";
import { resolvePhotoUri } from "../utils/photoStorage";

type BodyType = UserProfile["bodyType"];
type FitnessLevel = UserProfile["fitnessLevel"];
type Gender = UserProfile["gender"];
type WorkoutType = WorkoutStats["workoutType"];

const { width: SCREEN_W } = Dimensions.get("window");
// Hero card height on HomeScreen (matches the 460 constant there)
const HERO_CARD_CONTENT_H = 460;

const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "slim", label: "Slim" },
  { value: "average", label: "Average" },
  { value: "athletic", label: "Athletic" },
  { value: "muscular", label: "Muscular" },
  { value: "overweight", label: "Overweight" },
];

const FITNESS_LEVELS: { value: FitnessLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const WORKOUT_TYPES: { value: WorkoutType; label: string; icon: string }[] = [
  { value: "strength", label: "Strength", icon: "barbell" },
  { value: "cardio", label: "Cardio", icon: "heart" },
  { value: "mixed", label: "Mixed", icon: "fitness" },
  { value: "hiit", label: "HIIT", icon: "flash" },
  { value: "yoga", label: "Yoga", icon: "leaf" },
];

export default function FuturePhotoSetupScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Safe goBack helper
  const safeGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  // Store selectors
  const userProfile = useFuturePhotoStore((s) => s.userProfile);
  const workoutStats = useFuturePhotoStore((s) => s.workoutStats);
  const _beforePhotoFilename = useFuturePhotoStore((s) => s.beforePhotoUri);
  const _headshotPhotoFilename = useFuturePhotoStore((s) => s.headshotPhotoUri);
  const beforePhotoUri = resolvePhotoUri(_beforePhotoFilename);
  const headshotPhotoUri = resolvePhotoUri(_headshotPhotoFilename);
  const goalEndDate = useFuturePhotoStore((s) => s.goalEndDate);
  const setUserProfile = useFuturePhotoStore((s) => s.setUserProfile);
  const updateWorkoutStats = useFuturePhotoStore((s) => s.updateWorkoutStats);
  const setBeforePhoto = useFuturePhotoStore((s) => s.setBeforePhoto);
  const setHeadshotPhoto = useFuturePhotoStore((s) => s.setHeadshotPhoto);
  const totalWeeks = useFuturePhotoStore((s) => s.totalWeeks);
  const programStartDate = useFuturePhotoStore((s) => s.programStartDate);
  const setGeneratedPhoto = useFuturePhotoStore((s) => s.setGeneratedPhoto);
  const setIsGenerating = useFuturePhotoStore((s) => s.setIsGenerating);
  const setGenerationError = useFuturePhotoStore((s) => s.setGenerationError);
  const clearGeneratedPhoto = useFuturePhotoStore((s) => s.clearGeneratedPhoto);
  const clearBeforePhoto = useFuturePhotoStore((s) => s.clearBeforePhoto);

  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const weightGoal = useDietStore((s) => s.weightGoal);

  // Local state
  const [height, setHeight] = useState(userProfile?.height || "");
  const [bodyType, setBodyType] = useState<BodyType>(userProfile?.bodyType || "average");
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(
    userProfile?.fitnessLevel || "beginner"
  );
  const [gender, setGender] = useState<Gender>(userProfile?.gender || "male");
  const [age, setAge] = useState(userProfile?.age?.toString() || "");
  const [workoutType, setWorkoutType] = useState<WorkoutType>(
    workoutStats.workoutType || "mixed"
  );
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(
    workoutStats.avgWorkoutsPerWeek?.toString() || "3"
  );
  const [workoutDuration, setWorkoutDuration] = useState(
    workoutStats.avgWorkoutDuration?.toString() || "45"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingBeforePhoto, setIsProcessingBeforePhoto] = useState(false);
  const [isProcessingHeadshotPhoto, setIsProcessingHeadshotPhoto] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; showSettings?: boolean } | null>(null);

  const showInfo = (title: string, message: string, showSettings = false) => {
    setInfoModal({ title, message, showSettings });
  };

  const copyToPermanent = async (uri: string, prefix: string): Promise<string> => {
    const dest = `${FileSystem.documentDirectory}${prefix}-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  };

  const processAndSetBeforePhoto = async (uri: string) => {
    setIsProcessingBeforePhoto(true);
    try {
      const permanentUri = await copyToPermanent(uri, "before-photo");
      setBeforePhoto(permanentUri);
    } catch (error) {
      try {
        const dest = `${FileSystem.documentDirectory}before-photo-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        setBeforePhoto(dest);
      } catch {
        setBeforePhoto(uri);
      }
    } finally {
      setIsProcessingBeforePhoto(false);
    }
  };

  const processAndSetHeadshotPhoto = async (uri: string) => {
    setIsProcessingHeadshotPhoto(true);
    try {
      // Copy to permanent location first — Pixelcut needs a stable file:// URI
      const permanentUri = await copyToPermanent(uri, "headshot-photo");
      const processedUri = await removeBackground(permanentUri);
      setHeadshotPhoto(processedUri);
    } catch (error) {
      try {
        const permanentUri = await copyToPermanent(uri, "headshot-photo");
        setHeadshotPhoto(permanentUri);
      } catch {
        setHeadshotPhoto(uri);
      }
    } finally {
      setIsProcessingHeadshotPhoto(false);
    }
  };

  const pickBeforePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showInfo("Photo Library Access Required", "Please allow access to your photo library in Settings to upload a photo.", true);
      return;
    }

    const heroH = HERO_CARD_CONTENT_H + insets.top;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [SCREEN_W, heroH],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processAndSetBeforePhoto(result.assets[0].uri);
    }
  };

  const takeBeforePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showInfo("Camera Access Required", "Please allow camera access in Settings to take a photo.", true);
      return;
    }

    const heroH = HERO_CARD_CONTENT_H + insets.top;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [SCREEN_W, heroH],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processAndSetBeforePhoto(result.assets[0].uri);
    }
  };

  const pickHeadshotPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showInfo("Photo Library Access Required", "Please allow access to your photo library in Settings to upload a photo.", true);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processAndSetHeadshotPhoto(result.assets[0].uri);
    }
  };

  const takeHeadshotPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showInfo("Camera Access Required", "Please allow camera access in Settings to take a photo.", true);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    });

    if (!result.canceled && result.assets[0]) {
      processAndSetHeadshotPhoto(result.assets[0].uri);
    }
  };

  const handleSaveAndGenerate = async () => {
    if (!height || !age || !beforePhotoUri || !goalEndDate) {
      return;
    }

    setIsLoading(true);

    // Save profile
    const profile: UserProfile = {
      height,
      bodyType,
      fitnessLevel,
      gender,
      age: parseInt(age, 10),
    };
    setUserProfile(profile);

    // Save workout stats
    const updatedWorkoutStats = {
      workoutType,
      avgWorkoutsPerWeek: parseInt(workoutsPerWeek, 10) || 3,
      avgWorkoutDuration: parseInt(workoutDuration, 10) || 45,
    };
    updateWorkoutStats(updatedWorkoutStats);

    // Clear existing photo and generate new one
    clearGeneratedPhoto();
    setIsGenerating(true);

    // Collect reference images
    const referenceImages: string[] = [];
    if (beforePhotoUri) {
      referenceImages.push(beforePhotoUri);
    }
    if (headshotPhotoUri) {
      referenceImages.push(headshotPhotoUri);
    }

    // Get weekly log summary from diet store
    const weeklyLogSummary = useDietStore.getState().getWeeklyLogSummary();
    const consecutiveCompleteWeeks = useDietStore.getState().getConsecutiveCompleteWeeks();
    const maintenanceCalories = useDietStore.getState().maintenanceCalories;

    try {
      const result = await generateFuturePhoto({
        userProfile: profile,
        workoutStats: updatedWorkoutStats,
        nutritionGoal,
        weightGoal,
        maintenanceCalories,
        goalEndDate,
        weeklyLogSummary,
        consecutiveCompleteWeeks,
        referenceImages,
      });

      if (result.predictionData.isComplete && result.imageUrl) {
        setGeneratedPhoto(result.imageUrl, { complianceRate: 0, denoisingStrength: 0.3, progressScore: 0 });
        safeGoBack();
      } else if (result.predictionData.message) {
        setGenerationError(result.predictionData.message);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("[FuturePhotoSetup] Generation error:", error);
      setGenerationError(
        error instanceof Error ? error.message : "Failed to generate photo"
      );
      setIsLoading(false);
    }
  };

  const isFormValid = height && age && beforePhotoUri && goalEndDate;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const weeksUntilGoal = goalEndDate
    ? Math.max(0, Math.ceil((goalEndDate - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
    : 0;
  const weekOfProgram =
    programStartDate && totalWeeks
      ? Math.min(
          totalWeeks,
          Math.max(1, Math.floor((Date.now() - programStartDate) / (7 * 24 * 60 * 60 * 1000)) + 1)
        )
      : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={safeGoBack}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.headerText}>
            <ThemedText variant="h2">Future Photo Setup</ThemedText>
            <ThemedText variant="body" muted>
              Tell us about yourself to generate your future photo
            </ThemedText>
          </View>
        </View>

        {/* Before Photo Section */}
        <Card style={styles.card}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Full Body Photo
          </ThemedText>
          <ThemedText variant="bodySmall" muted style={styles.sectionSubtitle}>
            Upload a full body photo showing your current physique
          </ThemedText>

          {isProcessingBeforePhoto ? (
            <View style={styles.photoProcessingContainer}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <ThemedText variant="bodySmall" muted style={{ marginTop: spacing.md }}>
                Processing photo...
              </ThemedText>
            </View>
          ) : beforePhotoUri ? (
            <View style={styles.photoPreviewContainer}>
              <Image
                source={{ uri: beforePhotoUri }}
                style={styles.photoPreview}
                resizeMode="cover"
              />
              <Pressable
                style={styles.changePhotoButton}
                onPress={pickBeforePhoto}
              >
                <Ionicons name="camera" size={16} color="#fff" />
                <ThemedText variant="caption" style={{ color: "#fff", marginLeft: 4 }}>
                  Change
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.removePhotoButton}
                onPress={clearBeforePhoto}
              >
                <Ionicons name="trash" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoButtonsRow}>
              <Pressable style={styles.photoButton} onPress={takeBeforePhoto}>
                <Ionicons name="camera" size={24} color={colors.brandPrimary} />
                <ThemedText variant="bodySmall" style={styles.photoButtonText}>
                  Take Photo
                </ThemedText>
              </Pressable>
              <Pressable style={styles.photoButton} onPress={pickBeforePhoto}>
                <Ionicons name="images" size={24} color={colors.brandPrimary} />
                <ThemedText variant="bodySmall" style={styles.photoButtonText}>
                  From Gallery
                </ThemedText>
              </Pressable>
            </View>
          )}
        </Card>

        {/* Headshot Photo Section */}
        <Card style={styles.card}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Headshot Photo
          </ThemedText>
          <ThemedText variant="bodySmall" muted style={styles.sectionSubtitle}>
            Upload a clear photo of your face for accurate facial features
          </ThemedText>

          {isProcessingHeadshotPhoto ? (
            <View style={styles.headshotProcessingContainer}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <ThemedText variant="bodySmall" muted style={{ marginTop: spacing.md }}>
                Removing background...
              </ThemedText>
            </View>
          ) : headshotPhotoUri ? (
            <View style={styles.headshotPreviewContainer}>
              <Image
                source={{ uri: headshotPhotoUri }}
                style={styles.headshotPreview}
                resizeMode="cover"
              />
              <Pressable
                style={styles.changePhotoButton}
                onPress={pickHeadshotPhoto}
              >
                <Ionicons name="camera" size={16} color="#fff" />
                <ThemedText variant="caption" style={{ color: "#fff", marginLeft: 4 }}>
                  Change
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoButtonsRow}>
              <Pressable style={styles.photoButton} onPress={takeHeadshotPhoto}>
                <Ionicons name="person" size={24} color={colors.brandPrimary} />
                <ThemedText variant="bodySmall" style={styles.photoButtonText}>
                  Take Selfie
                </ThemedText>
              </Pressable>
              <Pressable style={styles.photoButton} onPress={pickHeadshotPhoto}>
                <Ionicons name="images" size={24} color={colors.brandPrimary} />
                <ThemedText variant="bodySmall" style={styles.photoButtonText}>
                  From Gallery
                </ThemedText>
              </Pressable>
            </View>
          )}
        </Card>

        {/* Basic Info Section */}
        <Card style={styles.card}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            About You
          </ThemedText>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <ThemedText variant="caption" muted style={styles.inputLabel}>
                Height
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={height}
                onChangeText={setHeight}
                placeholder="e.g., 5'10 or 178cm"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.inputGroup}>
              <ThemedText variant="caption" muted style={styles.inputLabel}>
                Age
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={age}
                onChangeText={setAge}
                placeholder="e.g., 28"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <ThemedText variant="caption" muted style={styles.inputLabel}>
            Gender
          </ThemedText>
          <View style={styles.optionsRow}>
            {GENDERS.map((g) => (
              <Pressable
                key={g.value}
                style={[
                  styles.optionButton,
                  gender === g.value && styles.optionButtonActive,
                ]}
                onPress={() => setGender(g.value)}
              >
                <ThemedText
                  variant="bodySmall"
                  style={{
                    color: gender === g.value ? colors.brandPrimary : colors.textMuted,
                    fontWeight: gender === g.value ? "600" : "400",
                  }}
                >
                  {g.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText variant="caption" muted style={styles.inputLabel}>
            Current Body Type
          </ThemedText>
          <View style={styles.optionsRow}>
            {BODY_TYPES.map((bt) => (
              <Pressable
                key={bt.value}
                style={[
                  styles.optionButton,
                  bodyType === bt.value && styles.optionButtonActive,
                ]}
                onPress={() => setBodyType(bt.value)}
              >
                <ThemedText
                  variant="bodySmall"
                  style={{
                    color: bodyType === bt.value ? colors.brandPrimary : colors.textMuted,
                    fontWeight: bodyType === bt.value ? "600" : "400",
                  }}
                >
                  {bt.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText variant="caption" muted style={styles.inputLabel}>
            Fitness Level
          </ThemedText>
          <View style={styles.optionsRow}>
            {FITNESS_LEVELS.map((fl) => (
              <Pressable
                key={fl.value}
                style={[
                  styles.optionButton,
                  fitnessLevel === fl.value && styles.optionButtonActive,
                ]}
                onPress={() => setFitnessLevel(fl.value)}
              >
                <ThemedText
                  variant="bodySmall"
                  style={{
                    color: fitnessLevel === fl.value ? colors.brandPrimary : colors.textMuted,
                    fontWeight: fitnessLevel === fl.value ? "600" : "400",
                  }}
                >
                  {fl.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Workout Section */}
        <Card style={styles.card}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Your Workout Plan
          </ThemedText>

          <ThemedText variant="caption" muted style={styles.inputLabel}>
            Workout Type
          </ThemedText>
          <View style={styles.workoutTypeGrid}>
            {WORKOUT_TYPES.map((wt) => (
              <Pressable
                key={wt.value}
                style={[
                  styles.workoutTypeButton,
                  workoutType === wt.value && styles.workoutTypeButtonActive,
                ]}
                onPress={() => setWorkoutType(wt.value)}
              >
                <Ionicons
                  name={wt.icon as any}
                  size={24}
                  color={workoutType === wt.value ? colors.brandPrimary : colors.textMuted}
                />
                <ThemedText
                  variant="caption"
                  style={{
                    color: workoutType === wt.value ? colors.brandPrimary : colors.textMuted,
                    marginTop: spacing.xs,
                    fontWeight: workoutType === wt.value ? "600" : "400",
                  }}
                >
                  {wt.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <ThemedText variant="caption" muted style={styles.inputLabel}>
                Workouts Per Week
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={workoutsPerWeek}
                onChangeText={setWorkoutsPerWeek}
                placeholder="e.g., 4"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <ThemedText variant="caption" muted style={styles.inputLabel}>
                Minutes Per Workout
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={workoutDuration}
                onChangeText={setWorkoutDuration}
                placeholder="e.g., 45"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </Card>

        {/* Sealed Program */}
        <Card style={styles.card}>
          <ThemedText variant="h3" style={styles.sectionTitle}>
            Your Program
          </ThemedText>
          <ThemedText variant="bodySmall" muted style={styles.sectionSubtitle}>
            {goalEndDate
              ? "Your goal date was sealed when you signed up and stays fixed for the whole program."
              : "Choose a 12 or 24 week program at sign-up to seal your goal date."}
          </ThemedText>

          <View style={styles.dateButton}>
            <Ionicons
              name={goalEndDate ? "lock-closed" : "calendar-outline"}
              size={20}
              color={colors.brandPrimary}
            />
            <ThemedText variant="body" style={styles.dateText}>
              {goalEndDate ? formatDate(new Date(goalEndDate)) : "No goal date yet"}
            </ThemedText>
            {goalEndDate ? (
              <ThemedText variant="caption" muted>
                {weeksUntilGoal} {weeksUntilGoal === 1 ? "week" : "weeks"} left
              </ThemedText>
            ) : null}
          </View>

          {goalEndDate && totalWeeks ? (
            <ThemedText variant="caption" muted style={styles.sectionSubtitle}>
              {totalWeeks} week program
              {weekOfProgram ? ` — week ${weekOfProgram} of ${totalWeeks}` : ""}
            </ThemedText>
          ) : null}
        </Card>

        {/* Info Card */}
        <Card style={[styles.card, styles.infoCard]}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color={colors.brandSecondary} />
            <ThemedText variant="bodySmall" style={styles.infoTitle}>
              How it works
            </ThemedText>
          </View>
          <ThemedText variant="caption" muted style={styles.infoText}>
            Your future photo shows what you will look like on your sealed goal date, projected
            from how you ate and trained over the past week. It refreshes every 7 days, so the
            picture moves with your real progress while the date stays fixed.
          </ThemedText>
        </Card>

        {/* Generate Button */}
        <Pressable
          style={[styles.generateButton, !isFormValid && styles.generateButtonDisabled]}
          onPress={handleSaveAndGenerate}
          disabled={!isFormValid || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#fff" />
              <ThemedText variant="body" style={styles.generateButtonText}>
                Generate Future Photo
              </ThemedText>
            </>
          )}
        </Pressable>

        {!isFormValid && (
          <ThemedText variant="caption" muted style={styles.validationText}>
            Please upload a photo and fill in height and age to continue
          </ThemedText>
        )}
      </ScrollView>

      {/* Info / Permission Modal */}
      <Modal visible={!!infoModal} transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons
              name={infoModal?.showSettings ? "lock-closed" : "warning"}
              size={40}
              color={infoModal?.showSettings ? colors.brandPrimary : colors.brandPrimary}
              style={{ marginBottom: spacing.md }}
            />
            <ThemedText variant="h3" style={styles.modalTitle}>
              {infoModal?.title}
            </ThemedText>
            <ThemedText variant="body" muted style={styles.modalBody}>
              {infoModal?.message}
            </ThemedText>
            {infoModal?.showSettings && (
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={() => { setInfoModal(null); Linking.openSettings(); }}
              >
                <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <ThemedText variant="body" style={{ color: "#fff", fontWeight: "700" }}>
                  Open Settings
                </ThemedText>
              </Pressable>
            )}
            <Pressable style={styles.modalSecondaryBtn} onPress={() => setInfoModal(null)}>
              <ThemedText variant="body" muted>
                {infoModal?.showSettings ? "Not Now" : "OK"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSection,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  card: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    marginBottom: spacing.lg,
  },
  photoButtonsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  photoButton: {
    flex: 1,
    paddingVertical: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    borderStyle: "dashed",
    backgroundColor: colors.brandSoftOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  photoButtonText: {
    color: colors.brandPrimary,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  photoPreviewContainer: {
    position: "relative",
  },
  photoProcessingContainer: {
    width: "100%",
    height: 300,
    borderRadius: radii.md,
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreview: {
    width: "100%",
    height: 300,
    borderRadius: radii.md,
  },
  headshotPreviewContainer: {
    position: "relative",
    alignItems: "center",
  },
  headshotProcessingContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  headshotPreview: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  changePhotoButton: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  removePhotoButton: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(220,38,38,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 11,
  },
  textInput: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: "#fff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  optionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSection,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  optionButtonActive: {
    backgroundColor: colors.brandSoftOrange,
    borderColor: colors.brandPrimary,
  },
  workoutTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  workoutTypeButton: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: colors.bgSection,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  workoutTypeButtonActive: {
    backgroundColor: colors.brandSoftOrange,
    borderColor: colors.brandPrimary,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.bgSection,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dateText: {
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
    color: "#fff",
  },
  infoCard: {
    backgroundColor: "rgba(110, 168, 255, 0.1)",
    borderColor: colors.brandSecondary,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  infoTitle: {
    color: colors.brandSecondary,
    fontWeight: "600",
    marginLeft: spacing.xs,
  },
  infoText: {
    lineHeight: 20,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.brandTeal,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  generateButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  generateButtonText: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: spacing.sm,
  },
  validationText: {
    textAlign: "center",
    marginTop: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  modalBody: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  modalPrimaryBtn: {
    width: "100%",
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: "center",
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  modalSecondaryBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
});
