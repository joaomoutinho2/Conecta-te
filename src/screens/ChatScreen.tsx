// src/screens/ChatScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  SafeAreaView,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../services/firebase';
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

type Msg = {
  id: string;
  from: string;
  text: string;
  createdAt?: any; // Firestore Timestamp
  system?: boolean;
};

type MatchDoc = {
  participants: string[];
  lastMessageAt?: any;
  lastSeen?: Record<string, any>;
};

type UserDoc = {
  displayName?: string;
  nickname?: string;
  profilePhoto?: string;
  avatar?: string;
};

type RouteParams = {
  mid: string;      // match id
  otherUid: string; // uid do outro participante
};

const COLORS = {
  bg: '#0f172a',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.15)',
  text: '#e5e7eb',
  sub: '#9ca3af',
  brand: '#7c3aed',
  error: '#fb7185',
  input: 'rgba(255,255,255,0.08)',
  bubbleMine: '#7c3aed',
  bubbleOther: '#1f2937',
};

const PAGE_SIZE = 30; // nº de mensagens por página

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { mid, otherUid } = (route.params || {}) as RouteParams;

  const uid = auth.currentUser?.uid!;
  const listRef = useRef<FlatList<Msg>>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');

  const [matchDoc, setMatchDoc] = useState<MatchDoc | null>(null);
  const [otherUser, setOtherUser] = useState<UserDoc | null>(null);

  // cursor para paginação (doc mais antigo atualmente carregado)
  const [oldestDoc, setOldestDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const title = useMemo(
    () => otherUser?.displayName || otherUser?.nickname || 'Conversa',
    [otherUser]
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  // --- Header (match + outro utilizador)
  useEffect(() => {
    let unsubMatch: any;
    let unsubOther: any;

    const run = async () => {
      try {
        unsubMatch = onSnapshot(doc(db, 'matches', mid), (snap) => {
          setMatchDoc(snap.exists() ? (snap.data() as MatchDoc) : null);
        });
        unsubOther = onSnapshot(doc(db, 'users', otherUid), (snap) => {
          setOtherUser(snap.exists() ? (snap.data() as UserDoc) : null);
        });
      } catch (e) {
        console.error('[chat header]', e);
      }
    };
    run();
    return () => {
      unsubMatch && unsubMatch();
      unsubOther && unsubOther();
    };
  }, [mid, otherUid]);

  // --- marca como lido (com throttle para evitar writes repetidos)
  const lastMarkRef = useRef(0);
  const markReadThrottled = useCallback(async () => {
    const now = Date.now();
    if (now - lastMarkRef.current < 4000) return; // no máximo 1 write/4s
    lastMarkRef.current = now;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'matches', mid), {
        [`lastSeen.${uid}`]: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[chat markRead]', e);
    }
  }, [mid, uid]);

  // --- Listener vivo das últimas mensagens
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setHasMore(true);

      const msgsRef = collection(db, 'matches', mid, 'messages');
      const qLive = query(msgsRef, orderBy('createdAt', 'asc'), limitToLast(PAGE_SIZE));

      const unsub = onSnapshot(qLive, (qs) => {
        const arr: Msg[] = [];
        qs.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        setMessages(arr);
        setOldestDoc(qs.docs.length ? qs.docs[0] : null);
        setLoading(false);
        if (arr.length) {
          scrollToEnd();
          // só marca como lido se a última mensagem não for tua
          const last = arr[arr.length - 1];
          if (last?.from && last.from !== uid) markReadThrottled();
        }
      });

      // marca uma vez quando entras (throttled)
      markReadThrottled();

      return () => unsub();
    }, [mid, scrollToEnd, markReadThrottled, uid])
  );

  // --- Carregar mensagens mais antigas (prepend) quando chegas ao topo
  const loadMore = useCallback(async () => {
    if (loadingMore || !oldestDoc || !hasMore) return;
    try {
      setLoadingMore(true);
      const msgsRef = collection(db, 'matches', mid, 'messages');

      const qOlder = query(
        msgsRef,
        orderBy('createdAt', 'asc'),
        endBefore(oldestDoc),
        limitToLast(PAGE_SIZE)
      );

      const qs = await getDocs(qOlder);
      const olderArr: Msg[] = [];
      qs.forEach((d) => olderArr.push({ id: d.id, ...(d.data() as any) }));

      if (olderArr.length === 0) {
        setHasMore(false);
        return;
      }

      // Prepend mantendo ordem cronológica
      setMessages((prev) => [...olderArr, ...prev]);

      // Atualiza cursor: o primeiro doc agora é o mais antigo carregado
      setOldestDoc(qs.docs.length ? qs.docs[0] : null);
    } catch (e) {
      console.error('[chat loadMore]', e);
      Alert.alert('Erro', 'Não foi possível carregar mensagens antigas.');
    } finally {
      setLoadingMore(false);
    }
  }, [mid, oldestDoc, loadingMore, hasMore]);

  // Detecta aproximação ao topo
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (e.nativeEvent.contentOffset.y < 80) {
        loadMore();
      }
    },
    [loadMore]
  );

  // --- Enviar mensagem
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !uid) return;

    try {
      setSending(true);
      const msgsRef = collection(db, 'matches', mid, 'messages');

      await addDoc(msgsRef, {
        from: uid,
        text,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'matches', mid), {
        lastMessageAt: serverTimestamp(),
      });

      setInput('');
      scrollToEnd();
    } catch (e) {
      console.error('[sendMessage]', e);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }, [uid, mid, input, scrollToEnd]);

  // --- Render
  const renderItem = useCallback(
    ({ item }: { item: Msg }) => {
      const isMine = item.from === uid;
      return (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: isMine ? 'flex-end' : 'flex-start',
            paddingHorizontal: 12,
            marginTop: 4,
          }}
        >
          <View
            style={{
              maxWidth: '78%',
              backgroundColor: isMine ? COLORS.bubbleMine : COLORS.bubbleOther,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 15 }}>{item.text}</Text>
          </View>
        </View>
      );
    },
    [uid]
  );

  const keyExtractor = useCallback((m: Msg) => m.id, []);

  const Header = useMemo(() => {
    const photo = otherUser?.profilePhoto || otherUser?.avatar;
    return (
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.bg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={{ width: 36, height: 36 }}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#233047',
              }}
            />
          ) : (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: '#1f2937',
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontWeight: '800' }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ color: COLORS.sub, fontSize: 12 }} numberOfLines={1}>
            {matchDoc ? 'Conversa' : '—'}
          </Text>
        </View>
      </View>
    );
  }, [navigation, otherUser, title, matchDoc]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {Header}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          windowSize={7}
          removeClippedSubviews
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 10 }}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : !hasMore ? (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: COLORS.sub, fontSize: 12 }}>Sem mais mensagens</Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingVertical: 10 }}
        />

        {/* Composer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.bg,
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Escreve uma mensagem..."
            placeholderTextColor={COLORS.sub}
            style={{
              flex: 1,
              backgroundColor: COLORS.input,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === 'ios' ? 12 : 8,
              color: COLORS.text,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
            multiline
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={sending || !input.trim()}
            style={{
              marginLeft: 10,
              backgroundColor: sending || !input.trim() ? '#4b5563' : COLORS.brand,
              borderRadius: 999,
              padding: 10,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
