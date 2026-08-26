import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import useDietStore from "../state/dietStore";
import { TrackerConfig, TrackerType, GoalDirection } from "../types/diet";
import { colors, spacing, radii, shadows } from "../theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICON_CATEGORIES: { label: string; icons: IoniconName[] }[] = [
  {
    label: "Health",
    icons: [
      "heart-outline", "pulse-outline", "fitness-outline", "body-outline",
      "medical-outline", "bandage-outline", "thermometer-outline", "eye-outline",
      "hand-left-outline", "accessibility-outline", "heart-circle-outline",
      "medkit-outline", "shield-checkmark-outline", "cellular-outline",
      "scale-outline", "battery-full-outline", "eyedrop-outline", "ear-outline",
      "hand-right-outline", "walk-outline",
    ],
  },
  {
    label: "Food & Drink",
    icons: [
      "water-outline", "cafe-outline", "restaurant-outline", "nutrition-outline",
      "beer-outline", "wine-outline", "fish-outline", "leaf-outline",
      "flask-outline", "ice-cream-outline", "fast-food-outline", "pizza-outline",
      "egg-outline", "apps-outline", "basket-outline", "bag-outline",
      "cart-outline", "storefront-outline", "color-filter-outline", "layers-outline",
    ],
  },
  {
    label: "Activity",
    icons: [
      "bicycle-outline", "barbell-outline", "flame-outline",
      "football-outline", "basketball-outline", "tennisball-outline",
      "golf-outline", "boat-outline", "stopwatch-outline", "trophy-outline",
      "medal-outline", "ribbon-outline", "flag-outline", "timer-outline",
      "speedometer-outline", "compass-outline", "map-outline", "navigate-outline",
      "radio-outline", "shuffle-outline",
    ],
  },
  {
    label: "Mind",
    icons: [
      "book-outline", "headset-outline", "musical-notes-outline", "mic-outline",
      "pencil-outline", "bulb-outline", "school-outline", "glasses-outline",
      "telescope-outline", "color-palette-outline", "brush-outline",
      "reader-outline", "journal-outline", "newspaper-outline", "library-outline",
      "musical-note-outline", "radio-button-on-outline", "chatbubble-outline",
      "language-outline", "construct-outline",
    ],
  },
  {
    label: "Sleep & Rest",
    icons: [
      "moon-outline", "bed-outline", "cloudy-night-outline", "time-outline",
      "alarm-outline", "hourglass-outline", "battery-charging-outline",
      "shield-outline", "umbrella-outline", "partly-sunny-outline",
      "cloudy-outline", "rainy-outline", "snow-outline", "thunderstorm-outline",
      "sunny-outline", "star-outline", "planet-outline", "telescope-outline",
      "infinite-outline", "pause-circle-outline",
    ],
  },
  {
    label: "Productivity",
    icons: [
      "checkmark-circle-outline", "calendar-outline", "timer-outline",
      "list-outline", "clipboard-outline", "briefcase-outline",
      "mail-outline", "phone-portrait-outline", "laptop-outline", "document-outline",
      "create-outline", "archive-outline", "folder-outline", "save-outline",
      "push-outline", "git-commit-outline", "layers-outline", "apps-outline",
      "grid-outline", "options-outline",
    ],
  },
  {
    label: "Lifestyle",
    icons: [
      "home-outline", "people-outline", "person-outline", "happy-outline",
      "flower-outline", "paw-outline", "earth-outline",
      "camera-outline", "car-outline", "airplane-outline",
      "bus-outline", "train-outline", "bicycle-outline", "boat-outline",
      "gift-outline", "balloon-outline", "sparkles-outline", "rose-outline",
      "heart-dislike-outline", "thumbs-up-outline",
    ],
  },
  {
    label: "Finance",
    icons: [
      "cash-outline", "card-outline", "wallet-outline", "trending-up-outline",
      "trending-down-outline", "bar-chart-outline", "pie-chart-outline",
      "calculator-outline", "receipt-outline", "pricetag-outline",
      "pricetags-outline", "stats-chart-outline", "analytics-outline",
      "business-outline", "diamond-outline", "cube-outline",
      "swap-horizontal-outline", "repeat-outline", "refresh-outline", "sync-outline",
    ],
  },
];

const ALL_ICONS: IoniconName[] = ICON_CATEGORIES.flatMap((c) => c.icons);
const DEFAULT_ICON: IoniconName = "checkmark-circle-outline";
const ACCENT = colors.brandOrange;

const PLEDGE_COLOR_PALETTE = [
  "#BE185D", // pink    — slot 0: first custom (e.g. Sweets)
  "#A855F7", // purple  — slot 1
  "#EAB308", // yellow  — slot 2
  "#14B8A6", // teal    — slot 3
  "#EF4444", // red     — slot 4
  "#84CC16", // lime    — slot 5
  "#F97316", // amber   — slot 6
  "#6366F1", // indigo  — slot 7
  "#0EA5E9", // sky     — slot 8
  "#D946EF", // fuchsia — slot 9
];

export default function PledgesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const trackers = useDietStore((s) => s.trackers);
  const addTracker = useDietStore((s) => s.addTracker);
  const updateTracker = useDietStore((s) => s.updateTracker);
  const deleteTracker = useDietStore((s) => s.deleteTracker);

  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingTracker, setEditingTracker] = useState<TrackerConfig | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ICON_CATEGORIES[0].label);

  const [trackerName, setTrackerName] = useState("");
  const [trackerType, setTrackerType] = useState<TrackerType>("counter");
  const [trackerIcon, setTrackerIcon] = useState<IoniconName>(DEFAULT_ICON);
  const [trackerGoal, setTrackerGoal] = useState("");
  const [trackerGoalDirection, setTrackerGoalDirection] = useState<GoalDirection>("max");
  const [trackerShowOnHome, setTrackerShowOnHome] = useState(true);
  const [trackerUnit, setTrackerUnit] = useState("glasses");

  const UNITS = ["glasses", "oz", "ml", "L", "cups"];

  const resetForm = () => {
    setTrackerName("");
    setTrackerType("counter");
    setTrackerIcon(DEFAULT_ICON);
    setTrackerGoal("");
    setTrackerGoalDirection("max");
    setTrackerShowOnHome(true);
    setTrackerUnit("glasses");
    setEditingTracker(null);
    setShowIconPicker(false);
  };

  const openEdit = (tracker: TrackerConfig) => {
    setEditingTracker(tracker);
    setTrackerName(tracker.name);
    setTrackerType(tracker.type);
    setTrackerIcon((tracker.icon as IoniconName) || DEFAULT_ICON);
    setTrackerGoal(tracker.goal?.toString() || "");
    setTrackerGoalDirection(tracker.goalDirection || "max");
    setTrackerShowOnHome(tracker.showOnHome);
    setTrackerUnit(tracker.unit || "glasses");
    setShowIconPicker(false);
    setShowTrackerModal(true);
  };

  const handleSave = () => {
    if (!trackerName.trim()) return;
    const parsedGoal = parseInt(trackerGoal);
    const goal = trackerType === "counter" && !isNaN(parsedGoal) ? parsedGoal : undefined;
    const goalDirection = trackerType === "counter" && goal != null ? trackerGoalDirection : undefined;
    const unit = trackerType === "counter" ? trackerUnit || undefined : undefined;
    // Pick a unique color from palette based on existing tracker count
    const color = editingTracker
      ? editingTracker.color
      : PLEDGE_COLOR_PALETTE[trackers.length % PLEDGE_COLOR_PALETTE.length];
    const config = {
      name: trackerName.trim(),
      type: trackerType,
      icon: trackerIcon,
      color,
      goal,
      goalDirection,
      unit,
      showOnHome: trackerShowOnHome,
    };
    if (editingTracker) {
      updateTracker(editingTracker.id, config);
    } else {
      addTracker(config);
    }
    setShowTrackerModal(false);
    resetForm();
  };

  const categoryIcons = ICON_CATEGORIES.find((c) => c.label === selectedCategory)?.icons ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Daily Pledges</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => { resetForm(); setShowTrackerModal(true); }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Pledges are daily habits shown on your home screen.</Text>

        {trackers.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="checkbox-outline" size={36} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No pledges yet</Text>
            <Text style={styles.emptySub}>Tap + to add your first daily habit</Text>
            <Pressable
              style={styles.emptyAddBtn}
              onPress={() => { resetForm(); setShowTrackerModal(true); }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.emptyAddText}>Add Pledge</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {trackers.map((tracker, idx) => (
              <View
                key={tracker.id}
                style={[styles.trackerRow, idx < trackers.length - 1 && styles.trackerRowBorder]}
              >
                <View style={styles.trackerIconCircle}>
                  <Ionicons
                    name={(tracker.icon as IoniconName) || DEFAULT_ICON}
                    size={22}
                    color={ACCENT}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackerName}>{tracker.name}</Text>
                  <Text style={styles.trackerMeta}>
                    {tracker.type === "counter" && tracker.goal != null
                      ? `${tracker.goalDirection === "min" ? "No more than" : "More than"} ${tracker.goal}${tracker.unit ? ` ${tracker.unit}` : ""}`
                      : tracker.type === "counter" ? "Counter" : "Yes / No"}
                    {tracker.showOnHome ? " · On Home" : ""}
                    {tracker.isBuiltIn ? " · Standard" : ""}
                  </Text>
                </View>
                <Pressable onPress={() => openEdit(tracker)} style={styles.action}>
                  <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                </Pressable>
                {tracker.isBuiltIn ? (
                  <View style={[styles.action, { opacity: 0.35 }]}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                  </View>
                ) : (
                  <Pressable onPress={() => deleteTracker(tracker.id)} style={styles.action}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal visible={showTrackerModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalTitle}>{editingTracker ? "Edit Pledge" : "New Pledge"}</Text>

                  {/* Name */}
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: spacing.lg }]}
                    placeholder="e.g., Drink water"
                    placeholderTextColor={colors.textMuted}
                    value={trackerName}
                    onChangeText={setTrackerName}
                  />

                  {/* Icon */}
                  <Text style={styles.inputLabel}>Icon</Text>
                  <Pressable
                    style={styles.iconPickerBtn}
                    onPress={() => setShowIconPicker((v) => !v)}
                  >
                    <View style={styles.iconPreview}>
                      <Ionicons name={trackerIcon} size={24} color={ACCENT} />
                    </View>
                    <Text style={styles.iconPickerLabel}>
                      {showIconPicker ? "Close picker" : "Choose icon"}
                    </Text>
                    <Ionicons
                      name={showIconPicker ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>

                  {showIconPicker && (
                    <View style={styles.iconPickerPanel}>
                      {/* Category tabs */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryTabsRow}
                      >
                        {ICON_CATEGORIES.map((cat) => (
                          <Pressable
                            key={cat.label}
                            style={[
                              styles.categoryTab,
                              selectedCategory === cat.label && styles.categoryTabActive,
                            ]}
                            onPress={() => setSelectedCategory(cat.label)}
                          >
                            <Text
                              style={[
                                styles.categoryTabText,
                                selectedCategory === cat.label && styles.categoryTabTextActive,
                              ]}
                            >
                              {cat.label}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>

                      {/* Icon grid */}
                      <View style={styles.iconGrid}>
                        {categoryIcons.map((icon) => (
                          <Pressable
                            key={icon}
                            style={[
                              styles.iconCell,
                              trackerIcon === icon && styles.iconCellActive,
                            ]}
                            onPress={() => {
                              setTrackerIcon(icon);
                              setShowIconPicker(false);
                            }}
                          >
                            <Ionicons
                              name={icon}
                              size={26}
                              color={trackerIcon === icon ? ACCENT : colors.textMuted}
                            />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Type */}
                  <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Type</Text>
                  <View style={styles.segmentRow}>
                    {(["counter", "boolean"] as TrackerType[]).map((t) => (
                      <Pressable
                        key={t}
                        style={[styles.segment, trackerType === t && styles.segmentActive]}
                        onPress={() => setTrackerType(t)}
                      >
                        <Text style={[styles.segmentText, trackerType === t && styles.segmentTextActive]}>
                          {t === "counter" ? "Counter" : "Yes / No"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {trackerType === "counter" && (
                    <>
                      <Text style={styles.inputLabel}>Direction</Text>
                      <View style={styles.segmentRow}>
                        {(["max", "min"] as GoalDirection[]).map((d) => (
                          <Pressable
                            key={d}
                            style={[styles.segment, trackerGoalDirection === d && styles.segmentActive]}
                            onPress={() => setTrackerGoalDirection(d)}
                          >
                            <Text style={[styles.segmentText, trackerGoalDirection === d && styles.segmentTextActive]}>
                              {d === "max" ? "More than" : "No more than"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.inputLabel}>Daily Goal (optional)</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: spacing.xs }]}
                        placeholder="e.g., 8"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        value={trackerGoal}
                        onChangeText={setTrackerGoal}
                      />
                      {editingTracker?.id === "builtin-water" && (
                        <Text style={styles.goalHint}>
                          {"Calculated from your weight, gender, and daily activity level. Updates dynamically each day based on your workouts."}
                        </Text>
                      )}

                      <Text style={styles.inputLabel}>Unit</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {UNITS.map((u) => (
                            <Pressable
                              key={u}
                              onPress={() => setTrackerUnit(u)}
                              style={[
                                styles.unitChip,
                                trackerUnit === u && styles.unitChipActive,
                              ]}
                            >
                              <Text style={[styles.unitChipText, trackerUnit === u && styles.unitChipTextActive]}>
                                {u}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    </>
                  )}

                  {/* Show on Home */}
                  <Pressable style={styles.homeToggleRow} onPress={() => setTrackerShowOnHome(!trackerShowOnHome)}>
                    <Text style={styles.homeToggleLabel}>Show on Home Screen</Text>
                    <View style={[styles.toggle, trackerShowOnHome && styles.toggleOn]}>
                      <View style={[styles.toggleThumb, trackerShowOnHome && styles.toggleThumbOn]} />
                    </View>
                  </Pressable>

                  <View style={styles.modalBtnRow}>
                    <Pressable style={styles.cancelBtn} onPress={() => { setShowTrackerModal(false); resetForm(); }}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.saveBtn} onPress={handleSave}>
                      <Text style={styles.saveText}>Save</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
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
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandOrange, alignItems: "center", justifyContent: "center",
  },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg },
  list: { backgroundColor: "#fff", borderRadius: radii.xl, overflow: "hidden", ...shadows.card },
  trackerRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm,
  },
  trackerRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  trackerIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(242,90,35,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  trackerName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  trackerMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  action: { padding: 6 },
  emptyState: { alignItems: "center", paddingVertical: spacing.xxl * 2 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    marginBottom: spacing.lg, ...shadows.card,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.xs },
  emptySub: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl },
  emptyAddBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.brandOrange, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: radii.pill,
  },
  emptyAddText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end", alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#fff", borderRadius: radii.xl,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    padding: spacing.lg, width: "100%", maxHeight: "90%",
    paddingBottom: spacing.xxl,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.lg },
  inputLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textMuted,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 16, color: colors.textPrimary,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  iconPickerBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgMain, borderRadius: radii.md,
    padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
  },
  iconPreview: {
    width: 44, height: 44, borderRadius: radii.sm,
    backgroundColor: "rgba(242,90,35,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  iconPickerLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  iconPickerPanel: {
    backgroundColor: colors.bgMain, borderRadius: radii.lg,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    marginBottom: spacing.md, overflow: "hidden",
  },
  categoryTabsRow: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.xs },
  categoryTab: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radii.pill, backgroundColor: "transparent",
  },
  categoryTabActive: { backgroundColor: ACCENT },
  categoryTabText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  categoryTabTextActive: { color: "#fff" },
  iconGrid: {
    flexDirection: "row", flexWrap: "wrap",
    padding: spacing.sm, gap: 4,
  },
  iconCell: {
    width: 52, height: 52, borderRadius: radii.md,
    alignItems: "center", justifyContent: "center",
  },
  iconCellActive: { backgroundColor: "rgba(242,90,35,0.12)" },
  segmentRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  segment: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md,
    backgroundColor: colors.bgMain, alignItems: "center",
    borderWidth: 1.5, borderColor: "transparent",
  },
  segmentActive: { borderColor: colors.brandOrange, backgroundColor: "rgba(242,90,35,0.08)" },
  segmentText: { fontWeight: "600", color: colors.textMuted },
  segmentTextActive: { color: colors.brandOrange },
  homeToggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  homeToggleLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  toggle: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: colors.bgMain, justifyContent: "center",
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  toggleOn: { backgroundColor: colors.brandOrange, borderColor: colors.brandOrange },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#ccc", marginLeft: 2 },
  toggleThumbOn: { backgroundColor: "#fff", marginLeft: 24 },
  modalBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill, backgroundColor: colors.bgMain, alignItems: "center",
  },
  cancelText: { fontWeight: "600", color: colors.textMuted },
  saveBtn: {
    flex: 1, paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill, backgroundColor: colors.brandOrange, alignItems: "center",
  },
  saveText: { fontWeight: "700", color: "#fff" },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSection,
  },
  unitChipActive: {
    backgroundColor: colors.brandOrange,
    borderColor: colors.brandOrange,
  },
  unitChipText: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
  unitChipTextActive: { color: "#fff", fontWeight: "600" },
  goalHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 17,
  },
});
