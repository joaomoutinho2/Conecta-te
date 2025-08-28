// src/services/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// Firebase v12 RN persistence util not typed/exported correctly
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  setLogLevel,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

// Firestore com cache local persistente para acesso offline.
// Em React Native forçamos long polling para maior compatibilidade.
const isWeb = Platform.OS === 'web';
let localCache;
try {
  // Tenta persistência em disco (AsyncStorage / IndexedDB).
  localCache = persistentLocalCache();
} catch (_) {
  // Fallback para cache em memória caso a persistência não esteja disponível.
  localCache = memoryLocalCache();
}

const _db = initializeFirestore(app, {
  localCache,
  ...(isWeb
    ? { experimentalAutoDetectLongPolling: true }
    : { experimentalForceLongPolling: true, useFetchStreams: false }),
} as any);

// Reduz verbosidade de logs (menos custo no bridge)
setLogLevel(__DEV__ ? 'warn' : 'error');

export const db = _db;
export const storage = getStorage(app);
