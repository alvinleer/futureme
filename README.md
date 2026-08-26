# Diet Coach App

A mobile calorie tracking and nutrition coaching app with AI-powered voice assistant. Built with React Native and Expo.

## Nutrition Analysis Architecture (Updated)

The app uses a multi-layer intelligent routing system for accurate nutrition lookups:

```
User Input (text / voice / photo)
        ↓
  GPT Parsing Layer  (nutrition-parser.ts)
  └── normalizes names, splits items, classifies branded vs generic
        ↓
  Routing Layer  (nutrition-router.ts)
  ├── Branded foods  → FatSecret API (packaged products)
  └── Generic foods  → Edamam API (whole foods)
        ↓
  Fallback Chain
  ├── Primary fails → Secondary API
  ├── Both fail     → GPT refines query, retries APIs
  └── Still fails   → GPT estimation (marked LOW confidence)
        ↓
  Post-processing
  └── confidence score, source label, in-memory cache (24h TTL)
        ↓
  MealConfirmationModal
  └── per-item confidence badges (Verified / Approx / Estimated)
```

### Confidence Levels
- **Verified (green)** — exact API match from Edamam or FatSecret
- **Approx (yellow)** — fuzzy/partial match from API
- **Estimated (red)** — GPT-estimated; user should review

### Enabling FatSecret (optional)
Get free API credentials at https://platform.fatsecret.com/api/ and add to `.env`:
```
EXPO_PUBLIC_FATSECRET_CLIENT_ID=your_client_id
EXPO_PUBLIC_FATSECRET_CLIENT_SECRET=your_client_secret
```
Without FatSecret credentials the system falls back to Edamam → GPT for all foods.

### Key Files
- `src/api/nutrition-types.ts` — shared types
- `src/api/nutrition-parser.ts` — GPT parsing layer
- `src/api/nutrition-router.ts` — routing + fallback orchestrator
- `src/api/fatsecret.ts` — FatSecret API integration
- `src/api/nutrition-cache.ts` — in-memory cache (200 entries, 24h TTL)
- `src/api/edamam-nutrition.ts` — Edamam Food Database API

## Design

The app uses a minimalist light theme inspired by clean fitness app design:
- **White backgrounds** (#FFFFFF) with light gray (#F5F5F5) for cards and sections
- **Black typography** (#111111) for primary text, gray (#9CA3AF) for secondary
- **Black pill buttons** for all CTAs
- **Subtle borders** (#E5E7EB) for card separation
- **Green accent** (#86EFAC) for chart/progress data

## Overview

Diet Coach helps users track their caloric intake and nutritional goals with an intelligent voice assistant powered by Claude Sonnet and ElevenLabs. Perfect for anyone looking to improve their dietary habits with a conversational, hands-free experience.

## Features

### 1. Onboarding Flow (NEW)
- **6-Step Setup Process**: Complete guided onboarding to create a personalized fitness plan
- **Goal Setting**: Choose to lose weight, gain muscle, or maintain - set current and target weight with timeframe (4-24 weeks)
- **Personal Stats**: Enter gender, height, weight, age, and activity level for accurate calculations
- **Smart Calorie Recommendations**: AI-calculated maintenance calories (TDEE) and target calories based on your goal
- **Macro Breakdown**: Automatically calculated protein, carbs, and fat targets (adjustable)
- **Workout Planning**: Select workout type (strength, cardio, mixed, HIIT, yoga), frequency (1-7x/week), and duration
- **Before Photo Upload**: Upload a full body photo with automatic background removal
- **Future You Generation**: AI generates a hyper-realistic photo of what you could look like after reaching your goal
- **Skip Option**: Users can skip onboarding and complete it later from the Account screen
- **Persistent Progress**: Onboarding data is saved, allowing users to resume or edit their plan anytime

### 2. Home Dashboard
- **AI Future Photo**: See what you could look like after following your fitness plan - AI-generated based on your progress
- **Daily Calorie Snapshot**: Quick overview of calories consumed vs. goal
- **Macronutrient Breakdown**: Visual progress bars for protein, carbs, and fat
- **Recent Meals**: View your latest logged meals with full nutritional details
- **Header Icons**: Camera icon to snap food photos, account icon for settings

### 2. Navigation
- **Bottom Tab Bar**: Home, Camera, Progress, and Log tabs with centered dictation button
- **Center Dictation Button**: Large, prominent mic button (bigger than other icons) in the tab bar for voice meal logging
- **Camera Tab**: Tap the camera icon in the tab bar to photograph and log food
- **Account Screen**: Access via the profile icon in the top right header
- **Goal Tracker**: Accessed from the Account screen

### 3. Meal Confirmation Popup (NEW)
- **Review Before Logging**: Every meal (voice or camera) shows a confirmation popup before logging
- **Date Selection**: Choose which day to log the meal for (defaults to today, auto-detects "yesterday" from speech)
- **Edit Items**: Tap any detected ingredient to modify the quantity or description
- **Delete Items**: Remove incorrectly detected items with the trash icon
- **Add Items**: Add missing ingredients that weren't detected
- **Nutrition Recalculation**: Nutrition data automatically updates when you edit ingredients
- **Historical Logging**: Log meals for previous days if you forgot to track them

### 4. Food Photo Capture
- **Camera Integration**: Take photos of your food directly from the app
- **AI Food Recognition**: GPT-4o analyzes photos to identify ingredients and portions
- **Accurate Nutrition Data**: Edamam API provides precise calorie and macro information
- **Visual Confirmation**: See detected ingredients before logging
- **Gallery Support**: Choose existing photos from your camera roll
- **One-Tap Logging**: Review nutrition facts and log with a single tap

### 4. Quick Trackers
- **Configurable Trackers**: Create custom trackers for daily habits (water intake, stretching, etc.)
- **Counter Trackers**: Track quantities (e.g., glasses of water, number of cigarettes)
- **Boolean Trackers**: Simple yes/no tracking (e.g., did I stretch today?)
- **Daily Goals**: Set optional goals for counter trackers
- **Goal Direction**: Choose "At least" (more is better) or "Less than" (less is better) for each goal
  - Example: Sleep goal - "At least 7 hours"
  - Example: Sweets goal - "Less than 2"
- **Home Screen Widgets**: Display up to 3 trackers on the home screen for quick access
- **Tap to Increment**: Single tap increases counter or toggles boolean
- **Long Press to Decrement**: Long press decreases counter value
- **Emoji Icon Picker**: Choose from hundreds of emojis organized by category (Food, Health, Activities, Nature, etc.)
- **Custom Colors**: Personalize each tracker with 8 color options
- **Manage in Goals**: Add, edit, and delete trackers from the Goals screen

### 5. Log Screen
- **Complete History**: View all logged meals and tracker entries
- **Organized by Day**: Entries grouped by date with most recent first
- **Daily Summaries**: See total calories and number of trackers logged per day
- **Visual Timeline**: Each entry shows time logged with relevant icons
- **Tracker Details**: View counter values and goal progress
- **Meal Details**: See calories for each logged meal

### 6. Future Photo Feature
- **AI-Generated Progress Preview**: See a hyper-realistic photo of what you might look like after following your diet and exercise plan
- **Reference Image Support**: Upload both a full body photo AND a headshot for more accurate face matching
- **Automatic Background Removal**: All uploaded photos have their backgrounds automatically removed using Gemini 2.5 Flash
- **Personalized Predictions**: Based on your body type, workout frequency, diet consistency, and goal end date
- **Weekly Updates**: Photo automatically regenerates every 7 days based on your actual logged progress
- **Data-Driven Transformations**: Uses your actual meal and workout logs to calculate realistic body composition changes
- **Hyper-Realistic AI Prompt**: Advanced prompt engineering ensures:
  - Realistic fat loss calculations (weekly deficit / 3,500 = lbs/week)
  - Muscle gain potential based on workout type and duration
  - Body type-specific adjustments for more accurate predictions
  - Consistency multiplier based on consecutive complete weeks
- **Week Completion Validation**: Only generates new predictions when you have complete logs (5+ days of meals AND at least 1 workout)
- **Full Body Generation**: Shows head-to-knee transformation based on your specific fitness regimen
- **Prediction Overlay**: Shows weeks from now, projected weight change, daily deficit/surplus, and confidence level

### 7. Workout Logging
- **Log Workouts**: Track your workouts with type (strength, cardio, mixed, HIIT, yoga)
- **Duration Tracking**: Log workout duration in minutes
- **Intensity Levels**: Set low, medium, or high intensity for each workout
- **Weekly Summaries**: See total workout hours and sessions per week
- **Integration with Future Photo**: Your workout data directly influences your predicted transformation

### 8. Progress Tracking
- **Weight Trends**: Visual chart showing your weight loss journey over time
- **Nutrition Analytics**: Weekly calorie averages and meal consistency tracking
- **Before & After Gallery**: Capture progress photos from front, side, and back angles
- **Automatic Background Removal**: All progress photos have backgrounds removed automatically
- **Photo Comparison**: See your transformation with side-by-side before/after views
- **Consistency Streaks**: Track meal logging consistency and weekly goals
- **Stats Dashboard**: Key metrics including weight lost, meals logged, and goal progress

### 9. AI Voice Assistant (Claude + ElevenLabs)
- **Center Tab Button**: Large mic button in the center of the tab bar for quick meal logging
- **Claude Sonnet Intelligence**: Advanced AI analyzes your meal description for accurate nutrition data
- **Natural Voice Responses**: ElevenLabs text-to-speech provides spoken confirmations
- **Smart Transcription**: Converts speech to text with high accuracy using OpenAI
- **Automatic Logging**: Meals are instantly added to your daily log

### 10. Goal Tracker (via Account)
- **Weight Tracking**: Set current and target weight with visual progress
- **Weight History Graph**: Track your weight trend over time
- **Custom Nutrition Goals**: Set daily targets for calories and macros
- **Easy Updates**: Tap to update weight or modify nutrition goals
- **Progress Visualization**: See how close you are to your target weight

## Technology Stack

- **Framework**: React Native 0.76.7 with Expo SDK 53
- **Navigation**: React Navigation (Bottom Tabs)
- **State Management**: Zustand with AsyncStorage persistence
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Audio**: Expo AV for recording and playback
- **AI Integration**:
  - Claude Sonnet 4.5 (Anthropic) - Primary AI brain
  - OpenAI API - Audio transcription
  - ElevenLabs - Text-to-speech voice synthesis
  - **Edamam Nutrition API** - Accurate nutrition data lookup for calories, macros, and micronutrients
- **Charts**: Victory Native for weight tracking visualization

## File Structure

```
/home/user/workspace/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx             # Dashboard with Future Photo, trackers & daily stats
│   │   ├── ProgressScreen.tsx         # Progress tracking with photos and trends
│   │   ├── GoalTrackerScreen.tsx      # Weight, nutrition & quick tracker management
│   │   ├── LogScreen.tsx              # History of all meals and tracker entries
│   │   ├── AccountScreen.tsx          # Account settings with link to Goals & Onboarding
│   │   ├── FuturePhotoSetupScreen.tsx # Setup screen for AI future photo feature
│   │   ├── FoodCameraScreen.tsx       # Camera screen for food photo capture & analysis
│   │   ├── OnboardingGoalScreen.tsx   # Step 1: Set weight goal and timeframe
│   │   ├── OnboardingStatsScreen.tsx  # Step 2: Enter personal stats (gender, height, weight, age, lifestyle)
│   │   ├── OnboardingCaloriesScreen.tsx # Step 3: Review/adjust calorie and macro targets
│   │   ├── OnboardingWorkoutScreen.tsx  # Step 4: Set workout type, frequency, and duration
│   │   ├── OnboardingPhotoScreen.tsx    # Step 5: Upload before photo
│   │   └── OnboardingFutureYouScreen.tsx # Step 6: Generate and view future self photo
│   ├── components/
│   │   ├── FuturePhotoCard.tsx        # AI-generated future photo card component
│   │   ├── MealConfirmationModal.tsx  # Confirmation popup for reviewing/editing meals before logging
│   │   ├── EmojiPicker.tsx            # Emoji picker modal with categories and search
│   │   ├── CTAButton.tsx              # Call-to-action button with arrow icon
│   │   ├── Button.tsx                 # Standard button component
│   │   ├── Card.tsx                   # Card wrapper component
│   │   └── ThemedText.tsx             # Themed text component
│   ├── navigation/
│   │   └── RootNavigator.tsx          # Stack + Bottom tab navigation with centered record button
│   ├── state/
│   │   ├── dietStore.ts               # Zustand store for meals & goals
│   │   ├── futurePhotoStore.ts        # Zustand store for future photo feature
│   │   └── onboardingStore.ts         # Zustand store for onboarding flow state
│   ├── types/
│   │   ├── diet.ts                    # TypeScript interfaces for diet tracking
│   │   ├── futurePhoto.ts             # TypeScript interfaces for future photo
│   │   └── onboarding.ts              # TypeScript interfaces for onboarding + calorie calculations
│   └── api/
│       ├── transcribe-audio.ts        # Audio transcription service
│       ├── chat-service.ts            # Multi-AI text generation (OpenAI, Grok, Claude)
│       ├── future-photo-service.ts    # AI future photo generation service
│       ├── edamam-nutrition.ts        # Edamam API for nutrition data lookup
│       ├── image-generation.ts        # Image generation API
│       ├── anthropic.ts               # Claude Sonnet API client
│       ├── elevenlabs.ts              # Text-to-speech API client
│       └── openai.ts                  # OpenAI API client
├── assets/
│   ├── fitness-hero.jpg               # Hero section fitness photo
│   └── fitness-group.jpg              # Group training fitness photo
├── App.tsx                            # App entry point
└── README.md                          # This file
```

## Key Components

### State Management (dietStore.ts)

The app uses a single Zustand store with the following key features:
- **Meals**: Array of all logged meals with timestamps
- **Workouts**: Array of all logged workouts with type, duration, and intensity
- **Nutrition Goals**: Daily targets for calories and macros
- **Weight Goals**: Current weight, target weight, and history
- **Quick Trackers**: Configurable counter and boolean trackers for daily habits
- **Tracker Entries**: All tracker logs with timestamps and values
- **Maintenance Calories**: Your estimated TDEE for deficit/surplus calculations
- **Weekly Log Summary**: Automatic calculation of weekly stats including:
  - Days with meals logged
  - Average daily calories and protein
  - Total workout minutes
  - Week completion status (5+ days of meals AND 1+ workouts)
- **Consecutive Complete Weeks**: Tracks how many weeks in a row you have complete logs
- **Persistence**: All data is persisted to AsyncStorage

### AI Voice Assistant

Uses a conversational voice interface with accurate nutrition data:
1. User presses and holds the microphone button
2. Audio is recorded using Expo AV
3. Recording stops when user releases
4. Audio is transcribed using OpenAI's gpt-4o-transcribe model
5. Claude Sonnet extracts structured ingredient data from the transcription
6. **Edamam Nutrition API** provides accurate calorie and macro data for the ingredients
7. Claude generates a friendly confirmation message (falls back to AI estimation if Edamam fails)
8. ElevenLabs converts the message to natural speech
9. Audio response is played back to the user
10. Meal is automatically added to today's log with accurate nutrition data

### AI-Powered Nutrition Analysis

The app uses a two-step process for accurate nutrition data:

**Step 1: Ingredient Extraction (Claude Sonnet)**
- Extracts meal name/description from voice transcription
- Breaks down the meal into individual ingredients with quantities
- Formats ingredients for the Edamam API (e.g., "4 oz grilled chicken breast")

**Step 2: Nutrition Lookup (Edamam API)**
- Sends structured ingredients to Edamam Nutrition Analysis API
- Returns accurate data for 28+ macro and micronutrients
- Includes calories, protein, carbs, fat, fiber, sugar, sodium, and more
- Provides diet labels (Low-Carb, High-Protein, etc.) and health labels (Gluten-Free, Vegan, etc.)

**Fallback: AI Estimation**
- If Edamam API fails, Claude estimates nutrition based on typical serving sizes
- Ensures meals are always logged even without API connectivity

## Design Philosophy

- **Dark & Modern**: Dark theme with black backgrounds (#121212) and grey cards (#2B2B2B)
- **Orange Accent**: Orange primary color (#F8652F) used for design accents, highlights, and brand elements
- **Turquoise Buttons**: Turquoise color (#14B8A6) used specifically for interactive buttons and CTAs
- **Floating Action**: Persistent floating button for quick access to voice logging from any screen
- **Inter Font**: Clean, modern Google Font (Inter) for headings (Bold/ExtraBold) and body (Regular/Medium)
- **Visual Storytelling**: Fitness photography incorporated to inspire and motivate users
- **Mobile-First**: Optimized for mobile interactions and gestures
- **Voice-First**: Makes meal logging effortless with voice input
- **Conversational AI**: Natural, encouraging interactions with Claude
- **Visual Feedback**: Progress bars and charts for quick insights
- **Accessible**: Large touch targets and clear typography

## Usage

### Setting Up Your Fitness Plan (Onboarding)
1. Tap the "See Your Future Self" card on the Home screen, or go to Account > "Set Up Fitness Plan"
2. **Step 1 - Goal**: Choose to lose weight, gain muscle, or maintain
   - Enter your current weight and target weight (in kg)
   - Select your timeframe (4-24 weeks)
   - The app shows your weekly rate and warns if too aggressive
3. **Step 2 - About You**: Enter your personal stats
   - Select gender, enter height (cm), weight (kg), and age
   - Choose your activity level (sedentary to very active)
4. **Step 3 - Calorie Target**: Review and adjust your nutrition plan
   - See your calculated maintenance calories (TDEE)
   - Adjust daily calorie target and view deficit/surplus
   - Fine-tune protein, carbs, and fat macros
5. **Step 4 - Workout Plan**: Set your exercise goals
   - Select workout type (strength, cardio, mixed, HIIT, yoga)
   - Choose workouts per week (1-7)
   - Select minutes per workout (20-90)
6. **Step 5 - Before Photo**: Upload your starting point
   - Take or select a full body photo (background auto-removed)
   - Optionally add a headshot for better face matching
7. **Step 6 - Future You**: See your transformation preview
   - AI generates what you could look like after following your plan
   - View your personalized plan summary
   - Tap "Start Your Journey" to begin!

### Setting Up Your Future Photo
1. On the Home screen, tap the "See Your Future Self" card
2. Upload a **full body photo** showing your current physique
3. Upload a **headshot photo** for accurate facial feature matching (optional but recommended)
4. Enter your height, age, and select your gender
5. Choose your current body type and fitness level
6. Select your workout type and set your weekly frequency
7. Set your goal end date (when you want to achieve your transformation)
8. Tap "Generate Future Photo" to see your AI-predicted future self
9. Photo automatically updates every 7 days based on your actual progress

### Logging a Meal
1. From any tab screen, tap the large centered mic button in the tab bar
2. The button will turn red indicating recording is active
3. Describe your meal (e.g., "Grilled chicken breast with brown rice and broccoli")
4. You can say "yesterday" or "2 days ago" to log for a previous day
5. Tap again to stop recording
6. A confirmation popup appears showing:
   - The date to log for (auto-detected from your speech or defaults to today)
   - Detected ingredients with quantities
   - Nutrition summary (calories, protein, carbs, fat)
7. Edit any ingredient by tapping on it, delete wrong items, or add missing ones
8. Change the date if needed by tapping the date selector
9. Tap "Log Meal" to confirm and save

### Tracking Progress
1. Navigate to the "Progress" tab to see your journey
2. View weight trends on the chart
3. Check weekly nutrition statistics and consistency
4. Capture progress photos by selecting an angle (Front/Side/Back)
5. Take a new photo or choose from your gallery
6. Compare before and after photos side by side

### Setting Goals
1. Tap the account icon in the top right header
2. Select "Goals" from the Account menu
3. Tap on Current Weight or Target Weight to update
4. Tap the edit icon next to Nutrition Goals to customize daily targets
5. All changes are saved automatically

### Viewing Overall Progress
1. Check the Home Dashboard for daily progress
2. Use the Progress tab for weekly trends and photo comparisons
3. Review the Goals tab for weight tracking history

## Setup Requirements

### Environment Variables

You need to add the following API keys in the ENV tab of the Vibecode app:

1. **EXPO_PUBLIC_VIBECODE_ANTHROPIC_API_KEY** - Your Anthropic API key for Claude Sonnet
2. **EXPO_PUBLIC_VIBECODE_ELEVENLABS_API_KEY** - Your ElevenLabs API key for text-to-speech
3. **EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY** - Pre-configured for audio transcription
4. **EXPO_PUBLIC_VIBECODE_GOOGLE_API_KEY** - Google AI API key for Gemini 3 Pro Image (NANO-BANANA) - used for Future Photo generation and automatic background removal
5. **EXPO_PUBLIC_API_EDAMAM** - Edamam API key for accurate nutrition data lookup

### Getting API Keys

- **Anthropic (Claude)**: Sign up at https://console.anthropic.com/
- **ElevenLabs**: Sign up at https://elevenlabs.io/
- **Google AI (Gemini)**: Get your API key from https://aistudio.google.com/apikey
- **Edamam**: Sign up at https://developer.edamam.com/ for Nutrition Analysis API

## Notes

- **Do not upgrade `react-native-reanimated` past 3.x.** Reanimated 4 requires the
  `react-native-worklets` native module, which the preview client does not ship. Bundling it
  crashes at startup with `getPropertyAsObject: property '__UI_WORKLET_RUNTIME_HOLDER' is
  undefined`, which in turn prevents `AppRegistry.registerComponent` from running
  (`"main" has not been registered`). The version is pinned to `3.17.4` exactly.
- Requires microphone and audio permissions for voice features
- Requires camera and photo library permissions for progress photos
- Requires internet connection for AI processing
- All meal and goal data is stored locally on device
- Progress photos are stored locally on your device
- Voice responses use the "Rachel" voice from ElevenLabs by default (can be customized in src/api/elevenlabs.ts)

## Future Enhancements

Potential features for future updates:
- Meal editing and deletion
- Cloud sync for progress photos
- Weekly/monthly nutrition reports
- Export data to CSV
- Barcode scanning for packaged foods
- Recipe suggestions based on goals
- Integration with fitness trackers
- Custom voice selection for assistant
- Multi-language support
- Share progress photos with friends
- Body measurements tracking (waist, arms, etc.)
