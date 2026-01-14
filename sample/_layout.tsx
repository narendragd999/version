// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useAuth } from "../../shared/AuthProvider";

export default function TabsLayout() {
  const { user, loading, role } = useAuth();

  if (loading) {
    return null; // Wait until Firebase resolves auth state
  }

  const isAdmin = role === "admin";

  console.log("Logged in user:", user?.email, "Role:", role);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favorites",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart" color={color} size={size} />
          ),
        }}
      />      
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" color={color} size={size} />
          ),
        }}
      />

      {/* ✅ Only admins see Games tab */}
      <Tabs.Screen
        name="Games"
        options={{
          title: "Games",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="game-controller-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          href: isAdmin ? "settings" : null, // hide for non-admin
        }}
      />

    </Tabs>
  );
}
