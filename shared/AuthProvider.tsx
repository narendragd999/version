// shared/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { checkOTAUpdateOnce } from "./checkOTAUpdate";
import { useForceUpdate } from "./useForceUpdate";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resendVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  signUp: async () => {},
  login: async () => {},
  logout: async () => {},
  resendVerification: async () => {},
});

const DEVICE_KEY = "brainsta_device_id";

// 🔑 Generate or fetch stable per-install device ID
const generateDeviceId = async (): Promise<string> => {
  let saved = await AsyncStorage.getItem(DEVICE_KEY);
  if (saved) return saved;

  let newId: string;
  try {
    if (Application.androidId) {
      newId = Application.androidId;
    } else if (Application.getIosIdForVendorAsync) {
      const iosId = await Application.getIosIdForVendorAsync();
      newId = iosId || Crypto.randomUUID();
    } else {
      newId = Crypto.randomUUID();
    }
  } catch {
    newId = Crypto.randomUUID();
  }

  await AsyncStorage.setItem(DEVICE_KEY, newId);
  return newId;
};

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<string>("");
  const [role, setRole] = useState<string | null>(null);
  const sessionUnsubRef = useRef<null | (() => void)>(null);

  // 🔴 BLOCK app if version is outdated (Firestore controlled)
  useForceUpdate();

  // 🟢 Auto OTA update (runs once, safe)
  useEffect(() => {
    checkOTAUpdateOnce();
  }, []);

  // ✅ Initialize deviceId once
  useEffect(() => {
    (async () => {
      const id = await generateDeviceId();
      setDeviceId(id);
      console.log("🔑 DeviceId initialized:", id);
    })();
  }, []);

  const forceLocalSignOut = async () => {
    Toast.show({
      type: "error",
      text1: "Logged out",
      text2: "Your account was logged in on another device.",
    });
    try {
      await signOut(auth);
    } catch {}
    setUser(null);
  };

  // 🔹 Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (sessionUnsubRef.current) {
        sessionUnsubRef.current();
        sessionUnsubRef.current = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);

        // 🔹 Fetch role from Firestore
        try {
          const userDoc = await getDoc(doc(db, "Users", firebaseUser.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role || "creator");
          } else {
            setRole("creator");
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
          setRole("creator");
        }

        // 🔹 Attach session listener (check if another device logs in)
        setTimeout(() => {
          const sessionRef = doc(db, "sessions", firebaseUser.uid);
          sessionUnsubRef.current = onSnapshot(sessionRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              if (data.deviceId && data.deviceId !== deviceId) {
                forceLocalSignOut();
              }
            }
          });
        }, 1000);
      } else {
        setUser(null);
        setRole(null);
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (sessionUnsubRef.current) sessionUnsubRef.current();
    };
  }, [deviceId]);
  
  // ---- signup ----
  const signUp = async (email: string, password: string) => {
    const id = deviceId || (await generateDeviceId());
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    if (cred.user) {
      await sendEmailVerification(cred.user);

      // ✅ Generate username: uid (short) + timestamp
      const uniqueUsername = `user_${cred.user.uid.substring(0, 6)}_${Date.now()}`;

      // ✅ Generate initials for avatar
      const initials = email
        .split("@")[0]
        .slice(0, 2)
        .toUpperCase();

      // ✅ Avatar URL with random background
      const avatarUrl = `https://ui-avatars.com/api/?name=${initials}&background=random&color=fff`;

      // Save user profile in Firestore
      await setDoc(doc(db, "Users", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        role: "creator",
        username: uniqueUsername,   // Auto username
        avatar: avatarUrl,          // Auto avatar
        createdAt: serverTimestamp(),
        emailVerified: false,
      });

      // ✅ Save session for this device
      await setDoc(doc(db, "sessions", cred.user.uid), {
        deviceId: id,
        updatedAt: serverTimestamp(),
      });

      setUser(cred.user);
    }
  };


  // ---- login ----
  const login = async (email: string, password: string) => {
    const id = deviceId || (await generateDeviceId());
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // ✅ Overwrite session with this deviceId
    await setDoc(doc(db, "sessions", cred.user.uid), {
      deviceId: id,
      updatedAt: serverTimestamp(),
    });

    setUser(cred.user);
  };

  // ---- logout ----
  const logout = async () => {
    try {
      if (auth.currentUser) {
        await setDoc(
          doc(db, "sessions", auth.currentUser.uid),
          { deviceId: null, updatedAt: serverTimestamp() },
          { merge: true }
        );
        await signOut(auth);
      }
    } finally {
      setUser(null);
    }
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    } else {
      throw new Error("No authenticated user");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        role,
        signUp,
        login,
        logout,
        resendVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
