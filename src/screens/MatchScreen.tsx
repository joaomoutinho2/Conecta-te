// src/screens/MatchScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { auth, db } from '../services/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  setDoc, serverTimestamp
} from 'firebase/firestore';

type UserDoc = { interests?: string[]; };
const midOf = (a:string,b:string) => ([a,b].sort().join('_'));

export default function MatchScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const [status, setStatus] = useState<'searching'|'nomatch'|'ready'>('searching');

  const findMatch = async () => {
    try {
      // STEP 1: ler o meu user
      let meSnap;
      try { meSnap = await getDoc(doc(db,'users',uid)); }
      catch(e:any){ console.log('STEP1 getDoc(users/me) err:', e?.code, e?.message); throw e; }
      const myInterests = ((meSnap.data()||{} as UserDoc).interests||[]).slice(0,10);
      if (myInterests.length===0) { setStatus('nomatch'); return Alert.alert('Interesses em falta'); }

      // STEP 2: query a outros users
      let candSnap;
      try {
        const qUsers = query(collection(db,'users'), where('interests','array-contains-any', myInterests), limit(25));
        candSnap = await getDocs(qUsers);
      } catch(e:any){ console.log('STEP2 query(users) err:', e?.code, e?.message); throw e; }

      let best: { uid:string; shared:string[] } | null = null;
      candSnap.forEach(d=>{
        if (d.id===uid) return;
        const ints = (d.data().interests||[]) as string[];
        const shared = ints.filter(i=>myInterests.includes(i));
        if (shared.length>0 && (!best || shared.length>best.shared.length)) best={uid:d.id,shared};
      });
      if(!best){ setStatus('nomatch'); return; }

      // STEP 3: criar o match
      const mid = midOf(uid, best.uid);
      try {
        const mref = doc(db,'matches',mid);
        const ex = await getDoc(mref);
        if(!ex.exists()){
          await setDoc(mref,{
            participants:[uid,best.uid],
            sharedInterests: best.shared,
            unlocked:{[uid]:false,[best.uid]:false},
            createdAt: serverTimestamp(),
            mode:'1to1'
          });
        }
      } catch(e:any){ console.log('STEP3 setDoc(match) err:', e?.code, e?.message); throw e; }

      setStatus('ready');
      navigation.replace('Chat',{ matchId: mid });
    } catch(e:any){
      console.log('Match error:', e?.code, e?.message);
      Alert.alert('Erro', e?.message || 'Falha ao procurar match (permissões).');
      setStatus('nomatch');
    }
  };

  useEffect(()=>{ findMatch(); },[]);

  if(status==='searching') return (
    <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
      <ActivityIndicator/><Text>A procurar alguém com interesses em comum…</Text>
    </View>
  );
  if(status==='nomatch') return (
    <View style={{flex:1,alignItems:'center',justifyContent:'center',gap:12,padding:24}}>
      <Text style={{fontSize:18,fontWeight:'700'}}>Ainda sem matches</Text>
      <TouchableOpacity onPress={findMatch} style={{backgroundColor:'#111',padding:12,borderRadius:10}}>
        <Text style={{color:'#fff',fontWeight:'700'}}>Procurar novamente</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={()=>navigation.replace('Interests')}><Text>Alterar interesses</Text></TouchableOpacity>
    </View>
  );
  return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text>Encontrámos alguém! A abrir chat…</Text></View>;
}
