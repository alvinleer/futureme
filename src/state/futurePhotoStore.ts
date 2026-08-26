import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toPhotoFilename } from "../utils/photoStorage";
import {
  UserProfile,
  WorkoutStats,
  FuturePhotoData,
} from "../types/futurePhoto";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function generateDeviceId(): string {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

interface FuturePhotoStore extends FuturePhotoData {
  deviceId: string;
  profilePhotoUri: string | null;
  weeklyGenerationKey: string | null;
  setUserProfile: (profile: UserProfile) => void;
  updateWorkoutStats: (stats: Partial<WorkoutStats>) => void;
  setBeforePhoto: (uri: string) => void;
  setHeadshotPhoto: (uri: string) => void;
  setProfilePhoto: (uri: string) => void;
  /**
   * Seals the program: fixes the start day, length and goal date together.
   * A sealed program is immutable until it ends — later calls are ignored so the
   * goal date can never drift once the user has committed to it.
   */
  sealProgram: (startDate: number, totalWeeks: number, goalEndDate: number) => void;
  /** True once a program has been sealed and its goal date is still in the future. */
  isProgramSealed: () => boolean;
  /** Weeks left until the sealed goal date (0 once it has passed). */
  weeksRemaining: () => number;
  /** 1-based week number within the program, capped at the program length. */
  currentProgramWeek: () => number;
  setGeneratedPhoto: (
    url: string,
    meta: { complianceRate: number; denoisingStrength: number; progressScore: number }
  ) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setGenerationError: (error: string | null) => void;
  clearGeneratedPhoto: () => void;
  clearBeforePhoto: () => void;
  setWeeklyGenerationKey: (key: string) => void;
  isProfileComplete: () => boolean;
  shouldRegenerate: () => boolean;
  reset: () => void;
}

const initialState: Omit<
  FuturePhotoStore,
  | "setUserProfile"
  | "updateWorkoutStats"
  | "setBeforePhoto"
  | "setHeadshotPhoto"
  | "setProfilePhoto"
  | "sealProgram"
  | "isProgramSealed"
  | "weeksRemaining"
  | "currentProgramWeek"
  | "setGeneratedPhoto"
  | "setIsGenerating"
  | "setGenerationError"
  | "clearGeneratedPhoto"
  | "clearBeforePhoto"
  | "setWeeklyGenerationKey"
  | "isProfileComplete"
  | "shouldRegenerate"
  | "reset"
> = {
  deviceId: generateDeviceId(),
  profilePhotoUri: null,
  weeklyGenerationKey: null,
  userProfile: null,
  workoutStats: {
    avgWorkoutsPerWeek: 3,
    workoutType: "mixed",
    avgWorkoutDuration: 45,
  },
  beforePhotoUri: null,
  headshotPhotoUri: null,
  programStartDate: null,
  goalEndDate: null,
  totalWeeks: null,
  generatedPhotoUrl: null,
  lastGeneratedAt: null,
  isGenerating: false,
  generationError: null,
  lastComplianceRate: null,
  lastDenoisingStrength: null,
  lastProgressScore: null,
};

const useFuturePhotoStore = create<FuturePhotoStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUserProfile: (profile) => set({ userProfile: profile }),

      updateWorkoutStats: (stats) =>
        set((state) => ({
          workoutStats: { ...state.workoutStats, ...stats },
        })),

      setBeforePhoto: (uri) => set({ beforePhotoUri: toPhotoFilename(uri) }),

      setHeadshotPhoto: (uri) => set({ headshotPhotoUri: toPhotoFilename(uri) }),

      setProfilePhoto: (uri) => set({ profilePhotoUri: toPhotoFilename(uri) }),

      sealProgram: (startDate, totalWeeks, goalEndDate) => {
        const existing = get().goalEndDate;
        // Already sealed and still running — the goal date stays put
        if (existing !== null && existing > Date.now()) return;
        set({ programStartDate: startDate, totalWeeks, goalEndDate });
      },

      isProgramSealed: () => {
        const { goalEndDate } = get();
        return goalEndDate !== null && goalEndDate > Date.now();
      },

      weeksRemaining: () => {
        const { goalEndDate } = get();
        if (!goalEndDate) return 0;
        return Math.max(0, Math.ceil((goalEndDate - Date.now()) / MS_PER_WEEK));
      },

      currentProgramWeek: () => {
        const { programStartDate, totalWeeks } = get();
        if (!programStartDate || !totalWeeks) return 1;
        const elapsed = Math.floor((Date.now() - programStartDate) / MS_PER_WEEK);
        return Math.min(totalWeeks, Math.max(1, elapsed + 1));
      },

      setGeneratedPhoto: (url, meta) =>
        set({
          generatedPhotoUrl: toPhotoFilename(url),
          lastGeneratedAt: Date.now(),
          isGenerating: false,
          generationError: null,
          lastComplianceRate: meta.complianceRate,
          lastDenoisingStrength: meta.denoisingStrength,
          lastProgressScore: meta.progressScore,
        }),

      setIsGenerating: (isGenerating) => set({ isGenerating }),

      setGenerationError: (error) =>
        set({ generationError: error, isGenerating: false }),

      clearGeneratedPhoto: () =>
        set({
          generatedPhotoUrl: null,
          lastGeneratedAt: null,
          generationError: null,
          lastComplianceRate: null,
          lastDenoisingStrength: null,
          lastProgressScore: null,
        }),

      clearBeforePhoto: () =>
        set({
          beforePhotoUri: null,
          generatedPhotoUrl: null,
          lastGeneratedAt: null,
          generationError: null,
          lastComplianceRate: null,
          lastDenoisingStrength: null,
          lastProgressScore: null,
        }),

      setWeeklyGenerationKey: (key) => set({ weeklyGenerationKey: key }),

      isProfileComplete: () => {
        const state = get();
        return !!(state.userProfile && state.beforePhotoUri && state.goalEndDate);
      },

      shouldRegenerate: () => {
        const state = get();
        if (!state.lastGeneratedAt) return true;
        return Date.now() - state.lastGeneratedAt >= 7 * 24 * 60 * 60 * 1000;
      },

      reset: () => set({ ...initialState, deviceId: get().deviceId }),
    }),
    {
      name: "future-photo-storage",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as typeof initialState;
        if (fromVersion < 2) {
          // Programs sealed before this version have no recorded start day —
          // derive it from the goal date and the length they were set up with.
          if (state.goalEndDate && !state.programStartDate) {
            const weeks = state.totalWeeks ?? 12;
            state.programStartDate = state.goalEndDate - weeks * MS_PER_WEEK;
          }
          // Snap legacy lengths onto the two supported program lengths
          if (state.totalWeeks != null) {
            state.totalWeeks = state.totalWeeks <= 18 ? 12 : 24;
          }
        }
        if (fromVersion < 1) {
          // Migrate absolute paths → filenames so they survive iOS app updates
          const strip = (p: string | null | undefined): string | null => {
            if (!p) return null;
            if (p.startsWith("http://") || p.startsWith("https://")) return p;
            // If it looks like a cacheDirectory path, discard it (cache is volatile)
            if (p.includes("Caches") || p.includes("cache")) return null;
            return p.split("/").pop() ?? null;
          };
          state.profilePhotoUri = strip(state.profilePhotoUri);
          state.beforePhotoUri = strip(state.beforePhotoUri);
          state.headshotPhotoUri = strip(state.headshotPhotoUri);
          state.generatedPhotoUrl = strip(state.generatedPhotoUrl);
        }
        return state;
      },
      partialize: (state) => ({
        deviceId: state.deviceId,
        profilePhotoUri: state.profilePhotoUri,
        weeklyGenerationKey: state.weeklyGenerationKey,
        userProfile: state.userProfile,
        workoutStats: state.workoutStats,
        beforePhotoUri: state.beforePhotoUri,
        headshotPhotoUri: state.headshotPhotoUri,
        programStartDate: state.programStartDate,
        goalEndDate: state.goalEndDate,
        totalWeeks: state.totalWeeks,
        generatedPhotoUrl: state.generatedPhotoUrl,
        lastGeneratedAt: state.lastGeneratedAt,
        lastComplianceRate: state.lastComplianceRate,
        lastDenoisingStrength: state.lastDenoisingStrength,
        lastProgressScore: state.lastProgressScore,
      }),
    }
  )
);

export default useFuturePhotoStore;
