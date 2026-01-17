import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

interface AppConfig {
  baseUrl?: string;
  shareHostUrl?: string;
  githubToken?: string;
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "settings", "appConfig");

    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        setConfig(snap.data() as AppConfig);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  return {
    baseUrl: config.baseUrl ?? "",
    shareHostUrl: config.shareHostUrl ?? "",
    githubToken: config.githubToken ?? "",
    loading,
  };
}
