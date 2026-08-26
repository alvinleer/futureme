import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { spacing, radii } from "../theme";
import useDiaryStore, { DiaryCategory, DiaryEntry } from "../state/diaryStore";
import { useDiaryDictation } from "../hooks/useDiaryDictation";

const TEAL = "#00CED1";
const BG = "#1e206a";
const CARD = "#2a2d7a";
const BORDER = "rgba(0,206,209,0.12)";

const CATEGORIES: { key: DiaryCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "diet", label: "Diet", icon: "restaurant-outline" },
  { key: "workout", label: "Workout", icon: "barbell-outline" },
  { key: "progress", label: "Progress", icon: "trending-up-outline" },
  { key: "general", label: "General", icon: "chatbubble-ellipses-outline" },
];

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

function categoryMeta(category: DiaryCategory) {
  return CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[3];
}

function EntryCard({
  entry,
  expanded,
  onToggleExpand,
  onDelete,
}: {
  entry: DiaryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const meta = categoryMeta(entry.category);

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.entryCard}>
      <Pressable onPress={onToggleExpand} style={styles.entryHeader}>
        <View style={styles.entryBadge}>
          <Ionicons name={meta.icon} size={13} color={TEAL} />
          <Text style={styles.entryBadgeText}>{meta.label}</Text>
        </View>
        <Text style={styles.entryDate}>{formatDate(entry.timestamp)}</Text>
      </Pressable>

      <Text style={styles.entryText} numberOfLines={expanded ? undefined : 3}>
        {entry.text}
      </Text>

      <View style={styles.entryFooter}>
        {entry.text.length > 140 && (
          <Pressable onPress={onToggleExpand} hitSlop={8}>
            <Text style={styles.entryMoreText}>{expanded ? "Show less" : "Show more"}</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {confirmingDelete ? (
          <View style={styles.confirmRow}>
            <Pressable onPress={() => setConfirmingDelete(false)} hitSlop={8} style={styles.confirmCancelBtn}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} style={styles.confirmDeleteBtn}>
              <Text style={styles.confirmDeleteText}>Delete</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8} style={styles.trashBtn}>
            <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.35)" />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

export default function DiaryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const entries = useDiaryStore((s) => s.entries);
  const addEntry = useDiaryStore((s) => s.addEntry);
  const deleteEntry = useDiaryStore((s) => s.deleteEntry);

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<DiaryCategory | "all">("all");
  const [recordCategory, setRecordCategory] = useState<DiaryCategory>("general");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { stage, isRecording, isBusy, error, clearError, toggle } = useDiaryDictation({
    onResult: (transcript, durationSec) => {
      addEntry({ text: transcript, category: recordCategory, durationSec });
    },
  });

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (activeFilter !== "all" && e.category !== activeFilter) return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, query, activeFilter]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Diary</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search your diary..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setActiveFilter("all")}
            style={[styles.filterChip, activeFilter === "all" && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, activeFilter === "all" && styles.filterChipTextActive]}>All</Text>
          </Pressable>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setActiveFilter(c.key)}
              style={[styles.filterChip, activeFilter === c.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, activeFilter === c.key && styles.filterChipTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Entries list */}
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
              onDelete={() => {
                deleteEntry(item.id);
                if (expandedId === item.id) setExpandedId(null);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={40} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyTitle}>
                {entries.length === 0 ? "No entries yet" : "No matching entries"}
              </Text>
              <Text style={styles.emptyBody}>
                {entries.length === 0
                  ? "Tap the mic below to record your first diary entry."
                  : "Try a different search or filter."}
              </Text>
            </View>
          }
        />

        {/* Recording bar */}
        <View style={[styles.recordBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {error && (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.errorBanner}>
              <Text style={styles.errorBannerText} numberOfLines={2}>{error}</Text>
              <Pressable onPress={clearError} hitSlop={8}>
                <Ionicons name="close" size={16} color="#f87171" />
              </Pressable>
            </Animated.View>
          )}

          {stage === "idle" && !error && (
            <View style={styles.categoryPicker}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setRecordCategory(c.key)}
                  style={[styles.categoryChip, recordCategory === c.key && styles.categoryChipActive]}
                >
                  <Ionicons
                    name={c.icon}
                    size={13}
                    color={recordCategory === c.key ? "#1e206a" : "rgba(255,255,255,0.5)"}
                  />
                  <Text
                    style={[styles.categoryChipText, recordCategory === c.key && styles.categoryChipTextActive]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            onPress={toggle}
            disabled={isBusy}
            style={[styles.micBtn, isRecording && styles.micBtnActive, isBusy && styles.micBtnBusy]}
          >
            {isBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name={isRecording ? "stop" : "mic"} size={26} color="#fff" />
            )}
          </Pressable>
          <Text style={styles.micHint}>
            {isRecording ? "Recording... tap to stop" : isBusy ? "Transcribing..." : "Tap to record a diary entry"}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#252C31",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3A464C",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: "#3A464C",
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#4C5960",
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, padding: 0 },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  filterChipText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600" },
  filterChipTextActive: { color: "#1e206a" },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  entryCard: {
    backgroundColor: CARD,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: spacing.sm,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  entryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,206,209,0.1)",
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  entryBadgeText: { color: TEAL, fontSize: 11, fontWeight: "700" },
  entryDate: { color: "rgba(255,255,255,0.4)", fontSize: 12 },
  entryText: { color: "#D4DDE2", fontSize: 14, lineHeight: 21 },
  entryFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  entryMoreText: { color: TEAL, fontSize: 12, fontWeight: "600" },
  trashBtn: { padding: 4 },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  confirmCancelBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  confirmCancelText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" },
  confirmDeleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  confirmDeleteText: { color: "#f87171", fontSize: 12, fontWeight: "700" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: "600", marginTop: 4 },
  emptyBody: { color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", lineHeight: 18 },
  recordBar: {
    alignItems: "center",
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "#252C31",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    width: "100%",
    marginBottom: spacing.sm,
  },
  errorBannerText: { flex: 1, color: "#f87171", fontSize: 12 },
  categoryPicker: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.sm,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  categoryChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  categoryChipText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" },
  categoryChipTextActive: { color: "#1e206a" },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  micBtnActive: { backgroundColor: "#dc2626" },
  micBtnBusy: { backgroundColor: "#3A464C" },
  micHint: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 8 },
});
