// ExercisePickerModal — search / browse / create-custom exercise picker.
// Extracted from LogWorkoutSessionScreen so the weekly plan editor picks
// exercises through exactly the same UI and matching rules.

import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../theme";
import {
  EXERCISE_GROUPS,
  EXERCISE_LIBRARY,
  ExerciseDef,
  ExerciseGroup,
  ExerciseMetric,
  METRIC_LABELS,
  customExerciseDef,
  findExerciseByName,
  searchExercises,
} from "../data/exerciseLibrary";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (def: ExerciseDef) => void;
  /** Exercise keys already in the list — shown as "Added" and not selectable again */
  addedKeys: string[];
  /** Recently logged exercise keys, surfaced before the user types anything */
  recentDefs?: ExerciseDef[];
  title?: string;
}

export function ExercisePickerModal({
  visible,
  onClose,
  onSelect,
  addedKeys,
  recentDefs = [],
  title = "Pick Exercise",
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<ExerciseGroup | null>(null);
  const [customMetric, setCustomMetric] = useState<ExerciseMetric | null>(null);

  const results = useMemo(() => {
    if (query.trim().length > 0) return searchExercises(query, 60);
    if (activeGroup) return EXERCISE_LIBRARY.filter((e) => e.group === activeGroup);
    return [];
  }, [query, activeGroup]);

  const exactMatch = query.trim().length > 0 ? findExerciseByName(query) : undefined;
  const canCreateCustom = query.trim().length >= 2 && !exactMatch;

  const reset = () => {
    setQuery("");
    setActiveGroup(null);
    setCustomMetric(null);
  };

  const handleSelect = (def: ExerciseDef) => {
    onSelect(def);
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.pickerContainer, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerBtnRight} />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setCustomMetric(null);
            }}
            placeholder="Search 250+ exercises..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {query.length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupRow}
          >
            {EXERCISE_GROUPS.map((g) => {
              const active = activeGroup === g.key;
              return (
                <Pressable
                  key={g.key}
                  onPress={() => setActiveGroup(active ? null : g.key)}
                  style={[styles.groupChip, active && styles.groupChipActive]}
                >
                  <Ionicons
                    name={g.icon as any}
                    size={13}
                    color={active ? "#fff" : colors.textMuted}
                  />
                  <Text style={[styles.groupChipText, active && { color: "#fff" }]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {query.length === 0 && !activeGroup && recentDefs.length > 0 && (
            <>
              <Text style={styles.pickerSectionLabel}>RECENT</Text>
              {recentDefs.map((def) => (
                <ExerciseRow
                  key={`recent_${def.key}`}
                  def={def}
                  added={addedKeys.includes(def.key)}
                  onPress={() => handleSelect(def)}
                />
              ))}
            </>
          )}

          {query.length === 0 && !activeGroup && (
            <>
              <Text style={styles.pickerSectionLabel}>BROWSE BY GROUP</Text>
              <Text style={styles.pickerHint}>
                Type to search, or pick a group above to see every exercise in it.
              </Text>
            </>
          )}

          {results.length > 0 && (
            <>
              {query.length > 0 && (
                <Text style={styles.pickerSectionLabel}>
                  {results.length} MATCH{results.length === 1 ? "" : "ES"}
                </Text>
              )}
              {results.map((def) => (
                <ExerciseRow
                  key={def.key}
                  def={def}
                  added={addedKeys.includes(def.key)}
                  onPress={() => handleSelect(def)}
                />
              ))}
            </>
          )}

          {query.trim().length > 0 && results.length === 0 && (
            <Text style={styles.pickerHint}>{`Nothing matched "${query.trim()}".`}</Text>
          )}

          {canCreateCustom && (
            <View style={styles.customBox}>
              <Text style={styles.customTitle}>{`Add "${query.trim()}" as a custom exercise`}</Text>
              <Text style={styles.customHint}>How do you want to measure it?</Text>
              <View style={styles.customMetricRow}>
                {(Object.keys(METRIC_LABELS) as ExerciseMetric[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setCustomMetric(m)}
                    style={[
                      styles.customMetricChip,
                      customMetric === m && styles.customMetricChipActive,
                    ]}
                  >
                    <Text
                      style={[styles.customMetricText, customMetric === m && { color: "#fff" }]}
                    >
                      {METRIC_LABELS[m]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.customAddBtn, { opacity: customMetric ? 1 : 0.4 }]}
                disabled={!customMetric}
                onPress={() => {
                  if (!customMetric) return;
                  handleSelect(customExerciseDef(query.trim(), customMetric));
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.customAddText}>Add custom exercise</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ExerciseRow({
  def,
  added,
  onPress,
}: {
  def: ExerciseDef;
  added: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.pickerRow} onPress={onPress} disabled={added}>
      <View style={styles.pickerIconBox}>
        <Ionicons name={def.icon as any} size={15} color={colors.brandTeal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pickerName, added && { color: colors.textMuted }]}>{def.name}</Text>
        <Text style={styles.pickerMeta}>
          {def.group} · {METRIC_LABELS[def.metric]}
        </Text>
      </View>
      {added ? (
        <View style={styles.addedBadge}>
          <Ionicons name="checkmark" size={12} color={colors.brandTeal} />
          <Text style={styles.addedBadgeText}>Added</Text>
        </View>
      ) : (
        <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pickerContainer: { flex: 1, backgroundColor: colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerBtn: { width: 40, alignItems: "flex-start" },
  headerBtnRight: { width: 40, alignItems: "flex-end" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  groupRow: { gap: 7, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  groupChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  groupChipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  pickerSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  pickerHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pickerIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(0,206,209,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  pickerMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  addedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,206,209,0.12)",
  },
  addedBadgeText: { fontSize: 11, fontWeight: "700", color: colors.brandTeal },
  customBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  customTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  customHint: { fontSize: 12, color: colors.textMuted, marginTop: 3, marginBottom: 10 },
  customMetricRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  customMetricChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSection,
  },
  customMetricChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  customMetricText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  customAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.brandTeal,
  },
  customAddText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
