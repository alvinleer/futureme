import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { lookupFatSecretBarcode } from "../api/fatsecret";
import { lookupBarcode as lookupOpenFoodFacts } from "../api/openfoodfacts";
import { logMeal } from "../api/nutrition-api";
import { getDeviceId } from "../api/device-id";
import useDietStore from "../state/dietStore";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";
import { LinearGradient } from "expo-linear-gradient";

interface FoundProduct {
  name: string;
  servingDescription: string;
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  metricGrams?: number;
  metricAmount?: number;  // actual serving amount in metricUnit (may not be grams)
  metricUnit?: string;
  source: "fatsecret" | "openfoodfacts";
}

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.35,
  ml: 1,
  tbsp: 14.79,
  tsp: 4.93,
  cup: 236.6,
};

const UNIT_OPTIONS = ["g", "oz", "ml", "tbsp", "tsp", "cup"];

export default function BarcodeScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "BarcodeScanner">>();
  const appendToMealJson = route.params?.appendToMealJson;

  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"idle" | "looking" | "error" | "not_found" | "found">("idle");
  const [error, setError] = useState<string | null>(null);
  const [foundProduct, setFoundProduct] = useState<FoundProduct | null>(null);

  // Serving picker state
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [gramMode, setGramMode] = useState(true);
  const [customGrams, setCustomGrams] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("g");
  const [amountError, setAmountError] = useState(false);

  const processingRef = useRef(false);
  const lastScannedRef = useRef<string | null>(null);

  const reset = () => {
    processingRef.current = false;
    lastScannedRef.current = null;
    setStatus("idle");
    setError(null);
    setFoundProduct(null);
    setServingMultiplier(1);
    setGramMode(true);
    setCustomGrams("");
    setSelectedUnit("g");
    setAmountError(false);
  };

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const barcode = result.data;
    if (processingRef.current || lastScannedRef.current === barcode) return;

    processingRef.current = true;
    lastScannedRef.current = barcode;
    setStatus("looking");
    setError(null);

    try {
      const fsResult = await lookupFatSecretBarcode(barcode);
      if (fsResult?.serving) {
        const s = fsResult.serving;
        const name = fsResult.brand_name
          ? `${fsResult.food_name} (${fsResult.brand_name})`
          : fsResult.food_name;

        const metricGrams = s.metric_serving_unit?.toLowerCase() === "g" && s.metric_serving_amount
          ? parseFloat(s.metric_serving_amount)
          : undefined;

        const metricAmount = s.metric_serving_amount ? parseFloat(s.metric_serving_amount) : undefined;

        setFoundProduct({
          name,
          servingDescription: s.serving_description || "1 serving",
          baseCalories: Math.round(parseFloat(s.calories) || 0),
          baseProtein: parseFloat(s.protein) || 0,
          baseCarbs: parseFloat(s.carbohydrate) || 0,
          baseFat: parseFloat(s.fat) || 0,
          metricGrams,
          metricAmount,
          metricUnit: s.metric_serving_unit?.toLowerCase() || "g",
          source: "fatsecret",
        });
        setServingMultiplier(1);
        setGramMode(true);
        setCustomGrams(metricAmount ? String(metricAmount) : "100");
        setSelectedUnit(s.metric_serving_unit?.toLowerCase() === "g" ? "g" : (s.metric_serving_unit?.toLowerCase() || "g"));
        setAmountError(false);
        setStatus("found");
        return;
      }

      const offResult = await lookupOpenFoodFacts(barcode);
      if (offResult) {
        const name = offResult.brand_name
          ? `${offResult.food_name} (${offResult.brand_name})`
          : offResult.food_name;

        setFoundProduct({
          name,
          servingDescription: offResult.serving_size || "1 serving",
          baseCalories: offResult.calories,
          baseProtein: offResult.protein,
          baseCarbs: offResult.carbs,
          baseFat: offResult.fat,
          metricGrams: offResult.base_amount_g,
          metricAmount: offResult.base_amount_g,
          metricUnit: "g",
          source: "openfoodfacts",
        });
        setServingMultiplier(1);
        setGramMode(true);
        setCustomGrams(String(offResult.base_amount_g));
        setSelectedUnit("g");
        setStatus("found");
        return;
      }

      setStatus("not_found");
      processingRef.current = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setStatus("error");
      processingRef.current = false;
    }
  }, []);

  const computedMacros = useMemo(() => {
    if (!foundProduct) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

    let multiplier = servingMultiplier;

    if (gramMode) {
      // Fall back to 100 so custom-amount mode always scales even when no metric data
      const baseAmount = (foundProduct.metricAmount ?? foundProduct.metricGrams) || 100;
      const baseUnit = foundProduct.metricUnit || "g";
      const amount = parseFloat(customGrams) || 0;
      if (amount > 0 && baseAmount > 0) {
        // Convert both to grams (or ml, treated equivalently) then divide
        const amountInBase = (amount * (UNIT_TO_GRAMS[selectedUnit] ?? 1)) /
                             (UNIT_TO_GRAMS[baseUnit] ?? 1);
        multiplier = amountInBase / baseAmount;
      } else {
        multiplier = 0;
      }
    }

    return {
      calories: Math.round(foundProduct.baseCalories * multiplier),
      protein: Math.round(foundProduct.baseProtein * multiplier * 10) / 10,
      carbs: Math.round(foundProduct.baseCarbs * multiplier * 10) / 10,
      fat: Math.round(foundProduct.baseFat * multiplier * 10) / 10,
    };
  }, [foundProduct, servingMultiplier, gramMode, customGrams, selectedUnit]);

  // When opened from MealConfirmation to add another item, navigate back
  // (restoring the original meal) instead of goBack().
  const handleBack = useCallback(() => {
    if (appendToMealJson) {
      navigation.replace("MealConfirmation", { initialDataJson: appendToMealJson });
    } else {
      navigation.goBack();
    }
  }, [appendToMealJson, navigation]);

  const addMeal = useDietStore((s) => s.addMeal);

  const canSubmit = !gramMode || (parseFloat(customGrams) || 0) > 0;

  const handleLogFood = useCallback(() => {
    if (!foundProduct) return;
    const macros = computedMacros;

    if (gramMode && (parseFloat(customGrams) || 0) <= 0) {
      Keyboard.dismiss();
      setAmountError(true);
      return;
    }
    setAmountError(false);

    let servingLabel: string;
    if (gramMode && (foundProduct.metricAmount ?? foundProduct.metricGrams)) {
      const amount = parseFloat(customGrams) || foundProduct.metricGrams;
      servingLabel = `${amount}${selectedUnit}`;
    } else {
      servingLabel = servingMultiplier === 1
        ? foundProduct.servingDescription
        : `${servingMultiplier} x ${foundProduct.servingDescription}`;
    }

    const mealData = {
      description: foundProduct.name,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      ingredients: [servingLabel],
      ingredientNutrition: [{
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        confidence: foundProduct.source === "fatsecret" ? "high" as const : "medium" as const,
        source: foundProduct.source,
      }],
    };

    if (appendToMealJson) {
      try {
        const existing = JSON.parse(appendToMealJson);
        const merged = {
          ...existing,
          calories: (existing.calories ?? 0) + macros.calories,
          protein: Math.round(((existing.protein ?? 0) + macros.protein) * 10) / 10,
          carbs: Math.round(((existing.carbs ?? 0) + macros.carbs) * 10) / 10,
          fat: Math.round(((existing.fat ?? 0) + macros.fat) * 10) / 10,
          ingredients: [...(existing.ingredients ?? []), ...mealData.ingredients],
          ingredientNutrition: [...(existing.ingredientNutrition ?? []), ...mealData.ingredientNutrition],
        };
        navigation.replace("MealConfirmation", { initialDataJson: JSON.stringify(merged) });
      } catch {
        navigation.replace("MealConfirmation", { initialDataJson: JSON.stringify(mealData) });
      }
      return;
    }

    // Log directly without confirmation screen
    addMeal(
      {
        description: mealData.description,
        calories: mealData.calories,
        protein: mealData.protein,
        carbs: mealData.carbs,
        fat: mealData.fat,
      },
      Date.now()
    );

    // Fire-and-forget analytics
    getDeviceId().then((userId) =>
      logMeal(
        userId,
        mealData.description,
        mealData.ingredientNutrition.map((n, i) => ({
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
          source: n.source ?? "fatsecret",
        }))
      ).catch(() => {})
    ).catch(() => {});

    navigation.navigate("MainTabs");
  }, [foundProduct, servingMultiplier, gramMode, customGrams, selectedUnit, computedMacros, navigation, addMeal, appendToMealJson]);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandTeal} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="barcode-outline" size={64} color="#6b7280" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permBody}>We need camera access to scan barcodes.</Text>
        <Pressable onPress={requestPermission} style={styles.permBtn}>
          <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </Pressable>
        <Pressable onPress={handleBack} style={styles.permBack}>
          <Text style={styles.permBackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const macros = computedMacros;
  const hasMetricOption = !!(foundProduct?.metricAmount ?? foundProduct?.metricGrams);

  return (
    <View style={styles.root}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
        onBarcodeScanned={status === "idle" ? handleBarcodeScanned : undefined}
      >
        <View style={StyleSheet.absoluteFill}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={handleBack} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Scan Barcode</Text>
            <View style={styles.closeBtn} />
          </View>

          {/* Viewfinder — only show when scanning */}
          {status !== "found" && (
            <View style={styles.viewfinderContainer}>
              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.hint}>
                {status === "idle" ? "Point camera at a barcode" : status === "looking" ? "Looking up product..." : ""}
              </Text>
            </View>
          )}

          {status === "looking" && (
            <View style={styles.statusCard}>
              <ActivityIndicator size="small" color={colors.brandTeal} />
              <Text style={styles.statusText}>Looking up product...</Text>
            </View>
          )}

          {(status === "not_found" || status === "error") && (
            <View style={styles.errorOverlay}>
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={32} color="#f87171" style={{ marginBottom: 8 }} />
                <Text style={styles.errorTitle}>
                  {status === "not_found" ? "Product Not Found" : "Lookup Failed"}
                </Text>
                <Text style={styles.errorBody}>
                  {status === "not_found"
                    ? "This barcode was not found in our database."
                    : (error || "Could not look up this product.")}
                </Text>
                <Pressable style={styles.retryBtn} onPress={reset}>
                  <LinearGradient colors={["#5b67cd", "#1e206a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={styles.retryText}>Try Another Barcode</Text>
                </Pressable>
                <Pressable style={styles.backBtn} onPress={handleBack}>
                  <Text style={styles.backBtnText}>Go Back</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Serving Size Picker Sheet */}
          {status === "found" && foundProduct && (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={StyleSheet.absoluteFill}
              keyboardVerticalOffset={0}
              pointerEvents="box-none"
            >
              <View style={styles.sheetOverlay} pointerEvents="box-none">
                <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                  {/* Handle */}
                  <View style={styles.sheetHandle} />

                  {/* Product name */}
                  <Text style={styles.productName} numberOfLines={2}>{foundProduct.name}</Text>

                  {/* Serving description pill */}
                  <View style={styles.servingPill}>
                    <Ionicons name="restaurant-outline" size={13} color={colors.brandTeal} />
                    <Text style={styles.servingPillText}>
                      {foundProduct.servingDescription} = {foundProduct.baseCalories} cal
                    </Text>
                  </View>

                  {/* Mode toggle — always shown */}
                  <View style={styles.modeToggle}>
                    <Pressable
                      onPress={() => setGramMode(false)}
                      style={[styles.modeTab, !gramMode && styles.modeTabActive]}
                    >
                      <Text style={[styles.modeTabText, !gramMode && styles.modeTabTextActive]}>
                        Servings
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setGramMode(true)}
                      style={[styles.modeTab, gramMode && styles.modeTabActive]}
                    >
                      <Text style={[styles.modeTabText, gramMode && styles.modeTabTextActive]}>
                        Custom Amount
                      </Text>
                    </Pressable>
                  </View>

                  {/* Servings mode */}
                  {!gramMode && (
                    <View style={styles.servingSection}>
                      {/* Stepper */}
                      <View style={styles.stepper}>
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => setServingMultiplier(m => Math.max(0.5, parseFloat((m - 0.5).toFixed(1))))}
                        >
                          <Ionicons name="remove" size={22} color="#fff" />
                        </Pressable>
                        <View style={styles.stepperValue}>
                          <Text style={styles.stepperNumber}>{servingMultiplier}</Text>
                          <Text style={styles.stepperLabel}>
                            {servingMultiplier === 1 ? "serving" : "servings"}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => setServingMultiplier(m => parseFloat((m + 0.5).toFixed(1)))}
                        >
                          <Ionicons name="add" size={22} color="#fff" />
                        </Pressable>
                      </View>

                      {/* Quick chips */}
                      <View style={styles.quickChips}>
                        {[0.5, 1, 1.5, 2, 3].map(v => (
                          <Pressable
                            key={v}
                            onPress={() => setServingMultiplier(v)}
                            style={[styles.chip, servingMultiplier === v && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, servingMultiplier === v && styles.chipTextActive]}>
                              {v === 0.5 ? "1/2" : v === 1 ? "1" : v === 1.5 ? "1\u00bdx" : `${String(v)}x`}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Custom amount mode */}
                  {gramMode && (
                    <View style={styles.gramSection}>
                      {!hasMetricOption && (
                        <Text style={styles.gramNoDataNote}>
                          Gram data not available — results are approximate
                        </Text>
                      )}
                      <View style={styles.gramRow}>
                        <TextInput
                          style={[styles.gramInput, amountError && styles.gramInputError]}
                          value={customGrams}
                          onChangeText={(text) => {
                            setCustomGrams(text);
                            if (amountError) setAmountError(false);
                          }}
                          keyboardType="decimal-pad"
                          placeholder={foundProduct.metricAmount ? String(foundProduct.metricAmount) : "0"}
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          selectTextOnFocus
                          returnKeyType="done"
                        />
                        <View style={styles.gramUnit}>
                          <Text style={styles.gramUnitText}>{selectedUnit}</Text>
                        </View>
                      </View>
                      {amountError && (
                        <Text style={styles.amountErrorText}>
                          Enter an amount greater than 0 to add this to your log
                        </Text>
                      )}
                      {/* Unit selector */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                        <View style={styles.gramChips}>
                          {UNIT_OPTIONS.map(unit => {
                            const isActive = selectedUnit === unit;
                            return (
                              <Pressable
                                key={unit}
                                onPress={() => setSelectedUnit(unit)}
                                style={[styles.chip, isActive && styles.chipActive]}
                              >
                                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                                  {unit}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                      {/* Quick amount shortcuts */}
                      {hasMetricOption && selectedUnit === "g" && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          <View style={styles.gramChips}>
                            {[25, 50, 75, 100, 150, 200].map(g => (
                              <Pressable
                                key={g}
                                onPress={() => setCustomGrams(String(g))}
                                style={[
                                  styles.chip,
                                  parseFloat(customGrams) === g && styles.chipActive,
                                ]}
                              >
                                <Text style={[
                                  styles.chipText,
                                  parseFloat(customGrams) === g && styles.chipTextActive,
                                ]}>
                                  {g}g
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* Macro summary */}
                  <View style={styles.macroRow}>
                    <View style={styles.macroMain}>
                      <Text style={styles.macroCalories}>{macros.calories}</Text>
                      <Text style={styles.macroCalLabel}>cal</Text>
                    </View>
                    <View style={styles.macroDivider} />
                    <View style={styles.macroItem}>
                      <Text style={styles.macroVal}>{macros.protein}g</Text>
                      <Text style={styles.macroKey}>Protein</Text>
                    </View>
                    <View style={styles.macroItem}>
                      <Text style={styles.macroVal}>{macros.carbs}g</Text>
                      <Text style={styles.macroKey}>Carbs</Text>
                    </View>
                    <View style={styles.macroItem}>
                      <Text style={styles.macroVal}>{macros.fat}g</Text>
                      <Text style={styles.macroKey}>Fat</Text>
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View style={styles.actionRow}>
                    <Pressable onPress={reset} style={styles.rescanBtn}>
                      <Ionicons name="scan-outline" size={18} color={colors.brandTeal} />
                      <Text style={styles.rescanText}>Rescan</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleLogFood}
                      style={[styles.logBtn, !canSubmit && styles.logBtnDisabled]}
                    >
                      <Text style={styles.logBtnText}>{appendToMealJson ? "Add to Meal" : "Add to Log"}</Text>
                      <Ionicons name="arrow-forward" size={18} color="#111111" />
                    </Pressable>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const CORNER_COLOR = "#ffffff";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#121212", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  viewfinderContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20 },
  viewfinder: { width: 260, height: 180, position: "relative" },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderColor: CORNER_COLOR },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderBottomRightRadius: 6 },
  hint: { color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: radii.md, paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 32, marginBottom: 48, alignSelf: "center" },
  statusText: { color: "#fff", fontSize: 14 },
  errorCard: { flexDirection: "column", alignItems: "center", backgroundColor: "rgba(239,68,68,0.15)", borderRadius: radii.lg, paddingHorizontal: 28, paddingVertical: 28, marginHorizontal: 32, alignSelf: "stretch", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  errorOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  errorBody: { color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: radii.pill, overflow: "hidden" },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  backBtn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 24 },
  backBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 15 },
  permTitle: { color: "#fff", fontSize: 20, fontWeight: "600", marginTop: 16, textAlign: "center" },
  permBody: { color: "#9ca3af", textAlign: "center", marginTop: 8, marginBottom: 24, lineHeight: 20 },
  permBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: radii.pill, overflow: "hidden" },
  permBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  permBack: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 24 },
  permBackText: { color: "#9ca3af", fontSize: 15 },

  // Serving picker sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 16,
  },
  productName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 24,
  },
  servingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(45,212,191,0.12)",
    borderRadius: radii.pill,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.25)",
  },
  servingPillText: {
    color: colors.brandTeal,
    fontSize: 12,
    fontWeight: "500",
  },

  // Mode toggle
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: radii.md,
    padding: 3,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  modeTabActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  modeTabText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "500",
  },
  modeTabTextActive: {
    color: "#fff",
  },

  // Stepper
  servingSection: { marginBottom: 16 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    marginBottom: 12,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    alignItems: "center",
    minWidth: 100,
  },
  stepperNumber: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 36,
  },
  stepperLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Quick chips
  quickChips: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipActive: {
    backgroundColor: "rgba(45,212,191,0.18)",
    borderColor: colors.brandTeal,
  },
  chipText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: colors.brandTeal,
    fontWeight: "600",
  },
  chipDisabled: {
    opacity: 0.3,
  },
  chipTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },

  // Gram mode
  gramSection: { marginBottom: 16 },
  gramNoDataNote: {
    color: "rgba(255,200,100,0.8)",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
    textAlign: "center" as const,
  },
  gramLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  gramRow: {
    flexDirection: "row",
    gap: 10,
  },
  gramInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    paddingHorizontal: 18,
    paddingVertical: 12,
    textAlign: "center",
  },
  gramInputError: {
    borderColor: "#ff6b6b",
  },
  amountErrorText: {
    color: "#ff6b6b",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center" as const,
  },
  gramUnit: {
    width: 56,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  gramUnitText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontWeight: "600",
  },
  gramChips: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },

  // Macro row
  macroRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  macroMain: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginRight: 16,
  },
  macroCalories: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 32,
  },
  macroCalLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "500",
  },
  macroDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginRight: 16,
  },
  macroItem: {
    flex: 1,
    alignItems: "center",
  },
  macroVal: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  macroKey: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: "rgba(45,212,191,0.1)",
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.3)",
  },
  rescanText: {
    color: colors.brandTeal,
    fontSize: 14,
    fontWeight: "600",
  },
  logBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    borderRadius: radii.pill,
  },
  logBtnDisabled: {
    opacity: 0.4,
  },
  logBtnText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "700",
  },
});
