// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

type UserDoc = {
  profileCompleted?: boolean;
  nickname?: string;
  displayName?: string;
  avatar?: string;
  profilePhoto?: string;
  interests?: string[];
  [k: string]: any;
};

type AuthCtx = {
  user: User | null;
  userDoc: UserDoc | null;
  profileCompleted: boolean;
  loading: boolean; // true até sabermos o estado (auth + userDoc)
};

const Ctx = createContext<AuthCtx>({
  user: null,
  userDoc: null,
  profileCompleted: false,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [docReady, setDocReady] = useState(false);

  // 1) auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2) doc do utilizador (só quando autenticado)
  useEffect(() => {
    setUserDoc(null);
    setDocReady(false);
    if (!user) {
      // sem user, não há doc para carregar
      setDocReady(true);
      return;
    }
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null);
        setDocReady(true);
      },
      () => setDocReady(true)
    );
    return () => unsub();
  }, [user]);

  const loading = !authReady || (user ? !docReady : false);
  const profileCompleted = !!userDoc?.profileCompleted;

  const value = useMemo(
    () => ({ user, userDoc, profileCompleted, loading }),
    [user, userDoc, profileCompleted, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
