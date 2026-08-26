// exerciseLibrary.ts — the searchable catalogue of individual exercises used when
// logging a workout session. Distinct from exerciseActivities.ts, which models
// broad activities purely for calorie estimation: every entry here maps onto one
// of those activities via `activityKey` so burn estimates keep working.

export type ExerciseMetric =
  | "weight_reps" // sets of weight × reps (barbell, dumbbell, machine)
  | "reps" // sets of reps only (bodyweight)
  | "duration" // total minutes (planks, classes, sports)
  | "distance_duration"; // distance + minutes (running, cycling, swimming)

export type ExerciseGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Arms"
  | "Legs"
  | "Glutes"
  | "Core"
  | "Olympic & Power"
  | "Cardio"
  | "HIIT"
  | "Yoga & Mobility"
  | "Sports"
  | "Custom";

export interface ExerciseDef {
  key: string;
  name: string;
  group: ExerciseGroup;
  metric: ExerciseMetric;
  /** Key into EXERCISE_ACTIVITIES — drives calorie estimation */
  activityKey: string;
  icon: string;
  /** Extra search terms (abbreviations, alternate names) */
  aliases?: string[];
}

export const EXERCISE_GROUPS: { key: ExerciseGroup; label: string; icon: string }[] = [
  { key: "Chest", label: "Chest", icon: "body-outline" },
  { key: "Back", label: "Back", icon: "body-outline" },
  { key: "Shoulders", label: "Shoulders", icon: "body-outline" },
  { key: "Arms", label: "Arms", icon: "barbell-outline" },
  { key: "Legs", label: "Legs", icon: "walk-outline" },
  { key: "Glutes", label: "Glutes", icon: "body-outline" },
  { key: "Core", label: "Core", icon: "ellipse-outline" },
  { key: "Olympic & Power", label: "Olympic", icon: "flash-outline" },
  { key: "Cardio", label: "Cardio", icon: "heart-outline" },
  { key: "HIIT", label: "HIIT", icon: "flame-outline" },
  { key: "Yoga & Mobility", label: "Yoga", icon: "leaf-outline" },
  { key: "Sports", label: "Sports", icon: "basketball-outline" },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Normalised form used for duplicate detection and search matching */
export const normalizeExerciseName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface RawExercise {
  name: string;
  metric?: ExerciseMetric;
  activityKey?: string;
  icon?: string;
  aliases?: string[];
}

function build(
  group: ExerciseGroup,
  defaults: { metric: ExerciseMetric; activityKey: string; icon: string },
  items: (string | RawExercise)[]
): ExerciseDef[] {
  return items.map((item) => {
    const raw: RawExercise = typeof item === "string" ? { name: item } : item;
    return {
      key: slug(raw.name),
      name: raw.name,
      group,
      metric: raw.metric ?? defaults.metric,
      activityKey: raw.activityKey ?? defaults.activityKey,
      icon: raw.icon ?? defaults.icon,
      aliases: raw.aliases,
    };
  });
}

const LIFT = { metric: "weight_reps" as const, activityKey: "weight_lifting", icon: "barbell-outline" };
const BW = { metric: "reps" as const, activityKey: "bodyweight", icon: "body-outline" };
const HOLD = { metric: "duration" as const, activityKey: "bodyweight", icon: "timer-outline" };
const RUN = { metric: "distance_duration" as const, activityKey: "running", icon: "walk-outline" };
const CLASS = { metric: "duration" as const, activityKey: "hiit", icon: "flame-outline" };
const FLOW = { metric: "duration" as const, activityKey: "yoga_vinyasa", icon: "leaf-outline" };
const SPORT = { metric: "duration" as const, activityKey: "sports_general", icon: "basketball-outline" };

const RAW_LIBRARY: ExerciseDef[] = [
  // ─── CHEST ──────────────────────────────────────────────────────────────────
  ...build("Chest", LIFT, [
    { name: "Barbell Bench Press", aliases: ["flat bench", "bench"] },
    "Incline Barbell Bench Press",
    "Decline Barbell Bench Press",
    "Close-Grip Bench Press",
    "Dumbbell Bench Press",
    "Incline Dumbbell Press",
    "Decline Dumbbell Press",
    "Machine Chest Press",
    "Smith Machine Bench Press",
    "Dumbbell Chest Fly",
    "Incline Dumbbell Fly",
    "Cable Fly",
    "Cable Crossover",
    "Pec Deck",
    "Landmine Press",
    "Svend Press",
    { name: "Weighted Chest Dip", aliases: ["dips"] },
  ]),
  ...build("Chest", BW, [
    { name: "Push-Up", aliases: ["pushup", "press up"] },
    "Incline Push-Up",
    "Decline Push-Up",
    "Diamond Push-Up",
    "Wide-Grip Push-Up",
    "Archer Push-Up",
    "Clap Push-Up",
    "Chest Dip",
  ]),

  // ─── BACK ───────────────────────────────────────────────────────────────────
  ...build("Back", LIFT, [
    { name: "Deadlift", aliases: ["conventional deadlift"] },
    "Sumo Deadlift",
    "Romanian Deadlift",
    "Stiff-Leg Deadlift",
    "Trap Bar Deadlift",
    "Rack Pull",
    "Barbell Row",
    "Pendlay Row",
    "Dumbbell Row",
    "Chest-Supported Row",
    "T-Bar Row",
    "Seated Cable Row",
    "Machine Row",
    "Lat Pulldown",
    "Wide-Grip Lat Pulldown",
    "Close-Grip Lat Pulldown",
    "Straight-Arm Pulldown",
    "Face Pull",
    "Barbell Shrug",
    "Dumbbell Shrug",
    "Good Morning",
    "Weighted Back Extension",
    "Weighted Pull-Up",
    "Meadows Row",
    "Seal Row",
  ]),
  ...build("Back", BW, [
    { name: "Pull-Up", aliases: ["pullup"] },
    { name: "Chin-Up", aliases: ["chinup"] },
    "Neutral-Grip Pull-Up",
    "Inverted Row",
    "Back Extension",
    "Superman Hold",
  ]),

  // ─── SHOULDERS ──────────────────────────────────────────────────────────────
  ...build("Shoulders", LIFT, [
    { name: "Overhead Press", aliases: ["ohp", "military press", "shoulder press"] },
    "Seated Dumbbell Shoulder Press",
    "Arnold Press",
    "Machine Shoulder Press",
    "Push Press",
    "Dumbbell Lateral Raise",
    "Cable Lateral Raise",
    "Machine Lateral Raise",
    "Front Raise",
    "Rear Delt Fly",
    "Reverse Pec Deck",
    "Upright Row",
    "Cuban Press",
    "Behind-the-Neck Press",
  ]),
  ...build("Shoulders", BW, ["Pike Push-Up", "Handstand Push-Up"]),

  // ─── ARMS ───────────────────────────────────────────────────────────────────
  ...build("Arms", LIFT, [
    "Barbell Curl",
    "EZ-Bar Curl",
    "Dumbbell Curl",
    "Hammer Curl",
    "Incline Dumbbell Curl",
    "Preacher Curl",
    "Concentration Curl",
    "Cable Curl",
    "Spider Curl",
    "Reverse Curl",
    "Wrist Curl",
    "Reverse Wrist Curl",
    "Triceps Pushdown",
    "Rope Pushdown",
    "Overhead Triceps Extension",
    "Skull Crusher",
    "Dumbbell Triceps Kickback",
    "Machine Triceps Extension",
    "Weighted Triceps Dip",
    "Farmer Grip Hold",
  ]),
  ...build("Arms", BW, ["Triceps Dip", "Bench Dip"]),

  // ─── LEGS ───────────────────────────────────────────────────────────────────
  ...build("Legs", LIFT, [
    { name: "Back Squat", aliases: ["squat", "barbell squat"] },
    "Front Squat",
    "Goblet Squat",
    "Box Squat",
    "Hack Squat",
    "Smith Machine Squat",
    "Belt Squat",
    "Leg Press",
    "Bulgarian Split Squat",
    "Walking Lunge",
    "Reverse Lunge",
    "Forward Lunge",
    "Lateral Lunge",
    "Curtsy Lunge",
    "Step-Up",
    "Leg Extension",
    "Lying Leg Curl",
    "Seated Leg Curl",
    "Standing Calf Raise",
    "Seated Calf Raise",
    "Calf Press",
    "Sumo Squat",
    "Zercher Squat",
    "Adductor Machine",
    "Abductor Machine",
    "Sissy Squat",
    "Jefferson Curl",
  ]),
  ...build("Legs", BW, ["Bodyweight Squat", "Jump Squat", "Pistol Squat", "Nordic Hamstring Curl", "Calf Raise"]),
  ...build("Legs", HOLD, ["Wall Sit"]),

  // ─── GLUTES ─────────────────────────────────────────────────────────────────
  ...build("Glutes", LIFT, [
    "Barbell Hip Thrust",
    "Machine Hip Thrust",
    "Weighted Glute Bridge",
    "Cable Kickback",
    "Cable Pull-Through",
    "Single-Leg Romanian Deadlift",
    "Hip Abduction Machine",
  ]),
  ...build("Glutes", BW, ["Glute Bridge", "Frog Pump", "Fire Hydrant", "Donkey Kick"]),

  // ─── CORE ───────────────────────────────────────────────────────────────────
  ...build("Core", HOLD, [
    { name: "Plank", aliases: ["front plank"] },
    "Side Plank",
    "Hollow Body Hold",
    "L-Sit",
    "Farmer's Carry",
    "Suitcase Carry",
    "Dead Hang",
  ]),
  ...build("Core", BW, [
    "Crunch",
    "Sit-Up",
    "Bicycle Crunch",
    "Russian Twist",
    "Hanging Leg Raise",
    "Lying Leg Raise",
    "Toes to Bar",
    "V-Up",
    "Flutter Kick",
    "Mountain Climber",
    "Dead Bug",
    "Bird Dog",
    "Ab Wheel Rollout",
    "Reverse Crunch",
    "Windshield Wiper",
  ]),
  ...build("Core", LIFT, ["Cable Crunch", "Weighted Sit-Up", "Cable Woodchopper", "Pallof Press", "Machine Ab Crunch"]),

  // ─── OLYMPIC & POWER ────────────────────────────────────────────────────────
  ...build("Olympic & Power", { ...LIFT, activityKey: "powerlifting", icon: "flash-outline" }, [
    "Clean and Jerk",
    "Power Clean",
    "Hang Clean",
    "Squat Clean",
    "Snatch",
    "Power Snatch",
    "Hang Snatch",
    "Clean Pull",
    "Snatch Pull",
    "Push Jerk",
    "Split Jerk",
    "Thruster",
    "Overhead Squat",
    "Barbell Complex",
  ]),
  ...build("Olympic & Power", { ...LIFT, activityKey: "kettlebell", icon: "flash-outline" }, [
    "Kettlebell Swing",
    "Kettlebell Clean",
    "Kettlebell Snatch",
    "Kettlebell Goblet Press",
    "Turkish Get-Up",
    "Medicine Ball Slam",
    "Medicine Ball Throw",
  ]),
  ...build("Olympic & Power", { metric: "duration", activityKey: "crossfit", icon: "flash-outline" }, [
    "Sled Push",
    "Sled Pull",
    "Battle Ropes",
    "Tire Flip",
    "Yoke Carry",
    "Sandbag Carry",
  ]),

  // ─── CARDIO ─────────────────────────────────────────────────────────────────
  ...build("Cardio", RUN, [
    { name: "Running", aliases: ["run", "jog"] },
    "Treadmill Run",
    "Trail Running",
    "Sprint Intervals",
    { name: "Jogging", activityKey: "running" },
    { name: "Walking", activityKey: "walking", aliases: ["walk"] },
    { name: "Treadmill Walk", activityKey: "walking" },
    { name: "Incline Walk", activityKey: "walking" },
    { name: "Hiking", activityKey: "hiking", icon: "trail-sign-outline" },
    { name: "Ruck March", activityKey: "hiking", icon: "trail-sign-outline" },
    { name: "Cycling", activityKey: "cycling", icon: "bicycle-outline", aliases: ["bike", "biking"] },
    { name: "Stationary Bike", activityKey: "stationary_bike", icon: "bicycle-outline" },
    { name: "Mountain Biking", activityKey: "mountain_biking", icon: "bicycle-outline" },
    { name: "Rowing Machine", activityKey: "rowing_machine", icon: "boat-outline", aliases: ["erg", "rower"] },
    { name: "Ski Erg", activityKey: "rowing_machine", icon: "snow-outline" },
    { name: "Assault Bike", activityKey: "stationary_bike", icon: "bicycle-outline", aliases: ["air bike"] },
    { name: "Elliptical", activityKey: "elliptical", icon: "sync-outline" },
    { name: "Stair Climber", activityKey: "stair_stepper", icon: "trending-up-outline", aliases: ["stairmaster"] },
    { name: "Swimming", activityKey: "swimming", icon: "water-outline" },
    { name: "Swimming (Freestyle)", activityKey: "swimming_laps", icon: "water-outline" },
    { name: "Swimming (Breaststroke)", activityKey: "swimming_laps", icon: "water-outline" },
    { name: "Swimming (Backstroke)", activityKey: "swimming_laps", icon: "water-outline" },
    { name: "Swimming (Butterfly)", activityKey: "swimming_laps", icon: "water-outline" },
    { name: "Kayaking", activityKey: "kayaking", icon: "boat-outline" },
    { name: "Paddleboarding", activityKey: "paddleboarding", icon: "boat-outline" },
    { name: "Rollerblading", activityKey: "rollerblading", icon: "bicycle-outline" },
  ]),
  ...build("Cardio", { metric: "duration", activityKey: "cardio", icon: "heart-outline" }, [
    { name: "Jump Rope", activityKey: "jump_rope", icon: "repeat-outline" },
    { name: "Stair Climbing", activityKey: "stair_climbing", icon: "trending-up-outline" },
    { name: "Spin Class", activityKey: "spin_class", icon: "bicycle-outline" },
    { name: "Aerobics", activityKey: "aerobics" },
    { name: "Water Aerobics", activityKey: "water_aerobics", icon: "water-outline" },
    { name: "Zumba", activityKey: "zumba", icon: "musical-notes-outline" },
    { name: "Dancing", activityKey: "dancing", icon: "musical-notes-outline" },
    { name: "Salsa Dancing", activityKey: "salsa_dancing", icon: "musical-notes-outline" },
    { name: "Hip Hop Dance", activityKey: "hip_hop_dance", icon: "musical-notes-outline" },
    { name: "Ballet", activityKey: "ballet", icon: "musical-note-outline" },
  ]),

  // ─── HIIT / CONDITIONING ────────────────────────────────────────────────────
  ...build("HIIT", CLASS, [
    { name: "HIIT Session", aliases: ["hiit", "interval training"] },
    { name: "Tabata", activityKey: "tabata" },
    { name: "Circuit Training", activityKey: "circuit_training" },
    { name: "CrossFit WOD", activityKey: "crossfit", aliases: ["wod", "crossfit"] },
    { name: "Bootcamp Class", activityKey: "bootcamp" },
    { name: "Plyometrics", activityKey: "plyometrics" },
    { name: "Shadow Boxing", activityKey: "boxing" },
    { name: "Heavy Bag Work", activityKey: "boxing" },
  ]),
  ...build("HIIT", { metric: "reps", activityKey: "hiit", icon: "flame-outline" }, [
    "Burpee",
    "Box Jump",
    "Jumping Jack",
    "High Knees",
    "Squat Thrust",
    "Broad Jump",
    "Bear Crawl",
    "Kettlebell Thruster",
  ]),

  // ─── YOGA & MOBILITY ────────────────────────────────────────────────────────
  ...build("Yoga & Mobility", FLOW, [
    { name: "Yoga (Vinyasa)", activityKey: "yoga_vinyasa" },
    { name: "Yoga (Hatha)", activityKey: "yoga_hatha" },
    { name: "Yoga (Power)", activityKey: "yoga_power" },
    { name: "Yoga (Yin)", activityKey: "yoga_hatha" },
    { name: "Pilates", activityKey: "pilates" },
    { name: "Barre", activityKey: "barre" },
    { name: "Stretching", activityKey: "stretching" },
    { name: "Mobility Work", activityKey: "stretching" },
    { name: "Foam Rolling", activityKey: "foam_rolling" },
    { name: "Tai Chi", activityKey: "tai_chi" },
    { name: "Breathwork", activityKey: "stretching" },
  ]),

  // ─── SPORTS ─────────────────────────────────────────────────────────────────
  ...build("Sports", SPORT, [
    { name: "Basketball", activityKey: "basketball" },
    { name: "Soccer", activityKey: "soccer", icon: "football-outline" },
    { name: "Tennis", activityKey: "tennis", icon: "tennisball-outline" },
    { name: "Pickleball", activityKey: "pickleball", icon: "tennisball-outline" },
    { name: "Volleyball", activityKey: "volleyball", icon: "tennisball-outline" },
    { name: "Badminton", activityKey: "badminton", icon: "tennisball-outline" },
    { name: "Squash", activityKey: "squash", icon: "tennisball-outline" },
    { name: "Racquetball", activityKey: "racquetball", icon: "tennisball-outline" },
    { name: "Table Tennis", activityKey: "table_tennis", icon: "tennisball-outline" },
    { name: "Golf", activityKey: "golf", icon: "golf-outline" },
    { name: "Baseball", activityKey: "baseball", icon: "baseball-outline" },
    { name: "Softball", activityKey: "baseball", icon: "baseball-outline" },
    { name: "Hockey", activityKey: "hockey" },
    { name: "Rugby", activityKey: "rugby", icon: "american-football-outline" },
    { name: "American Football", activityKey: "football", icon: "american-football-outline" },
    { name: "Boxing", activityKey: "boxing", icon: "fitness-outline" },
    { name: "Kickboxing", activityKey: "kickboxing", icon: "fitness-outline" },
    { name: "Muay Thai", activityKey: "kickboxing", icon: "fitness-outline" },
    { name: "Brazilian Jiu-Jitsu", activityKey: "judo", icon: "shield-outline", aliases: ["bjj"] },
    { name: "Judo", activityKey: "judo", icon: "shield-outline" },
    { name: "Wrestling", activityKey: "judo", icon: "shield-outline" },
    { name: "Karate", activityKey: "martial_arts", icon: "shield-outline" },
    { name: "Taekwondo", activityKey: "martial_arts", icon: "shield-outline" },
    { name: "MMA", activityKey: "mma", icon: "shield-outline" },
    { name: "Rock Climbing", activityKey: "rock_climbing", icon: "triangle-outline" },
    { name: "Bouldering", activityKey: "rock_climbing", icon: "triangle-outline" },
    { name: "Skiing", activityKey: "skiing", icon: "snow-outline" },
    { name: "Snowboarding", activityKey: "snowboarding", icon: "snow-outline" },
    { name: "Surfing", activityKey: "surfing", icon: "water-outline" },
    { name: "Skateboarding", activityKey: "skateboarding" },
    { name: "Water Polo", activityKey: "water_polo", icon: "water-outline" },
    { name: "Ultimate Frisbee", activityKey: "sports_general" },
    { name: "Cricket", activityKey: "sports_general" },
    { name: "Horse Riding", activityKey: "sports_general" },
  ]),
];

/** Deduplicated catalogue — first definition of a name wins */
export const EXERCISE_LIBRARY: ExerciseDef[] = (() => {
  const seen = new Set<string>();
  const unique: ExerciseDef[] = [];
  for (const ex of RAW_LIBRARY) {
    const id = normalizeExerciseName(ex.name);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(ex);
  }
  return unique;
})();

const BY_KEY = new Map(EXERCISE_LIBRARY.map((e) => [e.key, e]));
const BY_NAME = new Map(EXERCISE_LIBRARY.map((e) => [normalizeExerciseName(e.name), e]));

export function getExerciseDef(key: string): ExerciseDef | undefined {
  return BY_KEY.get(key);
}

export function findExerciseByName(name: string): ExerciseDef | undefined {
  return BY_NAME.get(normalizeExerciseName(name));
}

/**
 * Type-ahead search. Matches on name and aliases, ranking prefix matches above
 * word-start matches above loose substring matches. Never returns duplicates.
 */
export function searchExercises(query: string, limit = 40): ExerciseDef[] {
  const q = normalizeExerciseName(query);
  if (q.length === 0) return [];

  const scored: { def: ExerciseDef; score: number }[] = [];
  for (const def of EXERCISE_LIBRARY) {
    const name = normalizeExerciseName(def.name);
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(` ${q}`)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (def.aliases?.some((a) => normalizeExerciseName(a).includes(q))) score = 4;
    if (score >= 0) scored.push({ def, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.def.name.length - b.def.name.length)
    .slice(0, limit)
    .map((s) => s.def);
}

export function exercisesInGroup(group: ExerciseGroup): ExerciseDef[] {
  return EXERCISE_LIBRARY.filter((e) => e.group === group);
}

/** Build a definition for a name the catalogue does not contain */
export function customExerciseDef(name: string, metric: ExerciseMetric = "weight_reps"): ExerciseDef {
  return {
    key: `custom_${slug(name)}`,
    name: name.trim(),
    group: "Custom",
    metric,
    activityKey: metric === "distance_duration" ? "running" : metric === "duration" ? "general_workout" : "weight_lifting",
    icon: "ellipse-outline",
  };
}

export const METRIC_LABELS: Record<ExerciseMetric, string> = {
  weight_reps: "Weight × reps",
  reps: "Reps",
  duration: "Duration",
  distance_duration: "Distance & time",
};
