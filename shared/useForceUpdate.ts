import { useEffect } from "react";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

let forceChecked = false;

export function useForceUpdate() {
  useEffect(() => {
    if (forceChecked) return;
    forceChecked = true;

    const runCheck = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "appVersion"));
        if (!snap.exists()) return;

        const { latestVersion, forceUpdate, message } = snap.data();
        const currentVersion = Constants.expoConfig?.version;

        if (forceUpdate && currentVersion !== latestVersion) {
          Alert.alert(
            "Update Required",
            message || "New version available",
            [
              {
                text: "Update",
                onPress: () => {
                  Linking.openURL(
                    Platform.OS === "android"
                      ? "https://play.google.com/store/apps/details?id=com.narendragd.BrainstaApp"
                      : "https://apps.apple.com/app/idXXXXXXXX"
                  );
                }
              }
            ],
            { cancelable: false }
          );
        }
      } catch (e) {
        console.log("Force update error:", e);
      }
    };

    runCheck();
  }, []);
}
