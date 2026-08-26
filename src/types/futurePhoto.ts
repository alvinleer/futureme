export interface UserProfile {
  height: string;
  bodyType: "slim" | "average" | "athletic" | "muscular" | "overweight";
  fitnessLevel: "beginner" | "intermediate" | "advanced";
  gender: "male" | "female" | "other";
  age: number;
}

export interface WorkoutStats {
  avgWorkoutsPerWeek: number;
  workoutType: "strength" | "cardio" | "mixed" | "hiit" | "yoga";
  avgWorkoutDuration: number; // in minutes
}

export interface WeeklyProgressStats {
  avgDailyCalories: number;
  avgProteinPercentage: number;
  avgCarbsPercentage: number;
  avgFatPercentage: number;
  mealsLoggedCount: number;
  daysOnTrack: number;
  workoutsCompleted: number;
}

/** 7-day compliance metrics used by the VisualizationEngine */
export interface ComplianceMetrics {
  /** 0–100: calories (50%), protein (30%) and workouts (20%) combined */
  complianceRate: number;
  /** Logged days where the calorie target was met */
  calorieComplianceDays: number;
  /** Logged days that reached 90% of the protein target */
  proteinComplianceDays: number;
  /** Average protein per logged day, grams */
  avgDailyProtein: number;
  /** Protein hit rate over logged days, 0–100 */
  proteinCompliance: number;
  /** Workout days logged in the last 7 days */
  workoutDays: number;
  /** Expected workout days based on plan */
  expectedWorkoutDays: number;
}

/** Result from the backend VisualizationEngine */
export interface VisualizationResult {
  imageUrl: string;
  denoisingStrength: number;
  complianceRate: number;
  progressScore: number;
  generatedAt: string;
  cached: boolean;
}

export interface FuturePhotoData {
  userProfile: UserProfile | null;
  workoutStats: WorkoutStats;
  beforePhotoUri: string | null;
  headshotPhotoUri: string | null;
  /** Day the sealed program started */
  programStartDate: number | null;
  /** Sealed goal date — set once at sign-up, never moved */
  goalEndDate: number | null;
  /** Program length in weeks (12 or 24) */
  totalWeeks: number | null;
  generatedPhotoUrl: string | null;
  lastGeneratedAt: number | null;
  isGenerating: boolean;
  generationError: string | null;
  /** Most recent compliance metrics */
  lastComplianceRate: number | null;
  /** Denoising strength used in last generation */
  lastDenoisingStrength: number | null;
  /** Progress score 0–100 */
  lastProgressScore: number | null;
}
