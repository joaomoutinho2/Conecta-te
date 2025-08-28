// src/screens/ChatScreen.tsx
// ChatScreen otimizado: subscrição leve, paginação por blocos, envio com serverTimestamp,
// e pequenos cuidados de UI/performance para React Native + Expo + Firestore (v9 modular).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  addDoc,
  collection,
  doc,
  endBefore,
  getDocs,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// Se já tiveres este tipo no teu projeto, importa-o daqui:
// import { RootStackParamList } from '@/navigation/RootNavigator';
// Para evitar que isto quebre se o tipo não existir, definimos um fallback mínimo:

type RootStackParamList = {
  Chat: {
    matchId: string;
    peer?: { uid: string; name?: string; avatar?: string | null };
  };
};

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

const PAGE = 50; // nº de mensagens por "página"

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<ChatRouteProp>();
  const { matchId, peer } = route.params || ({} as any);

  const uid = auth.currentUser?.uid as string | undefined;

  const msgsRef = useMemo(() => {
    if (!matchId) return null;
    return collection(db, 'matches', matchId, 'messages');
  }, [matchId]);

  const [messages, setMessages] = useState<Array<{ id: string; from: string; text: string; createdAt: any }>>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const firstDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const listRef = useRef<FlatList>(null);

  // Header simples com botão voltar e nome do peer (se existir)
  useEffect(() => {
    navigation.setOptions?.({
      headerShown: true,
      headerTitle: peer?.name ?? 'Conversa',
      headerLeft: () => (
        <TouchableOpacity style={{ paddingHorizontal: 8 }} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, peer?.name]);

  // Subscrição principal às últimas PAGE mensagens, por ordem cronológica (asc)
  useEffect(() => {
    if (!msgsRef) return;

    const q = query(msgsRef, orderBy('createdAt', 'asc'), limitToLast(PAGE));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs as QueryDocumentSnapshot<DocumentData>[];
        const items = docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        setMessages(items);
        firstDocRef.current = docs[0] || null;
        setInitialLoading(false);

        // Scroll para o fim quando chega novo conteúdo (simples, não invasivo)
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 0);
      },
      (_err) => {
        setInitialLoading(false);
      }
    );

    return () => unsub();
  }, [msgsRef]);

  // Carregar mensagens mais antigas (paginado), puxar para baixo (pull-to-refresh)
  const loadOlder = useCallback(async () => {
    if (!msgsRef) return;
    const firstDoc = firstDocRef.current;
    if (!firstDoc) return; // já não há mais antigas no buffer atual

    setRefreshing(true);
    try {
      const olderQ = query(
        msgsRef,
        orderBy('createdAt', 'asc'),
        endBefore(firstDoc),
        limitToLast(PAGE)
      );
      const olderSnap = await getDocs(olderQ);
      const olderDocs = olderSnap.docs as QueryDocumentSnapshot<DocumentData>[];
      const older = olderDocs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      setMessages((prev) => [...older, ...prev]);
      firstDocRef.current = olderDocs[0] || null;
    } finally {
      setRefreshing(false);
    }
  }, [msgsRef]);

  // Enviar mensagem
  const sendMessage = useCallback(async () => {
    if (!msgsRef || !uid) return;
    const text = input.trim();
    if (!text) return;
    if (text.length > 1000) {
      // regra de 1000 chars
      return;
    }

    setSending(true);
    try {
      // Criar mensagem (compatível com regras: from == uid, createdAt == request.time)
      await addDoc(msgsRef, {
        from: uid,
        text,
        createdAt: serverTimestamp(),
      });

      // Atualizar metadados do match (se existir)
      if (matchId) {
        const matchRef = doc(db, 'matches', matchId);
        // estes campos são genéricos e seguros; adapta à tua estrutura se tiveres badges/unreads
        await updateDoc(matchRef, {
          lastMessageAt: serverTimestamp(),
          lastMessageText: text.slice(0, 200),
        }).catch(() => {});
      }

      setInput('');
      // Scroll para o fim após enviar
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } finally {
      setSending(false);
    }
  }, [msgsRef, uid, input, matchId]);

  // Marcar como lido quando abrimos o chat (opcional, genérico)
  useEffect(() => {
    const markRead = async () => {
      if (!uid || !matchId) return;
      const matchRef = doc(db, 'matches', matchId);
      await updateDoc(matchRef, { ["reads." + uid]: serverTimestamp() }).catch(() => {});
    };
    markRead();
  }, [uid, matchId]);

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const mine = item.from === uid;
      return (
        <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
            <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextOther]}>{item.text}</Text>
          </View>
        </View>
      );
    },
    [uid]
  );

  if (!matchId) {
    return (
      <SafeAreaView style={styles.containerCenter}> 
        <Text style={{ color: '#e11d48' }}>Chat inválido</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
      >
        <View style={styles.listWrap}>
          {initialLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(it) => it.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadOlder} />}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}
        </View>

        {/* Barra de envio */}
        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Escreve uma mensagem"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            disabled={!input.trim() || sending}
            onPress={sendMessage}
          >
            {sending ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="send" size={20} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  flex: { flex: 1 },
  listWrap: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  row: { width: '100%', paddingVertical: 4, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },

  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#e9d5ff', borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: '#f3f4f6', borderTopLeftRadius: 4 },

  msgText: { fontSize: 16, lineHeight: 20 },
  msgTextMine: { color: '#1f2937' },
  msgTextOther: { color: '#111827' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    fontSize: 16,
  },
  sendBtn: {
    marginLeft: 8,
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
