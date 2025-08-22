import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { auth, db } from '../services/firebase';
import { collection, getDocs, orderBy, query, writeBatch, doc, updateDoc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { INTERESTS_SEED, Interest } from '../utils/interestsSeed';
import { avatarFromNickname, randomNickname } from '../utils/nicknames';

const MAX = 3;

export default function InterestsScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const [all, setAll] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 1) tentar ler interesses
        const ref = collection(db, 'interests');
        let snap = await getDocs(query(ref, orderBy('name')));
        // 2) se vazio, semear 1x
        if (snap.empty) {
          const batch = writeBatch(db);
          INTERESTS_SEED.forEach((i) => {
            batch.set(doc(db, 'interests', i.id), i);
          });
          await batch.commit();
          snap = await getDocs(query(ref, orderBy('name')));
        }
        const items: Interest[] = [];
        snap.forEach((d) => items.push(d.data() as Interest));
        setAll(items);

        // 3) carregar seleção existente, se houver
        const uref = doc(db, 'users', uid);
        const u = await getDoc(uref);
        const ints = (u.data()?.interests as string[]) ?? [];
        setSelected(ints.slice(0, MAX));
      } catch (e) {
        console.error(e);
        Alert.alert('Erro', 'Falha a carregar interesses.');
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      if (prev.length >= MAX) {
        Alert.alert('Limite', `Escolhe no máximo ${MAX}.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Interest[]>();
    all.forEach((i) => {
      if (!map.has(i.cat)) map.set(i.cat, []);
      map.get(i.cat)!.push(i);
    });
    return Array.from(map.entries()).map(([cat, items]) => ({ cat, items }));
  }, [all]);

  const handleSave = async () => {
    if (selected.length === 0) return Alert.alert('Seleciona', 'Escolhe pelo menos 1 interesse.');
    setSaving(true);
    try {
      const uref = doc(db, 'users', uid);

      // garantir nickname/avatar
      const u = await getDoc(uref);
      let patch: any = { interests: selected, updatedAt: serverTimestamp() };
      if (!u.exists() || !u.data()?.nickname) {
        const nick = randomNickname();
        patch.nickname = nick;
        patch.avatar = avatarFromNickname(nick);
        patch.createdAt = u.exists() ? u.data()?.createdAt ?? serverTimestamp() : serverTimestamp();
      }
      await setDoc(uref, patch, { merge: true });

      navigation.replace('Match'); // segue para o próximo ecrã
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></View>;
  }

  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={{ fontSize:22, fontWeight:'800', marginBottom:4 }}>Escolhe até {MAX} interesses</Text>
      <Text style={{ color:'#666', marginBottom:12 }}>Isto ajuda a ligar-te a pessoas com gostos iguais.</Text>

      <FlatList
        data={grouped}
        keyExtractor={(g) => g.cat}
        renderItem={({ item }) => (
          <View style={{ marginBottom:12 }}>
            <Text style={{ fontWeight:'700', marginVertical:6 }}>{item.cat}</Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
              {item.items.map((i) => {
                const active = selected.includes(i.id);
                return (
                  <TouchableOpacity
                    key={i.id}
                    onPress={() => toggle(i.id)}
                    style={{
                      paddingVertical:8, paddingHorizontal:12, borderRadius:999,
                      borderWidth:1, borderColor: active ? '#111' : '#ddd',
                      backgroundColor: active ? '#111' : '#fff'
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : '#111' }}>{i.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      />

      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={{ backgroundColor:'#111', padding:14, borderRadius:12, alignItems:'center', marginTop:8 }}
      >
        <Text style={{ color:'#fff', fontWeight:'700' }}>{saving ? 'A guardar…' : 'Continuar'}</Text>
      </TouchableOpacity>
    </View>
  );
}
