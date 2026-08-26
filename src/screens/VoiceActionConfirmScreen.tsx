import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import useDietStore from "../state/dietStore";
import { colors, spacing, radii } from "../theme";
import { RootStackParamList } from "../navigation/RootNavigator";

type ScreenRouteProp = RouteProp<RootStackParamList, "VoiceActionConfirm">;
type ScreenNavProp = NativeStackNavigationProp<RootStackParamList, "VoiceActionConfirm">;

export type VoiceAction =
  | { intent: "remove_food"; id: string; description: string; calories: number; protein: number; carbs: number; fat: number }
  | { intent: "remove_exercise"; id: string; type: string; durationMinutes: number; intensity: string; description: string }
  | { intent: "remove_pledge"; id: string; name: string; icon: string; color: string }
  | { intent: "not_found"; message: string };

const WORKOUT_ICONS: Record<string, string> = {
  cardio: "walk",
  strength: "barbell",
  hiit: "flame",
  yoga: "leaf",
  mixed: "fitness",
};

const INTENSITY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
};

export default function VoiceActionConfirmScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<ScreenNavProp>();
  const route = useRoute<ScreenRouteProp>();
  const deleteMeal = useDietStore((s) => s.deleteMeal);
  const deleteWorkout = useDietStore((s) => s.deleteWorkout);
  const deleteTracker = useDietStore((s) => s.deleteTracker);

  const action: VoiceAction = JSON.parse(route.params.actionJson);

  const handleConfirm = () => {
    if (action.intent === "remove_food") {
      deleteMeal(action.id);
    } else if (action.intent === "remove_exercise") {
      deleteWorkout(action.id);
    } else if (action.intent === "remove_pledge") {
      deleteTracker(action.id);
    }
    navigation.navigate("MainTabs");
  };

  if (action.intent === "not_found") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Not Found</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.notFoundContainer}>
          <View style={styles.notFoundIcon}>
            <Ionicons name="search-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.notFoundTitle}>{"Couldn't Find It"}</Text>
          <Text style={styles.notFoundMessage}>{action.message}</Text>
          <Pressable style={styles.okBtn} onPress={() => navigation.navigate("MainTabs")}>
            <Text style={styles.okBtnText}>OK</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderItemCard = () => {
    if (action.intent === "remove_food") {
      return (
        <View style={styles.itemCard}>
          <View style={[styles.itemIconCircle, { backgroundColor: "#FFF3E0" }]}>
            <Ionicons name="restaurant" size={32} color="#F97316" />
          </View>
          <Text style={styles.itemTitle}>{action.description}</Text>
          <View style={styles.macroRow}>
            <View style={[styles.macroBadge, { backgroundColor: "#FFF3E0" }]}>
              <Text style={[styles.macroText, { color: "#F97316" }]}>{action.calories} cal</Text>
            </View>
            <View style={[styles.macroBadge, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.macroText, { color: "#3B82F6" }]}>P {action.protein}g</Text>
            </View>
            <View style={[styles.macroBadge, { backgroundColor: "#F5F3FF" }]}>
              <Text style={[styles.macroText, { color: "#8B5CF6" }]}>C {action.carbs}g</Text>
            </View>
            <View style={[styles.macroBadge, { backgroundColor: "#FDF2F8" }]}>
              <Text style={[styles.macroText, { color: "#EC4899" }]}>F {action.fat}g</Text>
            </View>
          </View>
        </View>
      );
    }

    if (action.intent === "remove_exercise") {
      const iconName = WORKOUT_ICONS[action.type] ?? "fitness";
      const intensityColor = INTENSITY_COLORS[action.intensity] ?? "#f59e0b";
      return (
        <View style={styles.itemCard}>
          <View style={[styles.itemIconCircle, { backgroundColor: intensityColor + "22" }]}>
            <Ionicons name={iconName as any} size={32} color={intensityColor} />
          </View>
          <Text style={styles.itemTitle}>{action.description || `${action.durationMinutes} min ${action.type}`}</Text>
          <View style={styles.macroRow}>
            <View style={[styles.macroBadge, { backgroundColor: "#F0FDF4" }]}>
              <Text style={[styles.macroText, { color: "#16A34A" }]}>{action.durationMinutes} min</Text>
            </View>
            <View style={[styles.macroBadge, { backgroundColor: intensityColor + "22" }]}>
              <Text style={[styles.macroText, { color: intensityColor }]}>{action.intensity} intensity</Text>
            </View>
          </View>
        </View>
      );
    }

    if (action.intent === "remove_pledge") {
      const isEmoji = /\p{Emoji}/u.test(action.icon) && action.icon.length <= 4;
      return (
        <View style={styles.itemCard}>
          <View style={[styles.itemIconCircle, { backgroundColor: action.color + "22" }]}>
            {isEmoji ? (
              <Text style={{ fontSize: 32 }}>{action.icon}</Text>
            ) : (
              <Ionicons name={action.icon as any} size={32} color={action.color} />
            )}
          </View>
          <Text style={styles.itemTitle}>{action.name}</Text>
          <View style={styles.macroRow}>
            <View style={[styles.macroBadge, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.macroText, { color: "#EF4444" }]}>Pledge</Text>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  const removeLabel = action.intent === "remove_food"
    ? "Remove Meal"
    : action.intent === "remove_exercise"
    ? "Remove Workout"
    : "Remove Pledge";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Confirm Removal</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.questionText}>Is this what you want to remove?</Text>
        {renderItemCard()}

        <Pressable style={styles.removeBtn} onPress={handleConfirm}>
          <Ionicons name="trash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.removeBtnText}>{removeLabel}</Text>
        </Pressable>

        <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  questionText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  itemCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  itemIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  itemTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  macroRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, justifyContent: "center" },
  macroBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  macroText: { fontSize: 12, fontWeight: "600" },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  removeBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  cancelBtnText: { fontSize: 16, color: colors.textMuted, fontWeight: "500" },
  notFoundContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  notFoundIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  notFoundTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  notFoundMessage: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  okBtn: {
    backgroundColor: colors.brandTeal,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  okBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
