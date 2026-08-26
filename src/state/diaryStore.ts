import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DiaryCategory = "diet" | "workout" | "progress" | "general";

export interface DiaryEntry {
  id: string;
  text: string;
  category: DiaryCategory;
  timestamp: number;
  durationSec: number;
}

interface DiaryStore {
  entries: DiaryEntry[];
  addEntry: (entry: Omit<DiaryEntry, "id" | "timestamp">) => void;
  deleteEntry: (id: string) => void;
}

const useDiaryStore = create<DiaryStore>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) => {
        const newEntry: DiaryEntry = {
          ...entry,
          id: `diary_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          timestamp: Date.now(),
        };
        set((state) => ({ entries: [newEntry, ...state.entries] }));
      },

      deleteEntry: (id) => {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
      },
    }),
    {
      name: "diary-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useDiaryStore;
