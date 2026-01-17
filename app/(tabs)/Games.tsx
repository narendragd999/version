import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import JSZip from "jszip";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput, 
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { useAuth } from "../../shared/AuthProvider";
import { auth, db } from "../../shared/firebase";

const GAMES_PER_PAGE = 10;

export default function GamesScreen() {
  const { user, loading, role } = useAuth();

  // -------------------- States --------------------
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<any>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [games, setGames] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubOwner, setGithubOwner] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [githubBranch, setGithubBranch] = useState<string | null>(null);

  // Pagination states
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(false);

  // Category modal
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  
  const githubReady = !!githubOwner && !!githubRepo && !!githubBranch && !!githubToken;

  // -------------------- Initial Firestore load --------------------
  useEffect(() => {
    if (loading) return;

    let q;

    if (role === "admin") {
      // 👑 ADMIN: fetch ALL games (no orderBy to avoid dropping old records)
      q = query(collection(db, "games"));
    } else if (user) {
      // 👤 USER: own + admin games
      q = query(
        collection(db, "games"),
        where("creatorId", "in", [user.uid, "admin"])
      );
    } else {
      return;
    }

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // 🔁 SORT SAFELY (new first, old last)
      list.sort((a, b) => {
        const ta =
          a.createdAt?.seconds ??
          a.createdAt?.toMillis?.() ??
          0;
        const tb =
          b.createdAt?.seconds ??
          b.createdAt?.toMillis?.() ??
          0;
        return tb - ta;
      });

      setGames(list);
    });

    return () => unsub();
  }, [loading, role, user?.uid]);


  // -------------------- Load more games --------------------
  const loadMoreGames = async () => {
    if (!hasMore || loadingMore || !lastVisible) return;

    setLoadingMore(true);
    try {
      let q;

      if (role === "admin") {
        q = query(
          collection(db, "games"),
          orderBy("createdAt", "desc"),
          startAfter(lastVisible),
          limit(GAMES_PER_PAGE)
        );
      } else if (user) {
        q = query(
          collection(db, "games"),
          where("creatorId", "in", [user.uid, "admin"]),
          orderBy("createdAt", "desc"),
          startAfter(lastVisible),
          limit(GAMES_PER_PAGE)
        );
      } else {
        setLoadingMore(false);
        return;
      }

      const snap = await getDocs(q);
      const newGames = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setGames(prev => [...prev, ...newGames]);
      setLastVisible(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === GAMES_PER_PAGE);
    } catch (err) {
      console.error("Error loading more games:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // -------------------- Categories listener --------------------
  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // -------------------- Settings listener --------------------
  useEffect(() => {
    (async () => {
      try {
        const docRef = doc(db, "settings", "appConfig");
        const snap = await getDoc(docRef);

        if (!snap.exists()) return;

        const cfg = snap.data();

        setBaseUrl(cfg.baseUrl || null);
        setGithubToken(cfg.githubToken || null);
        setGithubOwner(cfg.githubOwner || null);
        setGithubRepo(cfg.githubRepo || null);
        setGithubBranch(cfg.githubBranch || "main");
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    })();
  }, []);

  // -------------------- Helpers --------------------
  const fileUriToArrayBuffer = async (uri: string) => {
    const res = await fetch(uri);
    return await res.arrayBuffer();
  };

  const getFileSha = async (owner, repo, path, branch, token) => {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Failed to get file SHA");
    }
    const data = await res.json();
    return data.sha;
  };

  const uploadFileToGitHub = async (owner, repo, path, base64Content, branch, token) => {
    const existingSha = await getFileSha(owner, repo, path, branch, token);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: existingSha ? `Update ${path}` : `Add ${path}`,
        content: base64Content,
        branch,
        sha: existingSha || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "GitHub upload failed");
    return data.content?.download_url || null;
  };

  // -------------------- File picker --------------------
  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/zip" });
      if (!res.canceled) {
        setFile(res.assets[0]);
        Alert.alert("File Selected", res.assets[0].name);
      }
    } catch (err) {
      console.error("Pick file error", err);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  // -------------------- Add game --------------------
  const handleAddGame = async () => {
    if (!title || !file || !categoryId) {
      Alert.alert("Error", "Provide title, ZIP file, and select a category");
      return;
    }
    if (!baseUrl) {
      Alert.alert("Error", "Base URL not configured in settings/appConfig");
      return;
    }
    if (!githubToken) {
      Alert.alert("Error", "GitHub token not available in settings/appConfig");
      return;
    }

    setProcessing(true);
    try {
      const normalizedTitle = title.trim().toLowerCase();

      const snapshot = await getDocs(collection(db, "games"));
      const duplicate = snapshot.docs.find((d) => {
        const ddata = d.data();
        const existingNormalized = ddata.titleNormalized || ddata.title?.trim().toLowerCase();
        return existingNormalized === normalizedTitle;
      });
      if (duplicate) {
        Alert.alert("Duplicate Title", "A game with this title already exists.");
        setProcessing(false);
        return;
      }

      const folderName = title.trim().replace(/\s+/g, "_");
      const zipData = await fileUriToArrayBuffer(file.uri);
      const jszip = new JSZip();
      const zip = await jszip.loadAsync(zipData);

      if (!githubReady) {
        Alert.alert("Error", "GitHub settings not configured by admin");
        setProcessing(false);
        return;
      }

      const OWNER = githubOwner;
      const REPO = githubRepo;
      const BRANCH = githubBranch;
      const TOKEN = githubToken;

      for (const relativePath in zip.files) {
        const entry = zip.files[relativePath];
        if (!entry.dir) {
          const contentBase64 = await entry.async("base64");
          const pathInRepo = `${folderName}/${entry.name}`;
          await uploadFileToGitHub(OWNER, REPO, pathInRepo, contentBase64, BRANCH, TOKEN);
        }
      }

      const indexUrl = `${baseUrl}/${folderName}/index.html`;

      await addDoc(collection(db, "games"), {
        title: title.trim(),
        titleNormalized: normalizedTitle,
        url: indexUrl,
        categoryId,
        published: false,
        creatorId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
      });

      Alert.alert("Success", "Game uploaded successfully!");
      setTitle("");
      setFile(null);
      setCategoryId(null);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Upload failed");
    } finally {
      setProcessing(false);
    }
  };

  // -------------------- Delete game --------------------
  const handleDelete = async (gameId: string, gameUrlOrFolder: string | null) => {
    if (!gameUrlOrFolder || !githubToken) {
      Alert.alert("Error", "Cannot delete without GitHub token or folder info.");
      return;
    }

    const folderName = (() => {
      try {
        const parts = gameUrlOrFolder.split('/');
        const idx = parts.indexOf('index.html');
        if (idx > 0) return parts[idx - 1];
        const last = parts[parts.length - 1];
        return last.split('.').slice(0, -1).join('.') || last;
      } catch { return null; }
    })();

    if (!folderName) {
      Alert.alert("Error", "Could not determine folder name for deletion.");
      return;
    }

    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this game? This will remove files from GitHub and delete the Firestore record.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setProcessing(true);
            try {
              if (!githubReady) {
                Alert.alert("Error", "GitHub settings not configured by admin");
                setProcessing(false);
                return;
              }

              const OWNER = githubOwner;
              const REPO = githubRepo;
              const BRANCH = githubBranch;
              const TOKEN = githubToken;

              const fetchAllFiles = async (path: string): Promise<any[]> => {
                const res = await fetch(
                  `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
                  { headers: { Authorization: `Bearer ${TOKEN}` } }
                );
                if (res.status === 404) return [];
                if (!res.ok) throw new Error((await res.json()).message);

                const data = await res.json();
                let files: any[] = [];
                for (const item of data) {
                  if (item.type === "file") files.push(item);
                  if (item.type === "dir") files.push(...(await fetchAllFiles(item.path)));
                }
                return files;
              };

              const files = await fetchAllFiles(folderName);
              for (const f of files) {
                await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${f.path}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ message: `Delete ${f.path}`, sha: f.sha, branch: BRANCH }),
                });
              }

              await deleteDoc(doc(db, "games", gameId));
              Alert.alert("Deleted", "Game removed from GitHub and database.");
            } catch (err: any) {
              console.error(err);
              Alert.alert("Error", err.message || "Failed to delete game");
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // -------------------- Publish toggle --------------------
  const togglePublish = async (gameId: string, current: boolean) => {
    try {
      await updateDoc(doc(db, "games", gameId), { published: !current });
    } catch (err) {
      Alert.alert("Error", "Failed to update publish status");
    }
  };

  // -------------------- Category CRUD --------------------
  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return Alert.alert("Error", "Category name can't be empty");
    setProcessing(true);
    try {
      const snap = await getDocs(collection(db, "categories"));
      const exists = snap.docs.find(d => (d.data().name || "").trim().toLowerCase() === name.toLowerCase());
      if (exists) {
        Alert.alert("Duplicate", "A category with this name already exists.");
        setProcessing(false);
        return;
      }
      await addDoc(collection(db, "categories"), {
        name,
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
      });
      setNewCategoryName("");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to create category");
    } finally {
      setProcessing(false);
    }
  };

  const startEditCategory = (cat) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name || "");
  };

  const saveEditCategory = async () => {
    if (!editingCategoryId) return;
    const newName = editingCategoryName.trim();
    if (!newName) return Alert.alert("Error", "Name can't be empty");
    setProcessing(true);
    try {
      await updateDoc(doc(db, "categories", editingCategoryId), { name: newName });
      setEditingCategoryId(null);
      setEditingCategoryName("");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to rename category");
    } finally {
      setProcessing(false);
    }
  };

  const deleteCategory = async (catId: string) => {
    if (!catId || role !== 'admin') return;
    Alert.alert(
      'Delete Category',
      'Deleting a category will NOT delete games. Existing games keep their categoryId – update manually if needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              await deleteDoc(doc(db, 'categories', catId));
              Alert.alert('Deleted', 'Category removed. Update games if needed.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to delete category');
            } finally {
              setProcessing(false);
            }
          }
        }
      ]
    );
  };

  // -------------------- Filtered games --------------------
  const filteredGames = games.filter(
    g =>
      !searchQuery ||
      g.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (g.categoryId && categories.find(c => c.id === g.categoryId)?.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // -------------------- Footer component --------------------
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#6a11cb" />
        <Text style={styles.footerText}>Loading more games...</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (initialLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6a11cb" />
          <Text style={styles.emptyText}>Loading games...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="game-controller-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>
          {searchQuery ? "No games found" : "No games yet"}
        </Text>
      </View>
    );
  };

  // -------------------- Render --------------------
  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <Text style={styles.heading}>🎮 Games</Text>

      {/* Upload Card */}
      <View style={styles.card}>
        <View style={styles.inputBox}>
          <Ionicons name="game-controller" size={20} color="#666" />
          <TextInput
            placeholder="Game Title"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#999"
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handlePickFile}>
              <Text style={styles.primaryBtnText}>
                {file ? `📦 ${file.name}` : 'Select ZIP'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ width: 150 }}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setCatModalVisible(true)}>
              <Text style={styles.primaryBtnText}>
                {categoryId
                  ? (categories.find(c => c.id === categoryId)?.name || 'Category')
                  : 'Select Category'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10 }]} onPress={handleAddGame}>
          <Text style={styles.primaryBtnText}>+ Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.gamesHeader}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#666" />
          <TextInput
            placeholder="Search Games..."
            placeholderTextColor="#999"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Games List */}
      <FlatList
        data={filteredGames}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        renderItem={({ item }) => {
          const category = categories.find(c => c.id === item.categoryId);
          return (
            <View style={styles.gameCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gameTitle}>{item.title}</Text>
                {category && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{category.name}</Text>
                  </View>
                )}
                <View style={[styles.statusBadge, { backgroundColor: item.published ? "#27ae60" : "#D3D3D3" }]}>
                  <Text style={styles.statusText}>{item.published ? "Published" : "Draft"}</Text>
                </View>
              </View>

              <View style={styles.actionButtons}>
                {role === "admin" && (
                  <TouchableOpacity
                    style={[styles.publishBtn, { backgroundColor: item.published ? "#2ecc71" : "#D3D3D3" }]}
                    onPress={() => togglePublish(item.id, item.published)}
                  >
                    <Ionicons name={item.published ? "arrow-up" : "arrow-down"} size={18} color="#fff" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.previewBtn} onPress={() => setPreviewUrl(item.url)}>
                  <Ionicons name="eye" size={18} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.url)}>
                  <Ionicons name="trash" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={loadMoreGames}
        onEndReachedThreshold={0.5}
      />

      {/* WebView Preview */}
      <Modal visible={!!previewUrl} animationType="slide" onRequestClose={() => setPreviewUrl(null)}>
        <SafeAreaView style={{ flex: 1 }}>
          <LinearGradient colors={["#6a11cb", "#fff"]} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPreviewUrl(null)}>
              <Text style={{ color: "#fff", fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
            <WebView source={{ uri: previewUrl || "" }} style={{ flex: 1 }} />
          </LinearGradient>
        </SafeAreaView>
      </Modal>

      {/* Category Modal */}
      <Modal visible={catModalVisible} animationType="slide" onRequestClose={() => setCatModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, padding: 20, backgroundColor: "#f9f9f9" }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 16 }}>Select or Manage Category</Text>

          {/* Add New Category */}
          <View style={{ flexDirection: 'row', marginBottom: 16, alignItems: 'center', gap: 8 }}>
            <TextInput
              placeholder="New Category"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: "#fff"
              }}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={{ backgroundColor: "#6a11cb", padding: 10, borderRadius: 8 }} onPress={createCategory}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* Category Chips Grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  backgroundColor: categoryId === cat.id ? "#6a11cb" : "#e0e0e0",
                  marginBottom: 8
                }}
                onPress={() => { setCategoryId(cat.id); setCatModalVisible(false); }}
              >
                <Text style={{ color: categoryId === cat.id ? "#fff" : "#000", fontWeight: "500" }}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Manage Categories */}
          {role === "admin" && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>Manage Categories</Text>
            {categories.map(cat => (
              <View key={cat.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                {editingCategoryId === cat.id ? (
                  <>
                    <TextInput
                      value={editingCategoryName}
                      onChangeText={setEditingCategoryName}
                      style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#fff", marginRight: 8 }}
                    />
                    <TouchableOpacity style={{ backgroundColor: "#6a11cb", padding: 6, borderRadius: 6 }} onPress={saveEditCategory}>
                      <Text style={{ color: "#fff" }}>Save</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 16 }}>{cat.name}</Text>
                    {role === "admin" && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={{ backgroundColor: "#3498db", padding: 6, borderRadius: 6 }} onPress={() => startEditCategory(cat)}>
                          <Text style={{ color: "#fff" }}>Rename</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: "#e74c3c", padding: 6, borderRadius: 6 }} onPress={() => deleteCategory(cat.id)}>
                          <Ionicons name="trash" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            ))}
          </View>
          )}
          <TouchableOpacity style={{ marginTop: 20, backgroundColor: "#6a11cb", padding: 12, borderRadius: 8, alignItems: "center" }} onPress={() => setCatModalVisible(false)}>
            <Text style={{ color: "#fff", fontWeight: "bold" }}>Close</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {processing && (
        <View style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontSize: 18, marginTop: 12 }}>Processing...</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0, paddingHorizontal: 12 },
  heading: { fontSize: 22, fontWeight: "bold", marginVertical: 12, color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 8, marginVertical: 0, shadowColor: "#000", shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3 },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 8, marginBottom: 8 },
  input: { flex: 1, padding: 8, fontSize: 16, color: "#000", backgroundColor: "#fff", borderRadius: 6 },
  primaryBtn: { backgroundColor: "#6a11cb", padding: 10, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "bold" },
  deleteBtn: { backgroundColor: "#e74c3c", padding: 8, borderRadius: 6, justifyContent: "center", alignItems: "center", marginLeft: 4 },
  previewBtn: { backgroundColor: "#3498db", padding: 8, borderRadius: 6, justifyContent: "center", alignItems: "center" },
  gamesHeader: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    marginVertical: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 6,
    fontSize: 16,
    color: "#333",
  },
  gameCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  gameTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  categoryBadge: {
    backgroundColor: "#3498db",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  categoryBadgeText: { color: "#fff", fontSize: 10, fontWeight: "500" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "500" },
  actionButtons: { flexDirection: "row", alignItems: "center", gap: 6 },
  publishBtn: { padding: 8, borderRadius: 6 },
  closeBtn: { padding: 12, backgroundColor: "#6a11cb", alignItems: "center" },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
});