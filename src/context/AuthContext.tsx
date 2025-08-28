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

type CtxType = {
  user: User | null;
  userDoc: UserDoc | null;
  profileCompleted: boolean;
  loading: boolean; // true até sabermos: (a) auth resolvida, (b) userDoc lido (se houver user)
};

const Ctx = createContext<CtxType>({
  user: null,
  userDoc: null,
  profileCompleted: false,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [docReady, setDocReady] = useState(false);

  // 1) Autenticação
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2) Documento do utilizador (sem atrasos)
  useEffect(() => {
    setUserDoc(null);
    setDocReady(false);

    if (!user) { setDocReady(true); return; }

    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      snap => {
        setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null);
        setDocReady(true);
      },
      _err => { setDocReady(true); } // não bloqueia caso dê erro
    );
    return () => unsub();
  }, [user?.uid]);

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
