/**
 * Stable anonymous device ID persisted to AsyncStorage.
 * Used as the `user_id` for preference learning without requiring sign-in.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "vibecode_device_id";
let _cached: string | null = null;

const generateId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const getDeviceId = async (): Promise<string> => {
  if (_cached) return _cached;

  let id = await AsyncStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generateId();
    await AsyncStorage.setItem(STORAGE_KEY, id);
  }

  _cached = id;
  return id;
};
