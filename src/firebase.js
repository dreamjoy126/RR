import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase Web App 設定（前端公開設定；資料安全由 Authentication 與 Firestore Rules 控制）
const firebaseConfig = {
  apiKey: "AIzaSyDotVuZozZquLBs53G35vV9Shc2g4GyH2Io",
  authDomain: "rrrr-29923.firebaseapp.com",
  projectId: "rrrr-29923",
  messagingSenderId: "33128052034",
  appId: "1:33128052034:web:eb02811545ac8761aa44db"
};

const app = initializeApp(firebaseConfig);

export const firebaseReady = true;
export const auth = getAuth(app);
export const db = getFirestore(app);
