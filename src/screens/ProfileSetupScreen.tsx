// src/screens/ProfileSetupScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator,
  Alert, ScrollView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { auth, db, storage } from '../services/firebase';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ---------- helpers ----------
const sanitizeUsername = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
const isValidUsername = (u: string) => /^[a-z0-9_]{3,20}$/.test(u);
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const randomNickname = () => {
  const animals = ['Tigre', 'Lince', 'Corvo', 'Golfinho', 'Raposa', 'Falcao'];
  const adj = ['Criativo', 'Calmo', 'Rápido', 'Astuto', 'Zen', 'Bravo'];
  const a = animals[Math.floor(Math.random() * animals.length)];
  const b = adj[Math.floor(Math.random() * adj.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${b}${a}${n}`;
};
// compat picker (SDKs antigos)
const PICKER_MEDIA_IMAGES: any =
  (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;

export default function ProfileSetupScreen({ navigation }: any) {
  const uid = auth.currentUser?.uid!;
  const [username, setUsername] = useState('');
  const [usernameOK, setUsernameOK] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const [nickname, setNickname] = useState(randomNickname());
  const [bio, setBio] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileUri, setProfileUri] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefill + salto se já completo
  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'users', uid));
      const u = snap.data() || {};
      if (u?.profileComplete) { navigation.replace('Interests'); return; }
      if (u?.username) setUsername(String(u.username));
      if (u?.nickname) setNickname(String(u.nickname));
      if (u?.bio) setBio(String(u.bio));
      if (u?.dob) setDob(String(u.dob));
      if (u?.avatarUrl) setAvatarUri(String(u.avatarUrl));
      if (u?.photoUrl) setProfileUri(String(u.photoUrl));
    })();
  }, [uid, navigation]);

  // Image picker
  const pickImage = async (setter: (u: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Permissão', 'Autoriza o acesso às fotos para continuares.');
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: PICKER_MEDIA_IMAGES,
      allowsEditing: true,
      quality: 1,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]?.uri) setter(res.assets[0].uri);
  };

  // Debounce 400ms p/ verificar disponibilidade do username
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const uname = username.trim().toLowerCase();

    if (!uname || !isValidUsername(uname)) {
      setUsernameOK(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'usernames', uname));
        setUsernameOK(!snap.exists());
      } catch {
        setUsernameOK(null);
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username]);

  // ---------- Upload via Blob + uploadBytes (sem ArrayBuffer) ----------
  const upload = async (localUri: string, kind: 'avatar' | 'profile') => {
    // 1) Redimensiona/exporta para JPEG (sem pedir base64)
    const manip = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 800 } }],
      {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // 2) Transforma a URI (file:// / assets-library:// / blob:) em Blob
    //    Usar fetch(manip.uri) é a solução compatível com Expo/RN.
    const resp = await fetch(manip.uri);
    const blob = await resp.blob();

    // 3) Envia com uploadBytes
    const path = `users/${uid}/${kind}_${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    // 4) URL público
    return await getDownloadURL(storageRef);
  };

  const canSubmit = useMemo(() => {
    return isValidUsername(username) && usernameOK === true &&
      nickname.trim().length >= 2 &&
      !!avatarUri && !!profileUri &&
      (!dob || isValidDate(dob));
  }, [username, usernameOK, nickname, avatarUri, profileUri, dob]);

  const saveProfile = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    const unameClean = username.trim().toLowerCase();

    try {
      // 1) Pré-check transacional (não gastar dados se já ocupado)
      await runTransaction(db, async (tx) => {
        const unameRef = doc(db, 'usernames', unameClean);
        const current = await tx.get(unameRef);
        if (current.exists()) throw new Error('Esse nome de utilizador já está ocupado.');
      });

      // 2) Uploads (fora da transação)
      const [avatarUrl, photoUrl] = await Promise.all([
        upload(avatarUri as string, 'avatar'),
        upload(profileUri as string, 'profile'),
      ]);

      // 3) Reserva + gravação final (transação)
      await runTransaction(db, async (tx) => {
        const unameRef = doc(db, 'usernames', unameClean);
        const exist = await tx.get(unameRef);
        if (exist.exists()) throw new Error('Esse nome de utilizador já está ocupado.');

        tx.set(unameRef, { uid });

        const uref = doc(db, 'users', uid);
        tx.set(uref, {
          username: username.trim(),
          usernameLower: unameClean,
          nickname: nickname.trim(),
          avatarUrl,
          photoUrl,
          bio: bio.trim(),
          dob: dob || null,
          profileComplete: true,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        }, { merge: true });
      });

      Alert.alert('Perfil criado!', 'Agora escolhe os teus interesses.');
      navigation.replace('Interests');
    } catch (e: any) {
      setBusy(false);
      return Alert.alert('Erro', e?.message || 'Falha no upload / gravação.');
    }
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
        Define o teu nome de utilizador e os detalhes do teu perfil.
      </Text>

      {/* USERNAME */}
      <Text style={{ fontWeight: '700' }}>Nome de utilizador</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Text style={{ fontSize: 16, color: '#666' }}>@</Text>
        <TextInput
          value={username}
          onChangeText={(t) => { setUsername(sanitizeUsername(t)); setUsernameOK(null); }}
          placeholder="ex: joaosilva_"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textContentType="username"
          autoComplete="username"
          keyboardType={Platform.OS === 'ios' ? ('ascii-capable' as any) : ('visible-password' as any)}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor:
              username.length === 0 ? '#ddd'
              : isValidUsername(username) ? '#ddd'
              : '#f33',
            borderRadius: 10,
            padding: 10,
            color: '#111'
          }}
        />
      </View>
      <Text style={{ color: '#666', marginTop: 4 }}>3–20 car., minúsculas, números e “_”.</Text>
      {checking && <Text style={{ color: '#999', marginTop: 4 }}>A verificar disponibilidade…</Text>}
      {username && !isValidUsername(username) && !checking && (
        <Text style={{ color: '#f33', marginTop: 4 }}>Formato inválido.</Text>
      )}
      {usernameOK === false && isValidUsername(username) && !checking && (
        <Text style={{ color: '#f33', marginTop: 4 }}>Este nome já está ocupado.</Text>
      )}
      {usernameOK === true && isValidUsername(username) && !checking && (
        <Text style={{ color: '#090', marginTop: 4 }}>Disponível ✅</Text>
      )}

      {/* NICKNAME */}
      <Text style={{ marginTop: 16, fontWeight: '700' }}>Nome de avatar (mostrado no chat anónimo)</Text>
      <TextInput
        value={nickname}
        onChangeText={setNickname}
        placeholder="ex: CriativoTigre60"
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, marginTop: 6 }}
      />

      {/* BIO */}
      <Text style={{ marginTop: 16, fontWeight: '700' }}>Descrição do perfil</Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        placeholder="Uma frase sobre ti…"
        multiline
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, marginTop: 6, minHeight: 70 }}
        maxLength={180}
      />
      <Text style={{ color: '#666', textAlign: 'right' }}>{bio.length}/180</Text>

      {/* DOB */}
      <Text style={{ marginTop: 16, fontWeight: '700' }}>Data de nascimento</Text>
      <TextInput
        value={dob}
        onChangeText={setDob}
        placeholder="YYYY-MM-DD"
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
        style={{ borderWidth: 1, borderColor: isValidDate(dob) || dob === '' ? '#ddd' : '#f33', borderRadius: 10, padding: 10, marginTop: 6 }}
      />

      {/* FOTOS */}
      <Text style={{ marginTop: 16, fontWeight: '700' }}>Foto de avatar (chat anónimo)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <TouchableOpacity
          onPress={() => pickImage((u) => setAvatarUri(u))}
          style={{ backgroundColor: '#111', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{avatarUri ? 'Trocar imagem' : 'Escolher imagem'}</Text>
        </TouchableOpacity>
        {avatarUri ? <Image source={{ uri: avatarUri }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ddd' }} /> : null}
      </View>

      <Text style={{ marginTop: 16, fontWeight: '700' }}>Foto de perfil</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <TouchableOpacity
          onPress={() => pickImage((u) => setProfileUri(u))}
          style={{ backgroundColor: '#111', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{profileUri ? 'Trocar imagem' : 'Escolher imagem'}</Text>
        </TouchableOpacity>
        {profileUri ? <Image source={{ uri: profileUri }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ddd' }} /> : null}
      </View>

      {/* SUBMIT */}
      <TouchableOpacity
        onPress={saveProfile}
        disabled={!canSubmit || busy}
        style={{ marginTop: 22, backgroundColor: !canSubmit || busy ? '#aaa' : '#111', padding: 14, borderRadius: 12, alignItems: 'center' }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Concluir e continuar</Text>}
      </TouchableOpacity>

      <Text style={{ color: '#777', marginTop: 10, textAlign: 'center' }}>
        Podes editar estes dados mais tarde nas definições.
      </Text>
    </ScrollView>
  );
}
