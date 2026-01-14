// shared/firebaseErrors.ts
import { Alert } from "react-native";
import Toast from "react-native-toast-message";

export function handleFirebaseError(err: any, context: string = "Action") {
  let message = "Something went wrong. Please try again.";

  if (err?.code) {
    switch (err.code) {
      case "auth/email-already-in-use":
        message = "This email is already registered. Please log in instead.";
        break;
      case "auth/invalid-email":
        message = "Invalid email format. Please enter a valid email.";
        break;
      case "auth/weak-password":
        message = "Password is too weak. Use at least 6 characters.";
        break;
      case "auth/user-not-found":
        message = "No account found with this email. Please sign up first.";
        break;
      case "auth/wrong-password":
        message = "Incorrect password. Please try again.";
        break;
      case "auth/network-request-failed":
        message = "Network error. Please check your internet connection.";
        break;
      case "auth/user-disabled":
        message = "This account has been disabled. Contact support.";
        break;
      default:
        message = err.message || message;
    }
  }

  // ✅ Always log raw Firebase error for developers
  console.error(`${context} error:`, err);

  // ✅ Show toast if mounted, else fallback to Alert
  try {
    Toast.show({
      type: "error",
      text1: `${context} failed`,
      text2: message,
    });
  } catch {
    Alert.alert(`${context} failed`, message);
  }
}
