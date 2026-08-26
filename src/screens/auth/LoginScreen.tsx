import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../../api/auth-service";
import { useAuthStore } from "../../state/authStore";
import type { RootStackParamList } from "../../navigation/RootNavigator";

const { width, height } = Dimensions.get("window");

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const result = await authService.login(email.trim().toLowerCase(), password);
      if (result.token && result.refreshToken && result.user) {
        setAuth(result.token, result.refreshToken, result.user);
      } else {
        setError(result.error ?? "Invalid email or password.");
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Image
        source={require("../../../assets/futureme-finish.png")}
        style={styles.hero}
        resizeMode="cover"
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.5)", "transparent"]}
        locations={[0, 0.35]}
        style={styles.topScrim}
      />

      <View style={[styles.logoRow, { top: insets.top + 8 }]}>
        <Text style={styles.logoText}>FutureMe</Text>
      </View>

      <Pressable
        style={[styles.backBtn, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </Pressable>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.title}>{"Sign in with email"}</Text>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#dc2626" />
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            placeholderTextColor="#c4caca"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            cursorColor="#FF6A00"
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#c4caca"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            cursorColor="#FF6A00"
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color="#b0b8b8"
            />
          </Pressable>
        </View>

        <Pressable
          style={[styles.loginBtn, loading && { opacity: 0.6 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.loginBtnText}>Sign In</Text>
          }
        </Pressable>

        <View style={styles.signupRow}>
          <Text style={styles.signupGray}>{"Don't have an account? "}</Text>
          <Pressable onPress={() => navigation.navigate("Landing")}>
            <Text style={styles.signupLink}>Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 1,
  },
  logoRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  logoText: {
    fontSize: 26,
    fontFamily: "Pacifico-Regular",
    color: "#ffffff",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  backBtn: {
    position: "absolute",
    left: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: height * 0.75,
    zIndex: 5,
  },
  sheetContent: {
    paddingHorizontal: 28,
    paddingTop: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111111",
    lineHeight: 33,
    letterSpacing: -0.4,
    textAlign: "center",
    marginBottom: 24,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(220,38,38,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.15)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  errorText: { flex: 1, fontSize: 13, color: "#dc2626", lineHeight: 18 },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333333",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.2,
    borderColor: "#e2e8e8",
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    height: 52,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111111",
    height: 52,
    paddingVertical: 0,
  },
  eyeBtn: { padding: 6 },
  loginBtn: {
    backgroundColor: "#FF6A00",
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    marginTop: 8,
  },
  loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  signupGray: { fontSize: 14, color: "#9ca3af" },
  signupLink: { fontSize: 14, color: "#FF6A00", fontWeight: "600" },
});
