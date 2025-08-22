import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigation.replace('Interests');
    }
  }, [user, loading]);

  const ensureUserDoc = async (uid: string) => {
    const ref = doc(db, 'users', uid);
    await setDoc(ref, {
      createdAt: serverTimestamp(),
      interests: [],
      nickname: null,
      avatar: null,
      online: true,
    }, { merge: true });
  };

  const handleSignUpOrIn = async () => {
    if (!email || !pass) return Alert.alert('Dados em falta', 'Introduz email e password.');
    setBusy(true);
    try {
      // tenta criar; se já existir, faz login
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        await ensureUserDoc(cred.user.uid);
      } catch {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
        await ensureUserDoc(cred.user.uid);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Falha na autenticação.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnon = async () => {
    setBusy(true);
    try {
      const cred = await signInAnonymously(auth);
      await ensureUserDoc(cred.user.uid);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Falha no login anónimo.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></View>;
  }

  return (
    <View style={{ flex:1, padding:24, gap:16, justifyContent:'center' }}>
      <Text style={{ fontSize:28, fontWeight:'800', textAlign:'center' }}>Conecta‑te</Text>

      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12 }}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={pass}
        onChangeText={setPass}
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12 }}
      />

      <TouchableOpacity
        onPress={handleSignUpOrIn}
        disabled={busy}
        style={{ backgroundColor:'#111', padding:14, borderRadius:10, alignItems:'center' }}
      >
        <Text style={{ color:'#fff', fontWeight:'700' }}>{busy ? 'Aguarda…' : 'Entrar / Criar conta'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleAnon}
        disabled={busy}
        style={{ backgroundColor:'#888', padding:12, borderRadius:10, alignItems:'center' }}
      >
        <Text style={{ color:'#fff' }}>Entrar como convidado</Text>
      </TouchableOpacity>

      <Text style={{ textAlign:'center', color:'#666', marginTop:8 }}>
        Podes começar como convidado e escolher os interesses já a seguir.
      </Text>
    </View>
  );
}
