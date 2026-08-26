import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from "react-native-reanimated";
import useDietStore from "../state/dietStore";
import { FavoriteMeal } from "../types/diet";
import { RootStackParamList } from "../navigation/RootNavigator";
import { colors, spacing, radii } from "../theme";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function FavoriteMealsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const favoriteMeals = useDietStore((s) => s.favoriteMeals);
  const deleteFavoriteMeal = useDietStore((s) => s.deleteFavoriteMeal);
  const updateFavoriteMeal = useDietStore((s) => s.updateFavoriteMeal);

  const [editingFav, setEditingFav] = useState<FavoriteMeal | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openEdit = (fav: FavoriteMeal) => {
    setEditingFav(fav);
    setEditName(fav.name);
  };

  const confirmEdit = () => {
    if (!editingFav || !editName.trim()) return;
    updateFavoriteMeal(editingFav.id, { name: editName.trim() });
    setEditingFav(null);
    setEditName("");
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    deleteFavoriteMeal(deletingId);
    setDeletingId(null);
  };

  const logFavorite = (fav: FavoriteMeal) => {
    const mealData = {
      description: fav.name,
      ingredients: fav.ingredients,
      ingredientNutrition: fav.ingredientNutrition,
      calories: fav.calories,
      protein: fav.protein,
      carbs: fav.carbs,
      fat: fav.fat,
      micronutrients: fav.micronutrients,
    };
    navigation.navigate("MealConfirmation", { initialDataJson: JSON.stringify(mealData) });
  };

  const sorted = [...favoriteMeals].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved Meals</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sorted.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="bookmark-outline" size={40} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No saved meals yet</Text>
            <Text style={styles.emptySubtitle}>
              {"After logging a meal, tap \"Save as Favorite\" to store it here for quick re-logging."}
            </Text>
          </Animated.View>
        ) : (
          <Animated.View layout={LinearTransition.springify()}>
            {sorted.map((fav, idx) => (
              <Animated.View
                key={fav.id}
                entering={FadeInDown.duration(300).delay(idx * 40)}
                exiting={FadeOutUp.duration(200)}
                layout={LinearTransition.springify()}
              >
                <Pressable
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() => logFavorite(fav)}
                >
                  {/* Top row: name + action buttons */}
                  <View style={styles.cardTop}>
                    <View style={styles.cardNameRow}>
                      <Ionicons name="bookmark" size={14} color={colors.brandPrimary} style={{ marginRight: 6, marginTop: 1 }} />
                      <Text style={styles.cardName} numberOfLines={1}>{fav.name}</Text>
                    </View>
                    <View style={styles.cardActions}>
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => openEdit(fav)}
                        hitSlop={8}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                      </Pressable>
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => setDeletingId(fav.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </Pressable>
                    </View>
                  </View>

                  {/* Description */}
                  {fav.description !== fav.name && (
                    <Text style={styles.cardDesc} numberOfLines={1}>{fav.description}</Text>
                  )}

                  {/* Macro pills */}
                  <View style={styles.macroPills}>
                    <MacroPill label={`${fav.calories} cal`} accent={colors.brandPrimary} bg="#FFF3EE" />
                    <MacroPill label={`P ${fav.protein}g`} accent={colors.protein} bg="#EEF6FF" />
                    <MacroPill label={`C ${fav.carbs}g`} accent={colors.carbs} bg="#F5F0FF" />
                    <MacroPill label={`F ${fav.fat}g`} accent={colors.fat} bg="#FFF0F7" />
                  </View>

                  {/* Log hint */}
                  <View style={styles.logHint}>
                    <Ionicons name="add-circle-outline" size={13} color={colors.brandTeal} />
                    <Text style={styles.logHintText}>Tap to log</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>

      {/* Rename modal */}
      <Modal visible={!!editingFav} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setEditingFav(null); Keyboard.dismiss(); }} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Meal name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmEdit}
            />
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setEditingFav(null); Keyboard.dismiss(); }}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={confirmEdit}
              >
                <Text style={styles.modalBtnSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete confirm modal */}
      <Modal visible={!!deletingId} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setDeletingId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.deleteIconWrap}>
              <Ionicons name="trash-outline" size={28} color="#ef4444" />
            </View>
            <Text style={styles.modalTitle}>Remove favorite?</Text>
            <Text style={styles.deleteSubtitle}>This meal will be removed from your saved list.</Text>
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setDeletingId(null)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: "#ef4444", flex: 1 }]}
                onPress={confirmDelete}
              >
                <Text style={[styles.modalBtnSaveText]}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MacroPill({ label, accent, bg }: { label: string; accent: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgMain,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.bgSection,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bgSection,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  cardPressed: { opacity: 0.75 },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.2,
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.bgMain,
  },
  cardDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 20,
  },
  macroPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  logHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  logHintText: {
    fontSize: 11,
    color: colors.brandTeal,
    fontWeight: "500",
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  modalCard: {
    backgroundColor: colors.bgSection,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  modalInput: {
    backgroundColor: colors.bgMain,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalBtns: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
  },
  modalBtnSave: {
    backgroundColor: colors.brandOrange,
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.brandTeal,
  },
  modalBtnSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  deleteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  deleteSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },
});
