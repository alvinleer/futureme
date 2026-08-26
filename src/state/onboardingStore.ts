import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toPhotoFilename } from "../utils/photoStorage";
import {
  OnboardingData,
  OnboardingGoal,
  OnboardingStats,
  OnboardingCalories,
  OnboardingWorkout,
  OnboardingPhoto,
} from "../types/onboarding";
import { MicronutrientKey } from "../data/micronutrients";

interface OnboardingStore extends OnboardingData {
  setGoal: (goal: OnboardingGoal) => void;
  setStats: (stats: OnboardingStats) => void;
  setCalories: (calories: OnboardingCalories) => void;
  setWorkout: (workout: OnboardingWorkout) => void;
  setPhoto: (photo: OnboardingPhoto) => void;

  macrosCalculationVersion: string | null;
  setMacrosCalculationVersion: (version: string) => void;

  trackedMicronutrients: MicronutrientKey[];
  setTrackedMicronutrients: (keys: MicronutrientKey[]) => void;
  micronutrientTargets: Partial<Record<MicronutrientKey, number>>;
  setMicronutrientTargets: (targets: Partial<Record<MicronutrientKey, number>>) => void;

  setCurrentStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  completeOnboarding: () => void;
  skipOnboarding: () => void;
  resetOnboarding: () => void;

  unitSystem: "metric" | "imperial";
  setUnitSystem: (system: "metric" | "imperial") => void;

  setActivityProfile: (profile: import("../types/onboarding").ActivityProfile) => void;

  isStepComplete: (step: number) => boolean;
  canProceedToNextStep: () => boolean;
}

const TOTAL_STEPS = 7;

const initialState: OnboardingData & { trackedMicronutrients: MicronutrientKey[]; micronutrientTargets: Partial<Record<MicronutrientKey, number>>; macrosCalculationVersion: string | null } = {
  goal: null,
  stats: null,
  calories: null,
  workout: null,
  photo: null,
  currentStep: 1,
  isComplete: false,
  completedAt: null,
  skippedAt: null,
  unitSystem: "metric" as const,
  activityProfile: {
    dailySteps: 7000,
    stepsSource: "manual" as const,
    strengthSessionsPerWeek: 3,
    cardioSessionsPerWeek: 2,
    cardioMinutesPerSession: 30,
    cardioIntensity: "moderate" as const,
    bodyFatPercent: null,
  },
  trackedMicronutrients: [],
  micronutrientTargets: {},
  macrosCalculationVersion: null,
};

const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setGoal: (goal) => set({ goal }),
      setStats: (stats) => set({ stats }),
      setCalories: (calories) => set({ calories }),
      setWorkout: (workout) => set({ workout }),
      setPhoto: (photo) => set({
        photo: photo ? {
          beforePhotoUri: toPhotoFilename(photo.beforePhotoUri),
          headshotPhotoUri: toPhotoFilename(photo.headshotPhotoUri),
        } : photo,
      }),
      setMacrosCalculationVersion: (version) => set({ macrosCalculationVersion: version }),
      setTrackedMicronutrients: (keys) => set({ trackedMicronutrients: keys }),
      setMicronutrientTargets: (targets) => set({ micronutrientTargets: targets }),

      setCurrentStep: (step) => {
        set({ currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)) });
      },

      nextStep: () => {
        const current = get().currentStep;
        if (current < TOTAL_STEPS) set({ currentStep: current + 1 });
      },

      prevStep: () => {
        const current = get().currentStep;
        if (current > 1) set({ currentStep: current - 1 });
      },

      completeOnboarding: () => set({ isComplete: true, completedAt: Date.now() }),

      skipOnboarding: () => set({ skippedAt: Date.now() }),

      resetOnboarding: () => set(initialState),

      setUnitSystem: (system) => set({ unitSystem: system }),

      setActivityProfile: (profile) => set({ activityProfile: profile }),

      isStepComplete: (step) => {
        const state = get();
        switch (step) {
          case 1: return state.goal !== null;
          case 2: return state.stats !== null;
          case 3: return state.calories !== null;
          case 4: return state.workout !== null;
          case 5: return true; // micronutrients are optional
          case 6: return state.photo !== null && state.photo.beforePhotoUri !== null;
          case 7: return state.isComplete;
          default: return false;
        }
      },

      canProceedToNextStep: () => {
        const state = get();
        return state.isStepComplete(state.currentStep);
      },
    }),
    {
      name: "onboarding-storage",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as typeof initialState & { photo?: { beforePhotoUri?: string | null; headshotPhotoUri?: string | null } };
        if (fromVersion < 2 && state.goal) {
          // Goals set before program lengths were sealed: snap onto 12 or 24
          // weeks and recover the start day from the goal date.
          const weeks = state.goal.weeksToGoal <= 18 ? 12 : 24;
          const start =
            state.goal.programStartDate ??
            state.goal.goalEndDate - state.goal.weeksToGoal * 7 * 24 * 60 * 60 * 1000;
          state.goal = { ...state.goal, weeksToGoal: weeks, programStartDate: start };
        }
        if (fromVersion < 1 && state.photo) {
          const strip = (p: string | null | undefined): string | null => {
            if (!p) return null;
            if (p.startsWith("http://") || p.startsWith("https://")) return p;
            return p.split("/").pop() ?? null;
          };
          state.photo = {
            ...state.photo,
            beforePhotoUri: strip(state.photo.beforePhotoUri),
            headshotPhotoUri: strip(state.photo.headshotPhotoUri),
          };
        }
        return state;
      },
      partialize: (state) => ({
        goal: state.goal,
        stats: state.stats,
        calories: state.calories,
        workout: state.workout,
        photo: state.photo,
        currentStep: state.currentStep,
        isComplete: state.isComplete,
        completedAt: state.completedAt,
        skippedAt: state.skippedAt,
        unitSystem: state.unitSystem,
        activityProfile: state.activityProfile,
        trackedMicronutrients: state.trackedMicronutrients,
        micronutrientTargets: state.micronutrientTargets,
        macrosCalculationVersion: state.macrosCalculationVersion,
      }),
    }
  )
);

export default useOnboardingStore;
