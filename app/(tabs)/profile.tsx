// app/(tabs)/profile.tsx
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  TextInput,
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Platform,
  StatusBar,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../shared/AuthProvider";
import { db } from "../../shared/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Toast from "react-native-toast-message";
import * as Linking from "expo-linking";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "settings">("profile");
  const openPrivacyPolicy = () => {
    Linking.openURL("https://narendragd999.github.io/Games/privacy.html");
  };


  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        const profileRef = doc(db, "userProfiles", user.uid);
        const snap = await getDoc(profileRef);

        if (snap.exists()) {
          const data = snap.data();
          setUsername(data.username || "");
          setBio(data.bio || "");
          setAvatarUrl(data.avatarUrl || "");
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    };

    fetchProfile();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setLoading(true);

    try {
      await setDoc(
        doc(db, "userProfiles", user.uid),
        { bio, avatarUrl }, // 🔒 username stays locked
        { merge: true }
      );
      Toast.show({ type: "success", text1: "Profile Updated" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Update Failed",
        text2: err.message || "Something went wrong",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const contactSupport = () => {
    const email = "narendragd999@gmail.com";
    const subject = encodeURIComponent("Brainsta App Support");
    const body = encodeURIComponent(
      "Please describe your issue below:\n\n" +
      "------------------------------\n" +
      "App: Brainsta\n" +
      "Platform: " + Platform.OS + "\n"
    );

    const mailUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    Linking.openURL(mailUrl).catch(() => {
      Alert.alert(
        "Error",
        "No email app found. Please contact us at " + email
      );
    });
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.noUser}>No user logged in</Text>
      </SafeAreaView>
    );
  }

  // 🔹 Auto initials avatar if no avatarUrl found
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    username || user.email || "User"
  )}&background=6a11cb&color=fff&size=128`;

  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <View style={styles.card}>
        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "profile" && styles.tabActive]}
            onPress={() => setActiveTab("profile")}
          >
            <Ionicons
              name="person-circle"
              size={18}
              color={activeTab === "profile" ? "#fff" : "#333"}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "profile" && styles.tabTextActive,
              ]}
            >
              Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "settings" && styles.tabActive]}
            onPress={() => setActiveTab("settings")}
          >
            <Ionicons
              name="settings"
              size={18}
              color={activeTab === "settings" ? "#fff" : "#333"}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "settings" && styles.tabTextActive,
              ]}
            >
              Settings
            </Text>
          </TouchableOpacity>
        </View>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
            {/* Email */}
            <Text style={styles.email}>{user.email}</Text>

            {/* Avatar */}
            <Image
              source={{ uri: avatarUrl || fallbackAvatar }}
              style={styles.avatar}
            />

            {/* Read-only Username */}
            <View style={styles.readOnlyBox}>
              <Ionicons name="person" size={18} color="#666" />
              <Text style={styles.readOnlyText}>{username}</Text>
            </View>

            {/* Editable Bio */}
            <View style={[styles.inputBox, { height: 60 }]}>
              <Ionicons name="book" size={18} color="#666" />
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Bio"
                placeholderTextColor="#999"
                value={bio}
                onChangeText={setBio}
                multiline
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            {/* Save Btn */}
            <TouchableOpacity
              style={[styles.secondaryBtn, loading && { opacity: 0.7 }]}
              onPress={saveProfile}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Save</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
            {/* Privacy Policy */}
            <TouchableOpacity
              style={styles.actionCard}
              activeOpacity={0.85}
              onPress={openPrivacyPolicy}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="shield-checkmark" size={22} color="#fff" />
              </View>

              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Privacy Policy</Text>
                <Text style={styles.actionSubtitle}>
                  How we protect and use your data
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            </TouchableOpacity>

            {/* Contact Support */}
            <TouchableOpacity
              style={styles.actionCard}
              activeOpacity={0.85}
              onPress={contactSupport}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="mail" size={22} color="#fff" />
              </View>

              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Contact Support</Text>
                <Text style={styles.actionSubtitle}>
                  Need help? Get in touch with us
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            </TouchableOpacity>

            
            <View style={{ marginTop: 20 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleLogout}>
                <Text style={styles.btnText}>Log Out</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        )}
      </View>

      {/* Loader Modal */}
      {loading && (
        <Modal visible transparent animationType="fade">
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loaderText}>Processing...</Text>
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
  tabActive: {
    backgroundColor: "#6a11cb",
  },
  tabText: { fontSize: 14, fontWeight: "600", color: "#333" },
  tabTextActive: { color: "#fff" },
  email: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
    color: "#333",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    alignSelf: "center",
  },
  readOnlyBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 10,
    width: "100%",
    backgroundColor: "#f5f5f5",
  },
  readOnlyText: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: "#555",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 10,
    width: "100%",
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: "#333",
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
  loaderText: {
    marginTop: 12,
    color: "#fff",
    fontWeight: "bold",
  },
  noUser: {
    color: "#333",
    textAlign: "center",
    marginTop: 40,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },

  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#6a11cb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  actionTextWrap: {
    flex: 1,
  },

  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },

  actionSubtitle: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },

});
