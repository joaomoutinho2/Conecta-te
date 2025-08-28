// src/screens/ProfileSetupScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';

import { auth, db, storage } from '../services/firebase';
import {
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { INTERESTS_SEED, Interest } from '../utils/interestsSeed';
import { randomNickname, avatarFromNickname } from '../utils/nicknames';

type AppConfig = { maxInterests?: number };

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
  line: '#233047',
};

type UserDoc = {
  nickname?: string;
  displayName?: string;
  age?: number;
  bio?: string;
  profilePhoto?: string;
  avatar?: string;
  interests?: string[];
  profileCompleted?: boolean;
};

type RouteParams = {
  onDone?: string; // nome da rota para navegar quando concluir (opcional)
};

const DEFAULT_MAX_INTERESTS = 5;

export default function ProfileSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { onDone } = (route.params || {}) as RouteParams;

  const uid = auth.currentUser?.uid!;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // campos
  const [nickname, setNickname] = useState('');
  const [ageStr, setAgeStr] = useState('');
  const [bio, setBio] = useState('');

  // fotos
  const [profileLocal, setProfileLocal] = useState<string | null>(null);
  const [avatarLocal, setAvatarLocal] = useState<string | null>(null);
  const [profileRemote, setProfileRemote] = useState<string | null>(null);
  const [avatarRemote, setAvatarRemote] = useState<string | null>(null);

  // interesses (quick pick)
  const [maxInterests, setMaxInterests] = useState<number>(DEFAULT_MAX_INTERESTS);
  const [selected, setSelected] = useState<string[]>([]);
  const quickInterests = useMemo<Interest[]>(
    () => INTERESTS_SEED.slice(0, 24),
    []
  );

  const displayAvatar = useMemo(() => {
    if (avatarLocal) return { uri: avatarLocal };
    if (avatarRemote) return { uri: avatarRemote };
    const nick = nickname?.trim() || 'Conectate';
    return { uri: avatarFromNickname(nick) };
  }, [avatarLocal, avatarRemote, nickname]);

  const displayProfile = useMemo(() => {
    if (profileLocal) return { uri: profileLocal };
    if (profileRemote) return { uri: profileRemote };
    return null;
  }, [profileLocal, profileRemote]);

  // ---------- permissões ----------
  const ensureCameraPerm = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Autoriza o acesso à câmara para tirar foto.');
      return false;
    }
    return true;
  }, []);

  const ensureGalleryPerm = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Autoriza o acesso à galeria para escolher uma imagem.');
      return false;
    }
    return true;
  }, []);

  // ---------- manipulação de imagem ----------
  const processImage = useCallback(async (uri: string, squareMax = 512) => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: squareMax, height: squareMax } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  }, []);

  const processImageWide = useCallback(async (uri: string, maxWidth = 1080) => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  }, []);

  // ---------- pick/take ----------
  const pickAvatar = useCallback(async () => {
    if (!(await ensureGalleryPerm())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    setAvatarLocal(await processImage(res.assets[0].uri, 512));
  }, [ensureGalleryPerm, processImage]);

  const takeAvatar = useCallback(async () => {
    if (!(await ensureCameraPerm())) return;
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    setAvatarLocal(await processImage(res.assets[0].uri, 512));
  }, [ensureCameraPerm, processImage]);

  const pickProfile = useCallback(async () => {
    if (!(await ensureGalleryPerm())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.9,
    });
    if (res.canceled) return;
    setProfileLocal(await processImageWide(res.assets[0].uri, 1080));
  }, [ensureGalleryPerm, processImageWide]);

  const takeProfile = useCallback(async () => {
    if (!(await ensureCameraPerm())) return;
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.9,
    });
    if (res.canceled) return;
    setProfileLocal(await processImageWide(res.assets[0].uri, 1080));
  }, [ensureCameraPerm, processImageWide]);

  // ---------- toggle interesses ----------
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

  // ---------- carregar dados ----------
  useEffect(() => {
    let mount = true;
    (async () => {
      try {
        // maxInterests (config opcional)
        let max = DEFAULT_MAX_INTERESTS;
        try {
          const cfg = await getDoc(doc(db, 'app_config', 'general'));
          const data = (cfg.exists() ? (cfg.data() as AppConfig) : {}) || {};
          if (typeof data.maxInterests === 'number') {
            max = data.maxInterests;
            setMaxInterests(data.maxInterests);
          }
        } catch (_) {}

        const userRef = doc(db, 'users', uid);
        let snap;
        try {
          // Tenta obter do servidor; se falhar (offline), usa cache local.
          snap = await getDoc(userRef);
        } catch (err) {
          console.warn('[profile] getDoc failed, using cache', err);
          snap = await getDocFromCache(userRef);
        }
        if (!mount) return;

        if (snap?.exists()) {
          const u = snap.data() as UserDoc;
          setNickname(u.nickname || u.displayName || randomNickname());
          setAgeStr(typeof u.age === 'number' ? String(u.age) : '');
          setBio(u.bio || '');
          setProfileRemote(u.profilePhoto || null);
          setAvatarRemote(u.avatar || null);
          setSelected(Array.isArray(u.interests) ? u.interests.slice(0, max) : []);
        } else {
          // valores default
          setNickname(randomNickname());
          setSelected([]);
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Erro', 'Não foi possível carregar o teu perfil.');
      } finally {
        if (mount) setLoading(false);
      }
    })();
    return () => {
      mount = false;
    };
  }, [uid]);

  // ---------- upload helper ----------
  const uploadToStorage = useCallback(async (localUri: string, remotePath: string) => {
    const resp = await fetch(localUri);
    const blob = await resp.blob();
    const r = ref(storage, remotePath);
    await uploadBytes(r, blob, { contentType: 'image/jpeg' });
    return getDownloadURL(r);
  }, []);

  // ---------- guardar ----------
  const onSave = useCallback(async () => {
    const nick = nickname.trim();
    if (!nick) {
      Alert.alert('Validação', 'Escolhe um nickname.');
      return;
    }
    const age = ageStr.trim() ? Number(ageStr.trim()) : undefined;
    if (ageStr.trim() && Number.isNaN(age)) {
      Alert.alert('Validação', 'Idade inválida.');
      return;
    }

    try {
      setSaving(true);

      const userRef = doc(db, 'users', uid);
      let cached: Partial<UserDoc> | undefined;
      try {
        const cachedSnap = await getDocFromCache(userRef);
        if (cachedSnap.exists()) {
          cached = cachedSnap.data() as UserDoc;
        }
      } catch (_) {}

      const offline = typeof navigator !== 'undefined' && (navigator as any).onLine === false;
      if (!cached && offline) {
        Alert.alert('Offline', 'Sem ligação à internet e sem dados locais. Não foi possível guardar o perfil.');
        setSaving(false);
        return;
      }

      let profileUrl = profileRemote || null;
      let avatarUrl = avatarRemote || null;

      // upload se escolhidas novas imagens
      if (profileLocal) {
        const path = `users/${uid}/profile_${Date.now()}.jpg`;
        profileUrl = await uploadToStorage(profileLocal, path);
      }
      if (avatarLocal) {
        const path = `users/${uid}/avatar_${Date.now()}.jpg`;
        avatarUrl = await uploadToStorage(avatarLocal, path);
      }
      // se não existir avatar, usa gerado por nickname
      if (!avatarUrl) {
        avatarUrl = avatarFromNickname(nick);
      }

      await setDoc(
        userRef,
        {
          ...(cached || {}),
          nickname: nick,
          displayName: nick,
          age: typeof age === 'number' ? age : null,
          bio: bio.trim(),
          profilePhoto: profileUrl,
          avatar: avatarUrl,
          interests: selected,
          profileCompleted: true,
          updatedAt: serverTimestamp(),
        } as Partial<UserDoc>,
        { merge: true }
      );

      // navegação ao concluir
      if (onDone) {
        navigation.navigate(onDone as any);
      } else {
        // tenta reset para Tabs; se não existir, volta atrás
        try {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Tabs' as never }],
            })
          );
        } catch {
          navigation.goBack();
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível guardar o teu perfil.');
    } finally {
      setSaving(false);
    }
  }, [
    nickname,
    ageStr,
    bio,
    profileLocal,
    avatarLocal,
    profileRemote,
    avatarRemote,
    selected,
    uid,
    uploadToStorage,
    navigation,
    onDone,
  ]);

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {/* Header */}
          <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderColor: COLORS.border, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="person-circle" size={22} color={COLORS.brand} />
            <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>Completa o teu perfil</Text>
          </View>

          {/* Fotos */}
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            {/* Avatar */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Avatar</Text>
              <View style={{ width: 110, height: 110, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#1f2937' }}>
                <Image source={displayAvatar} style={{ width: '100%', height: '100%' }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={takeAvatar}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>Tirar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={pickAvatar}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>Escolher</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Foto de perfil */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Foto</Text>
              <View
                style={{
                  width: 110,
                  height: 138,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: COLORS.line,
                  backgroundColor: '#1f2937',
                }}
              >
                {displayProfile ? (
                  <Image source={displayProfile} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image" size={22} color={COLORS.sub} />
                    <Text style={{ color: COLORS.sub, fontSize: 12, marginTop: 4 }}>Sem foto</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={takeProfile}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>Tirar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={pickProfile}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>Escolher</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Nickname */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Nickname</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="at" size={16} color={COLORS.sub} />
              <TextInput
                value={nickname}
                onChangeText={setNickname}
                placeholder="Escolhe um nickname"
                placeholderTextColor={COLORS.sub}
                style={{ flex: 1, color: COLORS.text, paddingVertical: 10, marginLeft: 8 }}
                maxLength={24}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setNickname(randomNickname())} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="refresh" size={18} color={COLORS.sub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Idade & Bio */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Idade (opcional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border }}>
                <Ionicons name="calendar" size={16} color={COLORS.sub} />
                <TextInput
                  value={ageStr}
                  onChangeText={(v) => setAgeStr(v.replace(/[^\d]/g, ''))}
                  placeholder="Ex.: 22"
                  placeholderTextColor={COLORS.sub}
                  keyboardType="numeric"
                  style={{ flex: 1, color: COLORS.text, paddingVertical: 10, marginLeft: 8 }}
                  maxLength={2}
                />
              </View>
            </View>
            <View style={{ flex: 2 }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Bio (opcional)</Text>
              <View style={{ backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border }}>
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Fala um pouco sobre ti…"
                  placeholderTextColor={COLORS.sub}
                  style={{ color: COLORS.text, paddingVertical: 10 }}
                  maxLength={200}
                  multiline
                />
              </View>
              <Text style={{ color: COLORS.sub, fontSize: 12, textAlign: 'right', marginTop: 4 }}>{bio.length}/200</Text>
            </View>
          </View>

          {/* Interesses rápidos */}
          <View style={{ marginTop: 6, marginBottom: 8 }}>
            <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Interesses (rápido)</Text>
            <Text style={{ color: COLORS.sub, marginBottom: 8 }}>
              Selecionados: <Text style={{ color: COLORS.text, fontWeight: '800' }}>{selected.length}</Text> / {maxInterests}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {quickInterests.map((it) => {
                const active = selected.includes(it.id);
                return <Chip key={it.id} label={it.name} active={active} onPress={() => toggle(it.id)} />;
              })}
            </View>
            <Text style={{ color: COLORS.sub, fontSize: 12, marginTop: 6 }}>
              Podes editar interesses com mais detalhe mais tarde na aba <Text style={{ color: COLORS.text, fontWeight: '800' }}>Interesses</Text>.
            </Text>
          </View>

          {/* Guardar */}
          <View style={{ height: 12 }} />
          <TouchableOpacity
            disabled={saving}
            onPress={onSave}
            style={{
              backgroundColor: saving ? '#4b5563' : COLORS.brand,
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 14,
              borderRadius: 14,
              alignItems: 'center',
            }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Concluir</Text>}
          </TouchableOpacity>

          <View style={{ height: 8 }} />
          <Text style={{ color: COLORS.sub, fontSize: 12, textAlign: 'center' }}>
            Podes alterar tudo isto mais tarde no teu perfil.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
