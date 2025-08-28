// src/screens/InterestsScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  TextInput,
  ScrollView,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../services/firebase';
import {
  collection,
  getDocs,
  orderBy,
  query,
  writeBatch,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { INTERESTS_SEED, Interest } from '../utils/interestsSeed';

const COLORS = {
  bg: '#0f172a',
  text: '#e5e7eb',
  sub: '#9ca3af',
  border: 'rgba(255,255,255,0.15)',
  brand: '#7c3aed',
  card: 'rgba(255,255,255,0.06)',
  input: 'rgba(255,255,255,0.08)',
  danger: '#fb7185',
  ok: '#10b981',
};

type AppConfig = {
  maxInterests?: number;
};

export default function InterestsScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const tabBarHeight = useBottomTabBarHeight();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [initialSelected, setInitialSelected] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('Todos');

  const [maxInterests, setMaxInterests] = useState<number>(5);

  // ---------- helpers ----------
  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const exists = prev.includes(id);
        if (exists) return prev.filter((x) => x !== id);
        if (prev.length >= maxInterests) {
          Alert.alert('Limite atingido', `Podes escolher até ${maxInterests} interesses.`);
          return prev;
        }
        return [...prev, id];
      });
    },
    [maxInterests]
  );

  const changed = useMemo(() => {
    if (selected.length !== initialSelected.length) return true;
    const A = [...selected].sort();
    const B = [...initialSelected].sort();
    return A.some((v, i) => v !== B[i]);
  }, [selected, initialSelected]);

  const categories = useMemo<string[]>(() => {
    const s = new Set<string>(['Todos']);
    items.forEach((i) => s.add(i.cat));
    return Array.from(s);
  }, [items]);

  const filtered = useMemo(() => {
    const byCat = cat === 'Todos' ? items : items.filter((i) => i.cat === cat);
    const term = search.trim().toLowerCase();
    if (!term) return byCat;
    return byCat.filter((i) => i.name.toLowerCase().includes(term) || i.id.toLowerCase().includes(term));
  }, [items, cat, search]);

  // ---------- seed interests if needed ----------
  const seedIfEmpty = useCallback(async () => {
    // tenta ler
    const ref = collection(db, 'interests');
    const snap = await getDocs(query(ref, orderBy('name')));
    if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Interest));

    // vazio → tentar semear (requer permissão de admin pelas regras)
    try {
      const batch = writeBatch(db);
      INTERESTS_SEED.forEach((it) => {
        batch.set(doc(db, 'interests', it.id), { id: it.id, name: it.name, cat: it.cat });
      });
      await batch.commit();
      const snap2 = await getDocs(query(ref, orderBy('name')));
      return snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Interest));
    } catch (e: any) {
      // permissões insuficientes → fallback local (não persistimos a coleção)
      console.warn('[interests seed] sem permissões; a usar seed local só para UI');
      return [...INTERESTS_SEED].sort((a, b) => a.name.localeCompare(b.name));
    }
  }, []);

  // ---------- load on mount ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 1) app_config / limite
        try {
          const cfgSnap = await getDoc(doc(db, 'app_config', 'general'));
          const cfg = (cfgSnap.exists() ? (cfgSnap.data() as AppConfig) : {}) || {};
          if (cfg.maxInterests && typeof cfg.maxInterests === 'number') {
            setMaxInterests(cfg.maxInterests);
          }
        } catch (e) {
          // ignore, usa default
        }

        // 2) interesses
        const list = await seedIfEmpty();
        if (!mounted) return;
        setItems(list);

        // 3) selecionados do user
        try {
          const uSnap = await getDoc(doc(db, 'users', uid));
          const u = uSnap.exists() ? (uSnap.data() as any) : null;
          const my = (u?.interests as string[]) || [];
          setSelected(my);
          setInitialSelected(my);
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Erro', 'Não foi possível carregar os interesses.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [uid, seedIfEmpty]);

  // ---------- save ----------
  const onSave = useCallback(async () => {
    if (!changed) return;
    if (!uid) return;
    try {
      setSaving(true);
      await setDoc(
        doc(db, 'users', uid),
        {
          interests: selected,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setInitialSelected(selected);
      Alert.alert('Guardado', 'Os teus interesses foram atualizados com sucesso.');
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível guardar. Tenta novamente.');
    } finally {
      setSaving(false);
    }
  }, [uid, changed, selected]);

  // ---------- UI ----------
  const Chip = ({ active, label, onPress }: { active?: boolean; label: string; onPress?: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? COLORS.brand : COLORS.border,
        backgroundColor: active ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: active ? '#fff' : COLORS.text, fontWeight: '700', fontSize: 12 }}>#{label}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: tabBarHeight + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* header */}
        <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderColor: COLORS.border, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="pricetags" size={20} color={COLORS.brand} />
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>Escolhe os teus interesses</Text>
        </View>

        {/* barra de pesquisa */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: COLORS.input,
            borderRadius: 12,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 12,
          }}
        >
          <Ionicons name="search" size={16} color={COLORS.sub} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Pesquisar..."
            placeholderTextColor={COLORS.sub}
            style={{ flex: 1, color: COLORS.text, paddingVertical: 10, marginLeft: 8 }}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.sub} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* filtro por categoria */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          {categories.map((c) => (
            <Chip key={c} label={c} active={c === cat} onPress={() => setCat(c)} />
          ))}
        </ScrollView>

        {/* selecionados – sempre visíveis no topo */}
        <View style={{ marginTop: 6, marginBottom: 8 }}>
          <Text style={{ color: COLORS.sub, marginBottom: 6 }}>
            Selecionados: <Text style={{ color: COLORS.text, fontWeight: '800' }}>{selected.length}</Text> / {maxInterests}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {selected.length ? (
              selected.map((id) => {
                const it = items.find((x) => x.id === id);
                return <Chip key={`sel-${id}`} label={it?.name || id} active onPress={() => toggle(id)} />;
              })
            ) : (
              <Text style={{ color: COLORS.sub }}>Nada selecionado ainda.</Text>
            )}
          </View>
        </View>

        {/* lista de interesses (filtrada) */}
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 8 }}>Sugestões</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {filtered.map((it) => {
              const active = selected.includes(it.id);
              return <Chip key={it.id} label={it.name} active={active} onPress={() => toggle(it.id)} />;
            })}
          </View>
        </View>

        {/* ações */}
        <View style={{ height: 16 }} />

        <TouchableOpacity
          disabled={!changed || saving}
          onPress={onSave}
          style={{
            backgroundColor: !changed || saving ? '#4b5563' : COLORS.brand,
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 14,
            borderRadius: 14,
            alignItems: 'center',
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '800' }}>
              {changed ? 'Guardar alterações' : 'Guardado'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 8 }} />
        <Text style={{ color: COLORS.sub, fontSize: 12 }}>
          Estas escolhas ajudam a sugerir-te pessoas com mais afinidade. Podes alterá-las quando quiseres.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
