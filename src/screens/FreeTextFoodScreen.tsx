import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { analyzeNutritionAdvanced, toMealConfirmationData } from "../api/nutrition-router";
import useDietStore from "../state/dietStore";
import { colors, spacing, radii, shadows } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";

const SUGGESTIONS = [
  "2 scrambled eggs, toast with butter and orange juice",
  "Grilled chicken breast with rice and broccoli",
  "Large latte and a croissant",
  "Caesar salad with grilled salmon",
  "Protein shake with banana and almond milk",
];

export default function FreeTextFoodScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const inputRef = useRef<TextInput>(null);
  const findMatchingFavorite = useDietStore((s) => s.findMatchingFavorite);

  const [text, setText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setIsAnalyzing(true);
    setError(null);
    try {
      // Check favorites first
      const matchedFav = findMatchingFavorite(trimmed);
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
        navigation.navigate("MealConfirmation", { initialDataJson: JSON.stringify(favMealData) });
        return;
      }
      const result = await analyzeNutritionAdvanced(trimmed);
      const mealData = toMealConfirmationData(result, trimmed);
      navigation.navigate("MealConfirmation", { initialDataJson: JSON.stringify(mealData) });
    } catch {
      setError("Couldn't analyze that. Try describing the food in more detail.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Describe Your Meal</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"

      >
            {/* Instruction */}
            <Text style={styles.instructions}>
              {"Write what you ate in plain language — the AI will calculate the nutrition automatically."}
            </Text>

            {/* Text input card */}
            <View style={styles.inputCard}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={"e.g. Two scrambled eggs, toast with butter, glass of OJ"}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                returnKeyType="default"
                autoFocus
                cursorColor={colors.brandOrange}
                selectionColor={colors.brandOrange}
              />
              {text.length > 0 && (
                <Pressable style={styles.clearBtn} onPress={() => setText("")}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Error */}
            {error && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* Analyze button */}
            <Pressable
              style={[styles.analyzeBtn, (!text.trim() || isAnalyzing) && styles.analyzeBtnDisabled]}
              onPress={handleAnalyze}
              disabled={!text.trim() || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.analyzeBtnText}>Analyzing nutrition...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.analyzeBtnText}>Analyze Nutrition</Text>
                </>
              )}
            </Pressable>

            {/* Suggestion chips */}
            <Text style={styles.suggestionsLabel}>Try an example</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                style={styles.suggestionRow}
                onPress={() => {
                  setText(s);
                  inputRef.current?.focus();
                }}
              >
                <Ionicons name="restaurant-outline" size={16} color={colors.brandOrange} style={{ marginRight: 10 }} />
                <Text style={styles.suggestionText} numberOfLines={2}>{s}</Text>
              </Pressable>
            ))}
          </KeyboardAwareScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgCard, alignItems: "center", justifyContent: "center",
    marginRight: spacing.sm, ...shadows.card,
  },
  title: { flex: 1, fontSize: 22, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.4 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 60,
  },
  instructions: {
    fontSize: 14, color: colors.textMuted, lineHeight: 20,
    marginBottom: spacing.lg,
  },
  inputCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
    minHeight: 120,
  },
  input: {
    fontSize: 16, color: colors.textPrimary,
    lineHeight: 24, minHeight: 100,
  },
  clearBtn: {
    alignSelf: "flex-end", padding: 4, marginTop: 4,
  },
  errorCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(220,38,38,0.08)",
    borderRadius: radii.md, padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1, borderColor: "rgba(220,38,38,0.2)",
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error, lineHeight: 18 },
  analyzeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brandOrange,
    borderRadius: radii.pill, paddingVertical: 15,
    marginBottom: spacing.xl,
  },
  analyzeBtnDisabled: { opacity: 0.45 },
  analyzeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  suggestionsLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  suggestionRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bgCard, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.xs,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  suggestionText: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
});
