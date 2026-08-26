import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import useDietStore from "../state/dietStore";
import { RootStackParamList } from "../navigation/RootNavigator";
import { colors, spacing, radii, shadows } from "../theme";
import { LinearGradient } from "expo-linear-gradient";

type EditFoodEntryRouteProp = RouteProp<RootStackParamList, "EditFoodEntry">;

const UNIT_OPTIONS = [
  { label: "serving", plural: "servings" },
  { label: "g", plural: "g" },
  { label: "oz", plural: "oz" },
  { label: "ml", plural: "ml" },
  { label: "cup", plural: "cups" },
  { label: "piece", plural: "pieces" },
  { label: "tbsp", plural: "tbsp" },
  { label: "tsp", plural: "tsp" },
];

function getUnitLabel(unit: string, quantity: number): string {
  const found = UNIT_OPTIONS.find((u) => u.label === unit);
  if (!found) return unit;
  return quantity === 1 ? found.label : found.plural;
}

export default function EditFoodEntryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<EditFoodEntryRouteProp>();
  const { mealId } = route.params;

  const meals = useDietStore((s) => s.meals);
  const updateMeal = useDietStore((s) => s.updateMeal);
  const deleteMeal = useDietStore((s) => s.deleteMeal);

  const meal = meals.find((m) => m.id === mealId);

  // Per-serving base values derived from stored totals / stored servings
  const storedServings = meal?.servings ?? 1;
  const baseCalories = (meal?.calories ?? 0) / storedServings;
  const baseProtein = (meal?.protein ?? 0) / storedServings;
  const baseCarbs = (meal?.carbs ?? 0) / storedServings;
  const baseFat = (meal?.fat ?? 0) / storedServings;

  const [description, setDescription] = useState(meal?.description ?? "");
  const [servings, setServings] = useState(storedServings);
  const [servingsText, setServingsText] = useState(String(storedServings));
  const [selectedUnit, setSelectedUnit] = useState(meal?.unit ?? "serving");

  // Derived totals — always in sync with servings
  const totalCal = Math.round(baseCalories * servings);
  const totalPro = Math.round(baseProtein * servings * 10) / 10;
  const totalCarb = Math.round(baseCarbs * servings * 10) / 10;
  const totalFt = Math.round(baseFat * servings * 10) / 10;

  // Allow manual override of macros (when user edits them directly)
  const [calOverride, setCalOverride] = useState<string | null>(null);
  const [proOverride, setProOverride] = useState<string | null>(null);
  const [carbOverride, setCarbOverride] = useState<string | null>(null);
  const [fatOverride, setFatOverride] = useState<string | null>(null);

  const displayCal = calOverride ?? String(totalCal);
  const displayPro = proOverride ?? String(totalPro);
  const displayCarb = carbOverride ?? String(totalCarb);
  const displayFat = fatOverride ?? String(totalFt);

  function applyServings(newServings: number) {
    const s = Math.max(0.1, Math.round(newServings * 10) / 10);
    setServings(s);
    setServingsText(String(s));
    // Clear manual overrides so derived values take over
    setCalOverride(null);
    setProOverride(null);
    setCarbOverride(null);
    setFatOverride(null);
  }

  if (!meal) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Edit Food</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>Food entry not found.</Text>
        </View>
      </View>
    );
  }

  const cal = parseFloat(displayCal) || 0;
  const pro = parseFloat(displayPro) || 0;
  const carb = parseFloat(displayCarb) || 0;
  const ft = parseFloat(displayFat) || 0;

  const proCal = pro * 4;
  const carbCal = carb * 4;
  const fatCal = ft * 9;
  const totalMacroCal = proCal + carbCal + fatCal || 1;
  const macros = [
    { label: "Protein", grams: pro, color: colors.protein, pct: Math.round((proCal / totalMacroCal) * 100) },
    { label: "Carbs", grams: carb, color: colors.carbs, pct: Math.round((carbCal / totalMacroCal) * 100) },
    { label: "Fat", grams: ft, color: colors.fat, pct: Math.round((fatCal / totalMacroCal) * 100) },
  ];

  const handleSave = () => {
    updateMeal(mealId, {
      description,
      servings,
      unit: selectedUnit,
      calories: parseFloat(displayCal) || 0,
      protein: parseFloat(displayPro) || 0,
      carbs: parseFloat(displayCarb) || 0,
      fat: parseFloat(displayFat) || 0,
    });
    navigation.goBack();
  };

  const handleDelete = () => {
    deleteMeal(mealId);
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Edit Food</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Nutrition Breakdown Card */}
            <View style={styles.breakdownCard}>
              <View style={styles.breakdownCalRow}>
                <Text style={styles.breakdownCalNum}>{Math.round(cal)}</Text>
                <Text style={styles.breakdownCalUnit}>kcal</Text>
                {servings !== 1 && (
                  <View style={styles.perServingBadge}>
                    <Text style={styles.perServingText}>
                      {Math.round(baseCalories)} kcal / {selectedUnit}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.breakdownBarTrack}>
                {macros.map((m) => (
                  <View key={m.label} style={[styles.breakdownBarSegment, { flex: m.pct || 1, backgroundColor: m.color }]} />
                ))}
              </View>
              <View style={styles.breakdownMacroRow}>
                {macros.map((m) => (
                  <View key={m.label} style={styles.breakdownMacroItem}>
                    <View style={[styles.breakdownDot, { backgroundColor: m.color }]} />
                    <Text style={styles.breakdownMacroLabel}>{m.label.toUpperCase()}</Text>
                    <Text style={[styles.breakdownMacroGrams, { color: m.color }]}>{Math.round(m.grams)}g</Text>
                    <Text style={styles.breakdownMacroPct}>{m.pct}%</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Name */}
            <Text style={styles.inputLabel}>Food Name</Text>
            <TextInput
              style={[styles.input, { marginBottom: spacing.lg }]}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g., Chicken and Rice"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />

            {/* Quantity */}
            <Text style={styles.inputLabel}>Quantity</Text>
            <View style={styles.quantityCard}>
              <Pressable
                style={styles.quantityBtn}
                onPress={() => applyServings(servings - 0.5)}
              >
                <Ionicons name="remove" size={22} color={colors.textPrimary} />
              </Pressable>

              <View style={styles.quantityCenter}>
                <TextInput
                  style={styles.quantityInput}
                  value={servingsText}
                  onChangeText={(v) => {
                    setServingsText(v);
                    const n = parseFloat(v);
                    if (!isNaN(n) && n > 0) applyServings(n);
                  }}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  textAlign="center"
                  selectTextOnFocus
                />
                <Text style={styles.quantityUnit}>
                  {getUnitLabel(selectedUnit, servings)}
                </Text>
              </View>

              <Pressable
                style={styles.quantityBtn}
                onPress={() => applyServings(servings + 0.5)}
              >
                <Ionicons name="add" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Quick quantity shortcuts */}
            <View style={styles.quickRow}>
              {[0.5, 1, 1.5, 2, 3].map((q) => (
                <Pressable
                  key={q}
                  style={[styles.quickChip, servings === q && styles.quickChipActive]}
                  onPress={() => applyServings(q)}
                >
                  <Text style={[styles.quickChipText, servings === q && styles.quickChipTextActive]}>
                    {q}×
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Unit type picker */}
            <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Unit Type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.unitRow}
              keyboardShouldPersistTaps="handled"
            >
              {UNIT_OPTIONS.map((u) => {
                const isActive = selectedUnit === u.label;
                return (
                  <Pressable
                    key={u.label}
                    style={[styles.unitChip, isActive && styles.unitChipActive]}
                    onPress={() => setSelectedUnit(u.label)}
                  >
                    <Text style={[styles.unitChipText, isActive && styles.unitChipTextActive]}>
                      {u.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Macro overrides */}
            <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>Nutrition (total)</Text>
            <View style={styles.macroRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.macroFieldLabel}>Calories</Text>
                <TextInput
                  style={styles.input}
                  value={displayCal}
                  onChangeText={(v) => setCalOverride(v)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.macroFieldLabel}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  value={displayPro}
                  onChangeText={(v) => setProOverride(v)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
            <View style={[styles.macroRow, { marginTop: spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.macroFieldLabel}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  value={displayCarb}
                  onChangeText={(v) => setCarbOverride(v)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.macroFieldLabel}>Fat (g)</Text>
                <TextInput
                  style={styles.input}
                  value={displayFat}
                  onChangeText={(v) => setFatOverride(v)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.deleteBtnText}>Remove</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </Pressable>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgCard, alignItems: "center", justifyContent: "center",
    marginRight: spacing.sm, ...shadows.card,
  },
  title: { flex: 1, fontSize: 22, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.4 },
  inputLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textMuted,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: spacing.xs,
  },
  macroFieldLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textMuted,
    letterSpacing: 0.6, marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16, color: colors.textPrimary,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  deleteBtn: {
    flex: 1, flexDirection: "row", paddingVertical: 14,
    borderRadius: radii.pill, alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  deleteBtnText: { color: colors.textMuted, fontWeight: "600", fontSize: 15 },
  saveBtn: {
    flex: 2, paddingVertical: 14,
    borderRadius: radii.pill, alignItems: "center", backgroundColor: "#1e206a",
    overflow: "hidden",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  // Breakdown card
  breakdownCard: {
    backgroundColor: colors.bgCard, borderRadius: radii.lg,
    padding: spacing.lg, marginBottom: spacing.lg,
    borderWidth: 1.5, borderColor: colors.borderSubtle, ...shadows.card,
  },
  breakdownCalRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 12, gap: 6, flexWrap: "wrap" },
  breakdownCalNum: { fontSize: 40, fontWeight: "800", color: colors.textPrimary, lineHeight: 44 },
  breakdownCalUnit: { fontSize: 14, fontWeight: "500", color: colors.textMuted, marginBottom: 4 },
  perServingBadge: {
    marginLeft: "auto",
    backgroundColor: "rgba(94,234,212,0.1)",
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "center",
  },
  perServingText: { fontSize: 11, color: "#14B8A6", fontWeight: "600" },
  breakdownBarTrack: {
    flexDirection: "row", height: 6, borderRadius: 3,
    overflow: "hidden", gap: 2, marginBottom: 14,
  },
  breakdownBarSegment: { height: 6, borderRadius: 3 },
  breakdownMacroRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownMacroItem: { flex: 1, alignItems: "center", gap: 3 },
  breakdownDot: { width: 7, height: 7, borderRadius: 3.5 },
  breakdownMacroLabel: {
    fontSize: 10, fontWeight: "600", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  breakdownMacroGrams: { fontSize: 15, fontWeight: "700" },
  breakdownMacroPct: { fontSize: 11, fontWeight: "500", color: colors.textMuted },
  // Quantity card
  quantityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  quantityBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.bgMain,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  quantityCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityInput: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.textPrimary,
    minWidth: 80,
    textAlign: "center",
  },
  quantityUnit: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "500",
    marginTop: 2,
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
    flexWrap: "wrap",
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  quickChipActive: {
    backgroundColor: "#1e206a",
    borderColor: "#1e206a",
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  quickChipTextActive: {
    color: "#5EEAD4",
  },
  // Unit picker
  unitRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  unitChipActive: {
    backgroundColor: "#1e206a",
    borderColor: "#1e206a",
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  unitChipTextActive: {
    color: "#5EEAD4",
  },
});
