import React, { useState, useRef } from "react";
import { View, Pressable, StyleSheet, ActivityIndicator, Text, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import useDietStore from "../state/dietStore";
import { transcribeAudio } from "../api/transcribe-audio";
import { getOpenAITextResponse } from "../api/chat-service";
import { colors } from "../theme";

export const FloatingRecordButton: React.FC = () => {
  const addMeal = useDietStore((s) => s.addMeal);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // The permission dialog above briefly backgrounds the app on iOS. If we try
  // to activate the audio session before focus returns, iOS rejects it with
  // "This experience is currently in the background." Wait for "active" first.
  const waitForActiveAppState = () =>
    new Promise<void>((resolve) => {
      if (AppState.currentState === "active") {
        resolve();
        return;
      }
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          subscription.remove();
          resolve();
        }
      });
    });

  const startRecording = async () => {
    try {
      setErrorText(null);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorText("Microphone access denied");
        return;
      }

      await waitForActiveAppState();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      setErrorText("Failed to start recording");
    }
  };

  const stopRecording = async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    try {
      setIsRecording(false);
      recordingRef.current = null;
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = rec.getURI();
      if (!uri) throw new Error("No recording URI found");

      setIsProcessing(true);

      const transcription = await transcribeAudio(uri);

      const response = await getOpenAITextResponse([
        {
          role: "user",
          content: `You are a friendly nutrition assistant helping someone track their meals. They just described this meal: "${transcription}"

Please respond with ONLY a valid JSON object in this exact format, nothing else:
{
  "description": "brief meal name",
  "calories": estimated_calories_as_number,
  "protein": grams_as_number,
  "carbs": grams_as_number,
  "fat": grams_as_number,
  "confirmationMessage": "a natural, conversational message confirming the meal was logged. Example: 'Got it! I logged your grilled chicken salad with 450 calories.'"
}

Be accurate with your estimates based on typical serving sizes.`,
        },
      ]);

      let cleanedResponse = response.content.trim();

      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
      }

      cleanedResponse = cleanedResponse.trim();

      const mealData = JSON.parse(cleanedResponse);

      addMeal({
        description: mealData.description,
        calories: mealData.calories,
        protein: mealData.protein,
        carbs: mealData.carbs,
        fat: mealData.fat,
      });

      setIsProcessing(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setErrorText(`Error: ${msg.slice(0, 60)}`);
      setIsProcessing(false);
      recordingRef.current = null;
    }
  };

  const handlePress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          bottom: 60,
        },
      ]}
      pointerEvents="box-none"
    >
      {errorText && (
        <Pressable onPress={() => setErrorText(null)} style={styles.errorBadge}>
          <Text style={styles.errorText}>{errorText}</Text>
        </Pressable>
      )}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
          isRecording && styles.recording,
          isProcessing && styles.processing,
        ]}
        onPress={handlePress}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <>
            <Text style={styles.title}>Processing...</Text>
            <ActivityIndicator color="#FFFFFF" size="small" style={{ marginLeft: 8 }} />
          </>
        ) : (
          <>
            <Text style={styles.title}>
              {isRecording ? "STOP" : "LOG NOW"}
            </Text>
            <View style={styles.iconContainer}>
              <Ionicons name="mic" size={18} color="#FFFFFF" />
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.brandTeal,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  recording: {
    backgroundColor: "#EF4444",
  },
  processing: {
    backgroundColor: colors.brandTeal,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#3A3A3A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  errorBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    maxWidth: 280,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
});
