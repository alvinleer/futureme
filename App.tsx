import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import RootNavigator from "./src/navigation/RootNavigator";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from "react-native";
import React, { Component, useEffect, useState } from "react";
import { useAuthStore } from "./src/state/authStore";
import useDietStore from "./src/state/dietStore";
import useOnboardingStore from "./src/state/onboardingStore";
import useFuturePhotoStore from "./src/state/futurePhotoStore";

/*
IMPORTANT NOTICE: DO NOT REMOVE
There are already environment keys in the project.
Before telling the user to add them, check if you already have access to the required keys through bash.
Directly access them with process.env.${key}

Correct usage:
process.env.EXPO_PUBLIC_VIBECODE_{key}
//directly access the key

Incorrect usage:
import { OPENAI_API_KEY } from '@env';
//don't use @env, its depreicated

Incorrect usage:
import Constants from 'expo-constants';
const openai_api_key = Constants.expoConfig.extra.apikey;
//don't use expo-constants, its depreicated

*/

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{this.state.errorMessage}</Text>
          <Pressable style={styles.errorButton} onPress={this.handleReset}>
            <Text style={styles.errorButtonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function useStoresHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const checkAll = () => {
      if (
        useAuthStore.persist.hasHydrated() &&
        useDietStore.persist.hasHydrated() &&
        useOnboardingStore.persist.hasHydrated() &&
        useFuturePhotoStore.persist.hasHydrated()
      ) {
        setHydrated(true);
      }
    };

    const unsub1 = useAuthStore.persist.onFinishHydration(checkAll);
    const unsub2 = useDietStore.persist.onFinishHydration(checkAll);
    const unsub3 = useOnboardingStore.persist.onFinishHydration(checkAll);
    const unsub4 = useFuturePhotoStore.persist.onFinishHydration(checkAll);

    // Check immediately in case stores are already hydrated
    checkAll();

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  return hydrated;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_800ExtraBold,
    "Pacifico-Regular": require("./assets/fonts/Pacifico-Regular.ttf"),
  });

  const storesHydrated = useStoresHydrated();

  if (!fontsLoaded || !storesHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#121212" }}>
        <ActivityIndicator size="large" color="#F8652F" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  errorButton: {
    backgroundColor: "#F8652F",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
