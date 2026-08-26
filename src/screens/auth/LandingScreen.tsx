import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { authService } from "../../api/auth-service";
import { useAuthStore } from "../../state/authStore";
import { colors } from "../../theme";
import type { RootStackParamList } from "../../navigation/RootNavigator";

WebBrowser.maybeCompleteAuthSession();

// Must match one of the audiences in the backend's GOOGLE_CLIENT_IDS.
const GOOGLE_IOS_CLIENT_ID = "786920975006-nnscr630340ien378bngimvp3nhmp0f8.apps.googleusercontent.com";
// Google's iOS OAuth clients only ever accept the reversed-client-ID scheme as
// a native redirect — expo-auth-session defaults to the app's bundle ID
// scheme instead, which Google rejects with "redirect_uri_mismatch". This
// scheme is also registered under ios.infoPlist.CFBundleURLTypes in app.json.
const GOOGLE_REDIRECT_URI = "com.googleusercontent.apps.786920975006-nnscr630340ien378bngimvp3nhmp0f8:/oauthredirect";

const { width, height } = Dimensions.get("window");

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"login" | "signup">("signup");
  const [error, setError] = useState<string | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken = googleResponse.authentication?.idToken ?? googleResponse.params.id_token;
      if (idToken) {
        finishGoogleSignIn(idToken);
      } else {
        setError("Google did not return a sign-in token. Please try again.");
        setGoogleLoading(false);
      }
    } else if (googleResponse?.type === "error") {
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    } else if (googleResponse?.type === "cancel" || googleResponse?.type === "dismiss") {
      setGoogleLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  async function finishGoogleSignIn(idToken: string) {
    try {
      const result = await authService.oauthGoogle({ idToken });
      if (result.token && result.refreshToken && result.user) {
        setAuth(result.token, result.refreshToken, result.user);
      } else {
        setError(result.error ?? "Google sign-in failed.");
      }
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGooglePress() {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type !== "success") {
        setGoogleLoading(false);
      }
    } catch {
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  }

  function openModal(mode: "login" | "signup") {
    setError(null);
    setModalMode(mode);
    setModalVisible(true);
  }

  function handleEmailPress() {
    setModalVisible(false);
    navigation.navigate(modalMode === "login" ? "Login" : "Signup");
  }

  async function handleApplePress() {
    setError(null);
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const name = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
        : undefined;

      // Apple only returns the identityToken on a successful authorization.
      // It is the only thing the server will trust: the email and account id
      // are read from its verified claims, not from anything we send.
      if (!credential.identityToken) {
        setError("Apple did not return a sign-in token. Please try again.");
        return;
      }

      const result = await authService.oauthApple({
        idToken: credential.identityToken,
        name: name || undefined,
      });
      if (result.token && result.refreshToken && result.user) {
        setAuth(result.token, result.refreshToken, result.user);
      } else {
        setError(result.error ?? "Apple sign-in failed.");
      }
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        setError("Apple sign-in failed. Please try again.");
      }
    } finally {
      setAppleLoading(false);
    }
  }

  const isLogin = modalMode === "login";

  return (
    <View style={styles.root}>
      <Image source={require("../../../assets/futureme-finish.png")} style={styles.hero} resizeMode="cover" />
      <View style={styles.purpleTint} />

      <LinearGradient colors={["rgba(30,32,106,0.55)", "transparent"]} locations={[0, 0.35]} style={styles.topScrim} />
      <LinearGradient colors={["transparent", "rgba(10,10,20,0.65)", "rgba(5,5,12,0.95)"]} locations={[0.28, 0.58, 1]} style={styles.bottomScrim} />

      <View style={[styles.logoRow, { top: insets.top + 8 }]}>
        <Image source={require("../../../icon.png")} style={styles.logoIcon} />
        <Text style={styles.logoText}>FutureMe</Text>
      </View>

      <View style={styles.thumbFrame}>
        <Image source={require("../../../assets/futureme-thumb.png")} style={styles.thumbImage} resizeMode="cover" />
      </View>

      <View style={[styles.bottomText, { paddingBottom: insets.bottom + 180 }]}>
        <Text style={styles.headlineBold}>Discover your</Text>
        <Text style={styles.headlineAccent}>future self</Text>
        <Text style={styles.sub}>{"Track calories in seconds with your voice – and see live what you'll look like based on recent progress!"}</Text>
      </View>

      <View style={[styles.ctaContainer, { bottom: insets.bottom + 24 }]}>
        <Pressable style={styles.getStartedBtn} onPress={() => openModal("signup")}>
          <Text style={styles.getStartedText}>Get started</Text>
        </Pressable>
        <Pressable style={styles.loginBtn} onPress={() => openModal("login")}>
          <Text style={styles.loginText}>Sign in</Text>
        </Pressable>
      </View>

      <View style={[styles.pageIndicator, { bottom: insets.bottom + 8 }]} />

      {/* Method picker bottom sheet modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]} onPress={() => {}}>
            {/* Handle */}
            <View style={styles.handle} />

            <Text style={styles.sheetTitle}>
              {isLogin ? "Welcome back" : "Create your account"}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {isLogin ? "How would you like to sign in?" : "How would you like to get started?"}
            </Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
                <Text selectable style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => setError(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color="#dc2626" />
                </Pressable>
              </View>
            )}

            {/* Apple button */}
            <Pressable onPress={handleApplePress} disabled={appleLoading || googleLoading} style={{ height: 54, borderRadius: 27, backgroundColor: "#000", marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: appleLoading || googleLoading ? 0.7 : 1 }}>
              {appleLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="logo-apple" size={20} color="#fff" />
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Continue with Apple</Text>
                  </>
              }
            </Pressable>

            {/* Google button */}
            <Pressable onPress={handleGooglePress} disabled={!googleRequest || appleLoading || googleLoading} style={{ height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: "#e5e7eb", backgroundColor: "#fff", marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: appleLoading || googleLoading ? 0.7 : 1 }}>
              {googleLoading
                ? <ActivityIndicator size="small" color="#1f2937" />
                : <>
                    <Ionicons name="logo-google" size={18} color="#1f2937" />
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#1f2937" }}>Continue with Google</Text>
                  </>
              }
            </Pressable>

            {/* Email button */}
            <Pressable onPress={handleEmailPress} disabled={appleLoading || googleLoading}>
              <View style={{ height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: "#FF6A00", backgroundColor: "#FF6A00", marginBottom: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: appleLoading || googleLoading ? 0.7 : 1 }}>
                <Ionicons name="mail-outline" size={18} color="#fff" />
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Continue with Email</Text>
              </View>
            </Pressable>

            {/* Switch mode */}
            <View style={styles.switchRow}>
              <Text style={styles.switchGray}>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </Text>
              <Pressable onPress={() => setModalMode(isLogin ? "signup" : "login")}>
                <Text style={styles.switchLink}>{isLogin ? "Sign Up" : "Sign In"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  hero: { position: "absolute", top: 0, left: 0, width, height },
  purpleTint: { position: "absolute", top: 0, left: 0, width, height, backgroundColor: "rgba(30,32,106,0.28)" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 180 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.68 },
  logoRow: { position: "absolute", left: 20, flexDirection: "row", alignItems: "center", gap: 10, zIndex: 10 },
  logoIcon: { width: 34, height: 34, borderRadius: 10 },
  logoText: { fontSize: 20, fontWeight: "800", fontFamily: "Inter_800ExtraBold", color: "#fff", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  bottomText: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 28, zIndex: 10 },
  headlineBold: { fontSize: 48, fontFamily: "Inter_800ExtraBold", color: "#fff", lineHeight: 54, letterSpacing: -1.5 },
  headlineAccent: { fontSize: 48, fontFamily: "Inter_800ExtraBold", color: colors.brandPurpleMid, lineHeight: 54, letterSpacing: -1.5, marginBottom: 10 },
  sub: { fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 22 },
  thumbFrame: { position: "absolute", bottom: height * 0.35, right: 24, width: 130, height: 220, borderRadius: 20, overflow: "hidden", borderWidth: 2.5, borderColor: "rgba(255,255,255,0.85)", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12, zIndex: 10 },
  thumbImage: { width: "100%", height: "100%" },
  ctaContainer: { position: "absolute", left: 28, right: 28, gap: 12, zIndex: 20 },
  getStartedBtn: { backgroundColor: colors.brandPurpleMid, borderRadius: 999, paddingVertical: 18, alignItems: "center" },
  getStartedText: { color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  loginBtn: { borderRadius: 999, paddingVertical: 16, alignItems: "center", backgroundColor: "rgba(20,20,28,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  loginText: { color: "rgba(255,255,255,0.9)", fontSize: 17, fontWeight: "600", letterSpacing: 0.3 },
  pageIndicator: { position: "absolute", left: "50%", marginLeft: -18, width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", zIndex: 20 },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 14 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#d1d5db", alignSelf: "center", marginBottom: 24 },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center", marginBottom: 4 },
  sheetSubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 16 },
  errorText: { flex: 1, fontSize: 13, color: "#dc2626", lineHeight: 18 },
  btn: { borderRadius: 27, borderWidth: 1.5, marginBottom: 12, height: 54, overflow: "hidden" },
  btnInner: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleBtn: { backgroundColor: "#fff", borderColor: "#d1d5db" },
  emailBtn: { backgroundColor: "#FF6A00", borderColor: "#FF6A00" },
  googleBtnText: { fontSize: 16, fontWeight: "600", color: "#1f2937" },
  emailBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  switchRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 4 },
  switchGray: { fontSize: 14, color: "#9ca3af" },
  switchLink: { fontSize: 14, fontWeight: "600", color: "#FF6A00" },
});
