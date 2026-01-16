import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../shared/firebase";

import GameReelsScreen from "./index";

/* ================= TYPES ================= */

interface Game {
  id: string;
  title?: string;
}

/* ================= DEBOUNCE HOOK ================= */

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

/* ================= MAIN ================= */

export default function SearchScreen() {
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [query, setQuery] = useState("");

  const debouncedQuery = useDebounce(query, 400);

  /* ================= FETCH GAMES ================= */

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "games"), snap => {
      const list: Game[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Game, "id">),
      }));
      setAllGames(list);
    });

    return unsub;
  }, []);

  /* ================= FILTER ================= */

  const matchedGames = useMemo(() => {
    if (!debouncedQuery.trim()) return [];

    const q = debouncedQuery.toLowerCase();
    return allGames.filter(g =>
      g.title?.toLowerCase().includes(q)
    );
  }, [allGames, debouncedQuery]);

  const resultIds = matchedGames.map(g => g.id);
  const showEmpty =
    debouncedQuery.trim().length > 0 && resultIds.length === 0;

  /* ================= RENDER ================= */

  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      {/* SEARCH HEADER */}
      <View style={styles.searchHeader}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search games"
            placeholderTextColor="#999"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              hitSlop={10}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color="#999"
              />
            </TouchableOpacity>
          )}
        </View>

        {debouncedQuery.length > 0 && (
          <Text style={styles.resultText}>
            {matchedGames.length} result
            {matchedGames.length !== 1 ? "s" : ""} found
          </Text>
        )}
      </View>

      {/* EMPTY STATE */}
      {showEmpty ? (
        <View style={styles.empty}>
          <Ionicons
            name="search-outline"
            size={56}
            color="#bbb"
          />
          <Text style={styles.emptyTitle}>
            No games found
          </Text>
          <Text style={styles.emptyDesc}>
            Try searching with a different keyword
          </Text>

          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => setQuery("")}
          >
            <Text style={styles.clearText}>
              Clear search
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* RESULTS */
        resultIds.length > 0 && (
          <GameReelsScreen
            filterIds={resultIds}
            showHeaderFooter={false}
          />
        )
      )}
    </LinearGradient>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  /* HEADER */
  searchHeader: {
    paddingTop: "12%",
    paddingBottom: 8,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 14,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  input: {
    flex: 1,
    marginHorizontal: 10,
    fontSize: 15,
    color: "#333",
  },

  resultText: {
    marginLeft: 20,
    marginTop: 6,
    fontSize: 13,
    color: "#555",
  },

  /* EMPTY */
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 14,
  },

  emptyDesc: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    marginTop: 6,
  },

  clearBtn: {
    marginTop: 18,
    backgroundColor: "#6a11cb",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },

  clearText: {
    color: "#fff",
    fontWeight: "600",
  },
});
