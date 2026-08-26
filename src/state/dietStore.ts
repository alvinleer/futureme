import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Meal, DailyStats, NutritionGoal, WeightGoal, WeightEntry, WorkoutEntry, WeeklyLogSummary, TrackerConfig, TrackerEntry, ProgressPhoto, PhotoAngle, BodyMeasurementEntry, FavoriteMeal, WorkoutSession, LoggedExercise, WorkoutPlanDay } from "../types/diet";
import { MicronutrientKey } from "../data/micronutrients";
import { toPhotoFilename } from "../utils/photoStorage";
import { workoutEntryFromSession } from "../utils/exerciseProgress";

// Helper to get date string in YYYY-MM-DD format
const getDateString = (timestamp?: number) => {
  const date = timestamp ? new Date(timestamp) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

interface DietStore {
  meals: Meal[];
  workouts: WorkoutEntry[];
  stepEntries: { date: string; steps: number }[];
  nutritionGoal: NutritionGoal;
  weightGoal: WeightGoal;
  maintenanceCalories: number;
  trackers: TrackerConfig[];
  trackerEntries: TrackerEntry[];
  progressPhotos: ProgressPhoto[];
  // Meal actions
  addMeal: (meal: Omit<Meal, "id" | "timestamp">, timestamp?: number) => void;
  updateMeal: (id: string, updates: Partial<Omit<Meal, "id">>) => void;
  deleteMeal: (id: string) => void;
  getMealsForToday: () => Meal[];

  // Workout actions
  addWorkout: (workout: Omit<WorkoutEntry, "id" | "timestamp">, timestamp?: number) => void;
  deleteWorkout: (id: string) => void;
  getWorkoutsForWeek: () => WorkoutEntry[];

  // Detailed workout session actions
  workoutSessions: WorkoutSession[];
  saveWorkoutSession: (session: Omit<WorkoutSession, "id"> & { id?: string }) => string;
  deleteWorkoutSession: (id: string) => void;
  getWorkoutSession: (id: string) => WorkoutSession | null;
  getLastLoggedExercise: (exerciseKey: string, excludeSessionId?: string) => LoggedExercise | null;
  getRecentExerciseKeys: (limit?: number) => string[];

  // Weekly workout plan actions
  workoutPlans: WorkoutPlanDay[];
  saveWorkoutPlanDay: (plan: Omit<WorkoutPlanDay, "id" | "updatedAt"> & { id?: string }) => string;
  deleteWorkoutPlanDay: (dayOfWeek: number) => void;
  getWorkoutPlanForDay: (dayOfWeek: number) => WorkoutPlanDay | null;
  getTodayWorkoutPlan: () => WorkoutPlanDay | null;
  hasLoggedSessionOnDate: (date?: Date) => boolean;

  // Step entry actions
  setStepsForDate: (date: string, steps: number) => void;
  getStepsForDate: (date: string) => number | null;
  getWorkoutsForDate: (date: string) => WorkoutEntry[];

  // Stats calculation
  getTodayStats: () => DailyStats;
  getWeeklyLogSummary: (weeksAgo?: number) => WeeklyLogSummary;
  getConsecutiveCompleteWeeks: () => number;
  getDailyMicronutrientsForDate: (dateStr: string) => Partial<Record<MicronutrientKey, number>>;

  // Goal actions
  updateNutritionGoal: (goal: Partial<NutritionGoal>) => void;
  updateCurrentWeight: (weight: number) => void;
  updateTargetWeight: (weight: number) => void;
  updateMaintenanceCalories: (calories: number) => void;
  addWeightEntry: (entry: WeightEntry) => void;

  // Tracker actions
  addTracker: (tracker: Omit<TrackerConfig, "id" | "order">) => void;
  updateTracker: (id: string, updates: Partial<TrackerConfig>) => void;
  deleteTracker: (id: string) => void;
  reorderTrackers: (trackerIds: string[]) => void;
  incrementTracker: (trackerId: string, date?: string) => void;
  decrementTracker: (trackerId: string, date?: string) => void;
  toggleBooleanTracker: (trackerId: string, date?: string) => void;
  getTrackerValueForDate: (trackerId: string, date?: string) => number;
  getHomeTrackers: () => TrackerConfig[];
  getTrackerEntriesForDate: (date?: string) => TrackerEntry[];
  getAllTrackerEntriesByDate: () => Record<string, TrackerEntry[]>;

  // Progress photo actions
  addProgressPhoto: (photo: Omit<ProgressPhoto, "id"> & { timestamp?: number }) => void;
  deleteProgressPhoto: (id: string) => void;
  deleteAllProgressPhotos: () => void;
  getProgressPhotosForAngle: (angle: PhotoAngle) => ProgressPhoto[];

  // Body measurement actions
  bodyMeasurements: BodyMeasurementEntry[];
  addBodyMeasurement: (entry: Omit<BodyMeasurementEntry, "id">) => void;
  deleteBodyMeasurement: (id: string) => void;
  getLatestMeasurementForPart: (bodyPart: string) => BodyMeasurementEntry | null;
  getMeasurementHistoryForPart: (bodyPart: string) => BodyMeasurementEntry[];
  getTrackedBodyParts: () => string[];

  // Favorite meal actions
  favoriteMeals: FavoriteMeal[];
  addFavoriteMeal: (meal: Omit<FavoriteMeal, "id" | "createdAt">) => void;
  updateFavoriteMeal: (id: string, updates: Partial<Omit<FavoriteMeal, "id" | "createdAt">>) => void;
  deleteFavoriteMeal: (id: string) => void;
  findMatchingFavorite: (query: string) => FavoriteMeal | null;

  // Coach recommendations (AI toasts on home screen)
  coachMessagesEnabled: boolean;
  toggleCoachMessages: () => void;

  // Weekly review card
  weeklyReviewDismissedKey: string | null;
  weeklyPhotoRevealedKey: string | null;
  weeklyAiSummary: { key: string; wins: string[]; focuses: string[]; summary?: string } | null;
  dismissWeeklyReview: () => void;
  revealWeeklyPhoto: () => void;
  setWeeklyAiSummary: (key: string, wins: string[], focuses: string[], summary?: string) => void;
}

const useDietStore = create<DietStore>()(
  persist(
    (set, get) => ({
      meals: [],
      workouts: [],
      workoutSessions: [],
      workoutPlans: [],
      stepEntries: [],
      nutritionGoal: {
        dailyCalories: 2000,
        dailyProtein: 150,
        dailyCarbs: 225,
        dailyFat: 65,
      },
      weightGoal: {
        currentWeight: 0,
        targetWeight: 0,
        startDate: Date.now(),
        weightHistory: [],
      },
      maintenanceCalories: 2000,
      trackers: [
        {
          id: "builtin-water",
          name: "Water",
          icon: "water-outline",
          color: "#2563EB",
          type: "counter" as const,
          goal: 8,
          goalDirection: "max" as const,
          unit: "glasses",
          showOnHome: true,
          order: 0,
          isBuiltIn: true,
        },
      ],
      trackerEntries: [],
      progressPhotos: [],
      bodyMeasurements: [],
      coachMessagesEnabled: true,
      weeklyReviewDismissedKey: null,
      weeklyPhotoRevealedKey: null,
      weeklyAiSummary: null,
      favoriteMeals: [],

      toggleCoachMessages: () => {
        set((state) => ({ coachMessagesEnabled: !state.coachMessagesEnabled }));
      },

      dismissWeeklyReview: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const sunday = new Date(now);
        sunday.setDate(sunday.getDate() - dayOfWeek);
        const key = `${sunday.getFullYear()}-${sunday.getMonth() + 1}-${sunday.getDate()}`;
        set({ weeklyReviewDismissedKey: key });
      },

      revealWeeklyPhoto: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const sunday = new Date(now);
        sunday.setDate(sunday.getDate() - dayOfWeek);
        const key = `${sunday.getFullYear()}-${sunday.getMonth() + 1}-${sunday.getDate()}`;
        set({ weeklyPhotoRevealedKey: key });
      },

      setWeeklyAiSummary: (key, wins, focuses, summary) => {
        set({ weeklyAiSummary: { key, wins, focuses, summary } });
      },

      addMeal: (meal, timestamp) => {
        const newMeal: Meal = {
          ...meal,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp: timestamp ?? Date.now(),
        };
        set((state) => ({ meals: [...state.meals, newMeal] }));
      },

      deleteMeal: (id) => {
        set((state) => ({
          meals: state.meals.filter((meal) => meal.id !== id),
        }));
      },

      updateMeal: (id, updates) => {
        set((state) => ({
          meals: state.meals.map((meal) =>
            meal.id === id ? { ...meal, ...updates } : meal
          ),
        }));
      },

      getMealsForToday: () => {
        const meals = get().meals;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        return meals.filter((meal) => meal.timestamp >= todayTimestamp);
      },

      addWorkout: (workout, timestamp) => {
        const newWorkout: WorkoutEntry = {
          ...workout,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp: timestamp ?? Date.now(),
        };
        set((state) => ({ workouts: [...state.workouts, newWorkout] }));
      },

      deleteWorkout: (id) => {
        set((state) => ({
          workouts: state.workouts.filter((w) => w.id !== id),
        }));
      },

      setStepsForDate: (date, steps) => {
        set((state) => {
          const existing = state.stepEntries.filter((e) => e.date !== date);
          return { stepEntries: [...existing, { date, steps }] };
        });
      },

      getStepsForDate: (date) => {
        const entry = get().stepEntries.find((e) => e.date === date);
        return entry ? entry.steps : null;
      },

      getWorkoutsForDate: (date) => {
        const dayStart = new Date(date).setHours(0, 0, 0, 0);
        const dayEnd = dayStart + 86400000;
        return get().workouts.filter((w) => w.timestamp >= dayStart && w.timestamp < dayEnd);
      },

      saveWorkoutSession: (session) => {
        const id = session.id ?? `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const full: WorkoutSession = { ...session, id };
        const mirrored: WorkoutEntry = {
          ...workoutEntryFromSession(full),
          id: `w_${id}`,
          timestamp: full.timestamp,
        };

        set((state) => ({
          workoutSessions: [
            ...state.workoutSessions.filter((s) => s.id !== id),
            full,
          ].sort((a, b) => a.timestamp - b.timestamp),
          workouts: [...state.workouts.filter((w) => w.sessionId !== id), mirrored],
        }));

        return id;
      },

      deleteWorkoutSession: (id) => {
        set((state) => ({
          workoutSessions: state.workoutSessions.filter((s) => s.id !== id),
          workouts: state.workouts.filter((w) => w.sessionId !== id),
        }));
      },

      getWorkoutSession: (id) => get().workoutSessions.find((s) => s.id === id) ?? null,

      getLastLoggedExercise: (exerciseKey, excludeSessionId) => {
        const sessions = [...get().workoutSessions]
          .filter((s) => s.id !== excludeSessionId)
          .sort((a, b) => b.timestamp - a.timestamp);
        for (const session of sessions) {
          const match = session.exercises.find((e) => e.exerciseKey === exerciseKey);
          if (match) return match;
        }
        return null;
      },

      getRecentExerciseKeys: (limit = 8) => {
        const sessions = [...get().workoutSessions].sort((a, b) => b.timestamp - a.timestamp);
        const keys: string[] = [];
        for (const session of sessions) {
          for (const ex of session.exercises) {
            if (!keys.includes(ex.exerciseKey)) keys.push(ex.exerciseKey);
            if (keys.length >= limit) return keys;
          }
        }
        return keys;
      },

      // ── Weekly workout plan ──────────────────────────────────────────────
      saveWorkoutPlanDay: (plan) => {
        const id = plan.id ?? `wp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const full: WorkoutPlanDay = { ...plan, id, updatedAt: Date.now() };
        set((state) => ({
          // Keyed by weekday, not id: re-saving Tuesday replaces Tuesday rather
          // than leaving a stale second plan the day picker would have to choose between.
          workoutPlans: [
            ...state.workoutPlans.filter((p) => p.dayOfWeek !== full.dayOfWeek),
            full,
          ].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
        }));
        return id;
      },

      deleteWorkoutPlanDay: (dayOfWeek) => {
        set((state) => ({
          workoutPlans: state.workoutPlans.filter((p) => p.dayOfWeek !== dayOfWeek),
        }));
      },

      getWorkoutPlanForDay: (dayOfWeek) =>
        get().workoutPlans.find((p) => p.dayOfWeek === dayOfWeek) ?? null,

      getTodayWorkoutPlan: () => get().getWorkoutPlanForDay(new Date().getDay()),

      hasLoggedSessionOnDate: (date) => {
        const target = date ?? new Date();
        const dayStart = new Date(target).setHours(0, 0, 0, 0);
        const dayEnd = dayStart + 86400000;
        return get().workoutSessions.some(
          (s) => s.timestamp >= dayStart && s.timestamp < dayEnd
        );
      },

      getWorkoutsForWeek: () => {
        const workouts = get().workouts;
        const now = Date.now();
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
        return workouts.filter((w) => w.timestamp >= oneWeekAgo);
      },

      getTodayStats: () => {
        const todayMeals = get().getMealsForToday();

        const stats: DailyStats = {
          totalCalories: 0,
          totalProtein: 0,
          totalCarbs: 0,
          totalFat: 0,
          mealCount: todayMeals.length,
        };

        todayMeals.forEach((meal) => {
          stats.totalCalories += meal.calories;
          stats.totalProtein += meal.protein;
          stats.totalCarbs += meal.carbs;
          stats.totalFat += meal.fat;
        });

        return stats;
      },

      getWeeklyLogSummary: (weeksAgo = 0) => {
        const { meals, workouts, nutritionGoal } = get();

        // Calculate week boundaries (Sunday to Saturday)
        const now = new Date();
        const currentDayOfWeek = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - currentDayOfWeek - (weeksAgo * 7));
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        weekEnd.setHours(0, 0, 0, 0);

        const weekStartTime = weekStart.getTime();
        const weekEndTime = weekEnd.getTime();

        // Get meals for this week
        const weekMeals = meals.filter(
          (m) => m.timestamp >= weekStartTime && m.timestamp < weekEndTime
        );

        // Get workouts for this week
        const weekWorkouts = workouts.filter(
          (w) => w.timestamp >= weekStartTime && w.timestamp < weekEndTime
        );

        // Calculate unique days with meals
        const daysWithMeals = new Set(
          weekMeals.map((m) => new Date(m.timestamp).toDateString())
        ).size;

        // Calculate averages
        const totalCalories = weekMeals.reduce((sum, m) => sum + m.calories, 0);
        const totalProtein = weekMeals.reduce((sum, m) => sum + m.protein, 0);
        const avgDailyCalories = daysWithMeals > 0 ? Math.round(totalCalories / daysWithMeals) : 0;
        const avgDailyProtein = daysWithMeals > 0 ? Math.round(totalProtein / daysWithMeals) : 0;

        // Total workout minutes
        const totalWorkoutMinutes = weekWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);

        // Week is complete if 5+ days of meals AND at least 1 workout
        const isComplete = daysWithMeals >= 5 && weekWorkouts.length >= 1;

        return {
          weekStartDate: weekStartTime,
          weekEndDate: weekEndTime,
          mealsLogged: weekMeals.length,
          daysWithMeals,
          workoutsLogged: weekWorkouts.length,
          avgDailyCalories,
          avgDailyProtein,
          totalWorkoutMinutes,
          isComplete,
        };
      },

      getConsecutiveCompleteWeeks: () => {
        let consecutiveWeeks = 0;
        let weeksAgo = 0;

        while (true) {
          const summary = get().getWeeklyLogSummary(weeksAgo);
          if (summary.isComplete) {
            consecutiveWeeks++;
            weeksAgo++;
          } else {
            break;
          }
          // Safety limit
          if (weeksAgo > 52) break;
        }

        return consecutiveWeeks;
      },

      getDailyMicronutrientsForDate: (dateStr) => {
        const dayStart = new Date(dateStr).setHours(0, 0, 0, 0);
        const dayEnd = dayStart + 86400000;
        const dayMeals = get().meals.filter(
          (m) => m.timestamp >= dayStart && m.timestamp < dayEnd
        );
        const totals: Partial<Record<MicronutrientKey, number>> = {};
        for (const meal of dayMeals) {
          if (!meal.micronutrients) continue;
          for (const [key, val] of Object.entries(meal.micronutrients)) {
            if (val !== undefined) {
              const k = key as MicronutrientKey;
              totals[k] = (totals[k] ?? 0) + val;
            }
          }
        }
        return totals;
      },

      updateNutritionGoal: (goal) => {
        set((state) => ({
          nutritionGoal: { ...state.nutritionGoal, ...goal },
        }));
      },

      updateCurrentWeight: (weight) => {
        set((state) => ({
          weightGoal: { ...state.weightGoal, currentWeight: weight },
        }));
      },

      updateTargetWeight: (weight) => {
        set((state) => ({
          weightGoal: { ...state.weightGoal, targetWeight: weight },
        }));
      },

      updateMaintenanceCalories: (calories) => {
        set({ maintenanceCalories: calories });
      },

      addWeightEntry: (entry) => {
        set((state) => ({
          weightGoal: {
            ...state.weightGoal,
            weightHistory: [...state.weightGoal.weightHistory, entry],
          },
        }));
      },

      // Tracker actions
      addTracker: (tracker) => {
        const trackers = get().trackers;
        const newTracker: TrackerConfig = {
          ...tracker,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          order: trackers.length,
        };
        set((state) => ({ trackers: [...state.trackers, newTracker] }));
      },

      updateTracker: (id, updates) => {
        set((state) => ({
          trackers: state.trackers.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      deleteTracker: (id) => {
        const tracker = get().trackers.find((t) => t.id === id);
        if (tracker?.isBuiltIn) return; // built-in trackers cannot be deleted
        set((state) => ({
          trackers: state.trackers.filter((t) => t.id !== id),
          trackerEntries: state.trackerEntries.filter((e) => e.trackerId !== id),
        }));
      },

      reorderTrackers: (trackerIds) => {
        set((state) => ({
          trackers: state.trackers.map((t) => ({
            ...t,
            order: trackerIds.indexOf(t.id),
          })),
        }));
      },

      incrementTracker: (trackerId, date) => {
        const targetDate = date || getDateString();
        const entries = get().trackerEntries;
        const existingEntry = entries.find(
          (e) => e.trackerId === trackerId && e.date === targetDate
        );

        if (existingEntry) {
          set((state) => ({
            trackerEntries: state.trackerEntries.map((e) =>
              e.id === existingEntry.id ? { ...e, value: e.value + 1, timestamp: Date.now() } : e
            ),
          }));
        } else {
          const newEntry: TrackerEntry = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            trackerId,
            value: 1,
            timestamp: Date.now(),
            date: targetDate,
          };
          set((state) => ({ trackerEntries: [...state.trackerEntries, newEntry] }));
        }
      },

      decrementTracker: (trackerId, date) => {
        const targetDate = date || getDateString();
        const entries = get().trackerEntries;
        const existingEntry = entries.find(
          (e) => e.trackerId === trackerId && e.date === targetDate
        );

        if (existingEntry && existingEntry.value > 0) {
          set((state) => ({
            trackerEntries: state.trackerEntries.map((e) =>
              e.id === existingEntry.id ? { ...e, value: e.value - 1, timestamp: Date.now() } : e
            ),
          }));
        }
      },

      toggleBooleanTracker: (trackerId, date) => {
        const targetDate = date || getDateString();
        const entries = get().trackerEntries;
        const existingEntry = entries.find(
          (e) => e.trackerId === trackerId && e.date === targetDate
        );

        if (existingEntry) {
          set((state) => ({
            trackerEntries: state.trackerEntries.map((e) =>
              e.id === existingEntry.id ? { ...e, value: e.value === 1 ? 0 : 1, timestamp: Date.now() } : e
            ),
          }));
        } else {
          const newEntry: TrackerEntry = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            trackerId,
            value: 1,
            timestamp: Date.now(),
            date: targetDate,
          };
          set((state) => ({ trackerEntries: [...state.trackerEntries, newEntry] }));
        }
      },

      getTrackerValueForDate: (trackerId, date) => {
        const targetDate = date || getDateString();
        const entry = get().trackerEntries.find(
          (e) => e.trackerId === trackerId && e.date === targetDate
        );
        return entry?.value || 0;
      },

      getHomeTrackers: () => {
        return get()
          .trackers.filter((t) => t.showOnHome)
          .sort((a, b) => a.order - b.order)
          .slice(0, 3);
      },

      getTrackerEntriesForDate: (date) => {
        const targetDate = date || getDateString();
        return get().trackerEntries.filter((e) => e.date === targetDate);
      },

      getAllTrackerEntriesByDate: () => {
        const entries = get().trackerEntries;
        const grouped: Record<string, TrackerEntry[]> = {};
        entries.forEach((entry) => {
          if (!grouped[entry.date]) {
            grouped[entry.date] = [];
          }
          grouped[entry.date].push(entry);
        });
        return grouped;
      },

      // Progress photo actions
      addProgressPhoto: (photo) => {
        const newPhoto: ProgressPhoto = {
          ...photo,
          uri: toPhotoFilename(photo.uri) ?? photo.uri,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp: photo.timestamp ?? Date.now(),
        };
        set((state) => ({ progressPhotos: [...state.progressPhotos, newPhoto] }));
      },

      deleteProgressPhoto: (id) => {
        set((state) => ({
          progressPhotos: state.progressPhotos.filter((p) => p.id !== id),
        }));
      },

      deleteAllProgressPhotos: () => {
        set({ progressPhotos: [] });
      },

      getProgressPhotosForAngle: (angle) => {
        return get()
          .progressPhotos.filter((p) => p.angle === angle)
          .sort((a, b) => a.timestamp - b.timestamp);
      },

      addBodyMeasurement: (entry) => {
        const newEntry: BodyMeasurementEntry = { ...entry, id: `bm_${Date.now()}_${Math.random()}` };
        set((state) => ({ bodyMeasurements: [...state.bodyMeasurements, newEntry] }));
      },

      deleteBodyMeasurement: (id) => {
        set((state) => ({ bodyMeasurements: state.bodyMeasurements.filter((e) => e.id !== id) }));
      },

      getLatestMeasurementForPart: (bodyPart) => {
        const entries = get().bodyMeasurements
          .filter((e) => e.bodyPart === bodyPart)
          .sort((a, b) => b.timestamp - a.timestamp);
        return entries[0] ?? null;
      },

      getMeasurementHistoryForPart: (bodyPart) => {
        return get().bodyMeasurements
          .filter((e) => e.bodyPart === bodyPart)
          .sort((a, b) => a.timestamp - b.timestamp);
      },

      getTrackedBodyParts: () => {
        const parts = new Set(get().bodyMeasurements.map((e) => e.bodyPart));
        return Array.from(parts).sort();
      },

      addFavoriteMeal: (meal) => {
        const newFav: FavoriteMeal = {
          ...meal,
          id: `fav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
        };
        set((state) => ({ favoriteMeals: [...state.favoriteMeals, newFav] }));
      },

      updateFavoriteMeal: (id, updates) => {
        set((state) => ({
          favoriteMeals: state.favoriteMeals.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        }));
      },

      deleteFavoriteMeal: (id) => {
        set((state) => ({ favoriteMeals: state.favoriteMeals.filter((f) => f.id !== id) }));
      },

      findMatchingFavorite: (query) => {
        const normalize = (s: string) =>
          s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
        const nq = normalize(query);
        const favorites = get().favoriteMeals;

        // Exact or substring match first
        for (const fav of favorites) {
          const nf = normalize(fav.name);
          if (nq === nf || nq.includes(nf) || nf.includes(nq)) return fav;
        }

        // Word-overlap fallback (≥ 70% overlap)
        const queryWords = nq.split(" ").filter((w) => w.length > 2);
        let best: FavoriteMeal | null = null;
        let bestScore = 0;
        for (const fav of favorites) {
          const favWords = normalize(fav.name).split(" ").filter((w) => w.length > 2);
          if (favWords.length === 0) continue;
          const overlap = favWords.filter((w) => queryWords.includes(w)).length;
          const score = overlap / Math.max(favWords.length, queryWords.length);
          if (score >= 0.7 && score > bestScore) {
            bestScore = score;
            best = fav;
          }
        }
        return best;
      },
    }),
    {
      name: "diet-storage",
      storage: createJSONStorage(() => AsyncStorage),
      version: 5,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as DietStore & { trackers?: TrackerConfig[] };
        if (fromVersion < 1 && state.trackers && state.trackers.length > 0) {
          // Assign distinct palette colors to trackers that all share the same color
          const PALETTE = [
            "#F25A23", "#3B82F6", "#10B981", "#8B5CF6",
            "#F59E0B", "#EF4444", "#06B6D4", "#BE185D", "#84CC16",
          ];
          const uniqueColors = new Set(state.trackers.map((t) => t.color));
          if (uniqueColors.size === 1) {
            state.trackers = state.trackers.map((t, i) => ({
              ...t,
              color: PALETTE[i % PALETTE.length],
            }));
          }
        }
        // v2: ensure built-in water tracker exists
        if (fromVersion < 2) {
          if (!state.trackers) state.trackers = [];
          const hasWater = state.trackers.some((t) => t.id === "builtin-water");
          if (!hasWater) {
            state.trackers = [
              {
                id: "builtin-water",
                name: "Water",
                icon: "water-outline",
                color: "#2563EB",
                type: "counter" as const,
                goal: 8,
                goalDirection: "max" as const,
                unit: "glasses",
                showOnHome: true,
                order: -1,
                isBuiltIn: true,
              },
              ...state.trackers,
            ];
          }
        }
        // v3: fix colors — Water → blue, first custom tracker → pink
        if (fromVersion < 3 && state.trackers) {
          const PINK = "#BE185D";
          const BLUE = "#2563EB";
          const customTrackers = state.trackers.filter((t) => !t.isBuiltIn);
          state.trackers = state.trackers.map((t) => {
            if (t.id === "builtin-water") return { ...t, color: BLUE };
            if (customTrackers[0] && t.id === customTrackers[0].id) return { ...t, color: PINK };
            return t;
          });
        }
        // v4: update old pink #EC4899 to darker #BE185D for better contrast with orange
        if (fromVersion < 4 && state.trackers) {
          state.trackers = state.trackers.map((t) =>
            t.color === "#EC4899" ? { ...t, color: "#BE185D" } : t
          );
        }
        // v5: migrate progress photo absolute paths to filenames
        if (fromVersion < 5 && state.progressPhotos) {
          state.progressPhotos = state.progressPhotos.map((p) => ({
            ...p,
            uri: (() => {
              const u = p.uri;
              if (!u) return u;
              if (u.startsWith("http://") || u.startsWith("https://")) return u;
              return u.split("/").pop() ?? u;
            })(),
          }));
        }
        return state as DietStore;
      },
    },
  ),
);

export default useDietStore;
