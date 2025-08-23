// src/screens/MatchScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { auth, db } from '../services/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  setDoc, serverTimestamp
} from 'firebase/firestore';

type UserDoc = { nickname?: string; avatar?: string; interests?: string[]; };

const deterministicMatchId = (a: string, b: string) => {
  const [x, y] = [a, b].sort();
  return `${x}_${y}`;
};

export default function MatchScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const [status, setStatus] = useState<'searching' | 'nomatch' | 'ready'>('searching');
  const [hint, setHint] = useState<string | null>(null); // 👉 pistas quando há erro

  const findMatch = async () => {
    if (!uid) {
      setStatus('nomatch');
      setHint('Utilizador não autenticado.');
      return;
    }

    setStatus('searching');
    setHint(null);

    try {
      // STEP 1 — ler os meus interesses
      let meSnap;
      try {
        meSnap = await getDoc(doc(db, 'users', uid));
      } catch (e: any) {
        console.log('STEP1 getDoc(users/me) err:', e?.code, e?.message);
        throw e;
      }
      const me = (meSnap.data() || {}) as UserDoc;
      const myInterests = (me.interests || []).slice(0, 10);
      if (myInterests.length === 0) {
        setStatus('nomatch');
        setHint('Não tens interesses guardados.');
        Alert.alert('Interesses em falta', 'Escolhe pelo menos 1 interesse.');
        return;
      }

      // STEP 2 — query a /users por interesse em comum
      let candSnap;
      try {
        const qUsers = query(
          collection(db, 'users'),
          where('interests', 'array-contains-any', myInterests),
          limit(25)
        );
        candSnap = await getDocs(qUsers);
      } catch (e: any) {
        console.log('STEP2 query(users) err:', e?.code, e?.message);
        if (e?.code === 'permission-denied') {
          setHint('Regras do Firestore estão a bloquear leitura de /users. Em Rules: match /users/{uid} { allow read: if request.auth != null; }');
        }
        throw e;
      }

      // STEP 3 — escolher melhor candidato sem ler outra vez
      type Best = { uid: string; shared: string[] };
      let best: Best | null = null;
      candSnap.forEach((d) => {
        if (d.id === uid) return;
        const ints = (d.data().interests || []) as string[];
        const shared = ints.filter((i) => myInterests.includes(i));
        if (shared.length > 0 && (!best || shared.length > best.shared.length)) {
          best = { uid: d.id, shared };
        }
      });

      if (!best) {
        setStatus('nomatch');
        setHint('Não encontrámos ninguém com interesses em comum neste momento.');
        return;
      }

      // STEP 4 — criar/reutilizar o match
      const bestMatch = best as Best;
      const mid = deterministicMatchId(uid, bestMatch.uid);
      try {
        const mref = doc(db, 'matches', mid);
        const exists = await getDoc(mref);
        if (!exists.exists()) {
          await setDoc(mref, {
            participants: [uid, bestMatch.uid],
            sharedInterests: bestMatch.shared,
            unlocked: { [uid]: false, [bestMatch.uid]: false },
            createdAt: serverTimestamp(),
            mode: '1to1',
          });
        }
      } catch (e: any) {
        console.log('STEP3 setDoc(match) err:', e?.code, e?.message);
        if (e?.code === 'permission-denied') {
          setHint('Regras do Firestore estão a bloquear criação de /matches. Em Rules: match /matches/{matchId} { allow create: if request.auth != null; }');
        }
        throw e;
      }

      setStatus('ready');
      navigation.replace('Chat', { matchId: mid });
    } catch (e: any) {
      console.log('Match error:', e?.code, e?.message);
      Alert.alert('Erro', e?.message || 'Falha ao procurar match (permissões).');
      setStatus('nomatch');
    }
  };

  useEffect(() => { findMatch(); }, []);

  if (status === 'searching') {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:8, padding:16 }}>
        <ActivityIndicator />
        <Text>A procurar alguém com interesses em comum…</Text>
      </View>
    );
  }

  if (status === 'nomatch') {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24, gap:12 }}>
        <Text style={{ fontSize:18, fontWeight:'700', textAlign:'center' }}>Ainda sem matches</Text>
        {hint ? <Text style={{ color:'#666', textAlign:'center' }}>{hint}</Text> : null}
        <TouchableOpacity onPress={findMatch} style={{ backgroundColor:'#111', padding:12, borderRadius:10 }}>
          <Text style={{ color:'#fff', fontWeight:'700' }}>Procurar novamente</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.replace('Interests')} style={{ padding:10 }}>
          <Text>Alterar interesses</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
      <Text>Encontrámos alguém! A abrir chat…</Text>
    </View>
  );
}
