import React, { useState } from "react";
import { ActivityIndicator, Dimensions, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

const { width } = Dimensions.get("window");

interface Props {
  uri: string;
}

export default function GameWebView({ uri }: Props) {
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      {loading && (
        <ActivityIndicator
          size="large"
          color="#0F3B8C"
          style={styles.loader}
        />
      )}

      <WebView
        source={{ uri }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        startInLoadingState
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 12,
    borderWidth: 3,
    borderColor: "#0F3B8C",
    borderRadius: 12,
    overflow: "hidden",
    width: width - 24,
    alignSelf: "center",
    height: 500, // adjust as needed
  },
  webview: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  loader: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -25,
    marginLeft: -25,
  },
});
