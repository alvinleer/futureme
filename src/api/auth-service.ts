const BACKEND_URL =
  process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000";

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

interface AuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: AuthUser;
  error?: string;
}

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path: string, token: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export const authService = {
  register: (email: string, password: string, name?: string): Promise<AuthResponse> =>
    post("/register", { email, password, name }),

  login: (email: string, password: string): Promise<AuthResponse> =>
    post("/login", { email, password }),

  /**
   * Prefer the ID token — the server can verify its signature. A bare access
   * token still works, but costs an extra round-trip to Google to prove the
   * token was issued to this app.
   */
  oauthGoogle: (
    params: { idToken?: string; accessToken?: string; name?: string; avatarUrl?: string; nonce?: string }
  ): Promise<AuthResponse> => post("/oauth", { provider: "google", ...params }),

  /**
   * `idToken` is Apple's signed identityToken. The server verifies it against
   * Apple's JWKS and takes the email and account id from the verified claims,
   * so nothing identifying is sent from here.
   */
  oauthApple: (params: { idToken: string; name?: string; nonce?: string }): Promise<AuthResponse> =>
    post("/oauth", { provider: "apple", ...params }),

  me: (token: string): Promise<{ user?: AuthUser; error?: string }> =>
    get("/me", token),

  applyCoupon: (code: string, token: string): Promise<{ success: boolean; message?: string; status?: string; error?: string }> =>
    post("/coupon", { code }, token),

  refresh: (refreshToken: string): Promise<AuthResponse> =>
    post("/refresh", { refreshToken }),

  logout: (refreshToken?: string): Promise<void> =>
    post("/logout", { refreshToken }),

  deleteAccount: (token: string): Promise<{ success: boolean; error?: string }> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    return fetch(`${BACKEND_URL}/api/auth/account`, { method: "DELETE", headers }).then((r) => r.json());
  },
};
