// src/services/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  setLogLevel,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

type FirebaseExtra = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const cfg = (Constants.expoConfig?.extra as any)?.firebase as FirebaseExtra;
if (!cfg?.apiKey) {
  console.warn('[firebase] Missing config from app.json > extra.firebase');
}

export const app = getApps().length ? getApps()[0] : initializeApp(cfg);
export const auth = getAuth(app);

// Firestore com cache local persistente (arranques/leitura bem mais rápidos).
// Em Android + DEV, alguns ambientes precisam de long-polling para ficar estável.
let _db: ReturnType<typeof initializeFirestore>;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache(),
    ...(Platform.OS === 'android' && __DEV__ ? { experimentalForceLongPolling: true, useFetchStreams: false } : {}),
  } as any);
} catch {
  // fallback para memória (não persiste entre arranques)
  _db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  } as any);
}

// Reduz verbosidade de logs (menos custo no bridge)
setLogLevel(__DEV__ ? 'warn' : 'error');

export const db = _db;
export const storage = getStorage(app);
