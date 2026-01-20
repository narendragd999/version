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
import { useAppConfig } from "../../shared/useAppConfig";

const { height } = Dimensions.get("window");

/* ================= TYPES ================= */
interface Props {
  favoritesOnly?: boolean;
  filterIds?: string[];
  showHeaderFooter?: boolean;
}

interface Game {
  id: string;
  title?: string;
  url: string;
  playTime?: number;
  likeCount?: number;
  commentCount?: number;
  createdAt?: any;
}

interface Comment {
  id: string;
  text: string;
  parentId: string | null;
  userInitials?: string;
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

/* ================= MAIN ================= */
export default function GameReelsScreen({
  favoritesOnly = false,
  filterIds,
  showHeaderFooter = true,
}: Props) {
  const pagerRef = useRef<PagerView>(null);
  const { user } = useAuth();
  const { shareHostUrl } = useAppConfig();

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

  const [showTitle, setShowTitle] = useState(false);
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const navOpacity = useSharedValue(0);
  let navTimer: NodeJS.Timeout | null = null;

  /* ================= SORT: NEW GAMES FIRST ================= */
  const games = useMemo(() => {
    let list = [...allGames];

    if (favoritesOnly) {
      list = list.filter(g => favorites.includes(g.id));
    }

    if (filterIds?.length) {
      list = list.filter(g => filterIds.includes(g.id));
    }

    // 🔥 NEWEST FIRST (fallback safe)
    list.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });

    return list;
  }, [allGames, favoritesOnly, favorites, filterIds]);

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

  /* ================= FETCH GAMES ================= */
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

  /* ================= FAVORITE ================= */
  const toggleFavorite = async () => {
    if (!user || !currentGame) return;

    const removing = favorites.includes(currentGame.id);
    const updated = removing
      ? favorites.filter(i => i !== currentGame.id)
      : [...favorites, currentGame.id];

    setFavorites(updated);

    if (favoritesOnly && removing) {
      setPage(p => Math.max(0, p - 1));
    }

    await setDoc(
      doc(db, "userPreferences", user.uid),
      { favorites: updated },
      { merge: true }
    );
  };

  /* ================= SHARE ================= */
  const shareGame = () => {
    if (!currentGame || !shareHostUrl) return;
    Share.share({
      message: `🎮 Play this game\n${shareHostUrl}/game?id=${currentGame.id}`,
    });
  };

  /* ================= TITLE AUTO HIDE ================= */
  useEffect(() => {
    setShowTitle(true);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => setShowTitle(false), 2000);
    return () => titleTimerRef.current && clearTimeout(titleTimerRef.current);
  }, [page]);

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
    const initials =
      user.displayName?.[0]?.toUpperCase() ??
      user.email?.[0]?.toUpperCase() ??
      "U";

    await addDoc(collection(db, "games", currentGame.id, "comments"), {
      text: text.trim(),
      parentId: null,
      userInitials: initials,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "games", currentGame.id), {
      commentCount: increment(1),
    }).catch(() => {});

    setText("");
  };

  /* ================= NAV HELPERS ================= */
  const goToTop = () => {
    if (!pagerRef.current) return;
    stopTimer();
    setPage(0);
    pagerRef.current.setPageWithoutAnimation(0);
  };

  const goToBottom = () => {
    if (!pagerRef.current || games.length === 0) return;
    stopTimer();
    const last = games.length - 1;
    setPage(last);
    pagerRef.current.setPageWithoutAnimation(last);
  };

  /* ================= REFRESH / REINDEX ================= */
  const refreshReindex = () => {
    if (!pagerRef.current) return;

    stopTimer();

    // force re-sort + reset index
    setAllGames(prev => [...prev]); // triggers useMemo sort again

    setPage(0);
    pagerRef.current.setPageWithoutAnimation(0);
  };

  const showNavButtons = () => {
    navOpacity.value = withSpring(1);

    if (navTimer) clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      navOpacity.value = withSpring(0);
    }, 1200); // auto-hide delay
  };

  const navAnimStyle = useAnimatedStyle(() => ({
    opacity: navOpacity.value,
    transform: [
      { scale: navOpacity.value === 0 ? 0.9 : 1 },
    ],
  }));


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
          showNavButtons(); // 👈 fade-in on scroll
        }}
      >
        {games.map((g, i) => (
          <View key={g.id} style={{ flex: 1 }}>
            <ReelPage
              url={g.url}
              mount={Math.abs(i - page) <= 1}
              onVisible={startTimer}
            />
          </View>
        ))}
      </PagerView>

      {showTitle && currentGame?.title && (
        <View style={styles.gameTitleWrap}>
          <Text style={styles.gameTitleText} numberOfLines={1}>
            {currentGame.title}
          </Text>
        </View>
      )}

      {/* RIGHT ACTIONS */}
      <View style={styles.overlay}>
        <TouchableOpacity onPress={refreshReindex} style={styles.iconWrap}>
          <Ionicons name="refresh" size={22} color="#6a11cb" />
        </TouchableOpacity>


        <TouchableOpacity onPress={() => setPaused(p => !p)}   style={styles.iconWrap}>
          <Ionicons name={paused ? "play" : "pause"} size={28} color="#6a11cb" />
        </TouchableOpacity>

        <Animated.View style={likeAnim}  style={styles.iconWrap}>
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

        <TouchableOpacity onPress={toggleFavorite} style={styles.iconWrap}>
          <Ionicons
            name={favorites.includes(currentGame.id) ? "bookmark" : "bookmark-outline"}
            size={26}
            color="#6a11cb"
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCommentOpen(true)}  style={styles.iconWrap}>
          <Ionicons name="chatbubble-outline" size={26} color="#6a11cb" />
          <Text style={styles.count}>
            {formatCount(currentGame.commentCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={shareGame} style={styles.iconWrap}>
          <Ionicons name="share-social-outline" size={26} color="#6a11cb" />
        </TouchableOpacity>
      </View>

      {/* COMMENTS MODAL */}
      <Modal visible={commentOpen} animationType="slide">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Comments</Text>

          <ScrollView>
            {comments.map(c => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{c.userInitials}</Text>
                </View>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
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

      {/* BOTTOM NAVIGATION */}
      <Animated.View style={[styles.goTopWrap, navAnimStyle]}>
        <TouchableOpacity style={styles.goTop} onPress={goToTop}>
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[styles.goBottomWrap, navAnimStyle]}>
        <TouchableOpacity style={styles.goBottom} onPress={goToBottom}>
          <Ionicons name="arrow-down" size={18} color="#fff" />
        </TouchableOpacity>
      </Animated.View>


    </LinearGradient>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { paddingTop: "10%", alignItems: "center" },
  headerText: { color: "#fff", fontSize: 20, fontWeight: "bold" },

  overlay: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: -140 }], // 👈 controls vertical centering
    alignItems: "center",
  },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },


count: {
    fontSize: 11,
    color: "#333",
    marginTop: 2,
    textAlign: "center",
    minWidth: 30,
  },


  modal: { flex: 1, padding: 16, backgroundColor: "#fff" },
  modalTitle: { fontSize: 18, fontWeight: "bold" },

  commentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#6a11cb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  commentText: { flex: 1, fontSize: 14, color: "#333" },

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

  gameTitleWrap: {
    position: "absolute",
    left: 12,
    bottom: 40,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: "65%",
  },

  gameTitleText: { color: "#fff", fontSize: 10 },

  goTop: {
    position: "absolute",
    bottom: 16,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#6a11cb",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.85,
  },

  goBottom: {
    position: "absolute",
    bottom: 16,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#6a11cb",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.85,
  },
  goTopWrap: {
    position: "absolute",
    bottom: 16,
    left: 14,
  },

  goBottomWrap: {
    position: "absolute",
    bottom: 16,
    right: 14,
  },


});
