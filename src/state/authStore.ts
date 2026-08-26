import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  authProvider: string;
  subscriptionStatus: "trial" | "active" | "cancelled" | "lifetime";
  trialEndsAt: string;
  isSubscribed: boolean;
  createdAt: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => void;
  setToken: (token: string, refreshToken: string) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token, refreshToken, user) =>
        set({ token, refreshToken, user, isAuthenticated: true }),

      setToken: (token, refreshToken) =>
        set({ token, refreshToken }),

      updateUser: (user) =>
        set({ user }),

      logout: () =>
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
