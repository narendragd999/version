// app/_layout.tsx
import { Slot, useRootNavigationState, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import AuthProvider, { useAuth } from "../shared/AuthProvider";
import Toast from "react-native-toast-message";

function AppRouterGuard() {
  const { user, loading, forcedLogout } = useAuth();
  const router = useRouter();
  const navState = useRootNavigationState();

  // When user or loading changes, once navigation is ready, force the route
  useEffect(() => {
    if (!navState?.key) return; // wait for navigation to be ready
    if (loading) return;

    if (!user) {
      // no user -> go to auth group signup
      router.replace("/(auth)/signup");
    } else {
      // user exists -> go to tabs (home)
      router.replace("/(tabs)");
    }
  }, [user, loading, navState?.key, forcedLogout]);

  // Splash while resolving
  if (loading || !navState?.key) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0F3B8C" />
      </View>
    );
  }

  return <Slot />; // render nested routes (auth or tabs)
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppRouterGuard />
      <Toast /> 
    </AuthProvider>
  );
}
