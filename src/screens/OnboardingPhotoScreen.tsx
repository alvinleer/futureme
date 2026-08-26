import React, { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
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
import { removeBackground } from "../api/remove-background";
import { RootStackParamList } from "../navigation/RootNavigator";
import { resolvePhotoUri } from "../utils/photoStorage";

export default function OnboardingPhotoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const existingPhoto = useOnboardingStore((s) => s.photo);
  const setPhoto = useOnboardingStore((s) => s.setPhoto);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const [beforePhotoUri, setBeforePhotoUri] = useState(resolvePhotoUri(existingPhoto?.beforePhotoUri) || null);
  const [headshotPhotoUri, setHeadshotPhotoUri] = useState(resolvePhotoUri(existingPhoto?.headshotPhotoUri) || null);
  const [isProcessingBody, setIsProcessingBody] = useState(false);
  const [isProcessingHeadshot, setIsProcessingHeadshot] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [permissionModal, setPermissionModal] = useState<{ title: string; message: string } | null>(null);

  const showPermissionDenied = (type: "camera" | "library") => {
    setPermissionModal(
      type === "camera"
        ? { title: "Camera Access Required", message: "Please allow camera access in Settings to take a photo." }
        : { title: "Photo Library Access Required", message: "Please allow access to your photo library in Settings to upload a photo." }
    );
  };

  const buttonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const showError = (message: string) => {
    setErrorMessage(message);
    setErrorModalVisible(true);
  };

  const processBodyPhoto = async (uri: string) => {
    setIsProcessingBody(true);
    try {
      // Copy to permanent location first — Pixelcut needs a stable file:// URI
      const dest = `${FileSystem.documentDirectory}before-photo-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      const processedUri = await removeBackground(dest);
      setBeforePhotoUri(processedUri);
    } catch (error) {
      try {
        const dest = `${FileSystem.documentDirectory}before-photo-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        setBeforePhotoUri(dest);
      } catch {
        setBeforePhotoUri(uri);
      }
    } finally {
      setIsProcessingBody(false);
    }
  };

  const processHeadshotPhoto = async (uri: string) => {
    setIsProcessingHeadshot(true);
    try {
      // Copy to permanent location first — Pixelcut needs a stable file:// URI
      const dest = `${FileSystem.documentDirectory}headshot-photo-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      const processedUri = await removeBackground(dest);
      setHeadshotPhotoUri(processedUri);
    } catch (error) {
      try {
        const dest = `${FileSystem.documentDirectory}headshot-photo-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        setHeadshotPhotoUri(dest);
      } catch {
        setHeadshotPhotoUri(uri);
      }
    } finally {
      setIsProcessingHeadshot(false);
    }
  };

  const pickBodyPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showPermissionDenied("library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processBodyPhoto(result.assets[0].uri);
    }
  };

  const takeBodyPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showPermissionDenied("camera");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processBodyPhoto(result.assets[0].uri);
    }
  };

  const pickHeadshotPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showPermissionDenied("library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processHeadshotPhoto(result.assets[0].uri);
    }
  };

  const takeHeadshotPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showPermissionDenied("camera");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    });

    if (!result.canceled && result.assets[0]) {
      processHeadshotPhoto(result.assets[0].uri);
    }
  };

  const handleContinue = () => {
    setPhoto({
      beforePhotoUri,
      headshotPhotoUri,
    });

    nextStep();
    navigation.navigate("OnboardingFutureYou");
  };

  const handleBack = () => {
    prevStep();
    navigation.goBack();
  };

  const handleSkip = () => {
    skipOnboarding();
    navigation.popToTop();
  };

  const isValid = beforePhotoUri !== null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "85.7%" }]} />
          </View>
          <ThemedText variant="caption" muted>
            Step 6 of 7
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
            Before Photo
          </ThemedText>
          <ThemedText variant="body" muted style={styles.subtitle}>
            Upload your starting point photo
          </ThemedText>
        </Animated.View>

        {/* Body Photo */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
          <Card style={styles.photoCard}>
            <ThemedText variant="h3" style={styles.sectionTitle}>
              Full Body Photo
            </ThemedText>
            <ThemedText variant="bodySmall" muted style={{ marginBottom: spacing.md }}>
              Stand in front of a plain background
            </ThemedText>

            {isProcessingBody ? (
              <View style={styles.photoPlaceholder}>
                <ActivityIndicator size="large" color={colors.brandPrimary} />
                <ThemedText variant="bodySmall" muted style={{ marginTop: spacing.md }}>
                  Processing photo...
                </ThemedText>
              </View>
            ) : beforePhotoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: beforePhotoUri }} style={styles.photoPreview} resizeMode="cover" />
                <Pressable style={styles.changePhotoButton} onPress={pickBodyPhoto}>
                  <Ionicons name="camera" size={16} color="#fff" />
                  <ThemedText variant="caption" style={{ color: "#fff", marginLeft: 4 }}>
                    Change
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.photoButtonsRow}>
                <Pressable style={styles.photoButton} onPress={takeBodyPhoto}>
                  <Ionicons name="camera" size={28} color={colors.textMuted} />
                  <ThemedText variant="bodySmall" style={styles.photoButtonText}>
                    Take Photo
                  </ThemedText>
                </Pressable>
                <Pressable style={styles.photoButton} onPress={pickBodyPhoto}>
                  <Ionicons name="images" size={28} color={colors.textMuted} />
                  <ThemedText variant="bodySmall" style={styles.photoButtonText}>
                    Gallery
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Headshot Photo */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.section}>
          <Card style={styles.photoCard}>
            <View style={styles.optionalBadge}>
              <ThemedText variant="caption" muted>
                Optional
              </ThemedText>
            </View>
            <ThemedText variant="h3" style={styles.sectionTitle}>
              Headshot Photo
            </ThemedText>
            <ThemedText variant="bodySmall" muted style={{ marginBottom: spacing.md }}>
              For more accurate face matching
            </ThemedText>

            {isProcessingHeadshot ? (
              <View style={styles.headshotPlaceholder}>
                <ActivityIndicator size="large" color={colors.brandPrimary} />
              </View>
            ) : headshotPhotoUri ? (
              <View style={styles.headshotPreviewContainer}>
                <Image source={{ uri: headshotPhotoUri }} style={styles.headshotPreview} resizeMode="cover" />
                <Pressable style={styles.changeHeadshotButton} onPress={pickHeadshotPhoto}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.headshotButtonsRow}>
                <Pressable style={styles.headshotButton} onPress={takeHeadshotPhoto}>
                  <Ionicons name="person" size={24} color={colors.textMuted} />
                  <ThemedText variant="caption" muted style={{ marginTop: spacing.xs }}>
                    Selfie
                  </ThemedText>
                </Pressable>
                <Pressable style={styles.headshotButton} onPress={pickHeadshotPhoto}>
                  <Ionicons name="images" size={24} color={colors.textMuted} />
                  <ThemedText variant="caption" muted style={{ marginTop: spacing.xs }}>
                    Gallery
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Tips */}
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.section}>
          <Card style={styles.tipsCard}>
            <View style={styles.tipHeader}>
              <Ionicons name="bulb" size={20} color={colors.warning} />
              <ThemedText variant="bodySmall" style={{ marginLeft: spacing.sm, fontWeight: "600" }}>
                Tips for better results
              </ThemedText>
            </View>
            <View style={styles.tipsList}>
              <View style={styles.tipItem}>
                <Ionicons name="checkmark" size={16} color={colors.success} />
                <ThemedText variant="caption" muted style={{ marginLeft: spacing.sm }}>
                  Wear fitted clothing or workout clothes
                </ThemedText>
              </View>
              <View style={styles.tipItem}>
                <Ionicons name="checkmark" size={16} color={colors.success} />
                <ThemedText variant="caption" muted style={{ marginLeft: spacing.sm }}>
                  Use good lighting (natural light works best)
                </ThemedText>
              </View>
              <View style={styles.tipItem}>
                <Ionicons name="checkmark" size={16} color={colors.success} />
                <ThemedText variant="caption" muted style={{ marginLeft: spacing.sm }}>
                  Stand straight with arms relaxed
                </ThemedText>
              </View>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

      {/* Continue Button */}
      <Animated.View
        entering={FadeInUp.delay(500).springify()}
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <Animated.View style={animatedButtonStyle}>
          <Pressable
            style={[styles.continueButton, !isValid && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!isValid}
            onPressIn={() => {
              buttonScale.value = withSpring(0.96);
            }}
            onPressOut={() => {
              buttonScale.value = withSpring(1);
            }}
          >
            {isValid && <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
            <ThemedText variant="body" style={styles.continueButtonText}>
              Generate Future You
            </ThemedText>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
        {!isValid && (
          <ThemedText variant="caption" muted style={{ textAlign: "center", marginTop: spacing.sm }}>
            Upload a body photo to continue
          </ThemedText>
        )}
      </Animated.View>

      {/* Error Modal */}
      <Modal visible={errorModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color={colors.warning} />
            <ThemedText variant="h3" style={{ marginTop: spacing.md, textAlign: "center" }}>
              Photo Not Allowed
            </ThemedText>
            <ThemedText variant="body" muted style={{ marginTop: spacing.sm, textAlign: "center" }}>
              {errorMessage}
            </ThemedText>
            <Pressable style={styles.modalButton} onPress={() => setErrorModalVisible(false)}>
              <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <ThemedText variant="body" style={{ color: "#fff", fontWeight: "600" }}>
                OK
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Permission Denied Modal */}
      <Modal visible={!!permissionModal} transparent animationType="fade" onRequestClose={() => setPermissionModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="lock-closed" size={48} color={colors.brandPrimary} />
            <ThemedText variant="h3" style={{ marginTop: spacing.md, textAlign: "center" }}>
              {permissionModal?.title}
            </ThemedText>
            <ThemedText variant="body" muted style={{ marginTop: spacing.sm, textAlign: "center" }}>
              {permissionModal?.message}
            </ThemedText>
            <Pressable style={styles.modalButton} onPress={() => { setPermissionModal(null); Linking.openSettings(); }}>
              <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <ThemedText variant="body" style={{ color: "#fff", fontWeight: "600" }}>
                Open Settings
              </ThemedText>
            </Pressable>
            <Pressable style={{ marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl }} onPress={() => setPermissionModal(null)}>
              <ThemedText variant="body" muted>Not Now</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    marginBottom: spacing.lg,
  },
  photoCard: {
    padding: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  optionalBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    backgroundColor: "rgba(110, 168, 255, 0.2)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
  photoPlaceholder: {
    height: 280,
    backgroundColor: colors.bgSection,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreviewContainer: {
    position: "relative",
  },
  photoPreview: {
    width: "100%",
    height: 280,
    borderRadius: radii.md,
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
  photoButtonsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  photoButton: {
    flex: 1,
    paddingVertical: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderStyle: "dashed",
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
  },
  photoButtonText: {
    color: colors.textPrimary,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  headshotPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  headshotPreviewContainer: {
    position: "relative",
    alignSelf: "center",
  },
  headshotPreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  changeHeadshotButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  headshotButtonsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
  },
  headshotButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderStyle: "dashed",
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
  },
  tipsCard: {
    padding: spacing.md,
    backgroundColor: colors.bgSection,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  tipsList: {
    gap: spacing.xs,
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "center",
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
  continueButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  continueButtonText: {
    color: "#fff",
    fontWeight: "700",
    marginRight: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  modalButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
});
