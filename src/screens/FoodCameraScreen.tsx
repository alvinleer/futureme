import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn, FadeOut, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore } from "../state/authStore";
import { fetchWithAuthRefresh } from "../api/auth-fetch";
import { getSimplifiedNutrition } from "../api/edamam-nutrition";
import { analyzeNutritionAdvanced, toMealConfirmationData } from "../api/nutrition-router";
import { logMeal } from "../api/nutrition-api";
import { getDeviceId } from "../api/device-id";
import useDietStore from "../state/dietStore";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";

const { width: SCREEN_W } = Dimensions.get("window");

interface DetectedItem {
  id: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // Rough position on the photo (0–1 normalized)
  x: number;
  y: number;
}

type ScreenState = "camera" | "analyzing" | "overlay" | "logging";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function FoodCameraScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "FoodCamera">>();
  const libraryMode = route.params?.mode === "library";
  const authToken = useAuthStore((s) => s.token);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [screenState, setScreenState] = useState<ScreenState>("camera");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [mealDescription, setMealDescription] = useState("");
  const [editingItem, setEditingItem] = useState<DetectedItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

  // Auto-request permission on mount so the system dialog appears immediately
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission?.granted]);

  // ── AI Analysis ──────────────────────────────────────────────────────────

  const analyzeFood = async (imageUri: string) => {
    setScreenState("analyzing");
    setError(null);

    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const prompt = `Analyze this food image. Identify each distinct food item visible.

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "description": "Overall meal name (e.g. 'Chicken & Rice Bowl')",
  "items": [
    {
      "name": "food item name",
      "quantity": "estimated quantity (e.g. '1 cup', '6 oz', '2 slices')",
      "calories": 320,
      "protein": 28,
      "carbs": 40,
      "fat": 6,
      "x": 0.35,
      "y": 0.45
    }
  ]
}

For x/y: estimate the CENTER of each food item as a fraction of image width/height (0 = left/top, 1 = right/bottom).
Estimate nutrition per the quantity shown. Be specific. Minimum 1 item, maximum 8.`;

      if (!authToken) {
        setError("Please sign in again to scan food photos.");
        setScreenState("camera");
        return;
      }

      // Access tokens expire after 15 minutes, so a raw fetch here would 401 and
      // read as "photo scanning is broken". fetchWithAuthRefresh retries once.
      const res = await fetchWithAuthRefresh(`${BACKEND_URL}/api/ai/image/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg", prompt, maxTokens: 1024 }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          setError(
            "Photo scanning needs an OpenAI API key on the server. In the ENV tab add OPENAI_API_KEY (exact name), then try again."
          );
          setScreenState("camera");
          return;
        }
        if (res.status === 429) {
          setError("The daily photo scanning limit has been reached. Please try again later.");
          setScreenState("camera");
          return;
        }
        if (res.status === 401) {
          setError("Your session expired. Please sign in again.");
          setScreenState("camera");
          return;
        }
        throw new Error(await res.text());
      }
      const { content } = await res.json() as { content: string };

      let raw = (content ?? "").trim();
      raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);

      const items: DetectedItem[] = (parsed.items ?? []).map((item: {
        name: string;
        quantity: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        x: number;
        y: number;
      }, idx: number) => ({
        id: `item-${idx}`,
        name: item.name ?? "Unknown",
        quantity: item.quantity ?? "1 serving",
        calories: Math.round(item.calories ?? 0),
        protein: Math.round((item.protein ?? 0) * 10) / 10,
        carbs: Math.round((item.carbs ?? 0) * 10) / 10,
        fat: Math.round((item.fat ?? 0) * 10) / 10,
        x: Math.min(Math.max(item.x ?? 0.5, 0.05), 0.95),
        y: Math.min(Math.max(item.y ?? 0.5, 0.05), 0.95),
      }));

      setDetectedItems(items);
      setMealDescription(parsed.description ?? "Meal");
      setCapturedUri(imageUri);
      setScreenState("overlay");
    } catch (err) {
      // Session errors come back as thrown messages from fetchWithAuthRefresh —
      // showing them beats a generic "failed" that hides a fixable cause.
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.includes("session") || msg.includes("authenticated")
          ? msg
          : "Failed to analyze the food. Please try again."
      );
      setScreenState("camera");
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) await analyzeFood(photo.uri);
    } catch {
      setError("Failed to take picture. Please try again.");
    }
  };

  const pickImage = async () => {
    try {
      // Without this the picker opens empty (or closes instantly) on a fresh
      // install and "Upload Photo" looks like it does nothing.
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Photo access is off. Enable Photos for this app in Settings to upload a meal photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await analyzeFood(result.assets[0].uri);
      } else if (libraryMode) {
        navigation.goBack();
      }
    } catch {
      setError("The photo library could not be opened. Please try again.");
    }
  };

  // Opened via the "Upload Photo" menu option — jump straight to the library picker
  useEffect(() => {
    if (libraryMode) {
      pickImage();
    }
  }, []);

  // ── Overlay editing ──────────────────────────────────────────────────────

  const updateItem = (updated: DetectedItem) => {
    setDetectedItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    setEditingItem(null);
  };

  const removeItem = (id: string) => {
    setDetectedItems((prev) => prev.filter((it) => it.id !== id));
    if (editingItem?.id === id) setEditingItem(null);
  };

  const addMeal = useDietStore((s) => s.addMeal);

  const totalCalories = detectedItems.reduce((s, it) => s + it.calories, 0);
  const totalProtein = detectedItems.reduce((s, it) => s + it.protein, 0);
  const totalCarbs = detectedItems.reduce((s, it) => s + it.carbs, 0);
  const totalFat = detectedItems.reduce((s, it) => s + it.fat, 0);

  // ── Log food ─────────────────────────────────────────────────────────────

  const handleLogFood = () => {
    const ingredients = detectedItems.map((it) => `${it.quantity} ${it.name}`);
    const ingredientNutrition = detectedItems.map((it) => ({
      calories: it.calories,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      confidence: "medium" as const,
      source: "vision",
    }));

    addMeal(
      {
        description: mealDescription,
        calories: totalCalories,
        protein: Math.round(totalProtein * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
      },
      Date.now()
    );

    // Fire-and-forget analytics
    getDeviceId().then((userId) =>
      logMeal(
        userId,
        mealDescription,
        ingredientNutrition.map((n, i) => ({
          name: ingredients[i] ?? mealDescription,
          originalText: ingredients[i] ?? mealDescription,
          normalizedQuery: ingredients[i] ?? mealDescription,
          quantity: 1,
          unit: "serving",
          calories: n.calories,
          protein: n.protein,
          carbs: n.carbs,
          fat: n.fat,
          confidence: n.confidence,
          source: n.source,
        }))
      ).catch(() => {})
    ).catch(() => {});

    navigation.navigate("MainTabs");
  };

  // ── Permission screens ────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.fullDark}>
        <ActivityIndicator size="large" color={colors.brandTeal} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.fullDark}>
        <Ionicons name="camera-outline" size={64} color="#6b7280" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permBody}>
          We need camera access to take photos of your food for nutrition analysis.
        </Text>
        {permission.canAskAgain ? (
          <Pressable onPress={requestPermission} style={styles.permBtn}>
            <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </Pressable>
        ) : (
          <Pressable onPress={requestPermission} style={styles.permBtn}>
            <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.permBtnText}>Open Settings</Text>
          </Pressable>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.permBack}>
          <Text style={styles.permBackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Photo + AI overlay ────────────────────────────────────────────────────

  if (screenState === "overlay" && capturedUri) {
    return (
      <KeyboardAvoidingView
        style={styles.overlayRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={{ flex: 1 }}>
          {/* Photo fills entire background */}
          <Image
            source={{ uri: capturedUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <View style={[StyleSheet.absoluteFillObject, styles.photoDim]} />

          {/* Back to camera (retake) */}
          <Pressable
            style={[styles.overlayBack, { top: insets.top + 8 }]}
            onPress={() => {
              setScreenState("camera");
              setCapturedUri(null);
              setDetectedItems([]);
              setEditingItem(null);
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>

          {/* Close scanner entirely */}
          <Pressable
            style={[styles.overlayClose, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>

          {/* Callout chips — positioned relative to full screen */}
          {detectedItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setEditingItem(item)}
              style={[
                styles.calloutChip,
                {
                  left: item.x * SCREEN_W - 65,
                  top: item.y * (SCREEN_W * 1.2) - 28,
                },
              ]}
            >
              <Text style={styles.calloutName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.calloutQty} numberOfLines={1}>{item.quantity}</Text>
              <Text style={styles.calloutCals}>{item.calories} kcal</Text>
            </Pressable>
          ))}

          {/* Bottom panel — overlaps photo */}
          <Animated.View
            entering={FadeInUp.duration(300)}
            style={[styles.overlayPanel, { paddingBottom: insets.bottom + 16 }]}
          >
            {/* Total summary */}
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryTitle}>{mealDescription}</Text>
                <Text style={styles.summaryMeta}>
                  {detectedItems.length} item{detectedItems.length !== 1 ? "s" : ""} detected
                </Text>
              </View>
              <View style={styles.summaryCalBox}>
                <Text style={styles.summaryCalNum}>{totalCalories}</Text>
                <Text style={styles.summaryCalLabel}>kcal</Text>
              </View>
            </View>

            {/* Macro pills */}
            <View style={styles.macroPills}>
              <View style={styles.macroPill}>
                <Text style={[styles.macroPillVal, { color: colors.protein }]}>{Math.round(totalProtein)}g</Text>
                <Text style={styles.macroPillLabel}>protein</Text>
              </View>
              <View style={styles.macroPill}>
                <Text style={[styles.macroPillVal, { color: colors.carbs }]}>{Math.round(totalCarbs)}g</Text>
                <Text style={styles.macroPillLabel}>carbs</Text>
              </View>
              <View style={styles.macroPill}>
                <Text style={[styles.macroPillVal, { color: colors.fat }]}>{Math.round(totalFat)}g</Text>
                <Text style={styles.macroPillLabel}>fat</Text>
              </View>
            </View>

            {/* Item list (scrollable, compact) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
            >
              {detectedItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setEditingItem(item)}
                  style={styles.itemChip}
                >
                  <Text style={styles.itemChipName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemChipQty}>{item.quantity}</Text>
                  <Text style={styles.itemChipCal}>{item.calories} kcal</Text>
                </Pressable>
              ))}
              {/* Add item chip */}
              <Pressable
                onPress={() =>
                  setEditingItem({
                    id: `item-${Date.now()}`,
                    name: "",
                    quantity: "1 serving",
                    calories: 0,
                    protein: 0,
                    carbs: 0,
                    fat: 0,
                    x: 0.5,
                    y: 0.5,
                  })
                }
                style={[styles.itemChip, styles.itemChipAdd]}
              >
                <Ionicons name="add" size={20} color="rgba(255,255,255,0.6)" />
                <Text style={styles.itemChipAddText}>Add</Text>
              </Pressable>
            </ScrollView>

            {/* Log Food button */}
            <Pressable
              onPress={handleLogFood}
              style={styles.logBtn}
              disabled={detectedItems.length === 0}
            >
              <Ionicons name="checkmark" size={20} color="#1e206a" style={{ marginRight: 6 }} />
              <Text style={styles.logBtnText}>Log Food</Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Edit item sheet */}
        {editingItem && (
          <EditItemSheet
            item={editingItem}
            onSave={updateItem}
            onRemove={() => removeItem(editingItem.id)}
            onClose={() => setEditingItem(null)}
          />
        )}

      </KeyboardAvoidingView>
    );
  }

  // ── Camera View ───────────────────────────────────────────────────────────

  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing}>
        <View style={StyleSheet.absoluteFill}>
          {/* Header buttons — close top-left, flip top-right */}
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.camCornerBtn, { top: insets.top + 12, left: spacing.lg }]}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => setFacing(facing === "back" ? "front" : "back")}
            style={[styles.camCornerBtn, { top: insets.top + 12, right: spacing.lg }]}
          >
            <Ionicons name="camera-reverse" size={22} color="#fff" />
          </Pressable>

          {/* Center: analyzing overlay or guide box */}
          <View style={styles.camCenter}>
            {screenState === "analyzing" ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.analyzingBox}>
                <ActivityIndicator size="large" color={colors.brandTeal} />
                <Text style={styles.analyzingText}>Analyzing your food...</Text>
                <Text style={styles.analyzingSubText}>AI is identifying ingredients</Text>
              </Animated.View>
            ) : (
              <>
                <View style={styles.guideBox} />
                {error && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
                <Text style={styles.guideHint}>Take a picture of what you ate</Text>
              </>
            )}
          </View>

          {/* Bottom controls */}
          <View style={[styles.camControls, { paddingBottom: insets.bottom + 24 }]}>
            <Pressable
              onPress={pickImage}
              disabled={screenState === "analyzing"}
              style={[styles.camSideBtn, screenState === "analyzing" && { opacity: 0.4 }]}
            >
              <Ionicons name="images" size={26} color="#fff" />
            </Pressable>
            <Pressable
              onPress={takePicture}
              disabled={screenState === "analyzing"}
              style={[styles.camShutterBtn, screenState === "analyzing" && { opacity: 0.4 }]}
            >
              <View style={styles.camShutterInner} />
            </Pressable>
            <View style={styles.camSideBtn} />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

// ── Edit Item Sheet ───────────────────────────────────────────────────────────

function EditItemSheet({
  item,
  onSave,
  onRemove,
  onClose,
}: {
  item: DetectedItem;
  onSave: (item: DetectedItem) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isNew = item.name === "";
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [calories, setCalories] = useState(String(item.calories));
  const [protein, setProtein] = useState(String(item.protein));
  const [carbs, setCarbs] = useState(String(item.carbs));
  const [fat, setFat] = useState(String(item.fat));

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...item,
      name: name.trim(),
      quantity: quantity.trim(),
      calories: Math.round(parseFloat(calories) || 0),
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    });
  };

  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.editSheetBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "position" : "height"}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          entering={FadeInUp.duration(250)}
          style={[styles.editSheet, { paddingBottom: insets.bottom + 16 }]}
        >
        <View style={styles.editHandle} />
        <Text style={styles.editTitle}>{isNew ? "Add Item" : "Edit Item"}</Text>

        <View style={styles.editRow}>
          <Text style={styles.editLabel}>Food name</Text>
          <TextInput
            style={styles.editInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Grilled Chicken"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoFocus={isNew}
          />
        </View>
        <View style={styles.editRow}>
          <Text style={styles.editLabel}>Quantity</Text>
          <TextInput
            style={styles.editInput}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="e.g. 6 oz"
            placeholderTextColor="rgba(255,255,255,0.3)"
          />
        </View>
        <View style={styles.editMacroRow}>
          {[
            { label: "Calories", val: calories, set: setCalories },
            { label: "Protein (g)", val: protein, set: setProtein },
            { label: "Carbs (g)", val: carbs, set: setCarbs },
            { label: "Fat (g)", val: fat, set: setFat },
          ].map(({ label, val, set }) => (
            <View key={label} style={styles.editMacroField}>
              <Text style={styles.editLabel}>{label}</Text>
              <TextInput
                style={styles.editMacroInput}
                value={val}
                onChangeText={set}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
            </View>
          ))}
        </View>

        <View style={styles.editBtnRow}>
          {!isNew && (
            <Pressable onPress={onRemove} style={styles.editDeleteBtn}>
              <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          )}
          <Pressable
            onPress={handleSave}
            style={[styles.editSaveBtn, !name.trim() && { opacity: 0.5 }]}
            disabled={!name.trim()}
          >
            <Text style={styles.editSaveBtnText}>{isNew ? "Add" : "Update"}</Text>
          </Pressable>
        </View>
      </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullDark: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  // Camera
  camHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  camTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  camCornerBtn: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  camCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  guideBox: {
    width: 260,
    height: 260,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  guideHint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  analyzingBox: {
    width: 280,
    height: 280,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  analyzingText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  analyzingSubText: { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  camControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  camSideBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  camShutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  camShutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#000",
  },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    maxWidth: 280,
  },
  errorText: { color: "#f87171", fontSize: 14, textAlign: "center" },

  // Overlay screen
  overlayRoot: { flex: 1, backgroundColor: "#000" },
  photoDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  overlayBack: {
    position: "absolute",
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayClose: {
    position: "absolute",
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  calloutChip: {
    position: "absolute",
    backgroundColor: "rgba(8,46,43,0.92)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 80,
    maxWidth: 130,
    borderWidth: 1,
    borderColor: "rgba(0,206,209,0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  calloutName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  calloutQty: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    fontWeight: "400",
  },
  calloutCals: {
    color: colors.brandTeal,
    fontSize: 11,
    fontWeight: "700",
  },
  overlayPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1e206a",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingTop: 16,
    paddingHorizontal: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    maxWidth: 220,
  },
  summaryMeta: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 2,
  },
  summaryCalBox: { alignItems: "flex-end" },
  summaryCalNum: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  summaryCalLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    textAlign: "right",
  },
  macroPills: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  macroPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  macroPillVal: { fontSize: 15, fontWeight: "700" },
  macroPillLabel: { color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 1 },
  itemChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 90,
    maxWidth: 130,
    gap: 2,
  },
  itemChipAdd: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderStyle: "dashed",
  },
  itemChipAddText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  itemChipName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  itemChipQty: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
  },
  itemChipCal: {
    color: colors.brandTeal,
    fontSize: 11,
    fontWeight: "700",
  },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  logBtnText: {
    color: "#1e206a",
    fontSize: 16,
    fontWeight: "700",
  },
  // Permission screens
  permTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  permBody: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  permBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  permBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  permBack: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 24 },
  permBackText: { color: "#9ca3af", fontSize: 15 },
  // Edit sheet
  editSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  editSheet: {
    backgroundColor: "#1e206a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: spacing.lg,
  },
  editHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 16,
  },
  editTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 16,
  },
  editRow: { marginBottom: 12 },
  editLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  editInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editMacroRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  editMacroField: { flex: 1 },
  editMacroInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    textAlign: "center",
  },
  editBtnRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  editDeleteBtn: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  editSaveBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingVertical: 13,
    alignItems: "center",
  },
  editSaveBtnText: { color: "#1e206a", fontSize: 15, fontWeight: "700" },
});
