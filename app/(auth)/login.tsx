  import { useRouter } from "expo-router";
  import { sendPasswordResetEmail } from "firebase/auth";
  import React, { useState } from "react";
  import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Modal,
  } from "react-native";
  import Toast from "react-native-toast-message";
  import { useAuth } from "../../shared/AuthProvider";
  import { auth } from "../../shared/firebase";
  import { handleFirebaseError } from "../../shared/firebaseErrors";
  import { LinearGradient } from "expo-linear-gradient";

  export default function Login() {
    const { login, resendVerification, user } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
      if (!email || !password) {
        Toast.show({ type: "error", text1: "Error", text2: "Enter email & password" });
        return;
      }

      try {
        setLoading(true);
        await login(email.trim(), password);

        if (user && !user.emailVerified) {
          Toast.show({
            type: "info",
            text1: "Email not verified",
            text2: "Please verify your email or resend the link",
          });
          return;
        }

        Toast.show({ type: "success", text1: "Welcome back!" });
        router.replace("/");
      } catch (err: any) {
        console.error("Login error:", err);
        const message = handleFirebaseError(err);
        Toast.show({ type: "error", text1: "Login failed", text2: message });
      } finally {
        setLoading(false);
      }
    };

    const handleForgotPassword = async () => {
      if (!email) {
        Toast.show({ type: "error", text1: "Enter your email first" });
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email.trim());
        Toast.show({
          type: "success",
          text1: "Password Reset",
          text2: "Reset link sent to your email",
        });
      } catch (err: any) {
        Toast.show({ type: "error", text1: "Error", text2: err.message });
      }
    };

    return (
      <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>🔐 Sign In</Text>

          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#999"
          />

          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.secondaryBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Login</Text>
            )}
          </TouchableOpacity>

          {user && !user.emailVerified && (
            <TouchableOpacity
              style={[styles.secondaryBtn]}
              onPress={resendVerification}
            >
              <Text style={styles.btnText}>Resend Verification Link</Text>
            </TouchableOpacity>
          )}

          {/* Forgot Password */}
          <TouchableOpacity style={{ marginTop: 15 }} onPress={handleForgotPassword}>
            <Text style={styles.linkText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Switch to Signup */}
          <TouchableOpacity
            style={{ marginTop: 20 }}
            onPress={() => router.replace("/(auth)/signup")}
          >
            <Text style={styles.linkText}>Don’t have an account? Sign up</Text>
          </TouchableOpacity>
        </View>

        {/* Loader Overlay */}
        {loading && (
          <Modal visible transparent animationType="fade">
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ marginTop: 12, color: "#fff", fontWeight: "bold" }}>
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
      justifyContent: "center",
      padding: 20,
    },
    card: {
      backgroundColor: "#fff",
      borderRadius: 12,
      padding: 20,
      elevation: 3,
    },
    title: {
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 20,
      textAlign: "center",
      color: "#333",
    },
    input: {
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 10,
      padding: 12,
      marginBottom: 15,
      fontSize: 14,
      backgroundColor: "#fff",
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
    linkText: {
      textAlign: "center",
      color: "#6a11cb",
      fontWeight: "600",
      fontSize: 15,
    },
    loaderOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
  });
