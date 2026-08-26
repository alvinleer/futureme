/**
 * Access tokens expire after 15 minutes (see backend/src/routes/auth.ts).
 * Any authenticated call made after that point gets a bare 401 "Unauthorized"
 * unless it refreshes and retries. This wraps `fetch` to do that once,
 * transparently, before giving up.
 */
import { useAuthStore } from "../state/authStore";
import { authService } from "./auth-service";

export async function fetchWithAuthRefresh(url: string, init: RequestInit): Promise<Response> {
  const buildHeaders = (token: string) => ({
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  });

  const { token, refreshToken } = useAuthStore.getState();
  if (!token) throw new Error("Not authenticated.");

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });
  if (res.status !== 401 || !refreshToken) return res;

  const refreshed = await authService.refresh(refreshToken);
  if (!refreshed.success || !refreshed.token || !refreshed.refreshToken) {
    useAuthStore.getState().logout();
    throw new Error("Your session expired. Please log in again.");
  }
  useAuthStore.getState().setToken(refreshed.token, refreshed.refreshToken);

  res = await fetch(url, { ...init, headers: buildHeaders(refreshed.token) });
  return res;
}
