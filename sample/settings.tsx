// app/(tabs)/settings.tsx
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../shared/firebase";
import { useAuth } from "../../shared/AuthProvider";

export default function SettingsScreen() {
  const { role, loading } = useAuth();
  const isAdmin = role === "admin";

  const [baseUrl, setBaseUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "other">("general");

  useEffect(() => {
    if (loading || !isAdmin) return;
    const fetchSettings = async () => {
      try {
        const ref = doc(db, "settings", "appConfig");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setBaseUrl(data?.baseUrl || "");
          setGithubToken(data?.githubToken || "");
        }
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to fetch settings");
      }
    };
    fetchSettings();
  }, [loading, isAdmin]);

  const saveSettings = async () => {
    try {
      setProcessing(true);
      await setDoc(
        doc(db, "settings", "appConfig"),
        { baseUrl, githubToken },
        { merge: true }
      );
      Alert.alert("✅ Success", "Settings updated!");
    } catch (err) {
      console.error(err);
      Alert.alert("❌ Error", "Failed to save settings");
    } finally {
      setProcessing(false);
    }
  };

  if (!isAdmin) {
    return (
      <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
        <Text style={styles.noAccess}>
          ❌ You are not authorized to view this page.
        </Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <View style={styles.card}>
        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "general" && styles.tabActive]}
            onPress={() => setActiveTab("general")}
          >
            <Ionicons
              name="construct"
              size={18}
              color={activeTab === "general" ? "#fff" : "#333"}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "general" && styles.tabTextActive,
              ]}
            >
              General
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "other" && styles.tabActive]}
            onPress={() => setActiveTab("other")}
          >
            <Ionicons
              name="apps"
              size={18}
              color={activeTab === "other" ? "#fff" : "#333"}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "other" && styles.tabTextActive,
              ]}
            >
              Other
            </Text>
          </TouchableOpacity>
        </View>

        {/* General Tab */}
        {activeTab === "general" && (
          <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
            <View style={styles.inputBox}>
              <Ionicons name="link" size={18} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Enter Base URL"
                placeholderTextColor="#999"
                value={baseUrl}
                onChangeText={setBaseUrl}
              />
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="logo-github" size={18} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Enter Github Access Token"
                placeholderTextColor="#999"
                value={githubToken}
                onChangeText={setGithubToken}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.secondaryBtn, processing && { opacity: 0.7 }]}
              onPress={saveSettings}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>💾 Save Settings</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Other Tab */}
        {activeTab === "other" && (
          <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
            <Text style={{ fontSize: 16, color: "#333" }}>
              This is a dummy tab for future settings.
            </Text>
          </ScrollView>
        )}
      </View>

      {/* Loader Modal */}
      {processing && (
        <Modal visible transparent animationType="fade">
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text
              style={{ marginTop: 12, color: "#fff", fontWeight: "bold" }}
            >
              Processing...
            </Text>
          </View>
        </Modal>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    justifyContent: "center",
  },
  noAccess: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 40,
    fontWeight: "600",
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    margin: 10,
    elevation: 3,
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 15,
    borderRadius: 8,
    overflow: "hidden",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: "#eee",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#6a11cb" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#333" },
  tabTextActive: { color: "#fff" },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
    width: "100%",
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: "#333",
  },
  primaryBtn: {
    backgroundColor: "#3498db",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    width: "100%",
  },
  secondaryBtn: {
    backgroundColor: "#6a11cb",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
    width: "100%",
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  loaderOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
