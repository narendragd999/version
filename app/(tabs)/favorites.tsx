import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import GameReelsScreen from "./index";

export default function FavoritesScreen() {
  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <View style={{ flex: 1 }}>
        <GameReelsScreen favoritesOnly showHeaderFooter />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
