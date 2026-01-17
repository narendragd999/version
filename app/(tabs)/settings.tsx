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
import * as Linking from "expo-linking";
import Constants from "expo-constants";

export default function SettingsScreen() {
  const { role, loading } = useAuth();
  const isAdmin = role === "admin";

  // -------------------- State --------------------
  const [baseUrl, setBaseUrl] = useState("");
  const [shareHostUrl, setShareHostUrl] = useState("");

  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubToken, setGithubToken] = useState("");

  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "other">("general");

  // -------------------- Fetch settings (FIXED) --------------------
  useEffect(() => {
    if (loading || !isAdmin) return;

    const fetchSettings = async () => {
      try {
        const ref = doc(db, "settings", "appConfig");
        const snap = await getDoc(ref);

        if (!snap.exists()) return;

        setBaseUrl(snap.get("baseUrl") || "");
        setShareHostUrl(snap.get("shareHostUrl") || "");
        setGithubOwner(snap.get("githubOwner") || "");
        setGithubRepo(snap.get("githubRepo") || "");
        setGithubBranch(snap.get("githubBranch") || "main");
        setGithubToken(snap.get("githubToken") || "");
      } catch (err) {
        console.error("Failed to fetch settings:", err);
        Alert.alert("Error", "Failed to fetch settings");
      }
    };

    fetchSettings();
  }, [loading, isAdmin]);

  // -------------------- Save settings --------------------
  const saveSettings = async () => {
    if (!baseUrl || !githubOwner || !githubRepo || !githubBranch || !githubToken) {
      Alert.alert("Missing Fields", "All GitHub fields are required.");
      return;
    }

    try {
      setProcessing(true);
      await setDoc(
        doc(db, "settings", "appConfig"),
        {
          baseUrl,
          shareHostUrl,
          githubOwner,
          githubRepo,
          githubBranch,
          githubToken,
        },
        { merge: true }
      );
      Alert.alert("✅ Success", "Settings saved successfully!");
    } catch (err) {
      console.error(err);
      Alert.alert("❌ Error", "Failed to save settings");
    } finally {
      setProcessing(false);
    }
  };

  // -------------------- Helpers --------------------
  const openPrivacyPolicy = () => {
    Linking.openURL("https://narendragd999.github.io/Games/privacy.html");
  };

  const contactSupport = () => {
    const email = "narendragd999@gmail.com";
    const subject = encodeURIComponent("Brainsta App Support");
    const body = encodeURIComponent(
      `Please describe your issue:\n\nApp: Brainsta\nPlatform: ${Platform.OS}\n`
    );
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  if (!isAdmin && activeTab === "general") {
    return (
      <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
        <Text style={styles.noAccess}>❌ You are not authorized.</Text>
      </LinearGradient>
    );
  }

  // -------------------- UI --------------------
  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <View style={styles.card}>
        {/* Tabs */}
        <View style={styles.tabRow}>
          {["general", "other"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab as any)}
            >
              <Ionicons
                name={tab === "general" ? "construct" : "apps"}
                size={18}
                color={activeTab === tab ? "#fff" : "#333"}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "general" ? "General" : "Other"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* -------- GENERAL TAB -------- */}
        {activeTab === "general" && (
          <ScrollView>
            <Field icon="link" value={baseUrl} onChange={setBaseUrl} placeholder="Base URL (GitHub Pages)" />
            <Field icon="share-social" value={shareHostUrl} onChange={setShareHostUrl} placeholder="Share Host URL" />
            <Field icon="logo-github" value={githubOwner} onChange={setGithubOwner} placeholder="GitHub Owner" />
            <Field icon="folder" value={githubRepo} onChange={setGithubRepo} placeholder="GitHub Repository" />
            <Field icon="git-branch" value={githubBranch} onChange={setGithubBranch} placeholder="GitHub Branch" />
            <Field icon="key" value={githubToken} onChange={setGithubToken} placeholder="GitHub Token" secure />

            <TouchableOpacity style={styles.secondaryBtn} onPress={saveSettings} disabled={processing}>
              {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>💾 Save Settings</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* -------- OTHER TAB -------- */}
        {activeTab === "other" && (
          <ScrollView>
            <ActionCard icon="shield-checkmark" title="Privacy Policy" subtitle="How we use your data" onPress={openPrivacyPolicy} />
            <ActionCard icon="mail" title="Contact Support" subtitle="Need help?" onPress={contactSupport} />

            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={22} color="#fff" />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.infoTitle}>Brainsta</Text>
                <Text style={styles.infoSubtitle}>
                  Version {Constants.expoConfig?.version ?? "—"}
                </Text>
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      {processing && (
        <Modal visible transparent animationType="fade">
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: "#fff", marginTop: 10 }}>Processing...</Text>
          </View>
        </Modal>
      )}
    </LinearGradient>
  );
}

/* -------------------- Components -------------------- */
const Field = ({ icon, value, onChange, placeholder, secure = false }) => (
  <View style={styles.inputBox}>
    <Ionicons name={icon} size={18} color="#666" />
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor="#999"
      value={value}
      onChangeText={onChange}
      secureTextEntry={secure}
    />
  </View>
);

const ActionCard = ({ icon, title, subtitle, onPress }) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress}>
    <View style={styles.actionIcon}>
      <Ionicons name={icon} size={22} color="#fff" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#bbb" />
  </TouchableOpacity>
);

/* -------------------- Styles -------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
  noAccess: { color: "#fff", textAlign: "center", marginTop: 40 },
  card: { flex: 1, backgroundColor: "#fff", margin: 10, borderRadius: 12, padding: 16 },
  tabRow: { flexDirection: "row", borderRadius: 8, overflow: "hidden", marginBottom: 12 },
  tabBtn: { flex: 1, padding: 10, backgroundColor: "#eee", flexDirection: "row", justifyContent: "center" },
  tabActive: { backgroundColor: "#6a11cb" },
  tabText: { fontWeight: "600", color: "#333" },
  tabTextActive: { color: "#fff" },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  input: { flex: 1, padding: 12, fontSize: 14 },
  secondaryBtn: { backgroundColor: "#6a11cb", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 10 },
  btnText: { color: "#fff", fontWeight: "bold" },
  loaderOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  actionCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, backgroundColor: "#fff", marginBottom: 12 },
  actionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#6a11cb", justifyContent: "center", alignItems: "center", marginRight: 12 },
  actionTitle: { fontWeight: "600" },
  actionSubtitle: { fontSize: 12, color: "#777" },
  infoCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#6a11cb", padding: 14, borderRadius: 12 },
  infoTitle: { color: "#fff", fontWeight: "600" },
  infoSubtitle: { color: "#ddd", fontSize: 12 },
});
