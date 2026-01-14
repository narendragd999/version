import { useRouter } from "expo-router";
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
import { handleFirebaseError } from "../../shared/firebaseErrors";
import { LinearGradient } from "expo-linear-gradient";

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Toast.show({ type: "error", text1: "Error", text2: "Enter email & password" });
      return;
    }

    try {
      setLoading(true);
      await signUp(email.trim(), password);

      Toast.show({
        type: "success",
        text1: "Verify your email",
        text2: "Check your inbox for a verification link",
      });

      // redirect user to login after signup
      setTimeout(() => {
        router.replace("/(auth)/login");
      }, 1500);
    } catch (err: any) {
      console.error("Signup error:", err);
      handleFirebaseError(err, "Signup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#6a11cb", "#fff"]} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>📝 Create Account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholderTextColor="#999"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="#999"
        />

        <TouchableOpacity
          style={[styles.secondaryBtn, loading && { opacity: 0.7 }]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Sign Up</Text>
          )}
        </TouchableOpacity>

        {/* Already have account → Go to login */}
        <TouchableOpacity
          style={{ marginTop: 20 }}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={styles.linkText}>Already have an account? Log in</Text>
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
