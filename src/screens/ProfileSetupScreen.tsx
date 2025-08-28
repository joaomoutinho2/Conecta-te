// src/screens/ProfileSetupScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { auth, db, storage } from '../services/firebase';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';

export type Interest = { id: string; name: string; cat?: string };
const FALLBACK_MAX_INTERESTS = 10;

export default function ProfileSetupScreen() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [remotePhoto, setRemotePhoto] = useState<string | null>(null);

  const [interests, setInterests] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [maxInterests, setMaxInterests] = useState<number>(FALLBACK_MAX_INTERESTS);
  const [loadingSeed, setLoadingSeed] = useState(true);
  const [saving, setSaving] = useState(false);

  // Carrega interesses do Firestore
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const refInterests = collection(db, 'interests');
        const snap = await getDocs(query(refInterests, orderBy('name')));
        if (!mounted) return;
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setInterests(arr);
        setLoadingSeed(false);
      } catch (e) {
        setLoadingSeed(false);
        Alert.alert('Erro', 'Não foi possível carregar interesses.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Manipulação de imagem
  const processImage = useCallback(
    async (uri: string, max = 512) => {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: max, height: max } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    },
    []
  );

  // Pick/take foto
  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permissão necessária', 'Autoriza o acesso à galeria para escolher uma imagem.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    setPhoto(await processImage(res.assets[0].uri, 512));
  }, [processImage]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permissão necessária', 'Autoriza o acesso à câmara para tirar foto.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled) return;
    setPhoto(await processImage(res.assets[0].uri, 512));
  }, [processImage]);

  // Toggle interesses
  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= maxInterests) {
          Alert.alert('Limite atingido', `Podes escolher até ${maxInterests} interesses.`);
          return prev;
        }
        return [...prev, id];
      });
    },
    [maxInterests]
  );

  // Guardar perfil
  const onSave = useCallback(
    async () => {
      if (!displayName.trim()) {
        Alert.alert('Validação', 'Escolhe um nome.');
        return;
      }
      try {
        setSaving(true);
        let photoUrl = remotePhoto;
        if (photo) {
          const path = `users/${uid}/profile_${Date.now()}.jpg`;
          const resp = await fetch(photo);
          const blob = await resp.blob();
          const r = ref(storage, path);
          await uploadBytes(r, blob, { contentType: 'image/jpeg' });
          photoUrl = await getDownloadURL(r);
        }
        await setDoc(
          doc(db, 'users', uid!),
          {
            displayName: displayName.trim(),
            bio: bio.trim(),
            profilePhoto: photoUrl || null,
            interests: selected,
            updatedAt: serverTimestamp(),
            profileCompleted: true,
          },
          { merge: true }
        );
        Alert.alert('Sucesso', 'Perfil guardado com sucesso!');
      } catch (e) {
        console.error(e);
        Alert.alert('Erro', 'Não foi possível guardar o teu perfil.');
      } finally {
        setSaving(false);
      }
    },
    [displayName, bio, photo, remotePhoto, selected, uid]
  );

  // UI
  if (loadingSeed) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#e5e7eb', fontSize: 20, fontWeight: '800', marginBottom: 16 }}>Completa o teu perfil</Text>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Image
              source={photo ? { uri: photo } : remotePhoto ? { uri: remotePhoto } : require('../../assets/icon.png')}
              style={{ width: 110, height: 110, borderRadius: 999, backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#233047' }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                onPress={takePhoto}
                style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#232a3a', borderWidth: 1, borderColor: '#233047' }}
              >
                <Text style={{ color: '#e5e7eb', fontWeight: '700' }}>Tirar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickPhoto}
                style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#232a3a', borderWidth: 1, borderColor: '#233047' }}
              >
                <Text style={{ color: '#e5e7eb', fontWeight: '700' }}>Escolher</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={{ color: '#e5e7eb', fontWeight: '800', marginBottom: 6 }}>Nome</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="O teu nome ou nickname"
            placeholderTextColor="#9ca3af"
            style={{
              backgroundColor: '#232a3a',
              color: '#e5e7eb',
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: '#233047',
              marginBottom: 12,
            }}
            maxLength={24}
            autoCapitalize="words"
          />
          <Text style={{ color: '#e5e7eb', fontWeight: '800', marginBottom: 6 }}>Bio (opcional)</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Fala um pouco sobre ti…"
            placeholderTextColor="#9ca3af"
            style={{
              backgroundColor: '#232a3a',
              color: '#e5e7eb',
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: '#233047',
              marginBottom: 12,
            }}
            maxLength={200}
            multiline
          />
          <Text style={{ color: '#e5e7eb', fontWeight: '800', marginBottom: 6 }}>Interesses</Text>
          <Text style={{ color: '#9ca3af', marginBottom: 8 }}>
            Selecionados: <Text style={{ color: '#e5e7eb', fontWeight: '800' }}>{selected.length}</Text> / {maxInterests}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
            {interests.map((it) => {
              const active = selected.includes(it.id);
              return (
                <TouchableOpacity
                  key={it.id}
                  onPress={() => toggle(it.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? '#7c3aed' : '#233047',
                    backgroundColor: active ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
                    marginRight: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: active ? '#fff' : '#e5e7eb', fontWeight: '700', fontSize: 12 }}>#{it.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            disabled={saving}
            onPress={onSave}
            style={{ backgroundColor: saving ? '#4b5563' : '#7c3aed', borderWidth: 1, borderColor: '#233047', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 8 }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Concluir</Text>}
          </TouchableOpacity>
          <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
            Podes alterar tudo isto mais tarde no teu perfil.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
