/**
 * In-memory LRU cache for resolved food nutrition items.
 * Key: normalized_query + quantity  →  prevents redundant API calls.
 * TTL: 24 hours per entry. Max 200 entries.
 */

import { ResolvedFoodItem } from "./nutrition-types";

interface CacheEntry {
  item: ResolvedFoodItem;
  timestamp: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 200;

const cache = new Map<string, CacheEntry>();

export const getCacheKey = (query: string, quantity: number): string => {
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, " ");
  const roundedQty = Math.round(quantity * 10) / 10;
  return `${normalizedQuery}:${roundedQty}`;
};

export const getFromCache = (query: string, quantity: number): ResolvedFoodItem | null => {
  const key = getCacheKey(query, quantity);
  const entry = cache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.item;
};

export const setInCache = (query: string, quantity: number, item: ResolvedFoodItem): void => {
  // Evict the oldest entry when at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  const key = getCacheKey(query, quantity);
  cache.set(key, { item, timestamp: Date.now() });
};

export const clearNutritionCache = (): void => {
  cache.clear();
};

export const getCacheStats = (): { size: number; keys: string[] } => ({
  size: cache.size,
  keys: Array.from(cache.keys()),
});
