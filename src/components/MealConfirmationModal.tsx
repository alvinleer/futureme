import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { transcribeAudio } from "../api/transcribe-audio";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, spacing, radii } from "../theme";

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

interface MealConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: ParsedMealData, timestamp: number) => void;
  onRecalculateNutrition?: (ingredients: string[]) => Promise<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>;
  initialData: ParsedMealData | null;
  isLoading?: boolean;
  initialDate?: Date;
}

export default function MealConfirmationModal({
  visible,
  onClose,
  onConfirm,
  onRecalculateNutrition,
  initialData,
  isLoading = false,
  initialDate,
}: MealConfirmationModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mealData, setMealData] = useState<ParsedMealData | null>(initialData);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

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

  const startDictating = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsDictating(true);
    } catch {
      setIsDictating(false);
    }
  };

  const stopDictating = async () => {
    if (!recordingRef.current) return;
    setIsDictating(false);
    setIsTranscribing(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording URI");
      const transcription = await transcribeAudio(uri);
      if (transcription && mealData) {
        const trimmed = transcription.trim();
        const newIngredients = [...mealData.ingredients, trimmed];
        const newIngredientNutrition = [...(mealData.ingredientNutrition || []), { calories: 0, protein: 0, carbs: 0, fat: 0 }];
        const newIndex = newIngredients.length - 1;
        setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition });
        if (onRecalculateNutrition) {
          setIsRecalculating(true);
          try {
            const nutrition = await onRecalculateNutrition([trimmed]);
            if (nutrition) {
              setMealData((prev) => {
                if (!prev) return prev;
                const updatedNutrition = [...(prev.ingredientNutrition || [])];
                updatedNutrition[newIndex] = nutrition;
                return { ...prev, ingredientNutrition: updatedNutrition, ...sumNutrition(updatedNutrition) };
              });
            }
          } catch { /* silently fail */ } finally {
            setIsRecalculating(false);
          }
        }
      }
    } catch { /* silently fail */ } finally {
      setIsTranscribing(false);
      recordingRef.current = null;
    }
  };

  useEffect(() => {
    if (initialData) {
      setMealData(initialData);
    }
  }, [initialData]);

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    } else {
      setSelectedDate(new Date());
    }
  }, [initialDate, visible]);

  const formatDateLabel = (date: Date): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - compareDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays === -1) return "Tomorrow";
    if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleDateChange = (_event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      // Set to noon of the selected day to avoid timezone issues
      const newDate = new Date(date);
      newDate.setHours(12, 0, 0, 0);
      setSelectedDate(newDate);
    }
  };

  const startEditing = (index: number, value: string) => {
    setEditingIndex(index);
    setEditingValue(value);
  };

  const saveEdit = async () => {
    if (editingIndex === null || !mealData) return;

    const savedIndex = editingIndex;
    const trimmedValue = editingValue.trim();
    const newIngredients = [...mealData.ingredients];

    setEditingIndex(null);
    setEditingValue("");
    Keyboard.dismiss();

    if (trimmedValue === "") {
      // Delete this ingredient and recompute total locally
      newIngredients.splice(savedIndex, 1);
      const newIngredientNutrition = (mealData.ingredientNutrition || []).filter((_, i) => i !== savedIndex);
      setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition, ...sumNutrition(newIngredientNutrition) });
      return;
    }

    newIngredients[savedIndex] = trimmedValue;
    setMealData({ ...mealData, ingredients: newIngredients });

    if (!onRecalculateNutrition) return;

    setIsRecalculating(true);
    try {
      const singleNutrition = await onRecalculateNutrition([trimmedValue]);
      if (singleNutrition) {
        setMealData((prev) => {
          if (!prev) return prev;
          const newIngredientNutrition = [...(prev.ingredientNutrition || [])];
          newIngredientNutrition[savedIndex] = singleNutrition;
          return {
            ...prev,
            ingredients: newIngredients,
            ingredientNutrition: newIngredientNutrition,
            ...sumNutrition(newIngredientNutrition),
          };
        });
      }
    } catch {
      // silently fail
    } finally {
      setIsRecalculating(false);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue("");
    Keyboard.dismiss();
  };

  const deleteIngredient = (index: number) => {
    if (!mealData) return;
    const newIngredients = mealData.ingredients.filter((_, i) => i !== index);
    const newIngredientNutrition = (mealData.ingredientNutrition || []).filter((_, i) => i !== index);
    setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition, ...sumNutrition(newIngredientNutrition) });
  };

  const addIngredient = () => {
    if (!mealData) return;
    const newIngredients = [...mealData.ingredients, ""];
    const newIngredientNutrition = [...(mealData.ingredientNutrition || []), { calories: 0, protein: 0, carbs: 0, fat: 0 }];
    setMealData({ ...mealData, ingredients: newIngredients, ingredientNutrition: newIngredientNutrition });
    setEditingIndex(newIngredients.length - 1);
    setEditingValue("");
  };

  const handleConfirm = () => {
    if (!mealData) return;

    // Create timestamp at noon of the selected day
    const timestamp = selectedDate.getTime();
    onConfirm(mealData, timestamp);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        style={{ paddingTop: insets.top }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-3 border-b border-[#E5E7EB] flex-row items-center justify-between">
          <Text className="text-[#111111] font-bold text-2xl">Confirm Meal</Text>
          <Pressable onPress={onClose} className="p-2">
            <Ionicons name="close" size={24} color="#111111" />
          </Pressable>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text className="text-gray-400 mt-4">Processing your meal...</Text>
          </View>
        ) : mealData ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date Selector — compact inline row */}
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="mx-4 mt-4 flex-row items-center"
            >
              <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
              <Text className="text-gray-400 text-sm ml-1.5">Logging for</Text>
              <Text className="text-[#111111] text-sm font-semibold ml-1">
                {formatDateLabel(selectedDate)}
              </Text>
              <Ionicons name="chevron-forward" size={13} color="#9ca3af" style={{ marginLeft: 2 }} />
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

            {/* Meal Description */}
            <View className="px-4 mt-6">
              <Text className="text-[#111111] text-lg font-bold">{mealData.description}</Text>
            </View>

            {/* Nutrition Summary — clean breakdown card */}
            <View className="mx-4 mt-4 bg-[#F7F8F7] rounded-2xl p-4" style={{ borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" }}>
              {isRecalculating ? (
                <View className="items-center py-3">
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                  <Text className="text-gray-400 mt-2 text-sm">Recalculating...</Text>
                </View>
              ) : (
                <>
                  {/* Big calorie number */}
                  <View className="flex-row items-baseline mb-3" style={{ gap: 4 }}>
                    <Text style={{ fontSize: 40, fontWeight: "800", color: "#111", lineHeight: 44 }}>
                      {mealData.calories}
                    </Text>
                    <Text className="text-gray-400 text-sm font-medium mb-1">kcal</Text>
                  </View>
                  {/* Proportional macro bar */}
                  <MacroBar protein={mealData.protein} carbs={mealData.carbs} fat={mealData.fat} />
                  {/* Macro values row */}
                  <View className="flex-row justify-between mt-3">
                    {[
                      { label: "PROTEIN", value: mealData.protein, color: colors.protein },
                      { label: "CARBS", value: mealData.carbs, color: colors.carbs },
                      { label: "FAT", value: mealData.fat, color: colors.fat },
                    ].map((m) => (
                      <View key={m.label} className="items-center flex-1">
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.color, marginBottom: 4 }} />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: "#9ca3af", letterSpacing: 0.5 }}>{m.label}</Text>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: m.color }}>{m.value}g</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Ingredients - Editable */}
            <View className="px-4 mt-6">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-gray-400 text-xs uppercase tracking-wide">
                  Detected Items
                </Text>
                <Text className="text-gray-500 text-xs">Tap to edit</Text>
              </View>

              {mealData.ingredients.map((ingredient, index) => {
                const nutrition = mealData.ingredientNutrition?.[index];
                return (
                <View
                  key={index}
                  className="py-3 border-b border-[#E5E7EB]"
                >
                  <View className="flex-row items-start">
                    <View
                      className="w-2 h-2 rounded-full mr-3 mt-1.5"
                      style={{ backgroundColor: colors.brandPrimary }}
                    />
                    {editingIndex === index ? (
                      <View className="flex-1 flex-row items-center">
                        <TextInput
                          value={editingValue}
                          onChangeText={setEditingValue}
                          autoFocus
                          className="flex-1 text-[#111111] text-base bg-[#F5F5F5] rounded-lg px-3 py-2 mr-2"
                          placeholderTextColor="#6b7280"
                          placeholder="e.g., 1 cup rice"
                          onSubmitEditing={saveEdit}
                          returnKeyType="done"
                        />
                        <Pressable onPress={saveEdit} className="p-2">
                          <Ionicons name="checkmark" size={22} color={colors.brandPrimary} />
                        </Pressable>
                        <Pressable onPress={cancelEdit} className="p-2">
                          <Ionicons name="close" size={22} color="#6b7280" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => startEditing(index, ingredient)}
                        className="flex-1"
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-2">
                            <Text className="text-[#374151] text-base">{ingredient}</Text>
                            {nutrition?.confidence && (
                              <ConfidenceBadge
                                confidence={nutrition.confidence}
                                source={nutrition.source}
                              />
                            )}
                          </View>
                          <View className="flex-row items-center">
                            <Ionicons name="pencil" size={16} color="#6b7280" />
                            <Pressable
                              onPress={() => deleteIngredient(index)}
                              className="ml-3 p-1"
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Ionicons name="trash-outline" size={16} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>
                        {nutrition && (
                          <View className="flex-row mt-1.5 gap-x-3">
                            <Text className="text-xs font-semibold" style={{ color: colors.brandPrimary }}>
                              {nutrition.calories} cal
                            </Text>
                            <Text className="text-xs" style={{ color: colors.protein }}>
                              P {nutrition.protein}g
                            </Text>
                            <Text className="text-xs" style={{ color: colors.carbs }}>
                              C {nutrition.carbs}g
                            </Text>
                            <Text className="text-xs" style={{ color: colors.fat }}>
                              F {nutrition.fat}g
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
                );
              })}

              {/* Add Item Buttons */}
              {isDictating ? (
                <Pressable
                  onPress={stopDictating}
                  className="flex-row items-center justify-center py-4 px-5 mt-2 rounded-2xl"
                  style={{ backgroundColor: "#FEE2E2" }}
                >
                  <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                  <Text style={{ color: "#DC2626" }} className="text-base font-semibold">Tap to stop recording</Text>
                </Pressable>
              ) : isTranscribing ? (
                <View className="flex-row items-center justify-center py-4 mt-2">
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                  <Text style={{ color: colors.textMuted }} className="text-sm ml-2">Transcribing...</Text>
                </View>
              ) : (
                <View className="flex-row mt-2 gap-3">
                  <Pressable
                    onPress={addIngredient}
                    className="flex-1 flex-row items-center justify-center py-4 rounded-2xl"
                    style={{ backgroundColor: `${colors.brandPrimary}15` }}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.brandPrimary} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.brandPrimary }} className="text-sm font-semibold">Add manually</Text>
                  </Pressable>
                  <Pressable
                    onPress={startDictating}
                    className="flex-1 flex-row items-center justify-center py-4 rounded-2xl"
                    style={{ backgroundColor: `${colors.brandPrimary}15` }}
                  >
                    <Ionicons name="mic-outline" size={18} color={colors.brandPrimary} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.brandPrimary }} className="text-sm font-semibold">Add by dictating</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-400">No meal data available</Text>
          </View>
        )}

        {/* Confirm Button */}
        {mealData && !isLoading && (
          <View
            className="absolute bottom-0 left-0 right-0 px-4 bg-white"
            style={{ paddingBottom: insets.bottom + 16, paddingTop: 16 }}
          >
            <Pressable
              onPress={handleConfirm}
              disabled={isRecalculating || mealData.ingredients.length === 0}
              style={{
                backgroundColor:
                  isRecalculating || mealData.ingredients.length === 0
                    ? "#D1D5DB"
                    : colors.brandTeal,
              }}
              className="py-4 rounded-full flex-row items-center justify-center"
            >
              <Text
                className="font-bold text-lg"
                style={{
                  color: "#FFFFFF",
                }}
              >
                Log Meal
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const CONFIDENCE_CONFIG = {
  high: { label: "Verified", bg: "#dcfce7", text: "#15803d" },
  medium: { label: "Approx", bg: "#fef9c3", text: "#a16207" },
  low: { label: "Estimated", bg: "#fee2e2", text: "#b91c1c" },
};

const SOURCE_LABELS: Record<string, string> = {
  edamam: "Edamam",
  fatsecret: "FatSecret",
  gpt_estimated: "AI Est.",
};

function ConfidenceBadge({
  confidence,
  source,
}: {
  confidence: "high" | "medium" | "low";
  source?: string;
}) {
  const config = CONFIDENCE_CONFIG[confidence];
  const sourceLabel = source ? SOURCE_LABELS[source] ?? source : null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, gap: 4 }}>
      <View
        style={{
          backgroundColor: config.bg,
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: 4,
        }}
      >
        <Text style={{ color: config.text, fontSize: 10, fontWeight: "600" }}>
          {config.label}
        </Text>
      </View>
    </View>
  );
}

function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const proCal = protein * 4;
  const carbCal = carbs * 4;
  const fatCal = fat * 9;
  const total = proCal + carbCal + fatCal || 1;
  return (
    <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
      <View style={{ flex: Math.max(proCal / total, 0.01), backgroundColor: colors.protein, borderRadius: 3 }} />
      <View style={{ flex: Math.max(carbCal / total, 0.01), backgroundColor: colors.carbs, borderRadius: 3 }} />
      <View style={{ flex: Math.max(fatCal / total, 0.01), backgroundColor: colors.fat, borderRadius: 3 }} />
    </View>
  );
}
