// shared/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyBeFSC30o-02iPrxWLWzimDbVGthMiTe6k",
  authDomain: "brainsta-9d23f.firebaseapp.com",
  projectId: "brainsta-9d23f",
  storageBucket: "brainsta-9d23f.firebasestorage.app",
  messagingSenderId: "1077844347798",
  appId: "1:1077844347798:web:5f60fec19cadfb5c65ebb7",
  measurementId: "G-SPLFQ3X8YD"
};

const app = initializeApp(firebaseConfig);

// ✅ Must use initializeAuth, not getAuth
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

const db = getFirestore(app);

export { auth, db };