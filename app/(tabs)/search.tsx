// app/(tabs)/search.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Keyboard,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../shared/firebase";
import { useAuth } from "../../shared/AuthProvider";
import GameReelsScreen from "./index";

export default function SearchScreen() {
  const { user } = useAuth();
  const [queryText, setQueryText] = useState("");
  const [games, setGames] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filteredGames, setFilteredGames] = useState<any[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<any[]>([]);
  const [selectedGames, setSelectedGames] = useState<any[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [searchActive, setSearchActive] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const searchHeight = useRef(new Animated.Value(50)).current;

  // Load all games & categories once
  useEffect(() => {
    const gq = query(collection(db, "games"), where("published", "==", true));
    const uq = query(collection(db, "categories"));

    const unsubGames = onSnapshot(gq, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setGames(data);
    });

    const unsubCategories = onSnapshot(uq, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(data);
    });

    return () => {
      unsubGames();
      unsubCategories();
    };
  }, []);

  // Filter suggestions as user types
  useEffect(() => {
    const text = queryText.toLowerCase();
    if (!text) {
      setFilteredGames([]);
      setFilteredCategories([]);
      setSelectedSuggestionIndex(-1);
      return;
    }

    const gameSuggestions = games.filter((g) =>
      g.title?.toLowerCase().includes(text)
    );
    const categorySuggestions = categories.filter((c) =>
      c.name?.toLowerCase().includes(text)
    );

    setFilteredGames(gameSuggestions);
    setFilteredCategories(categorySuggestions);
    setSelectedSuggestionIndex(-1);
  }, [queryText, games, categories]);

  // Select a game
  const handleSelectGame = (game: any) => {
    setSelectedGames([game]);
    clearSuggestions();
    setQueryText(game.title);
    setSearchActive(false); // hide suggestions
    Keyboard.dismiss();
    animateSearchBox(false);
  };

  // Select a category
  const handleSelectCategory = (categoryId: string) => {
    const gamesInCategory = games.filter((g) => g.categoryId === categoryId);
    setSelectedGames(gamesInCategory);
    clearSuggestions();
    const cat = categories.find((c) => c.id === categoryId);
    setQueryText(cat?.name || "");
    setSearchActive(false); // hide suggestions
    Keyboard.dismiss();
    animateSearchBox(false);
  };

  const clearSuggestions = () => {
    setFilteredGames([]);
    setFilteredCategories([]);
    setSelectedSuggestionIndex(-1);
  };

  // Typing starts
  const handleChangeText = (text: string) => {
    setQueryText(text);
    setSearchActive(true); // show suggestions
    if (!searchActive) animateSearchBox(true); // expand if hidden
  };

  // Highlight matched text
  const highlightText = (text: string) => {
    const regex = new RegExp(`(${queryText})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) => (
      <Text
        key={i}
        style={part.toLowerCase() === queryText.toLowerCase() ? styles.highlight : {}}
      >
        {part}
      </Text>
    ));
  };

  const totalSuggestions = filteredGames.length + filteredCategories.length;

  // Keyboard navigation
  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (totalSuggestions === 0) return;
    if (e.nativeEvent.key === "ArrowDown") {
      let nextIndex = selectedSuggestionIndex + 1;
      if (nextIndex >= totalSuggestions) nextIndex = 0;
      setSelectedSuggestionIndex(nextIndex);
      scrollToIndex(nextIndex);
    }
    if (e.nativeEvent.key === "ArrowUp") {
      let prevIndex = selectedSuggestionIndex - 1;
      if (prevIndex < 0) prevIndex = totalSuggestions - 1;
      setSelectedSuggestionIndex(prevIndex);
      scrollToIndex(prevIndex);
    }
    if (e.nativeEvent.key === "Enter" && selectedSuggestionIndex >= 0) {
      if (selectedSuggestionIndex < filteredGames.length)
        handleSelectGame(filteredGames[selectedSuggestionIndex]);
      else
        handleSelectCategory(
          filteredCategories[selectedSuggestionIndex - filteredGames.length].id
        );
    }
  };

  const scrollToIndex = (index: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ y: index * 50, animated: true }); // 50 = item height
  };

  const animateSearchBox = (expand: boolean) => {
    Animated.timing(searchHeight, {
      toValue: expand ? 50 : 40,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>🎮 Brainsta Games</Text>
      </View>

      <View style={styles.searchOverlay}>
        <Animated.View style={[styles.searchBar, { height: searchHeight }]}>
          <TextInput
            placeholder={searchActive ? "Search games or categories" : ""}
            value={queryText}
            onChangeText={handleChangeText}
            style={styles.input}
            onKeyPress={handleKeyPress}
          />
          <Ionicons name="search" size={24} color="#6a11cb" />
        </Animated.View>

        {/* Suggestions only show while searching */}
        {searchActive && (filteredGames.length > 0 || filteredCategories.length > 0) && (
          <ScrollView ref={scrollRef} style={styles.suggestions}>
            {filteredGames.map((g, idx) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.suggestionItem,
                  idx === selectedSuggestionIndex && styles.suggestionActive,
                ]}
                onPress={() => handleSelectGame(g)}
              >
                <Text style={styles.suggestionText}>🎮 {highlightText(g.title)}</Text>
              </TouchableOpacity>
            ))}
            {filteredCategories.map((c, idx) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.suggestionItem,
                  idx + filteredGames.length === selectedSuggestionIndex &&
                    styles.suggestionActive,
                ]}
                onPress={() => handleSelectCategory(c.id)}
              >
                <Text style={styles.suggestionText}>📂 {highlightText(c.name)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        {selectedGames.length > 0 ? (
          <GameReelsScreen
            filterIds={selectedGames.map((g) => g.id)}
            showHeaderFooter={false}
          />
        ) : queryText ? (
          <Text style={styles.noResults}>No results found</Text>
        ) : null}
      </View>

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
    paddingTop: "10%",
  },
  headerText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  searchOverlay: {
    position: "absolute",
    top: "5%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    width: "90%",
    borderRadius: 10,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  input: { flex: 1, height: 40 },
  suggestions: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 250,
    elevation: 4,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    height: 50,
    justifyContent: "center",
  },
  suggestionText: { fontSize: 16 },
  suggestionActive: { backgroundColor: "#e0e0ff" },
  highlight: { fontWeight: "bold", color: "#6a11cb" },
  noResults: {
    textAlign: "center",
    fontSize: 16,
    color: "#666",
    alignSelf: "center",
  },
  footer: {
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  footerText: { color: "#fff", fontSize: 14 },
});
