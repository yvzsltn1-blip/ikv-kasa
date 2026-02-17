// firebase.ts dosyası (App.tsx ile yan yana olsun)

import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

// BURAYA FIREBASE KONSOLUNDAN ALDIĞIN "const firebaseConfig" KODUNU YAPIŞTIR
// Örnek (Sen kendi kodunu yapıştıracaksın):
const firebaseConfig = {
  apiKey: "AIzaSyDfXopA2ww46osAqoYK2VS-7Xajm3DHvXg",
  authDomain: "ikv-kasa-yonetimi.web.app",
  projectId: "ikv-kasa-yonetimi",
  storageBucket: "ikv-kasa-yonetimi.firebasestorage.app",
  messagingSenderId: "1026667249911",
  appId: "1:1026667249911:web:d699702992a5be68b993f2"
};

// Uygulamayı başlatıyoruz
const app = initializeApp(firebaseConfig);

// Dışarıya (diğer dosyalara) servisleri açıyoruz
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
});
const firestoreInstance = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: memoryLocalCache(),
});

export const db = firestoreInstance;
