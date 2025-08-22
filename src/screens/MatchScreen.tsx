import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { auth, db } from '../services/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  setDoc, serverTimestamp
} from 'firebase/firestore';

type UserDoc = {
  nickname?: string;
  avatar?: string;
  interests?: string[];
};

function deterministicMatchId(a: string, b: string) {
  const [x, y] = [a, b].sort();
  return `${x}_${y}`;
}

export default function MatchScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const [status, setStatus] = useState<'idle' | 'searching' | 'nomatch' | 'ready'>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);

  // procura e cria/usa um match
  const findMatch = async () => {
    setStatus('searching');
    try {
      // 1) ler os meus interesses
      const meRef = doc(db, 'users', uid);
      const meSnap = await getDoc(meRef);
      const me = (meSnap.data() || {}) as UserDoc;
      const myInterests = (me.interests || []).slice(0, 10); // segurança (limite do array-contains-any)

      if (myInterests.length === 0) {
        setStatus('nomatch');
        return Alert.alert('Interesses em falta', 'Escolhe pelo menos 1 interesse.');
      }

      // 2) candidatos com pelo menos 1 interesse igual
      const q = query(
        collection(db, 'users'),
        where('interests', 'array-contains-any', myInterests),
        limit(25),
      );
      const candSnap = await getDocs(q);

      // 3) filtrar eu próprio e ordenar por maior interseção
      type Cand = { uid: string; score: number };
      const candidates: Cand[] = [];
      candSnap.forEach((d) => {
        const otherUid = d.id;
        if (otherUid === uid) return;
        const ints = (d.data().interests || []) as string[];
        const overlap = ints.filter((i) => myInterests.includes(i)).length;
        if (overlap > 0) candidates.push({ uid: otherUid, score: overlap });
      });
      // maior overlap primeiro (empates são OK)
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length === 0) {
        setStatus('nomatch');
        return;
      }

      const other = candidates[0].uid;
      const mid = deterministicMatchId(uid, other);
      const mref = doc(db, 'matches', mid);

      // 4) criar match se ainda não existe
      const ex = await getDoc(mref);
      if (!ex.exists()) {
        // partilhar interseção para UI
        const otherSnap = await getDoc(doc(db, 'users', other));
        const otherInterests = (otherSnap.data()?.interests || []) as string[];
        const sharedInterests = Array.from(
          new Set((me.interests || []).filter((i) => otherInterests.includes(i)))
        );

        await setDoc(mref, {
          participants: [uid, other],
          sharedInterests,
          unlocked: { [uid]: false, [other]: false },
          createdAt: serverTimestamp(),
          mode: '1to1',
        });

        // mensagem de sistema opcional
        // (evita ter de criar logo uma mensagem manualmente)
      }

      setMatchId(mid);
      setStatus('ready');
      // segue para o chat
      navigation.replace('Chat', { matchId: mid });
    } catch (e: any) {
      console.error(e);
      setStatus('nomatch');
      Alert.alert('Erro', e?.message ?? 'Falha ao procurar match.');
    }
  };

  useEffect(() => {
    findMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'searching' || status === 'idle') {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:8 }}>
        <ActivityIndicator />
        <Text>A procurar alguém com interesses em comum…</Text>
      </View>
    );
  }

  if (status === 'nomatch') {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:24, gap:12 }}>
        <Text style={{ fontSize:18, fontWeight:'700', textAlign:'center' }}>Ainda sem matches</Text>
        <Text style={{ color:'#666', textAlign:'center' }}>
          Tenta selecionar outros interesses, ou volta a procurar.
        </Text>
        <TouchableOpacity
          onPress={findMatch}
          style={{ backgroundColor:'#111', padding:12, borderRadius:10 }}
        >
          <Text style={{ color:'#fff', fontWeight:'700' }}>Procurar novamente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.replace('Interests')}
          style={{ padding:10 }}
        >
          <Text>Alterar interesses</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ready: já navega para Chat automaticamente; este estado é raramente visto
  return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
      <Text>Encontrámos alguém! A abrir chat…</Text>
    </View>
  );
}
