import React, { useState, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { ThemedText } from "../components/ThemedText";
import { colors, spacing, radii } from "../theme";
import { getOpenAITextResponse } from "../api/chat-service";
import { AIMessage } from "../types/ai";
import useDietStore from "../state/dietStore";
import useOnboardingStore from "../state/onboardingStore";

const TEAL = "#00CED1";
const ORANGE = "#F25A23";
const BG = "#1e206a";
const CARD = "#2a2d7a";
const BORDER = "rgba(0,206,209,0.12)";
const MSG_BG = "#2a2d7a";
const USER_BG = TEAL;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function buildSystemPrompt(userContext: string): string {
  return `You are the FutureMe AI Specialist, a professional, knowledgeable, and encouraging fitness and nutrition assistant embedded inside the FutureMe app. Your sole purpose is to help users navigate the FutureMe app, understand their nutritional data, track their fitness goals, and interpret their "Future Self" visual projections.

Core Directives:
- Priority Order: The app ranks two levers above everything else. First, the calorie balance — the deficit or surplus — which decides how much weight moves. Second, protein, which decides how much of that movement is muscle rather than fat, whether the user is cutting or bulking. Carbs, fat, meal timing and supplements come after those two. When a user is off track, address calories first and protein second before mentioning anything else, and never let a protein shortfall pass unmentioned.
- Strictly In-Scope: Only answer questions related to nutrition, physical fitness, hydration, sleep, and the usage of the FutureMe app.
- Polite Refusal: If a user asks about politics, religion, general trivia, coding, or any topic outside of health and the app, respond with: "I'm specialized in helping you reach your FutureMe fitness and nutrition goals. I'm unable to assist with that particular topic, but I'd love to help you with your meal plan or workout schedule!"
- Accuracy: Do not make up specific nutritional facts. If you do not have specific data, state "I don't have the exact data for that specific item right now. However, generally speaking..." and provide high-level, evidence-based guidance.
- Tone: Be professional yet friendly. Use "we" and "us" to foster partnership (e.g., "Let's look at your protein intake for the week").
- Safety: Never provide medical advice or diagnose conditions. For extreme queries: "I am an AI assistant, not a doctor. Please consult a healthcare professional before starting a new intense diet or exercise program."
- Disordered Eating: If a user expresses intent to engage in harmful behaviors (e.g., extreme starvation), provide an empathetic refusal and suggest they speak with a professional.

Speak as if you are the user's future self — confident, achieved, and supportive. Keep responses concise and mobile-friendly (2-4 short paragraphs max).

Here is the user's current data for personalized context:
${userContext}`;
}

// Animated typing dots
function TypingDots() {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  React.useEffect(() => {
    dot1.value = withRepeat(
      withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 })),
      -1
    );
    dot2.value = withRepeat(
      withDelay(150, withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 }))),
      -1
    );
    dot3.value = withRepeat(
      withDelay(300, withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 }))),
      -1
    );
  }, []);

  const dot1Style = useAnimatedStyle(() => ({ opacity: 0.3 + dot1.value * 0.7, transform: [{ translateY: -dot1.value * 4 }] }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: 0.3 + dot2.value * 0.7, transform: [{ translateY: -dot2.value * 4 }] }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: 0.3 + dot3.value * 0.7, transform: [{ translateY: -dot3.value * 4 }] }));

  return (
    <View style={styles.typingBubble}>
      <Animated.View style={[styles.dot, dot1Style]} />
      <Animated.View style={[styles.dot, dot2Style]} />
      <Animated.View style={[styles.dot, dot3Style]} />
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <Animated.View
      entering={FadeInDown.duration(280).springify()}
      style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAI]}
    >
      {!isUser && (
        <View style={styles.avatar}>
          <Ionicons name="hourglass-outline" size={16} color={TEAL} />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAI,
        ]}
      >
        <ThemedText
          variant="body"
          style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}
        >
          {message.content}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

export default function FutureMeChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const meals = useDietStore((s) => s.meals);
  const nutritionGoal = useDietStore((s) => s.nutritionGoal);
  const weightGoal = useDietStore((s) => s.weightGoal);
  const workouts = useDietStore((s) => s.workouts);
  const stepEntries = useDietStore((s) => s.stepEntries);
  const maintenanceCalories = useDietStore((s) => s.maintenanceCalories);
  const trackers = useDietStore((s) => s.trackers);
  const goal = useOnboardingStore((s) => s.goal);
  const stats = useOnboardingStore((s) => s.stats);
  const activityProfile = useOnboardingStore((s) => s.activityProfile);
  const onboardingWorkout = useOnboardingStore((s) => s.workout);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey, it's Future You. I've made it to the other side of this journey — and I'm here to help you get over here. How can I help?",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const buildUserContext = useCallback(() => {
    const now = Date.now();
    const lines: string[] = [];

    // ── Profile ──────────────────────────────────────────────────────────────
    if (goal) {
      const goalLabel = goal.type === "lose" ? "lose fat" : goal.type === "gain" ? "gain muscle" : "optimize health and performance";
      lines.push(`PRIMARY GOAL: ${goalLabel}`);
      if (goal.targetWeightKg && goal.currentWeightKg) {
        const diff = Math.abs(goal.targetWeightKg - goal.currentWeightKg);
        lines.push(`Current weight: ${goal.currentWeightKg} kg | Target: ${goal.targetWeightKg} kg | Remaining: ${diff.toFixed(1)} kg`);
      }
    }
    if (stats) {
      const parts: string[] = [];
      if (stats.age) parts.push(`age ${stats.age}`);
      if (stats.gender) parts.push(stats.gender);
      if (stats.heightCm) parts.push(`${stats.heightCm} cm`);
      if (stats.lifestyle) parts.push(`activity: ${stats.lifestyle}`);
      if (parts.length) lines.push(`Profile: ${parts.join(", ")}`);
    }
    if (weightGoal.currentWeight > 0) {
      lines.push(`Logged weight: ${weightGoal.currentWeight} kg`);
      if (weightGoal.targetWeight > 0) lines.push(`Weight target: ${weightGoal.targetWeight} kg`);
    }

    // ── Calorie / Nutrition Goals ─────────────────────────────────────────────
    lines.push(`\nNUTRITION GOALS:`);
    lines.push(`- Calories: ${nutritionGoal.dailyCalories} kcal/day`);
    lines.push(`- Protein: ${nutritionGoal.dailyProtein} g | Carbs: ${nutritionGoal.dailyCarbs ?? "?"} g | Fat: ${nutritionGoal.dailyFat ?? "?"} g`);
    lines.push(`- Maintenance calories: ${maintenanceCalories} kcal/day`);

    // ── Activity Profile ──────────────────────────────────────────────────────
    if (activityProfile) {
      lines.push(`\nACTIVITY PROFILE:`);
      lines.push(`- Daily steps target: ${activityProfile.dailySteps}`);
      lines.push(`- Strength sessions/week: ${activityProfile.strengthSessionsPerWeek}`);
      lines.push(`- Cardio: ${activityProfile.cardioSessionsPerWeek}x/week, ${activityProfile.cardioMinutesPerSession} min, ${activityProfile.cardioIntensity} intensity`);
      if (onboardingWorkout) {
        lines.push(`- Workout split: ${onboardingWorkout.workoutsPerWeek} days/week, ${onboardingWorkout.minutesPerWorkout} min/${onboardingWorkout.workoutType}`);
      }
    }

    // ── Per-Day Breakdown (last 14 days) ──────────────────────────────────────
    lines.push(`\nDAILY LOG (last 14 days — most recent first):`);
    const toDateStr = (ts: number) => {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const today = toDateStr(now);
    let anyDayData = false;
    for (let i = 0; i < 14; i++) {
      const dayTs = now - i * 24 * 60 * 60 * 1000;
      const dateStr = toDateStr(dayTs);
      const dayStart = new Date(dateStr).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      const dayMeals = meals.filter((m) => m.timestamp >= dayStart && m.timestamp < dayEnd);
      const dayWorkouts = workouts.filter((w) => w.timestamp >= dayStart && w.timestamp < dayEnd);
      const stepEntry = stepEntries.find((e) => e.date === dateStr);

      if (dayMeals.length === 0 && dayWorkouts.length === 0 && !stepEntry) continue;
      anyDayData = true;

      const totalCal = dayMeals.reduce((s, m) => s + m.calories, 0);
      const totalProtein = dayMeals.reduce((s, m) => s + m.protein, 0);
      const totalCarbs = dayMeals.reduce((s, m) => s + (m.carbs ?? 0), 0);
      const totalFat = dayMeals.reduce((s, m) => s + (m.fat ?? 0), 0);
      const calDiff = totalCal - nutritionGoal.dailyCalories;
      const calVsMaintenance = totalCal - maintenanceCalories;
      const label = dateStr === today ? "TODAY" : dateStr;

      const dayParts: string[] = [];
      if (dayMeals.length > 0) {
        const diffStr = calDiff > 0 ? `+${calDiff} OVER` : `${Math.abs(calDiff)} under`;
        const energyBalance = calVsMaintenance > 0 ? `surplus +${calVsMaintenance} kcal` : `deficit ${Math.abs(calVsMaintenance)} kcal`;
        dayParts.push(`${totalCal} kcal eaten (${diffStr} goal | ${energyBalance} vs maintenance)`);
        dayParts.push(`protein ${Math.round(totalProtein)}g | carbs ${Math.round(totalCarbs)}g | fat ${Math.round(totalFat)}g`);
        dayParts.push(`${dayMeals.length} meal(s): ${dayMeals.map((m) => m.description).join(", ")}`);
      }
      if (stepEntry) dayParts.push(`steps: ${stepEntry.steps.toLocaleString()}`);
      if (dayWorkouts.length > 0) {
        const wStr = dayWorkouts.map((w) => `${w.type} ${w.durationMinutes}min ${w.intensity}`).join("; ");
        dayParts.push(`workout: ${wStr}`);
      }

      lines.push(`${label}: ${dayParts.join(" | ")}`);
    }
    if (!anyDayData) lines.push("No data logged yet.");

    // ── Trackers ──────────────────────────────────────────────────────────────
    if (trackers.length > 0) {
      lines.push(`\nCUSTOM TRACKERS: ${trackers.map((t) => t.name + (t.goal ? ` (goal: ${t.goal})` : "")).join(", ")}`);
    }

    return lines.join("\n");
  }, [meals, nutritionGoal, weightGoal, goal, stats, workouts, stepEntries, maintenanceCalories, trackers, activityProfile, onboardingWorkout]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const userContext = buildUserContext();
      const systemPrompt = buildSystemPrompt(userContext);

      // Build the full message history for the API call
      const apiMessages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        // Include prior conversation (skip the welcome message for brevity, include last 10 exchanges)
        ...messages.slice(-20).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: text },
      ];

      const response = await getOpenAITextResponse(apiMessages, {
        temperature: 0.15,
        maxTokens: 512,
      });

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: response.content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: "I ran into a connection issue. Give me a moment and try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Ionicons name="hourglass-outline" size={20} color={TEAL} />
            <View style={styles.onlineDot} />
          </View>
          <View>
            <ThemedText variant="h3" style={styles.headerName}>Future Me</ThemedText>
            <ThemedText variant="caption" style={styles.headerSub}>AI Fitness Specialist</ThemedText>
          </View>
        </View>
        <Pressable style={styles.diaryBtn} onPress={() => navigation.navigate("Diary")}>
          <Ionicons name="book-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            isLoading ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.typingRow}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={16} color={TEAL} />
                </View>
                <TypingDots />
              </Animated.View>
            ) : null
          }
        />

        {/* Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Future You anything..."
            placeholderTextColor="#8FA0A6"
            multiline
            maxLength={500}
            returnKeyType="default"
            onSubmitEditing={sendMessage}
          />
          <Pressable
            style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,  },
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
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#252C31",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: TEAL,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: BG,
  },
  headerName: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  headerSub: {
    color: "#5A6A72",
    fontSize: 12,
  },
  diaryBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3A464C",
    alignItems: "center",
    justifyContent: "center",
  },
  messagesList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowAI: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#252C31",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    borderWidth: 1.5,
    borderColor: TEAL + "55",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: {
    backgroundColor: TEAL,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: MSG_BG,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#2E3840",
  },
  bubbleText: {
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: "#FFFFFF",
  },
  bubbleTextAI: {
    color: "#D4DDE2",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MSG_BG,
    borderRadius: radii.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 5,
    borderWidth: 1,
    borderColor: "#2E3840",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: TEAL,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#252C31",
    backgroundColor: BG,    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: "#3A464C",
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: "#FFFFFF",
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#4C5960",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#2E3840",
  },
});
