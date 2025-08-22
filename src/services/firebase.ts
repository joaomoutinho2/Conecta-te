// src/services/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCdedo1UjNROpFU5v4_3CegqyWFs-HEYKo",
  authDomain: "conecta-te-149e7.firebaseapp.com",
  projectId: "conecta-te-149e7",
  storageBucket: "conecta-te-149e7.appspot.com",
  messagingSenderId: "547765500925",
  appId: "1:547765500925:web:b50b1b51560c9fbca1b794",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
