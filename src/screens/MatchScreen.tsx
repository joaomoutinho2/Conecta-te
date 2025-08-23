import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { auth, db } from '../services/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  setDoc, serverTimestamp
} from 'firebase/firestore';

type UserDoc = { nickname?: string; avatar?: string; interests?: string[]; };

function deterministicMatchId(a: string, b: string) {
  const [x, y] = [a, b].sort();
  return `${x}_${y}`;
}

export default function MatchScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const [status, setStatus] = useState<'searching' | 'nomatch' | 'ready'>('searching');

  const findMatch = async () => {
    try {
      // 1) os meus interesses
      const meSnap = await getDoc(doc(db, 'users', uid));
      const me = (meSnap.data() || {}) as UserDoc;
      const myInterests = (me.interests || []).slice(0, 10);
      if (myInterests.length === 0) {
        setStatus('nomatch');
        return Alert.alert('Interesses em falta', 'Escolhe pelo menos 1 interesse.');
      }

      // 2) candidatos (pelo menos 1 interesse em comum)
      const qUsers = query(
        collection(db, 'users'),
        where('interests', 'array-contains-any', myInterests),
        limit(25)
      );
      const candSnap = await getDocs(qUsers);

      // 3) escolher o melhor candidato e calcular overlap sem ler outra vez
      type BestCandidate = { uid: string; shared: string[] };
      let best: BestCandidate | null = null;
      candSnap.forEach((d) => {
        if (d.id === uid) return;
        const ints = (d.data().interests || []) as string[];
        const shared = ints.filter((i) => myInterests.includes(i));
        if (shared.length > 0) {
          if (!best || shared.length > best.shared.length) best = { uid: d.id, shared };
        }
      });

      if (!best) {
        setStatus('nomatch');
        return;
      }

      // 4) criar (ou usar) o match
      const { uid: bestUid, shared: bestShared } = best;
      const mid = deterministicMatchId(uid, bestUid);
      const mref = doc(db, 'matches', mid);
      const exists = await getDoc(mref);
      if (!exists.exists()) {
        await setDoc(mref, {
          participants: [uid, bestUid],
          sharedInterests: bestShared,
          unlocked: { [uid]: false, [bestUid]: false },
          createdAt: serverTimestamp(),
          mode: '1to1'
        });
      }

      setStatus('ready');
      navigation.replace('Chat', { matchId: mid });
    } catch (e: any) {
      console.error('Match error:', e?.code || e, e?.message);
      Alert.alert('Erro', e?.message || 'Falha ao procurar match (permissões).');
      setStatus('nomatch');
    }
  };

  useEffect(() => { findMatch(); }, []);

  if (status === 'searching') {
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
        <Text style={{ color:'#666', textAlign:'center' }}>Tenta selecionar outros interesses, ou volta a procurar.</Text>
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
