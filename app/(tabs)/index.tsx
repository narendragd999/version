import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import PagerView from "react-native-pager-view";
import { WebView } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Linking from "expo-linking";

import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  setDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../shared/firebase";
import { useAuth } from "../../shared/AuthProvider";

const { height } = Dimensions.get("window");

/* ================= PROPS ================= */
interface Props {
  favoritesOnly?: boolean;
  filterIds?: string[];          // for Search page
  showHeaderFooter?: boolean;
}

/* ================= TYPES ================= */
interface Game {
  id: string;
  url: string;
  playTime?: number;
  likeCount?: number;
  commentCount?: number;
}

interface Comment {
  id: string;
  text: string;
  parentId: string | null;
}

/* ================= UTILS ================= */
const formatCount = (n = 0) =>
  n < 1000 ? `${n}` : n < 1e6 ? `${(n / 1000).toFixed(1)}K` : `${(n / 1e6).toFixed(1)}M`;

/* ================= REEL PAGE ================= */
const ReelPage = ({
  url,
  mount,
  onVisible,
}: {
  url: string;
  mount: boolean;
  onVisible: () => void;
}) =>
  mount ? (
    <WebView
      source={{ uri: url }}
      style={{ flex: 1 }}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      onLoadEnd={onVisible}
    />
  ) : (
    <View style={{ flex: 1, backgroundColor: "#000" }} />
  );

/* ================= MAIN SCREEN ================= */
export default function GameReelsScreen({
  favoritesOnly = false,
  filterIds,
  showHeaderFooter = true,
}: Props) {
  const pagerRef = useRef<PagerView>(null);
  const { user } = useAuth();

  /* ---------- CORE STATE ---------- */
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);

  const [liked, setLiked] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [commentOpen, setCommentOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");

  const playStartRef = useRef<number | null>(null);

  const likeScale = useSharedValue(1);
  const countScale = useSharedValue(1);

  /* ---------- SAFE DERIVED LIST ---------- */
  const games = useMemo(() => {
    let list = [...allGames];

    if (favoritesOnly) {
      list = list.filter(g => favorites.includes(g.id));
    }

    if (filterIds && filterIds.length > 0) {
      list = list.filter(g => filterIds.includes(g.id));
    }

    list.sort((a, b) => (b.playTime || 0) - (a.playTime || 0));
    return list;
  }, [allGames, favoritesOnly, favorites, filterIds]);

  useEffect(() => {
    if (page >= games.length && games.length > 0) {
      setPage(games.length - 1);
    }
  }, [games.length]);


  const currentGame = games[page] ?? null;

  /* ================= USER PREFS ================= */
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "userPreferences", user.uid), snap => {
      const d = snap.data() || {};
      setLiked(d.likedGames || []);
      setFavorites(d.favorites || []);
    });
  }, [user]);

  /* ================= FETCH ALL GAMES ================= */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "games"), snap => {
      const list: Game[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Game, "id">),
      }));
      setAllGames(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  /* ================= PLAYTIME ================= */
  const startTimer = () => {
    if (!currentGame) return;
    playStartRef.current = Date.now();
  };

  const stopTimer = async () => {
    if (!user || !currentGame || !playStartRef.current) return;
    const sec = Math.floor((Date.now() - playStartRef.current) / 1000);
    playStartRef.current = null;
    await updateDoc(doc(db, "games", currentGame.id), {
      playTime: increment(sec),
    }).catch(() => {});
  };

  /* ================= LIKE ================= */
  const handleLike = async () => {
    if (!user || !currentGame) return;

    likeScale.value = withSpring(1.3);
    countScale.value = withSpring(1.25, {}, () => {
      countScale.value = withSpring(1);
    });

    const isLiked = liked.includes(currentGame.id);
    const updated = isLiked
      ? liked.filter(i => i !== currentGame.id)
      : [...liked, currentGame.id];

    setLiked(updated);

    await setDoc(
      doc(db, "userPreferences", user.uid),
      { likedGames: updated },
      { merge: true }
    );

    await updateDoc(doc(db, "games", currentGame.id), {
      likeCount: increment(isLiked ? -1 : 1),
    }).catch(() => {});
  };

  const likeAnim = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const countAnim = useAnimatedStyle(() => ({
    transform: [{ scale: countScale.value }],
  }));


  
  /* ================= Create dynamic deep link ================= */
  const shareGame = () => {
    if (!currentGame) return;

    const url = Linking.createURL("game", {
      queryParams: { id: currentGame.id },
    });

    Share.share({
      message: `🎮 Play this game\n${url}`,
    });
  };


  /* ================= FAVORITE ================= */
  const toggleFavorite = async () => {
    if (!user || !currentGame) return;

    const removing = favorites.includes(currentGame.id);

    const updated = removing
      ? favorites.filter(i => i !== currentGame.id)
      : [...favorites, currentGame.id];

    // 1️⃣ Update UI immediately
    setFavorites(updated);

    // 2️⃣ If in favorites screen & removing current item → move page safely
    if (favoritesOnly && removing) {
      setPage(p => Math.max(0, p - 1));
    }

    // 3️⃣ Persist to Firestore
    await setDoc(
      doc(db, "userPreferences", user.uid),
      { favorites: updated },
      { merge: true }
    );
  };


  /* ================= COMMENTS ================= */
  useEffect(() => {
    if (!commentOpen || !currentGame) return;
    return onSnapshot(
      collection(db, "games", currentGame.id, "comments"),
      snap =>
        setComments(
          snap.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<Comment, "id">),
          }))
        )
    );
  }, [commentOpen, currentGame?.id]);

  const sendComment = async () => {
    if (!user || !currentGame || !text.trim()) return;

    await addDoc(
      collection(db, "games", currentGame.id, "comments"),
      {
        text: text.trim(),
        parentId: null,
        createdAt: serverTimestamp(),
      }
    );

    await updateDoc(doc(db, "games", currentGame.id), {
      commentCount: increment(1),
    }).catch(() => {});

    setText("");
  };

  /* ================= DEEP LINK ================= */
  useEffect(() => {
    const handler = ({ url }: any) => {
      const { queryParams } = Linking.parse(url);
      if (!queryParams?.id) return;
      const index = games.findIndex(g => g.id === queryParams.id);
      if (index >= 0) {
        pagerRef.current?.setPage(index);
        setPage(index);
      }
    };

    const sub = Linking.addEventListener("url", handler);
    Linking.getInitialURL().then(url => url && handler({ url }));
    return () => sub.remove();
  }, [games]);

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6a11cb" />
      </View>
    );
  }

  if (!currentGame) {
    return (
      <View style={styles.center}>
        <Text>No games found</Text>
      </View>
    );
  }

  /* ================= RENDER ================= */
  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      {showHeaderFooter && (
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {favoritesOnly ? "❤️ My Favorites" : "🎮 Brainsta"}
          </Text>
        </View>
      )}

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        orientation="vertical"
        scrollEnabled={!paused}
        onPageSelected={e => {
          stopTimer();
          setPage(e.nativeEvent.position);
        }}
      >
        {games.map((g, i) => (
          <View key={g.id} style={{ flex: 1 }}>
            <ReelPage
              url={g.url}
              mount={i === page || i === page + 1 || page === 0}
              onVisible={startTimer}
            />
          </View>
        ))}
      </PagerView>

      {/* RIGHT ACTION STACK */}
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.iconWrap} onPress={() => setPaused(p => !p)}>
          <Ionicons name={paused ? "play" : "pause"} size={28} color="#6a11cb" />
        </TouchableOpacity>

        <Animated.View style={[styles.iconWrap, likeAnim]}>
          <TouchableOpacity onPress={handleLike}>
            <Ionicons
              name={liked.includes(currentGame.id) ? "heart" : "heart-outline"}
              size={28}
              color="#6a11cb"
            />
          </TouchableOpacity>
          <Animated.Text style={[styles.count, countAnim]}>
            {formatCount(currentGame.likeCount)}
          </Animated.Text>
        </Animated.View>

        <TouchableOpacity style={styles.iconWrap} onPress={toggleFavorite}>
          <Ionicons
            name={
              favorites.includes(currentGame.id)
                ? "bookmark"
                : "bookmark-outline"
            }
            size={26}
            color="#6a11cb"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconWrap}
          onPress={() => setCommentOpen(true)}
        >
          <Ionicons name="chatbubble-outline" size={26} color="#6a11cb" />
          <Text style={styles.count}>
            {formatCount(currentGame.commentCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconWrap} onPress={shareGame}>
          <Ionicons
            name="share-social-outline"
            size={26}
            color="#6a11cb"
          />
        </TouchableOpacity> 

      </View>

      {showHeaderFooter && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Brainsta
          </Text>
        </View>
      )}

      {/* COMMENTS MODAL */}
      <Modal visible={commentOpen} animationType="slide">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Comments</Text>
          <ScrollView>
            {comments.map(c => (
              <Text key={c.id} style={styles.comment}>
                {c.text}
              </Text>
            ))}
          </ScrollView>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a comment…"
            style={styles.input}
          />

          <TouchableOpacity style={styles.send} onPress={sendComment}>
            <Text style={{ color: "#fff" }}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setCommentOpen(false)}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </LinearGradient>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { paddingTop: "10%", alignItems: "center" },
  headerText: { color: "#fff", fontSize: 20, fontWeight: "bold" },

  footer: { height: 20, alignItems: "center", justifyContent: "center" },
  footerText: { color: "#fff", fontSize: 14 },

  overlay: {
    position: "absolute",
    right: 10,
    top: height * 0.25,
    alignItems: "center",
  },

  iconWrap: {
    alignItems: "center",
    marginVertical: 10,
  },

  count: { fontSize: 12, color: "#333", marginTop: 2 },

  modal: { flex: 1, padding: 16, backgroundColor: "#fff" },
  modalTitle: { fontSize: 18, fontWeight: "bold" },
  comment: { paddingVertical: 6 },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  send: {
    backgroundColor: "#6a11cb",
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
  },
  close: { marginTop: 10, color: "#6a11cb", textAlign: "center" },
});
