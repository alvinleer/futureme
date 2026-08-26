import React, { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  Dimensions,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useDietStore from "../state/dietStore";
import { ThemedText } from "../components/ThemedText";
import { colors, spacing, radii } from "../theme";
import { ProgressPhoto } from "../types/diet";
import { resolvePhotoUri } from "../utils/photoStorage";

const { width } = Dimensions.get("window");
const numColumns = 3;
const gap = spacing.xs;
const imageSize = (width - spacing.lg * 2 - gap * (numColumns - 1)) / numColumns;

export default function AllPhotosScreen() {
  const insets = useSafeAreaInsets();

  const progressPhotos = useDietStore((s) => s.progressPhotos);
  const deleteProgressPhoto = useDietStore((s) => s.deleteProgressPhoto);
  const deleteAllProgressPhotos = useDietStore((s) => s.deleteAllProgressPhotos);

  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const sortedPhotos = [...progressPhotos].sort((a, b) => b.timestamp - a.timestamp);

  const handleDeletePhoto = () => {
    if (selectedPhoto) {
      deleteProgressPhoto(selectedPhoto.id);
    }
    setShowDeleteConfirm(false);
    setSelectedPhoto(null);
  };

  const handleDeleteAll = () => {
    deleteAllProgressPhotos();
    setShowDeleteAllConfirm(false);
  };

  const getAngleLabel = (angle: string) => {
    switch (angle) {
      case "front":
        return "Front";
      case "side":
        return "Side";
      case "back":
        return "Back";
      default:
        return angle;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <ThemedText variant="h2">{progressPhotos.length}</ThemedText>
            <ThemedText variant="caption" muted>
              Total Photos
            </ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText variant="h2">
              {progressPhotos.filter((p) => p.angle === "front").length}
            </ThemedText>
            <ThemedText variant="caption" muted>
              Front
            </ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText variant="h2">
              {progressPhotos.filter((p) => p.angle === "side").length}
            </ThemedText>
            <ThemedText variant="caption" muted>
              Side
            </ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText variant="h2">
              {progressPhotos.filter((p) => p.angle === "back").length}
            </ThemedText>
            <ThemedText variant="caption" muted>
              Back
            </ThemedText>
          </View>
        </View>

        {/* Delete All Button */}
        {progressPhotos.length > 0 && (
          <Pressable
            style={styles.deleteAllButton}
            onPress={() => setShowDeleteAllConfirm(true)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteAllText}>Delete All Photos</Text>
          </Pressable>
        )}

        {/* Photo Grid */}
        {progressPhotos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={64} color={colors.textMuted} />
            <ThemedText variant="body" muted style={styles.emptyText}>
              No progress photos yet
            </ThemedText>
            <ThemedText variant="caption" muted style={styles.emptySubtext}>
              Add photos from the Progress tab to track your transformation
            </ThemedText>
          </View>
        ) : (
          <View style={styles.grid}>
            {sortedPhotos.map((photo) => (
              <Pressable
                key={photo.id}
                style={styles.gridItem}
                onPress={() => setSelectedPhoto(photo)}
              >
                <Image source={{ uri: resolvePhotoUri(photo.uri) ?? photo.uri }} style={styles.gridImage} />
                <View style={styles.photoOverlay}>
                  <Text style={styles.angleLabel}>{getAngleLabel(photo.angle)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Full Screen Photo Modal */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPhoto && (
              <>
                <Image
                  source={{ uri: resolvePhotoUri(selectedPhoto.uri) ?? selectedPhoto.uri }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <View style={styles.modalInfo}>
                  <ThemedText variant="bodySmall" style={{ color: "#FFFFFF" }}>
                    {getAngleLabel(selectedPhoto.angle)} •{" "}
                    {new Date(selectedPhoto.timestamp).toLocaleDateString()}
                  </ThemedText>
                </View>
              </>
            )}
            <Pressable
              style={styles.closeButton}
              onPress={() => setSelectedPhoto(null)}
            >
              <Ionicons name="close" size={32} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={styles.deleteButton}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delete Single Photo Confirmation */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <ThemedText variant="h3" style={styles.confirmTitle}>
              Delete Photo?
            </ThemedText>
            <ThemedText variant="body" muted style={styles.confirmMessage}>
              This action cannot be undone.
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <ThemedText variant="body" style={{ color: colors.brandTeal, fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable style={styles.confirmDeleteButton} onPress={handleDeletePhoto}>
                <ThemedText variant="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete All Confirmation */}
      <Modal visible={showDeleteAllConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <ThemedText variant="h3" style={styles.confirmTitle}>
              Delete All Photos?
            </ThemedText>
            <ThemedText variant="body" muted style={styles.confirmMessage}>
              This will permanently delete all {progressPhotos.length} progress photos. This
              action cannot be undone.
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={() => setShowDeleteAllConfirm(false)}
              >
                <ThemedText variant="body" style={{ color: colors.brandTeal, fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable style={styles.confirmDeleteButton} onPress={handleDeleteAll}>
                <ThemedText variant="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Delete All
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  statItem: {
    alignItems: "center",
  },
  deleteAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  deleteAllText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    marginTop: spacing.lg,
  },
  emptySubtext: {
    marginTop: spacing.sm,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: gap,
  },
  gridItem: {
    width: imageSize,
    height: imageSize * 1.33,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  angleLabel: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: "90%",
    height: "70%",
  },
  modalInfo: {
    marginTop: spacing.lg,
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    gap: spacing.sm,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  confirmDialog: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 320,
  },
  confirmTitle: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  confirmMessage: {
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
    alignItems: "center",
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
});
