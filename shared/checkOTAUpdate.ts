import * as Updates from "expo-updates";
import { Alert } from "react-native";

let alreadyChecked = false;

export async function checkOTAUpdateOnce() {
  if (__DEV__) return;
  if (alreadyChecked) return;

  alreadyChecked = true;

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();

      Alert.alert(
        "Update Ready",
        "A new update is available. Restarting app.",
        [{ text: "OK", onPress: () => Updates.reloadAsync() }],
        { cancelable: false }
      );
    }
  } catch (err) {
    console.log("OTA update failed:", err);
  }
}
