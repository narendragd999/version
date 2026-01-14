// app/(tabs)/favorites.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import GameReelsScreen from "./index";

export default function FavoritesScreen() {
  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      {/* Header (same as index) */}
      <View style={styles.header}>
        <Text style={styles.headerText}>❤️ My Favorites</Text>
      </View>

      {/* Main Content → only favorites */}
      <View style={{ flex: 1 }}>
        <GameReelsScreen favoritesOnly showHeaderFooter={false} />
      </View>

      {/* Footer (same as index) */}
      <LinearGradient colors={["#6a11cb", "#6a11cb"]} style={styles.footer}>
        <Text style={styles.footerText}>© 2025 Brainsta</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: "10%", // match index.tsx
  },
  headerText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  footer: {
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  footerText: { color: "#fff", fontSize: 14 },
});
