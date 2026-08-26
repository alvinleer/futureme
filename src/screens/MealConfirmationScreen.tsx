import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Audio } from "expo-av";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { analyzeNutritionAdvanced } from "../api/nutrition-router";
import { logMeal } from "../api/nutrition-api";
import { getDeviceId } from "../api/device-id";
import { transcribeAudio } from "../api/transcribe-audio";
import useDietStore from "../state/dietStore";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { MicronutrientKey } from "../data/micronutrients";

export interface MealIngredient {
  name: string;
  quantity: string;
}

export interface IngredientNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence?: "high" | "medium" | "low";
  source?: string;
  micronutrients?: Partial<Record<string, number>>;
}

export interface ParsedMealData {
  description: string;
  ingredients: string[];
  ingredientNutrition?: IngredientNutrition[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients?: Partial<Record<MicronutrientKey, number>>;
}

type MealConfirmationRouteProp = RouteProp<RootStackParamList, "MealConfirmation">;
type MealConfirmationNavProp = NativeStackNavigationProp<RootStackParamList, "MealConfirmation">;

export default function MealConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MealConfirmationNavProp>();
  const route = useRoute<MealConfirmationRouteProp>();
  const addMeal = useDietStore((s) => s.addMeal);
  const deleteMeal = useDietStore((s) => s.deleteMeal);
  const addFavoriteMeal = useDietStore((s) => s.addFavoriteMeal);

  const { initialDataJson, initialDateMs, existingMealId } = route.params;

  const [mealData, setMealData] = useState<ParsedMealData | null>(() => {
    try { return JSON.parse(initialDataJson); } catch { return null; }
  });
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialDateMs ? new Date(initialDateMs) : new Date()
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const [editingFood, setEditingFood] = useState("");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSaveFavoriteModal, setShowSaveFavoriteModal] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [logAsMeal, setLogAsMeal] = useState(false);
  const [mealName, setMealName] = useState(() => {
    try { return JSON.parse(initialDataJson).description ?? ""; } catch { return ""; }
  });

  const sumNutrition = (items: IngredientNutrition[]) =>
    items.reduce(
      (acc, n) => ({
        calories: acc.calories + n.calories,
        protein: Math.round((acc.protein + n.protein) * 10) / 10,
        carbs: Math.round((acc.carbs + n.carbs) * 10) / 10,
        fat: Math.round((acc.fat + n.fat) * 10) / 10,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

  const aggregateMicronutrients = (
    items: IngredientNutrition[]
  ): Partial<Record<string, number>> | undefined => {
    const result: Record<string, number> = {};
    for (const item of items) {
      if (item.micronutrients) {
        for (const [key, val] of Object.entries(item.micronutrients)) {
          if (typeof val === "number" && val > 0) {
            result[key] = (result[key] ?? 0) + val;
          }
        }
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const formatDateLabel = (date: Date): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - compareDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays === -1) return "Tomorrow";
    if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const handleDateChange = (_event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      const newDate = new Date(date);
      newDate.setHours(12, 0, 0, 0);
      setSelectedDate(newDate);
    }
  };

  const parseIngredient = (value: string): { qty: string; food: string } => {
    const match = value.match(/^(\d+(?:[./]\d+)?(?:\s*(?:g|kg|ml|l|oz|lb|lbs|cups?|tbsp|tsp|pieces?|slices?|servings?))?\s+)(.+)$/i);
    if (match) return { qty: match[1].trim(), food: match[2].trim() };
    const simple = value.match(/^(\S+)\s+(.+)$/);
    if (simple && /^\d/.test(simple[1])) return { qty: simple[1], food: simple[2] };
    return { qty: "", food: value };
  };

  const startEditing = (index: number, value: string) => {
    const { qty, food } = parseIngredient(value);
    setEditingIndex(index);
    setEditingQty(qty);
    setEditingFood(food);
  };

  const saveEdit = async () => {
    if (editingIndex === null || !mealData) return;
    const savedIndex = editingIndex;
    const trimmedValue = [editingQty.trim(), editingFood.trim()].filter(Boolean).join(" ");
    const newIngredients = [...mealData.ingredients];
    setEditingIndex(null);
    setEditingQty("");
    setEditingFood("");
    Keyboard.dismiss();

    if (trimmedValue === "") {
      newIngredients.splice(savedIndex, 1);
      const newIngredientNutrition = (mealData.ingredientNutrition || []).filter((_, i) => i !== savedIndex);
      setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition, ...sumNutrition(newIngredientNutrition), micronutrients: aggregateMicronutrients(newIngredientNutrition) });
      return;
    }

    newIngredients[savedIndex] = trimmedValue;
    setMealData({ ...mealData, ingredients: newIngredients });
    setIsRecalculating(true);
    try {
      const result = await analyzeNutritionAdvanced(trimmedValue);
      // Aggregate micronutrients from all resolved items in the result
      const itemMicros: Record<string, number> = {};
      for (const item of result.items) {
        if (item.micronutrients) {
          for (const [key, val] of Object.entries(item.micronutrients)) {
            if (typeof val === "number" && val > 0) {
              itemMicros[key] = (itemMicros[key] ?? 0) + val;
            }
          }
        }
      }
      const singleNutrition: IngredientNutrition = {
        calories: result.total.calories,
        protein: result.total.protein,
        carbs: result.total.carbs,
        fat: result.total.fat,
        micronutrients: Object.keys(itemMicros).length > 0 ? itemMicros : undefined,
      };
      setMealData((prev) => {
        if (!prev) return prev;
        const updated = [...(prev.ingredientNutrition || [])];
        updated[savedIndex] = singleNutrition;
        return { ...prev, ingredients: newIngredients, ingredientNutrition: updated, ...sumNutrition(updated), micronutrients: aggregateMicronutrients(updated) };
      });
    } catch { /* silently fail */ } finally {
      setIsRecalculating(false);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingQty("");
    setEditingFood("");
    Keyboard.dismiss();
  };

  const deleteIngredient = (index: number) => {
    if (!mealData) return;
    const newIngredients = mealData.ingredients.filter((_, i) => i !== index);
    const newIngredientNutrition = (mealData.ingredientNutrition || []).filter((_, i) => i !== index);
    setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition, ...sumNutrition(newIngredientNutrition), micronutrients: aggregateMicronutrients(newIngredientNutrition) });
  };

  const addIngredient = () => {
    if (!mealData) return;
    const newIngredients = [...mealData.ingredients, ""];
    const newIngredientNutrition = [...(mealData.ingredientNutrition || []), { calories: 0, protein: 0, carbs: 0, fat: 0 }];
    setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition });
    setEditingIndex(newIngredients.length - 1);
    setEditingQty("");
    setEditingFood("");
  };

  const startDictating = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsDictating(true);
      // Auto-stop after 15 seconds
      autoStopTimerRef.current = setTimeout(() => {
        stopDictating();
      }, 15000);
    } catch { setIsDictating(false); }
  };

  const stopDictating = async () => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (!recordingRef.current) return;
    setIsDictating(false);
    setIsTranscribing(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording URI");
      let transcription: string;
      try {
        transcription = await transcribeAudio(uri);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.startsWith("No speech detected")) {
          setDictationError("No speech was picked up. Speak clearly and reduce background noise, then try again.");
        }
        return;
      }
      if (transcription && mealData) {
        const trimmed = transcription.trim();
        setIsRecalculating(true);
        try {
          const result = await analyzeNutritionAdvanced(trimmed);
          const nutrition = { calories: result.total.calories, protein: result.total.protein, carbs: result.total.carbs, fat: result.total.fat };
          // Only add to the list after we confirm it resolved successfully
          setMealData((prev) => {
            if (!prev) return prev;
            const newIngredients = [...prev.ingredients, trimmed];
            const newIngredientNutrition = [...(prev.ingredientNutrition || []), nutrition];
            return { ...prev, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition, ...sumNutrition(newIngredientNutrition) };
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          if (msg.startsWith("No food detected")) {
            setDictationError("No food was detected in your recording. Please clearly describe what you ate.");
          }
        } finally { setIsRecalculating(false); }
      }
    } catch { /* silently fail for recording errors */ } finally {
      setIsTranscribing(false);
      recordingRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (!mealData) return;
    const timestamp = selectedDate.getTime();
    if (existingMealId) deleteMeal(existingMealId);

    const hasMultiple = mealData.ingredients.length > 1;

    if (!hasMultiple || logAsMeal) {
      // Log as single combined meal
      addMeal(
        {
          description: logAsMeal && mealName.trim() ? mealName.trim() : mealData.description,
          calories: mealData.calories,
          protein: mealData.protein,
          carbs: mealData.carbs,
          fat: mealData.fat,
          micronutrients: mealData.micronutrients,
        },
        timestamp
      );
    } else {
      // Log each ingredient as its own separate food entry
      mealData.ingredients.forEach((ingredient, index) => {
        const nutrition = mealData.ingredientNutrition?.[index];
        if (!nutrition) return;
        addMeal(
          {
            description: ingredient,
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
            micronutrients: nutrition.micronutrients,
          },
          timestamp
        );
      });
    }

    // Fire-and-forget analytics
    getDeviceId().then((userId) =>
      logMeal(
        userId,
        mealData.description,
        (mealData.ingredientNutrition ?? []).map((n, i) => ({
          name: mealData.ingredients[i] ?? mealData.description,
          originalText: mealData.ingredients[i] ?? mealData.description,
          normalizedQuery: mealData.ingredients[i] ?? mealData.description,
          quantity: 1,
          unit: "serving",
          calories: n.calories,
          protein: n.protein,
          carbs: n.carbs,
          fat: n.fat,
          confidence: n.confidence ?? "medium",
          source: n.source ?? "ai",
        }))
      ).catch(() => {})
    ).catch(() => {});

    navigation.navigate("MainTabs");
  };

  const handleSaveFavorite = () => {
    if (!mealData) return;
    setFavoriteName(logAsMeal && mealName.trim() ? mealName.trim() : mealData.description);
    setShowSaveFavoriteModal(true);
  };

  const confirmSaveFavorite = () => {
    if (!mealData || !favoriteName.trim()) return;
    addFavoriteMeal({
      name: favoriteName.trim(),
      description: mealData.description,
      calories: mealData.calories,
      protein: mealData.protein,
      carbs: mealData.carbs,
      fat: mealData.fat,
      micronutrients: mealData.micronutrients,
      ingredients: mealData.ingredients,
      ingredientNutrition: mealData.ingredientNutrition ?? [],
    });
    setShowSaveFavoriteModal(false);
    setFavoriteName("");
  };

  if (!mealData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Confirm Meal</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.textMuted }}>No meal data available</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Confirm Meal</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Date row */}
        <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
          <Text style={styles.dateLabel}>Logging for</Text>
          <Text style={styles.dateValue}>{formatDateLabel(selectedDate)}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textMuted} style={{ marginLeft: 2 }} />
        </Pressable>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
            maximumDate={new Date()}
            themeVariant="light"
          />
        )}

        {/* Meal description */}
        <View style={styles.section}>
          <Text style={styles.mealTitle}>{mealData.description}</Text>
        </View>

        {/* Nutrition card */}
        <View style={styles.nutritionCard}>
          {isRecalculating ? (
            <View style={styles.recalcRow}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <Text style={styles.recalcText}>Recalculating...</Text>
            </View>
          ) : (
            <>
              <View style={styles.calorieRow}>
                <Text style={styles.calorieNumber}>{mealData.calories}</Text>
                <Text style={styles.calorieUnit}>kcal</Text>
              </View>
              <MacroBar protein={mealData.protein} carbs={mealData.carbs} fat={mealData.fat} />
              <View style={styles.macroRow}>
                {[
                  { label: "PROTEIN", value: mealData.protein, color: colors.protein },
                  { label: "CARBS", value: mealData.carbs, color: colors.carbs },
                  { label: "FAT", value: mealData.fat, color: colors.fat },
                ].map((m) => (
                  <View key={m.label} style={styles.macroItem}>
                    <View style={[styles.macroDot, { backgroundColor: m.color }]} />
                    <Text style={styles.macroLabel}>{m.label}</Text>
                    <Text style={[styles.macroValue, { color: m.color }]}>{m.value}g</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Ingredients */}
        <View style={styles.section}>
          <View style={styles.ingredientsHeader}>
            <Text style={styles.sectionLabel}>DETECTED ITEMS</Text>
            <Text style={styles.tapHint}>Tap to edit</Text>
          </View>

          {mealData.ingredients.map((ingredient, index) => {
            const nutrition = mealData.ingredientNutrition?.[index];
            return (
              <View key={index} style={styles.ingredientRow}>
                <View style={[styles.dot, { backgroundColor: colors.brandPrimary }]} />
                {editingIndex === index ? (
                  <View style={styles.editRow}>
                    <TextInput
                      value={editingQty}
                      onChangeText={setEditingQty}
                      autoFocus
                      style={[styles.editInput, { width: 64, flexShrink: 0 }]}
                      placeholderTextColor={colors.textMuted}
                      placeholder="Qty"
                      keyboardType="default"
                      returnKeyType="next"
                    />
                    <TextInput
                      value={editingFood}
                      onChangeText={setEditingFood}
                      style={[styles.editInput, { flex: 1 }]}
                      placeholderTextColor={colors.textMuted}
                      placeholder="Food name"
                      onSubmitEditing={saveEdit}
                      returnKeyType="done"
                    />
                    <Pressable onPress={saveEdit} style={styles.editAction}>
                      <Ionicons name="checkmark" size={22} color={colors.brandPrimary} />
                    </Pressable>
                    <Pressable onPress={cancelEdit} style={styles.editAction}>
                      <Ionicons name="close" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => startEditing(index, ingredient)} style={{ flex: 1 }}>
                    <View style={styles.ingredientContent}>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={styles.ingredientText}>{ingredient}</Text>
                        {nutrition?.confidence && (
                          <ConfidenceBadge confidence={nutrition.confidence} source={nutrition.source} />
                        )}
                      </View>
                      <View style={styles.ingredientActions}>
                        <Ionicons name="pencil" size={16} color={colors.textMuted} />
                        <Pressable
                          onPress={() => deleteIngredient(index)}
                          style={{ marginLeft: spacing.sm, padding: 2 }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </Pressable>
                      </View>
                    </View>
                    {nutrition && (
                      <View style={styles.nutritionMicro}>
                        <Text style={[styles.microText, { color: colors.brandPrimary }]}>{nutrition.calories} cal</Text>
                        <Text style={[styles.microText, { color: colors.protein }]}>P {nutrition.protein}g</Text>
                        <Text style={[styles.microText, { color: colors.carbs }]}>C {nutrition.carbs}g</Text>
                        <Text style={[styles.microText, { color: colors.fat }]}>F {nutrition.fat}g</Text>
                      </View>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}

          {/* Add item buttons */}
          {isDictating ? (
            <Pressable onPress={stopDictating} style={styles.dictatingBtn}>
              <View style={styles.dictatingDot} />
              <Text style={styles.dictatingText}>Tap to stop recording</Text>
            </Pressable>
          ) : isTranscribing ? (
            <View style={styles.transcribingRow}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <Text style={styles.transcribingText}>Transcribing...</Text>
            </View>
          ) : (
            <View style={styles.addButtons}>
              <View style={styles.addRow}>
                <Pressable onPress={addIngredient} style={styles.addBtn}>
                  <Ionicons name="create-outline" size={18} color={colors.brandPrimary} style={{ marginRight: 6 }} />
                  <Text style={styles.addBtnText}>Add manually</Text>
                </Pressable>
                <Pressable onPress={startDictating} style={styles.addBtn}>
                  <Ionicons name="mic-outline" size={18} color={colors.brandPrimary} style={{ marginRight: 6 }} />
                  <Text style={styles.addBtnText}>Add by dictating</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => {
                  if (!mealData) return;
                  navigation.replace("BarcodeScanner", { appendToMealJson: JSON.stringify(mealData) });
                }}
                style={styles.addBtnFull}
              >
                <Ionicons name="barcode-outline" size={18} color={colors.brandPrimary} style={{ marginRight: 6 }} />
                <Text style={styles.addBtnText}>Scan barcode</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Confirm button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {/* Log mode toggle — only shown when multiple ingredients */}
        {mealData.ingredients.length > 1 && (
          <View style={styles.logModeToggle}>
            <Pressable
              onPress={() => setLogAsMeal(false)}
              style={[styles.toggleOption, !logAsMeal && styles.toggleOptionActive]}
            >
              <Ionicons name="list-outline" size={14} color={!logAsMeal ? "#fff" : colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={[styles.toggleOptionText, !logAsMeal && styles.toggleOptionTextActive]}>Individual</Text>
            </Pressable>
            <Pressable
              onPress={() => setLogAsMeal(true)}
              style={[styles.toggleOption, logAsMeal && styles.toggleOptionActive]}
            >
              <Ionicons name="layers-outline" size={14} color={logAsMeal ? "#fff" : colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={[styles.toggleOptionText, logAsMeal && styles.toggleOptionTextActive]}>As a Meal</Text>
            </Pressable>
          </View>
        )}

        {/* Meal name input — shown in meal mode */}
        {(logAsMeal || mealData.ingredients.length <= 1) && (
          <TextInput
            style={styles.mealNameInput}
            value={mealName}
            onChangeText={setMealName}
            placeholder="Meal name (optional)..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        )}

        {/* Save as Favorite — shown in meal mode or single food */}
        {(logAsMeal || mealData.ingredients.length <= 1) && (
          <Pressable
            style={styles.saveAsFavBtn}
            onPress={handleSaveFavorite}
            disabled={isRecalculating || mealData.ingredients.length === 0}
          >
            <Ionicons name="bookmark-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.saveAsFavText}>Save as Favorite</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleConfirm}
          disabled={isRecalculating || mealData.ingredients.length === 0}
          style={[
            styles.confirmBtn,
            (isRecalculating || mealData.ingredients.length === 0) && styles.confirmBtnDisabled,
          ]}
        >
          {!(isRecalculating || mealData.ingredients.length === 0) && (
            <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <Text style={styles.confirmBtnText}>
            {!logAsMeal && mealData.ingredients.length > 1
              ? `Log ${mealData.ingredients.length} Foods`
              : "Log Meal"}
          </Text>
        </Pressable>
      </View>

      {/* Dictation error modal */}
      <Modal visible={!!dictationError} transparent animationType="fade">
        <Pressable style={styles.favOverlay} onPress={() => setDictationError(null)}>
          <View style={[styles.favCard, { alignItems: "center" }]}>
            <Ionicons name="mic-off-outline" size={28} color="#ef4444" style={{ marginBottom: 8 }} />
            <Text style={[styles.favTitle, { textAlign: "center" }]}>No Food Detected</Text>
            <Text style={[styles.favSubtitle, { textAlign: "center", marginBottom: 16 }]}>{dictationError}</Text>
            <Pressable
              style={{ backgroundColor: colors.brandPrimary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
              onPress={() => setDictationError(null)}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Try Again</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Save as Favorite modal */}
      <Modal visible={showSaveFavoriteModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.favOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowSaveFavoriteModal(false); Keyboard.dismiss(); }} />
          <View style={styles.favCard}>
            <View style={styles.favIconRow}>
              <Ionicons name="bookmark" size={22} color={colors.brandPrimary} />
            </View>
            <Text style={styles.favTitle}>Save as Favorite</Text>
            <Text style={styles.favSubtitle}>Give this meal a name you can say when logging.</Text>
            <TextInput
              style={styles.favInput}
              value={favoriteName}
              onChangeText={setFavoriteName}
              placeholder="e.g. Morning Shake, Lunch Salad..."
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmSaveFavorite}
            />
            <View style={styles.favBtnRow}>
              <Pressable
                style={styles.favCancelBtn}
                onPress={() => { setShowSaveFavoriteModal(false); Keyboard.dismiss(); }}
              >
                <Text style={styles.favCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.favSaveBtn, !favoriteName.trim() && { opacity: 0.45 }]}
                onPress={confirmSaveFavorite}
                disabled={!favoriteName.trim()}
              >
                <Text style={styles.favSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const CONFIDENCE_CONFIG = {
  high: { label: "Verified", bg: "#dcfce7", text: "#15803d" },
  medium: { label: "Approx", bg: "#fef9c3", text: "#a16207" },
  low: { label: "Estimated", bg: "#fee2e2", text: "#b91c1c" },
};
const SOURCE_LABELS: Record<string, string> = { edamam: "Edamam", fatsecret: "FatSecret", gpt_estimated: "AI Est." };

function ConfidenceBadge({ confidence, source }: { confidence: "high" | "medium" | "low"; source?: string }) {
  const config = CONFIDENCE_CONFIG[confidence];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, gap: 4 }}>
      <View style={{ backgroundColor: config.bg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
        <Text style={{ color: config.text, fontSize: 10, fontWeight: "600" }}>{config.label}</Text>
      </View>
    </View>
  );
}

function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const proCal = protein * 4, carbCal = carbs * 4, fatCal = fat * 9;
  const total = proCal + carbCal + fatCal || 1;
  return (
    <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
      <View style={{ flex: Math.max(proCal / total, 0.01), backgroundColor: colors.protein, borderRadius: 3 }} />
      <View style={{ flex: Math.max(carbCal / total, 0.01), backgroundColor: colors.carbs, borderRadius: 3 }} />
      <View style={{ flex: Math.max(fatCal / total, 0.01), backgroundColor: colors.fat, borderRadius: 3 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgCard,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: colors.bgCard,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  dateLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginLeft: 5,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    marginLeft: 4,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  mealTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  nutritionCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: "#F7F8F7",
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  recalcRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  recalcText: {
    fontSize: 13,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  calorieRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
    gap: 4,
  },
  calorieNumber: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 44,
  },
  calorieUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
    marginBottom: 4,
  },
  macroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  macroItem: {
    flex: 1,
    alignItems: "center",
  },
  macroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  ingredientsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  tapHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: spacing.sm,
  },
  editRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  editInput: {
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
  },
  editAction: {
    padding: spacing.xs,
  },
  ingredientContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ingredientText: {
    fontSize: 15,
    color: "#374151",
  },
  ingredientActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  nutritionMicro: {
    flexDirection: "row",
    marginTop: 4,
    gap: 12,
  },
  microText: {
    fontSize: 11,
    fontWeight: "600",
  },
  addRow: {
    flexDirection: "row",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  addButtons: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: `${colors.brandPrimary}15`,
  },
  addBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: `${colors.brandPrimary}15`,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandPrimary,
  },
  dictatingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: "#FEE2E2",
  },
  dictatingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    marginRight: spacing.sm,
  },
  dictatingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#DC2626",
  },
  transcribingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  transcribingText: {
    fontSize: 13,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  confirmBtn: {
    backgroundColor: "#1e206a",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  confirmBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  saveAsFavBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    marginBottom: spacing.sm,
  },
  saveAsFavText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.brandPrimary,
  },
  // Save-as-favorite modal
  favOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  favCard: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  favIconRow: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSoftOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  favTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  favSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: -4,
  },
  favInput: {
    backgroundColor: colors.bgMain,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.textPrimary,
  },
  favBtnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  favCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.pill,
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
  },
  favCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.brandTeal,
  },
  favSaveBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.pill,
    alignItems: "center",
    backgroundColor: colors.brandOrange,
  },
  favSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  logModeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: radii.lg,
    padding: 3,
    marginBottom: spacing.sm,
  },
  toggleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  toggleOptionActive: {
    backgroundColor: colors.brandPrimary,
  },
  toggleOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  toggleOptionTextActive: {
    color: "#fff",
  },
  mealNameInput: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
