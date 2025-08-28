// src/screens/MatchScreen.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  ScrollView,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../services/firebase';
import useNetwork from '../hooks/useNetwork';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromCache,
  getDocsFromCache,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { COLORS } from '../utils/colors';

// Fallback helper to compare arrays without pulling in an additional
// dependency at runtime. If `fast-deep-equal` is present it will be used.
let isEqual: (a: unknown, b: unknown) => boolean;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  isEqual = require('fast-deep-equal');
} catch {
  isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
}

type UserDoc = {
  displayName?: string;
  nickname?: string;
  profilePhoto?: string;
  avatar?: string;
  bio?: string;
  age?: number;
  interests?: string[];
};

type QueueDoc = {
  status: 'waiting' | 'matched';
  interests: string[];
  ts: any; // timestamp
};

type Candidate = {
  uid: string;
  shared: string[];
  score: number;
  profile: UserDoc;
};


const MAX_INTERESTS_MATCH = 10; // para queries com array-contains-any
const MAX_INTERESTS = 30; // ajusta ao teu limite
const FETCH_LIMIT = 40;         // candidatos por batch

function matchIdFor(a: string, b: string) {
  return [a, b].sort((x, y) => (x < y ? -1 : 1)).join('_');
}

export default function MatchScreen({ navigation }: any) {
  const tabBarHeight = useBottomTabBarHeight();
  const uid = auth.currentUser?.uid!;
  const { isConnected } = useNetwork(db);
  const [me, setMe] = useState<UserDoc | null>(null);

  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  // 1) Ler o meu perfil e garantir que estou na queue “waiting” com os interesses atualizados
  const prevInterestsRef = useRef<string[] | null>(null);
  const lastWriteRef = useRef<number>(0);

  useEffect(() => {
    if (!uid) return;
    let unsub: any;
    (async () => {
      try {
        unsub = onSnapshot(doc(db, 'users', uid), async (snap) => {
          const data = (snap.exists() ? (snap.data() as UserDoc) : null);
          setMe(data);
          const interests = (data?.interests ?? []).slice(0, MAX_INTERESTS);

          // Dedupe por conteúdo
          if (prevInterestsRef.current && isEqual(prevInterestsRef.current, interests)) return;
          prevInterestsRef.current = interests;

          // Throttle: no máx. 1 write por 5s
          const now = Date.now();
          if (now - lastWriteRef.current < 5000) return;
          lastWriteRef.current = now;

          if (interests.length) {
            await setDoc(doc(db, 'match_queue', uid), {
              status: 'waiting',
              interests,
              ts: serverTimestamp(),
            }, { merge: true });
          }
          setLoading(false);
        });
      } catch (e) {
        console.error('[match:init]', e);
        setLoading(false);
      }
    })();

    return () => {
      unsub && unsub();
    };
  }, [uid]);

  // pontuação de afinidade simples (nº de interesses em comum, desempate por idade próxima se existir)
  const scoreCandidate = useCallback((mine: UserDoc, other: UserDoc) => {
    const mineSet = new Set(mine.interests || []);
    const shared = (other.interests || []).filter((i) => mineSet.has(i));
    let score = shared.length;

    if (typeof mine.age === 'number' && typeof other.age === 'number') {
      const diff = Math.abs(mine.age - other.age);
      // bónus pequeno quanto mais próximo
      score += Math.max(0, 5 - Math.min(5, Math.floor(diff / 2)));
    }

    return { shared, score };
  }, []);

  // buscar candidatos “waiting” com interesses em comum e escolher o melhor localmente
  const fetchBestCandidate = useCallback(async () => {
    if (!me?.interests?.length) {
      Alert.alert('Perfil incompleto', 'Escolhe alguns interesses primeiro.');
      return;
    }
    setFinding(true);
    try {
      const q = query(
        collection(db, 'match_queue'),
        where('status', '==', 'waiting'),
        where('interests', 'array-contains-any', me.interests.slice(0, MAX_INTERESTS_MATCH)),
        orderBy('ts', 'asc'),
        limit(FETCH_LIMIT)
      );

      let qs;
      try {
        qs = await getDocs(q);
      } catch (err: any) {
        if (err.code === 'unavailable') {
          try {
            qs = await getDocsFromCache(q);
          } catch {
            Alert.alert('Sem ligação à internet');
            return;
          }
        } else {
          throw err;
        }
      }

      if (!qs || qs.empty) {
        setCandidate(null);
        Alert.alert('Sem candidatos agora', 'Volta a tentar em breve.');
        return;
      }

      let offline = false;
      const candidates = (
        await Promise.all(
          qs.docs.map(async (d) => {
            const otherUid = d.id;
            if (otherUid === uid) return null;

            const userRef = doc(db, 'users', otherUid);
            let userSnap;
            try {
              userSnap = await getDoc(userRef);
            } catch (err: any) {
              if (err.code === 'unavailable') {
                try {
                  userSnap = await getDocFromCache(userRef);
                } catch {
                  offline = true;
                  return null;
                }
              } else {
                return null;
              }
            }
            if (!userSnap || !userSnap.exists()) return null;

            const profile = userSnap.data() as UserDoc;
            const { shared, score } = scoreCandidate(me, profile);
            if (shared.length === 0) return null;

            return { uid: otherUid, shared, score, profile } as Candidate;
          })
        )
      ).filter(Boolean) as Candidate[];

      if (offline) {
        Alert.alert('Sem ligação à internet');
      }

      candidates.sort((a, b) => b.score - a.score);
      setCandidate(candidates[0] || null);
    } catch (e: any) {
      console.error('[match:fetch]', e);
      Alert.alert('Erro', 'Não foi possível procurar candidatos.');
    } finally {
      setFinding(false);
    }
  }, [me, uid, scoreCandidate]);

  // 2) Tentar “reivindicar” e criar o match com transação (evita corridas simples)
  const startChatWith = useCallback(async (otherUid: string) => {
    const mid = matchIdFor(uid, otherUid);

    try {
      setFinding(true);
      await runTransaction(db, async (tx) => {
        const qMeRef = doc(db, 'match_queue', uid);
        const qOtRef = doc(db, 'match_queue', otherUid);
        const matchRef = doc(db, 'matches', mid);

        const [meQ, otQ, mDoc] = await Promise.all([tx.get(qMeRef), tx.get(qOtRef), tx.get(matchRef)]);

        if (mDoc.exists()) {
          // já existe match — segue para chat
          return;
        }

        const meStatus = meQ.exists() ? (meQ.data() as QueueDoc).status : 'waiting';
        const otStatus = otQ.exists() ? (otQ.data() as QueueDoc).status : 'waiting';

        if (meStatus !== 'waiting' || otStatus !== 'waiting') {
          throw new Error('Um dos utilizadores já não está disponível.');
        }

        // criar match
        tx.set(matchRef, {
          participants: [uid, otherUid],
          lastMessageAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        // marcar ambos como matched (simples; em produção, poderias remover da queue)
        tx.update(qMeRef, { status: 'matched', ts: serverTimestamp() });
        tx.update(qOtRef, { status: 'matched', ts: serverTimestamp() });
      });

      // navega para o chat
      navigation.navigate('Chat', { mid, otherUid });
    } catch (e: any) {
      console.error('[match:tx]', e);
      Alert.alert('Ups', e?.message || 'Não foi possível iniciar conversa.');
    } finally {
      setFinding(false);
    }
  }, [navigation, uid]);

  const Card = useMemo(() => {
    if (!candidate) return null;
    const p = candidate.profile;
    const photo = p.profilePhoto || p.avatar;
    return (
      <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, overflow: 'hidden' }}>
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: '100%', height: 220 }} />
        ) : (
          <View style={{ width: '100%', height: 220, backgroundColor: '#1f2937' }} />
        )}

        <View style={{ padding: 14, gap: 8 }}>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800' }}>
            {p.displayName || p.nickname || 'Utilizador'}
            {typeof p.age === 'number' ? `, ${p.age}` : ''}
          </Text>
          {!!p.bio && <Text style={{ color: COLORS.sub }}>{p.bio}</Text>}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {candidate.shared.slice(0, 6).map((it) => (
              <View key={it} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>#{it}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => setCandidate(null)}
              style={{ flex: 1, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.text, fontWeight: '700' }}>Passar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => startChatWith(candidate.uid)}
              style={{ flex: 1, backgroundColor: COLORS.brand, borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Iniciar conversa</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [candidate, startChatWith]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {!isConnected && (
        <View style={{ backgroundColor: COLORS.danger, padding: 8 }}>
          <Text style={{ color: '#fff', textAlign: 'center' }}>Sem ligação à internet</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarHeight + 24, paddingTop: 12 }}>
        {/* Header */}
        <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderColor: COLORS.border, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="sparkles" size={20} color={COLORS.brand} />
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>Encontra pessoas compatíveis</Text>
        </View>

        {/* Estado do perfil */}
        {!me?.interests?.length ? (
          <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, gap: 10 }}>
            <Text style={{ color: COLORS.sub }}>
              Para começares, escolhe alguns interesses na aba **Interesses**. Isso ajuda a sugerir-te pessoas com mais afinidade.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Interesses')}
              style={{ backgroundColor: COLORS.brand, borderColor: COLORS.border, borderWidth: 1, padding: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Escolher interesses</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Controlo de procura */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={fetchBestCandidate}
                disabled={finding}
                style={{ flex: 1, backgroundColor: COLORS.brand, borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 12, alignItems: 'center' }}
              >
                {finding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Procurar candidato</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCandidate(null)}
                style={{ width: 56, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="refresh" size={18} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Cartão do candidato */}
            {candidate ? (
              Card
            ) : (
              <View style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14 }}>
                <Text style={{ color: COLORS.sub }}>
                  Carrega em <Text style={{ color: COLORS.text, fontWeight: '800' }}>Procurar candidato</Text> para ver uma sugestão com base nos teus interesses.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
