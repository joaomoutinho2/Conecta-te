import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import { auth, db } from '../services/firebase';
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc
} from 'firebase/firestore';

type Msg = { id: string; from: string; text: string; createdAt?: any; system?: boolean; };
type MatchDoc = {
  participants: string[];
  sharedInterests?: string[];
  unlocked?: Record<string, boolean>;
};

export default function ChatScreen({ route, navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const { matchId } = route.params as { matchId: string };

  const [messages, setMessages] = useState<Msg[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [otherUser, setOtherUser] = useState<any>(null);

  const listRef = useRef<FlatList>(null);

  // carregar match + outro utilizador
  useEffect(() => {
    const mref = doc(db, 'matches', matchId);
    const unsubMatch = onSnapshot(mref, async (snap) => {
      if (!snap.exists()) return;
      const m = snap.data() as MatchDoc;
      setMatch(m);
      const otherUid = m.participants.find((x) => x !== uid)!;
      const uref = doc(db, 'users', otherUid);
      const usnap = await getDoc(uref);
      setOtherUser({ id: otherUid, ...usnap.data() });
    });

    // subscrever mensagens
    const mcol = collection(db, 'matches', matchId, 'messages');
    const q = query(mcol, orderBy('createdAt', 'asc'));
    const unsubMsgs = onSnapshot(q, (snap) => {
      const arr: Msg[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setMessages(arr);
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });

    return () => { unsubMatch(); unsubMsgs(); };
  }, [matchId, uid]);

  const unlockedMine = match?.unlocked?.[uid] ?? false;
  const otherUid = useMemo(() => match?.participants?.find((x) => x !== uid), [match, uid]);
  const unlockedOther = match?.unlocked?.[otherUid || ''] ?? false;
  const bothUnlocked = unlockedMine && unlockedOther;

  const handleSend = async () => {
    const text = msg.trim();
    if (!text) return;
    setMsg('');
    await addDoc(collection(db, 'matches', matchId, 'messages'), {
      from: uid,
      text,
      createdAt: serverTimestamp(),
      system: false
    });
  };

  const handleUnlock = async () => {
    await updateDoc(doc(db, 'matches', matchId), {
      [`unlocked.${uid}`]: true
    });
  };

  if (loading || !match || !otherUser) {
    return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header simples */}
      <View style={{ paddingTop:50, paddingBottom:12, paddingHorizontal:16, borderBottomWidth:1, borderColor:'#eee', backgroundColor:'#fff' }}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
          <Image source={{ uri: otherUser?.avatar }} style={{ width:36, height:36, borderRadius:18, backgroundColor:'#ddd' }} />
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:16, fontWeight:'700' }}>
              {bothUnlocked ? (otherUser?.name || otherUser?.nickname || 'Utilizador') : (otherUser?.nickname || 'Utilizador')}
            </Text>
            <Text style={{ color:'#666', fontSize:12 }}>
              {match.sharedInterests?.length ? `Interesses em comum: ${match.sharedInterests.join(', ')}` : 'Conversa anónima'}
            </Text>
          </View>
          {!unlockedMine && (
            <TouchableOpacity onPress={handleUnlock} style={{ backgroundColor:'#111', paddingHorizontal:10, paddingVertical:8, borderRadius:10 }}>
              <Text style={{ color:'#fff', fontWeight:'700' }}>Desbloquear</Text>
            </TouchableOpacity>
          )}
        </View>
        {bothUnlocked && <Text style={{ marginTop:6, color:'#0a0' }}>🔓 Perfis desbloqueados</Text>}
      </View>

      {/* Mensagens */}
      <FlatList
        ref={listRef}
        contentContainerStyle={{ padding:16, gap:8 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const mine = item.from === uid;
          return (
            <View style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              backgroundColor: mine ? '#111' : '#eee',
              paddingHorizontal:12, paddingVertical:8, borderRadius:12, maxWidth: '85%'
            }}>
              <Text style={{ color: mine ? '#fff' : '#111' }}>{item.text}</Text>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={{ flexDirection:'row', gap:8, padding:12, borderTopWidth:1, borderColor:'#eee', backgroundColor:'#fff' }}>
        <TextInput
          value={msg}
          onChangeText={setMsg}
          placeholder="Escreve uma mensagem…"
          style={{ flex:1, borderWidth:1, borderColor:'#ddd', borderRadius:12, paddingHorizontal:12, paddingVertical:10 }}
        />
        <TouchableOpacity onPress={handleSend} style={{ backgroundColor:'#111', paddingHorizontal:16, borderRadius:12, justifyContent:'center' }}>
          <Text style={{ color:'#fff', fontWeight:'700' }}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
