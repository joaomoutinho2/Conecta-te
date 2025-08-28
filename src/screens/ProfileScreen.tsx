// src/screens/ProfileScreen.tsx
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
import { useNavigation } from '@react-navigation/native';

import { auth, db, storage } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import useNetwork from '../hooks/useNetwork';
import { COLORS } from '../utils/colors';

type UserDoc = {
  nickname?: string;
  displayName?: string;
  email?: string;
  age?: number;
  bio?: string;
  profilePhoto?: string;
  avatar?: string;
  interests?: string[];
  profileCompleted?: boolean;
  updatedAt?: any;
};


export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { userDoc } = useAuth();
  const uid = auth.currentUser?.uid!;
  const email = auth.currentUser?.email ?? '';
  const { isConnected } = useNetwork(db);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nickname, setNickname] = useState('');
  const [ageStr, setAgeStr] = useState('');
  const [bio, setBio] = useState('');

  const [profileRemote, setProfileRemote] = useState<string | null>(null);
  const [avatarRemote, setAvatarRemote] = useState<string | null>(null);

  const [profileLocal, setProfileLocal] = useState<string | null>(null);
  const [avatarLocal, setAvatarLocal] = useState<string | null>(null);

  const displayProfile = useMemo(() => {
    if (profileLocal) return { uri: profileLocal };
    if (profileRemote) return { uri: profileRemote };
    return null;
  }, [profileLocal, profileRemote]);

  const displayAvatar = useMemo(() => {
    if (avatarLocal) return { uri: avatarLocal };
    if (avatarRemote) return { uri: avatarRemote };
    return undefined;
  }, [avatarLocal, avatarRemote]);

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
  const processSquare = useCallback(async (uri: string, squareMax = 512) => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: squareMax, height: squareMax } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  }, []);

  const processWide = useCallback(async (uri: string, maxWidth = 1080) => {
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
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    setAvatarLocal(await processSquare(res.assets[0].uri));
  }, [ensureGalleryPerm, processSquare]);

  const takeAvatar = useCallback(async () => {
    if (!(await ensureCameraPerm())) return;
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    setAvatarLocal(await processSquare(res.assets[0].uri));
  }, [ensureCameraPerm, processSquare]);

  const pickProfile = useCallback(async () => {
    if (!(await ensureGalleryPerm())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.9,
    });
    if (res.canceled) return;
    setProfileLocal(await processWide(res.assets[0].uri));
  }, [ensureGalleryPerm, processWide]);

  const takeProfile = useCallback(async () => {
    if (!(await ensureCameraPerm())) return;
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.9,
    });
    if (res.canceled) return;
    setProfileLocal(await processWide(res.assets[0].uri));
  }, [ensureCameraPerm, processWide]);

  // ---------- load ----------
  useEffect(() => {
    if (!userDoc) {
      setNickname(auth.currentUser?.displayName || '');
      setLoading(false);
      return;
    }
    setNickname(userDoc.nickname || userDoc.displayName || '');
    setAgeStr(typeof userDoc.age === 'number' ? String(userDoc.age) : '');
    setBio(userDoc.bio || '');
    setProfileRemote(userDoc.profilePhoto || null);
    setAvatarRemote(userDoc.avatar || null);
    setLoading(false);
  }, [userDoc]);

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
      Alert.alert('Validação', 'O nickname não pode estar vazio.');
      return;
    }
    const age = ageStr.trim() ? Number(ageStr.trim()) : undefined;
    if (ageStr.trim() && Number.isNaN(age)) {
      Alert.alert('Validação', 'Idade inválida.');
      return;
    }

    try {
      setSaving(true);

      let profileUrl = profileRemote || null;
      let avatarUrl = avatarRemote || null;

      const uploads: Promise<void>[] = [];
      if (profileLocal) {
        const path = `users/${uid}/profile_${Date.now()}.jpg`;
        uploads.push(
          uploadToStorage(profileLocal, path).then((url) => {
            profileUrl = url;
          })
        );
      }
      if (avatarLocal) {
        const path = `users/${uid}/avatar_${Date.now()}.jpg`;
        uploads.push(
          uploadToStorage(avatarLocal, path).then((url) => {
            avatarUrl = url;
          })
        );
      }
      if (uploads.length) {
        await Promise.all(uploads);
      }

      await setDoc(
        doc(db, 'users', uid),
        {
          nickname: nick,
          displayName: nick,
          age: typeof age === 'number' ? age : null,
          bio: bio.trim(),
          profilePhoto: profileUrl,
          avatar: avatarUrl,
          updatedAt: serverTimestamp(),
        } as Partial<UserDoc>,
        { merge: true }
      );

      setProfileLocal(null);
      setAvatarLocal(null);
      setProfileRemote(profileUrl);
      setAvatarRemote(avatarUrl);

      Alert.alert('Guardado', 'Perfil atualizado com sucesso.');
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
    uid,
    uploadToStorage,
  ]);

  // ---------- ações ----------
  const goInterests = useCallback(() => navigation.navigate('Interesses'), [navigation]);
  const goMatches = useCallback(() => navigation.navigate('Matches'), [navigation]);
  const doLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível terminar sessão.');
    }
  }, []);

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {/* Header */}
          <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderColor: COLORS.border, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="person" size={20} color={COLORS.brand} />
            <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>O meu perfil</Text>
          </View>

          {/* Fotos */}
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            {/* Avatar */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Avatar</Text>
              <View style={{ width: 110, height: 110, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#1f2937' }}>
                {displayAvatar ? (
                  <Image source={displayAvatar} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-circle" size={42} color={COLORS.sub} />
                  </View>
                )}
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

          {/* Dados básicos */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Nickname</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="at" size={16} color={COLORS.sub} />
              <TextInput
                value={nickname}
                onChangeText={setNickname}
                placeholder="O teu nickname"
                placeholderTextColor={COLORS.sub}
                style={{ flex: 1, color: COLORS.text, paddingVertical: 10, marginLeft: 8 }}
                maxLength={24}
                autoCapitalize="none"
              />
            </View>
          </View>

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

          {/* Email */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Email</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="mail" size={16} color={COLORS.sub} />
              <Text style={{ color: COLORS.text, paddingVertical: 10, marginLeft: 8 }} numberOfLines={1}>
                {email || '—'}
              </Text>
            </View>
          </View>

          {/* Ações */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity
              onPress={onSave}
              disabled={saving}
              style={{
                flex: 1,
                backgroundColor: saving ? '#4b5563' : COLORS.brand,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 14,
                borderRadius: 14,
                alignItems: 'center',
              }}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goInterests}
              style={{
                flex: 1,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 14,
                borderRadius: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: '800' }}>Editar interesses</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <TouchableOpacity
              onPress={goMatches}
              style={{
                flex: 1,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 14,
                borderRadius: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: '800' }}>Abrir Matches</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={doLogout}
              style={{
                flex: 1,
                backgroundColor: '#7f1d1d',
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 14,
                borderRadius: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Terminar sessão</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 8 }} />
          <Text style={{ color: COLORS.sub, fontSize: 12, textAlign: 'center' }}>
            Mantém o teu perfil atualizado para melhores sugestões de matches.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
