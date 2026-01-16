// app/(tabs))/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";   // 🔹 NEW
import {
  addDoc,
  arrayRemove, // ✅ needed for fetching multiple docs
  arrayUnion,
  collection,
  deleteDoc,
  doc, // ← add this
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Share, 
} from "react-native";
import PagerView from "react-native-pager-view";
import Animated, {
  Easing,
  Extrapolate,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { useAuth } from "../../shared/AuthProvider";
import { db } from "../../shared/firebase";
 

const { height, width } = Dimensions.get("window");

interface Game {
  id: string;
  url: string;
  isFavorite?: boolean;
  playCount?: number;
  recommendationScore?: number;
  likeCount?: number;
  commentCount?: number;
  createdAt?: any;
}


interface GameReelsProps {
  filterIds?: string[];   // optional: only show these games (search results)
  favoritesOnly?: boolean; // optional: only favorites
  showHeaderFooter?: boolean; // toggle header/footer
}

export default function GameReelsScreen({
    filterIds,
    favoritesOnly,
    showHeaderFooter = true,
  }: GameReelsProps)  {
  const { user } = useAuth(); 

  const [games, setGames] = useState<Game[]>([]);
  const [page, setPage] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [loadingMap, setLoadingMap] = useState<{ [key: string]: boolean }>({});
  const [pausedReel, setPausedReel] = useState<number | null>(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showRightStack, setShowRightStack] = useState(true);
  const { width } = Dimensions.get("window");
  const dynamicPadding = Math.max(12, Math.floor(width * 0.05)); 

  const [userPrefs, setUserPrefs] = useState<{
    favorites: string[];
    playCounts: Record<string, number>;
    likeCounts: Record<string, number>;
  }>({ favorites: [], playCounts: {}, likeCounts: {} }); 
  

  const [likedGames, setLikedGames] = useState<string[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  const loadingTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);  
  const previousPageRef = useRef<number>(0);

  // Animations (NOT using PanGesture)
  const progressWidth = useSharedValue(width);
  const iconOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  // Native pager (vertical, one-screen-per-swipe)
  const pagerRef = useRef<PagerView>(null);
  // 🔹 New state for deep link
  const [initialGameId, setInitialGameId] = useState<string | null>(null);


   // 🔹 put it here with other animations/hooks
  const bounceScale = useSharedValue(1);

   // 🔹 put it here with Comemnt feature
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const commentListRef = useRef<FlatList>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null); 
  // holds commentId if user is replying to a specific comment
  const [replyText, setReplyText] = useState(""); 
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<string | null>(null);  

  const [fullscreenGameId, setFullscreenGameId] = useState<string | null>(null);
  // Tracks games seen in this session (no DB write)
  const sessionSeenRef = useRef<Record<string, number>>({});


  // text typed for reply

  const handleBounce = () => {
    bounceScale.value = withSpring(1.3, { damping: 4 }, () => {
      bounceScale.value = withSpring(1);
    });
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounceScale.value }],
  }));

  // -------------------- FETCH USER PREFS --------------------
  useEffect(() => {
    if (!user) return;

    const prefRef = doc(db, "userPreferences", user.uid);
    const unsubscribePrefs = onSnapshot(prefRef, (snap) => {
      const data = snap.exists()
        ? (snap.data() as any)
        : { favorites: [], playCounts: {}, likeCounts: {} };

      setUserPrefs(data);

      const likes = data.likeCounts || {};
      setLikeCounts(likes);

      const liked = Object.entries(likes)
        .filter(([_, count]) => (count as number) > 0)
        .map(([id]) => id);
      setLikedGames(liked);
    });

    return () => unsubscribePrefs();
  }, [user]);
  
   // -------------------- FETCH GAMES --------------------
  useEffect(() => {
    const gamesQuery = query(
      collection(db, "games"),
      where("published", "==", true)
    );

    const unsubscribeGames = onSnapshot(gamesQuery, (snapshot) => {
      let publishedGames: Game[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      // Apply filters
      if (filterIds?.length) {
        publishedGames = publishedGames.filter((g) =>
          filterIds.includes(g.id)
        );
      }

      if (favoritesOnly) {
        publishedGames = publishedGames.filter((g) =>
          userPrefs.favorites?.includes(g.id)
        );
      }

      // Compute recommendation score
      const scoredGames = publishedGames.map((game) => ({
        ...game,
        isFavorite: userPrefs.favorites?.includes(game.id),
        playCount: userPrefs.playCounts?.[game.id] || 0,
        recommendationScore: computeRecommendationScore({
          game,
          userPrefs,
          likeCounts,
          commentCounts,
        }),
      }));

      // Sort by score
      scoredGames.sort(
        (a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0)
      );

      // 🔀 Exploration injection (every 5th game random)
      // ðŸ"€ Exploration injection (every 5th game random)
      const finalGames: Game[] = [];
      const usedIds = new Set<string>();
      const shuffled = [...scoredGames].sort(() => Math.random() - 0.5);

      scoredGames.forEach((g, i) => {
        if (i % 5 === 4 && shuffled[i] && !usedIds.has(shuffled[i].id)) {
          // Insert random game if not already used
          finalGames.push(shuffled[i]);
          usedIds.add(shuffled[i].id);
        } else if (!usedIds.has(g.id)) {
          // Insert scored game if not already used
          finalGames.push(g);
          usedIds.add(g.id);
        }
      });

      setGames(finalGames);
    });
    return () => unsubscribeGames();
  }, [userPrefs, likeCounts, commentCounts, filterIds, favoritesOnly]);


  
  // -------------------- TIMER & PROGRESS --------------------
  useEffect(() => {
    if (!games[page]) return;

    // Reset timer & progress every time a new game loads
    setTimeLeft(30);
    progressWidth.value = width;

    // ❌ Do not auto-start
    if (!isRunning) return;

    // ✅ Only start when running
    progressWidth.value = withTiming(0, { duration: 30000 });

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    /*timerRef.current = setTimeout(() => {
      goNext();
    }, 30000);*/

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [page, games, isRunning]);


  // -------------------- LOADING --------------------
  const startLoading = useCallback((gameId: string) => {
    setLoadingMap((prev) => ({ ...prev, [gameId]: true }));
    if (loadingTimeouts.current[gameId])
      clearTimeout(loadingTimeouts.current[gameId]);
    loadingTimeouts.current[gameId] = setTimeout(() => {
      setLoadingMap((prev) => ({ ...prev, [gameId]: false }));
    }, 20000);
  }, []);

  // -------------------- PLAY COUNT --------------------
  const updateUserPlay = async (gameId: string) => {
    if (!user) return;
    const prefRef = doc(db, "userPreferences", user.uid);
    await updateDoc(prefRef, {
      [`playCounts.${gameId}`]: increment(1),
    }).catch(() => {});
    setUserPrefs((prev) => ({
      ...prev,
      playCounts: {
        ...prev.playCounts,
        [gameId]: (prev.playCounts[gameId] || 0) + 1,
      },
    }));
  };

const computeRecommendationScore = ({
    game,
    userPrefs,
    likeCounts,
    commentCounts,
  }: {
    game: Game;
    userPrefs: any;
    likeCounts: Record<string, number>;
    commentCounts: Record<string, number>;
  }) => {
    const playCount = userPrefs.playCounts?.[game.id] || 0;
    const liked = userPrefs.likeCounts?.[game.id] > 0;
    const favorite = userPrefs.favorites?.includes(game.id);
    const commented = (commentCounts?.[game.id] || 0) > 0;

    const globalLikes = likeCounts?.[game.id] || 0;
    const globalComments = commentCounts?.[game.id] || 0;

    // Session repetition penalty
    const seenCount = sessionSeenRef.current[game.id] || 0;
    const seenPenalty = seenCount * 5;

    // Recency boost (new games)
    let recencyBoost = 0;
    if (game.createdAt?.toDate) {
      const ageHours =
        (Date.now() - game.createdAt.toDate().getTime()) / 36e5;
      recencyBoost = Math.max(0, 10 - ageHours); // fades over ~10 hours
    }

    return (
      playCount * 1 +
      (liked ? 5 : 0) +
      (favorite ? 10 : 0) +
      (commented ? 7 : 0) +
      globalLikes * 0.3 +
      globalComments * 0.5 +
      recencyBoost -
      seenPenalty
    );
  };

  
// -------------------- FAVORITE --------------------
  const toggleFavorite = async (gameId: string) => {
    if (!user) return;

    const isCurrentlyFavorite = userPrefs?.favorites?.includes(gameId);
    const newFavorites = isCurrentlyFavorite
      ? (userPrefs?.favorites || []).filter((id) => id !== gameId)
      : [...(userPrefs?.favorites || []), gameId];

    // Optimistically update local states
    setGames((prevGames) =>
      prevGames.map((g) =>
        g.id === gameId
          ? {
              ...g,
              isFavorite: !isCurrentlyFavorite,
              recommendationScore: !isCurrentlyFavorite
                ? g.recommendationScore + 10
                : g.recommendationScore - 10,
            }
          : g
      )
    );

    setUserPrefs((prev) => ({
      ...prev,
      favorites: newFavorites,
    }));

    // Save to Firestore
    try {
      await setDoc(
        doc(db, "userPreferences", user.uid),
        { favorites: newFavorites },
        { merge: true }
      );
    } catch (err) {
      console.error("Error updating favorites:", err);
      // Optional: rollback local state if Firestore fails
    }
  };




  // -------------------- LIKE --------------------
  const handleLike = async (gameId: string) => {
    if (!user) return;

    const userRef = doc(db, "userPreferences", user.uid);
    const gameRef = doc(db, "games", gameId);

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const gameDoc = await transaction.get(gameRef);

        const currentLikes: string[] = userDoc.exists()
          ? userDoc.data().likedGames || []
          : [];

        const isLiked = currentLikes.includes(gameId);
        let likeCount = gameDoc.exists() ? gameDoc.data().likeCount || 0 : 0;

        if (isLiked) {
          // remove like
          transaction.update(userRef, {
            likedGames: arrayRemove(gameId),
          });
          transaction.update(gameRef, {
            likeCount: Math.max(0, likeCount - 1), // avoid negative
          });
        } else {
          // add like
          transaction.set(
            userRef,
            { likedGames: arrayUnion(gameId) },
            { merge: true }
          );
          transaction.update(gameRef, {
            likeCount: likeCount + 1,
          });
        }

        // Optimistic UI update
        setLikedGames((prev) =>
          isLiked ? prev.filter((id) => id !== gameId) : [...prev, gameId]
        );
        setLikeCounts((prev) => ({
          ...prev,
          [gameId]: isLiked
            ? Math.max(0, (prev[gameId] || 1) - 1)
            : (prev[gameId] || 0) + 1,
        }));
      });
    } catch (err) {
      console.error("Like transaction failed:", err);
    }
  };


  // -------------------- NAVIGATION (via PagerView) --------------------
  const goNext = useCallback(() => {
    if (page < games.length - 1) {
      const currentGameId = games[page]?.id;
      if (currentGameId) updateUserPlay(currentGameId);
      pagerRef.current?.setPage(page + 1);
    }
  }, [page, games]);

  const goPrev = useCallback(() => {
    if (page > 0) {
      const currentGameId = games[page]?.id;
      if (currentGameId) updateUserPlay(currentGameId);
      pagerRef.current?.setPage(page - 1);
    }
  }, [page, games]);

  const onPagerPageSelected = useCallback(
    (e: any) => {
      const newIndex = e?.nativeEvent?.position ?? 0;
      const game = games[newIndex];

      if (game) {
        sessionSeenRef.current[game.id] =
          (sessionSeenRef.current[game.id] || 0) + 1;
      }

      setPage(newIndex);
    },
    [games]
  );

  // 🔹 Boost score when user opens fullscreen (high intent signal)
  useEffect(() => {
    if (!fullscreenGameId) return;

    sessionSeenRef.current[fullscreenGameId] =
      (sessionSeenRef.current[fullscreenGameId] || 0) - 2;

  }, [fullscreenGameId]);


  // -------------------- TAP TO PAUSE --------------------
  const handleTapPause = () => {
    if (pausedReel === page) {
      // If current reel is paused → resume
      setPausedReel(null);
    } else {
      // If playing → pause current reel
      setPausedReel(page);
    }

    // Animate icon fade
    iconOpacity.value = withTiming(1, { duration: 150, easing: Easing.ease }, () => {
      iconOpacity.value = withTiming(0, { duration: 500, easing: Easing.ease });
    });
  };



  // -------------------- ANIMATED STYLES --------------------
  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: progressWidth.value,
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [
      {
        scale: interpolate(
          iconOpacity.value,
          [0, 1],
          [0.5, 1],
          Extrapolate.CLAMP
        ),
      },
    ],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  // -------------------- When modal opens, fetch comments for that game: --------------------
  useEffect(() => {
    if (!selectedGameId) return;

    // Listen for comments in realtime
    const commentsRef = collection(db, "games", selectedGameId, "comments");
    const commentsQuery = query(commentsRef, orderBy("createdAt", "asc"));

    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      const newComments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        replies: [], // we'll fill below with realtime listener
      }));

      // For each comment, attach a replies listener
      newComments.forEach((comment) => {
        const repliesRef = collection(
          db,
          "games",
          selectedGameId,
          "comments",
          comment.id,
          "replies"
        );
        const repliesQuery = query(repliesRef, orderBy("createdAt", "asc"));

        // Attach a snapshot listener for this comment’s replies
        const unsubscribeReplies = onSnapshot(repliesQuery, (replySnap) => {
          setComments((prev) =>
            prev.map((c) =>
              c.id === comment.id
                ? {
                    ...c,
                    replies: replySnap.docs.map((r) => ({
                      id: r.id,
                      ...r.data(),
                    })),
                  }
                : c
            )
          );
        });

        // store unsubscribe for replies cleanup
        comment._unsubscribeReplies = unsubscribeReplies;
      });

      setComments(newComments);
    });

    return () => {
      unsubscribeComments();
      // Cleanup replies listeners too
      setComments((prev) => {
        prev.forEach((c) => {
          if (c._unsubscribeReplies) c._unsubscribeReplies();
        });
        return [];
      });
    };
  }, [selectedGameId]);

  //scroll when comments change:
  useEffect(() => {
    if (comments.length > 0) {
      setTimeout(() => {
        commentListRef.current?.scrollToEnd({ animated: true });
      }, 300);
    }
  }, [comments]);

  //Add reply handler
  const handleAddReply = async (commentId: string, replyText: string) => {
    if (!user || !selectedGameId || !replyText.trim()) return;

    try {
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      const avatarUrl = profileSnap.exists() ? profileSnap.data().avatarUrl || "" : "";
      const username = user.email?.split("@")[0] || "Anonymous";

      const replyPayload = {
        userId: user.uid,
        username,
        avatarUrl,
        text: replyText.trim(),
        createdAt: serverTimestamp(),
      };

      // ----- Optimistic reply with temporary key -----
      const tempId = `temp-${Date.now()}`;
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, replies: [...(c.replies || []), { id: tempId, ...replyPayload }] }
            : c
        )
      );

      // ----- Add reply to Firestore -----
      const replyDocRef = await addDoc(
        collection(db, "games", selectedGameId, "comments", commentId, "replies"),
        replyPayload
      );

      // ----- Replace tempId with real Firestore id -----
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                replies: c.replies.map((r) =>
                  r.id === tempId ? { ...r, id: replyDocRef.id } : r
                ),
              }
            : c
        )
      );

      // Clear inline input
      setReplyText("");
      setActiveReplyCommentId(null);

      // Auto-scroll down to latest reply
      setTimeout(() => {
        commentListRef.current?.scrollToEnd({ animated: true });
      }, 150);

    } catch (err) {
      console.error("🔥 Error adding reply:", err);
    }
  };

  // --------------------Add Comment Function-------------------------
  const handleAddComment = async () => {
    if (!user || !selectedGameId || !newComment.trim()) return;

    try {
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      const avatarUrl = profileSnap.exists() ? profileSnap.data().avatarUrl || "" : "";

      await addDoc(
        collection(db, "games", selectedGameId, "comments"),
        {
          userId: user.uid,
          username: user.email?.split("@")[0] || "Anonymous",
          avatarUrl,
          text: newComment.trim(),
          createdAt: serverTimestamp(),
        }
      );

      setNewComment("");
    } catch (err) {
      console.error("🔥 Error adding comment:", err);
    }
  };

  // Delete a comment
  const handleDeleteComment = (commentId: string) => {
    if (!user || !selectedGameId) return;

    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete comment
              const commentRef = doc(db, "games", selectedGameId, "comments", commentId);
              await deleteDoc(commentRef);

              // Optionally delete replies
              const repliesRef = collection(db, "games", selectedGameId, "comments", commentId, "replies");
              const replyDocs = await getDocs(repliesRef);
              replyDocs.forEach(async (r) =>
                await deleteDoc(doc(db, "games", selectedGameId, "comments", commentId, "replies", r.id))
              );

              // Optimistic UI update
              setComments((prev) => prev.filter((c) => c.id !== commentId));
            } catch (err) {
              console.error("🔥 Error deleting comment:", err);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };


  const handleDeleteReply = (commentId: string, replyId: string) => {
    Alert.alert(
      "Delete Reply",
      "Are you sure you want to delete this reply?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const replyRef = doc(db, "games", selectedGameId, "comments", commentId, "replies", replyId);
              await deleteDoc(replyRef);

              // Optimistic UI update
              setComments((prev) =>
                prev.map((c) =>
                  c.id === commentId
                    ? { ...c, replies: c.replies.filter((r) => r.id !== replyId) }
                    : c
                )
              );
            } catch (err) {
              console.error("🔥 Error deleting reply:", err);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  //send button with this unified function:  
  // Replace your existing handleSend with this corrected implementation:
  const handleSend = async () => {
    if (!user || !selectedGameId) return;
    if (!newComment.trim() && !replyText.trim()) return;

    try {
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      const avatarUrl = profileSnap.exists() ? profileSnap.data().avatarUrl || "" : "";
      const username = user.email?.split("@")[0] || "Anonymous";

      if (activeReplyCommentId) {
        // ----- Reply case -----
        const replyPayload = {
          userId: user.uid,
          username,
          avatarUrl,
          text: replyText.trim(),
          createdAt: serverTimestamp(),
        };

        // Add reply to Firestore and get id
        const replyDocRef = await addDoc(
          collection(
            db,
            "games",
            selectedGameId,
            "comments",
            activeReplyCommentId,
            "replies"
          ),
          replyPayload
        );

        // Optimistic update with actual id
        setComments((prev) =>
          prev.map((c) =>
            c.id === activeReplyCommentId
              ? { ...c, replies: [...(c.replies || []), { id: replyDocRef.id, ...replyPayload }] }
              : c
          )
        );

        setReplyText("");
        setActiveReplyCommentId(null);
      } else {
        // ----- New comment case -----
        const commentPayload = {
          userId: user.uid,
          username,
          avatarUrl,
          text: newComment.trim(),
          createdAt: serverTimestamp(),
        };

        const commentDocRef = await addDoc(
          collection(db, "games", selectedGameId, "comments"),
          commentPayload
        );

        setComments((prev) => [
          ...prev,
          { id: commentDocRef.id, ...commentPayload, replies: [] },
        ]);

        setNewComment("");
      }

      // Scroll to bottom
      setTimeout(() => {
        commentListRef.current?.scrollToEnd({ animated: true });
      }, 150);

    } catch (err) {
      console.error("🔥 Error sending comment/reply:", err);
    }
  };


  //Auto-scroll for inline reply:
  const handleReplyPress = (commentId: string, index: number) => {
    setActiveReplyCommentId(
      activeReplyCommentId === commentId ? null : commentId
    );
    setReplyText("");

    // Delay scroll to allow the input box to render
    setTimeout(() => {
      commentListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3, // top 30% of screen
      });
    }, 100);
  };


  useEffect(() => {
    if (!selectedGameId) return;

    const commentsRef = collection(db, "games", selectedGameId, "comments");
    getDocs(commentsRef)
      .then((snap) => {
        setCommentCounts((prev) => ({
          ...prev,
          [selectedGameId]: snap.size,
        }));
      })
      .catch(() => {
        setCommentCounts((prev) => ({ ...prev, [selectedGameId]: 0 }));
      });
  }, [selectedGameId, comments.length]);


  // Whenever user swipes to new page
  useEffect(() => {
    if (commentModalVisible && games[page]) {
      setSelectedGameId(games[page].id);
    }
  }, [page, commentModalVisible, games]);


  // -------------------- Deep Linking --------------------
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      const { queryParams } = Linking.parse(url);
      if (queryParams?.id) {
        setInitialGameId(queryParams.id as string);
      }
    };

    // Listen for runtime deep links
    const subscription = Linking.addEventListener("url", handleDeepLink);

    // Handle cold start (app opened from a link)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  // 🔹 After games load, jump to the shared one
  useEffect(() => {
    if (initialGameId && games.length > 0) {
      const index = games.findIndex((g) => g.id === initialGameId);
      if (index >= 0) {
        pagerRef.current?.setPage(index);
        setPage(index);
      }
    }
  }, [initialGameId, games]);

  // -------------------- SHARE --------------------  
  const handleShare = async (gameId: string) => {
    // ✅ Use a HTTPS URL (configure Universal Links / Firebase Dynamic Links if needed)
    const shareUrl = `http://stoxvalue.in/game?id=${gameId}`;

    try {
      await Share.share({
        message: `🎮 Play this game on Brainsta!\n${shareUrl}`,
        url: shareUrl, // iOS needs this
        title: "Brainsta",
      });
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  

  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      {/* Header */}
      {showHeaderFooter && (
        <View style={styles.header}>
          <Text style={styles.headerText}>🎮 Brainsta Games</Text>
        </View>
      )}

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={onPagerPageSelected}
        orientation="vertical"
        overScrollMode="never"
        pageMargin={0}
        scrollEnabled={pausedReel !== page}
      >
        {games.map((game, index) => (
          <View key={game.id} style={{ flex: 1 }}>
            {/* WebView Container */}
            <View style={styles.webviewContainer}>
              {loadingMap[game.id] && (
                <ActivityIndicator
                  style={styles.loader}
                  size="large"
                  color="#fff"
                />
              )}

              <View style={{ flex: 1 }}>
                <WebView
                  source={{ uri: game.url }}
                  style={{ flex: 1, borderRadius: 12, overflow: "hidden" , backgroundColor: "transparent"  }}
                  contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }} // prevents double inset
                  automaticallyAdjustContentInsets={false}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={["*"]}
                  mixedContentMode="always"
                  allowsFullscreenVideo
                  setSupportMultipleWindows={false}
                  scrollEnabled={false}       // 🚫 disable native scroll
                  bounces={false}             // 🚫 disable bounce on iOS
                  scalesPageToFit={false}     // 🚫 disable auto scaling
                  onLoadStart={() => startLoading(game.id)}
                  onLoadEnd={() =>
                    setLoadingMap((prev) => ({ ...prev, [game.id]: false }))
                  }
                  onError={() =>
                    setLoadingMap((prev) => ({ ...prev, [game.id]: false }))
                  }
                  injectedJavaScript={`
                    (function() {
                      // Force fixed viewport
                      var meta = document.querySelector('meta[name=viewport]');
                      if (!meta) {
                        meta = document.createElement('meta');
                        meta.setAttribute('name', 'viewport');
                        document.head.appendChild(meta);
                      }
                      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');

                      // Disable scrolling completely
                      document.body.style.overflow = 'hidden';
                      document.documentElement.style.overflow = 'hidden';
                      document.body.style.position = 'fixed';
                      document.body.style.width = '100%';
                      document.body.style.height = '100%';
                      document.body.style.padding = "16px";   // add padding inside page
                      document.body.style.boxSizing = "border-box";
                      document.body.style.margin = "0";       // remove default margin
                      document.body.style.background = "transparent";
                      document.documentElement.style.background = "transparent";

                      // Prevent zoom via gestures
                      document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
                      document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
                      document.addEventListener('gestureend', function (e) { e.preventDefault(); });
                    })();
                    true; // required for Android
                  `}
                />

                {/* 🚫 Overlay when paused → blocks ALL touches */}
                {pausedReel === page && (
                  <View style={StyleSheet.absoluteFill} pointerEvents="auto" />
                )}
              </View>

            </View>
            {/* Overlays (conditional only for current page) */}
            {index === page && (
              <>
                {/* Timer */}
                

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <Animated.View
                    style={[styles.progressBar, progressAnimatedStyle]}
                  >
                    <LinearGradient
                      colors={["#4facfe", "#00f2fe"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1, borderRadius: 4 }}
                    />
                  </Animated.View>
                </View>

                {/* Debug Game ID */}
                {/* <Text style={styles.debugGameId}>{game.id.slice(-4)}</Text> */}

                {/* Fullscreen Button */}
                <TouchableOpacity
                  style={[styles.stackIcon, { top: "40%" }]}   // 👈 placed just above pause/play
                  onPress={() => setFullscreenGameId(game.id)}
                >
                  <Ionicons name="expand" size={28} color="#6a11cb" />
                </TouchableOpacity>


                {/* Stack Toggle Button */}
                {/* Pause / Play Button */}
                <TouchableOpacity
                  style={[styles.stackIcon, { top: "45%" }]}   // ⬆ moved up
                  onPress={handleTapPause}
                >
                  <Ionicons
                    name={pausedReel === page ? "play" : "pause"}
                    size={28}
                    color="#6a11cb"
                  />
                </TouchableOpacity>

                {/* Stack Toggle Button */}
                <TouchableOpacity
                  style={[styles.stackIcon, { top: "50%" }]}   // ⬆ also moved up
                  onPress={() => setShowRightStack(!showRightStack)}
                >
                  <Ionicons
                    name={showRightStack ? "chevron-forward" : "chevron-back"}
                    size={28}
                    color="#6a11cb"
                  />
                </TouchableOpacity>

                {/* Action Buttons Stack */}
                {showRightStack && (
                  <Animated.View
                    style={styles.rightButtonStack}
                    entering={FadeIn.duration(600)}
                    exiting={FadeOut.duration(300)}                    
                  >
                    {/* Favorite */}
                    <TouchableOpacity onPress={() => toggleFavorite(game.id)}>
                      <Animated.View style={[styles.actionButton, pulseStyle]}>
                        <Ionicons
                          name={game.isFavorite ? "heart" : "heart-outline"}
                          size={32}
                          color={game.isFavorite ? "#6a11cb" : "#6a11cb"} // 🔴 red when active, ⚪ white when idle
                        />
                      </Animated.View>
                    </TouchableOpacity>


                    {/* Like */}
                    <TouchableOpacity onPress={() => handleLike(game.id)}>
                      <Animated.View style={[styles.actionButton, pulseStyle]}>
                        <Ionicons
                          name={likedGames.includes(game.id) ? "thumbs-up" : "thumbs-up-outline"}
                          size={32}
                          color={likedGames.includes(game.id) ? "#6a11cb" : "#6a11cb"} // 🔵 blue when active, ⚪ white when idle
                        />
                        <Text style={styles.actionCount}>
                          {likeCounts[game.id] || 0}
                        </Text>
                      </Animated.View>
                    </TouchableOpacity>


                    {/* Comment */}
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedGameId(game.id);
                        setCommentModalVisible(true);
                      }}
                    >
                      <Animated.View style={[styles.actionButton, pulseStyle]}>
                        <Ionicons
                          name="chatbubble-outline"
                          size={28}
                          color="#6a11cb" // always white for clarity
                        />
                        <Text style={styles.actionCount}>
                          {commentCounts[game.id] || 0}
                        </Text>
                      </Animated.View>
                    </TouchableOpacity>


                    {/* 🔹 Share button */}
                    <TouchableOpacity onPress={() => handleShare(game.id)}>
                      <Animated.View style={styles.actionButton}>
                        <Ionicons
                          name="share-social-outline"
                          size={28}
                          color="#6a11cb" // white for clarity
                        />
                      </Animated.View>
                    </TouchableOpacity>

                    {/* Prev / Next Buttons */}
                    <TouchableOpacity onPress={goPrev}>
                      <Animated.View style={[styles.actionButton, pulseStyle]}>
                        <Ionicons name="chevron-up" size={28} color="#6a11cb" />
                      </Animated.View>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={goNext}>
                      <Animated.View style={[styles.actionButton, pulseStyle]}>
                        <Ionicons name="chevron-down" size={28} color="#6a11cb" />
                      </Animated.View>
                    </TouchableOpacity>
                  </Animated.View>
                )}                
              </>
            )}
          </View>
        ))}
      </PagerView>
      {/* Footer */}             
      {showHeaderFooter && (
        <LinearGradient colors={["#6a11cb", "#6a11cb"]} style={styles.footer}>
          <Text style={styles.footerText}>© {new Date().getFullYear()} Brainsta</Text>
        </LinearGradient>
      )}

      {/* ✅ Comment Modal */}      
      {selectedGameId && (
        <Modal
          visible={commentModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setCommentModalVisible(false);
            setActiveReplyCommentId(null);
            setReplyText("");
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <View
              style={{
                height: "70%",
                backgroundColor: "#f5f5f5",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: 15,
                  backgroundColor: "#6a11cb",
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                }}
              >
                <Text style={{ fontSize: 18, color: "#fff", fontWeight: "bold" }}>
                  Comments
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setCommentModalVisible(false);
                    setActiveReplyCommentId(null);
                    setReplyText("");
                  }}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Comments List */}
              <FlatList
                ref={commentListRef}
                data={comments}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 80 }}
                renderItem={({ item, index }) => {
                  const createdAt = item.createdAt?.toDate ? item.createdAt.toDate() : new Date();
                  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });

                  return (
                    <View
                      //key={item.id}
                      style={{
                        padding: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: "#eee",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <View style={{ flexDirection: "row", flex: 1 }}>
                          {/* Avatar */}
                          {item.avatarUrl ? (
                            <Image
                              source={{ uri: item.avatarUrl }}
                              style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
                            />
                          ) : (
                            <View
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: "#6a11cb",
                                marginRight: 10,
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <Ionicons name="person" size={20} color="#fff" />
                            </View>
                          )}

                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: "bold" }}>{item.username}</Text>
                            <Text>{item.text}</Text>
                            <Text style={{ fontSize: 12, color: "#6a11cb", marginTop: 2 }}>
                              {timeAgo}
                            </Text>

                            {/* Replies */}
                            {item.replies?.map((reply: any, replyIndex: number) => {
                              const replyTime = reply.createdAt?.toDate ? reply.createdAt.toDate() : new Date();
                              return (
                                <View 
                                  key={`${reply.id}-${replyIndex}`}   // ✅ now guaranteed unique per reply
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    marginLeft: 46,
                                    marginTop: 8,
                                  }}
                                >
                                  <View style={{ flexDirection: "row", flex: 1 }}>
                                    {reply.avatarUrl ? (
                                      <Image
                                        source={{ uri: reply.avatarUrl }}
                                        style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                                      />
                                    ) : (
                                      <View
                                        style={{
                                          width: 28,
                                          height: 28,
                                          borderRadius: 14,
                                          backgroundColor: "#bbb",
                                          marginRight: 8,
                                          justifyContent: "center",
                                          alignItems: "center",
                                        }}
                                      >
                                        <Ionicons name="person" size={16} color="#6a11cb" />
                                      </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontWeight: "600" }}>{reply.username}</Text>
                                      <Text>{reply.text}</Text>
                                      <Text style={{ fontSize: 11, color: "#6a11cb" }}>
                                        {formatDistanceToNow(replyTime, { addSuffix: true })}
                                      </Text>
                                    </View>
                                  </View>

                                  {/* Delete reply */}
                                  {reply.userId === user.uid && (
                                    <TouchableOpacity
                                      onPress={() => handleDeleteReply(item.id, reply.id)}
                                      style={{ padding: 4, marginLeft: 6 }}
                                    >
                                      <Ionicons name="trash-outline" size={18} color="#6a11cb" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              );
                            })}

                            {/* Reply Button */}
                            <TouchableOpacity onPress={() => handleReplyPress(item.id, index)}>
                              <Text style={{ color: "#6a11cb", marginTop: 4 }}>Reply</Text>
                            </TouchableOpacity>

                            {/* Inline Reply Input */}
                            {activeReplyCommentId === item.id && (
                              <View style={{ flexDirection: "row", marginTop: 6 }}>
                                <TextInput
                                  value={replyText}
                                  onChangeText={setReplyText}
                                  placeholder="Write a reply..."
                                  multiline
                                  style={{
                                    flex: 1,
                                    borderWidth: 1,
                                    borderColor: "#ccc",
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    backgroundColor: "#fff",
                                    fontSize: 14,
                                    minHeight: 36,
                                    maxHeight: 100,
                                  }}
                                />
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Delete comment */}
                        {item.userId === user.uid && (
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(item.id)}
                            style={{ padding: 4, marginLeft: 8 }}
                          >
                            <Ionicons name="trash-outline" size={20} color="#6a11cb" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
              />

              {/* Bottom Input & Send */}
              <View
                style={{
                  flexDirection: "row",
                  padding: 10,
                  borderTopWidth: 1,
                  borderTopColor: "#ddd",
                  backgroundColor: "#6a11cb",
                }}
              >
                <TextInput
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#ccc",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    backgroundColor: "#fff",
                    fontSize: 14,
                    minHeight: 36,
                    maxHeight: 100,
                  }}
                  placeholder={activeReplyCommentId ? "Write a reply..." : "Add a comment..."}
                  value={activeReplyCommentId ? replyText : newComment}
                  onChangeText={activeReplyCommentId ? setReplyText : setNewComment}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  style={{
                    marginLeft: 8,
                    backgroundColor: "#6a11cb",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {fullscreenGameId && (
      <Modal
        visible={true}
        animationType="slide"
        onRequestClose={() => setFullscreenGameId(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {/* WebView fullscreen */}
          <WebView
            source={{ uri: games.find((g) => g.id === fullscreenGameId)?.url }}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
          />

          {/* Close Button */}
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 40,
              right: 20,
              backgroundColor: "rgba(0,0,0,0.6)",
              padding: 10,
              borderRadius: 20,
            }}
            onPress={() => setFullscreenGameId(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    )}

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // ---------------- Container ----------------
  container: {
    flex: 1,    
  },

  // ---------------- WebView ----------------
  webviewContainer: {
    flex: 1, // takes all space between header & footer    
    overflow: "hidden",
    paddingTop:"10%",    
    
  },
  webview: {
    flex: 1, // ensures WebView fills its container
    backgroundColor: "#6a11cb", // uniform background
  },
  loader: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -18, // center loader horizontally
    marginTop: -18,  // center loader vertically
    zIndex: 20,       // appear above WebView
  },

  // ---------------- Header ----------------
  header: {    
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    zIndex: 10,    
    paddingTop:"10%",
  },
  headerText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  // ---------------- Timer ----------------
  timerBox: {
    position: "absolute",
    top: 0,
    left: 200,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  timerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },

  // ---------------- Pause Icons ----------------
  smallPauseIcon: {
    position: "absolute",
    top: 0,
    right: 20,
    backgroundColor: "#000",
    borderRadius: 8,
    padding: 4,
    zIndex: 20,
  },
  pauseIconOverlay: {
    position: "absolute",
    //top: "40%",
    top: 0,
    left: "40%",
    zIndex: 20,
  },

  // ---------------- Progress Bar ----------------
  progressContainer: {
    position: "absolute",
    top: "5%",
    left: 0,
    height: 8,
    width, // dynamic width from screen
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
    zIndex: 10,
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
  },

  // ---------------- Footer ----------------
  footer: {
    height: 20,    
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  footerText: {
    color: "#fff",
    fontSize: 14,
  },

  // ---------------- Stack Toggle Button ----------------
  stackButton: {
    position: "absolute",
    right: 6,
    top: "45%",   // 👈 pause button here
    width: 36,
    height: 36,
    borderRadius: 18,    
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  stackIcon: {
    position: "absolute",
    right: 4,
    zIndex: 30,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  
  // ---------------- Right Action Buttons Stack ----------------
  rightButtonStack: {
    position: "absolute",
    right: 4,
    top: "55%",    
    alignItems: "center",
    zIndex: 50,
    backgroundColor: "transparent", // ✅ make stack transparent    
    elevation: 50,
  },

  // ---------------- Individual Action Buttons ----------------
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 22,
    marginVertical: 8, // spacing between buttons
    alignItems: "center",
    justifyContent: "center",    
  },

  gradientButton: {
    width: 38,
    height: 38,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    // subtle glow effect
    shadowColor: "#05af21ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },

  actionCount: {
    color: "#6a11cb",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 0,
    textAlign: "center",
  },

  // ---------------- Navigation Buttons (Prev/Next) ----------------
  navButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 25,
    marginVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  // ---------------- Comment Modal ----------------
  commentModalContainer: {
    flex: 1,
    backgroundColor: "#6a11cb", // dark overlay behind modal
    justifyContent: "flex-end",
  },

  commentBox: {
    flex: 0.6, // modal takes ~60% of screen height
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },

  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  commentHeaderText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#6a11cb", // matches gradient theme
  },

  commentInput: {
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginTop: 10,
  },

  commentButton: {
    marginTop: 12,
    backgroundColor: "#6a11cb",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },

  commentButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },

  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  commentUser: {
    fontWeight: "bold",
    color: "#6a11cb",
    marginRight: 6,
  },

  commentText: {
    flexShrink: 1,
    fontSize: 15,
    color: "#333",
  },
  fullscreenButton: {
    position: "absolute",
    right: 4,
    zIndex: 30,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },

});
