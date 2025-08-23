import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, SafeAreaView, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  signInWithEmailAndPassword,
  signInAnonymously,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  bg1: '#0f172a', bg2: '#111827', brandA: '#7c3aed', brandB: '#06b6d4',
  card: 'rgba(255,255,255,0.06)', text: '#e5e7eb', sub: '#9ca3af',
  error: '#fb7185', input: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.15)', white: '#fff',
};

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const mapAuthError = (err: any): string => {
  const code = (err?.code || '').replace('auth/', '');
  const table: Record<string, string> = {
    'invalid-email': 'Email inválido.',
    'missing-password': 'Escreve a tua palavra-passe.',
    'user-not-found': 'Conta não encontrada.',
    'wrong-password': 'Password incorreta.',
    'too-many-requests': 'Muitas tentativas. Tenta novamente daqui a pouco.',
    'network-request-failed': 'Sem ligação à internet.',
    'admin-restricted-operation': 'Modo convidado desativado no Firebase.',
  };
  return table[code] || 'Falha na autenticação.';
};

export default function LoginScreen({ navigation }: any) {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errEmail, setErrEmail] = useState<string | null>(null);
  const [errPass, setErrPass] = useState<string | null>(null);
  const passRef = useRef<TextInput>(null);


  const valid = useMemo(() => {
    const e = email.trim();
    setErrEmail(e ? (isValidEmail(e) ? null : 'Email inválido') : null);
    setErrPass(pass.length >= 6 || pass.length === 0 ? null : 'Mínimo 6 caracteres');
    return isValidEmail(e) && pass.length >= 6;
  }, [email, pass]);

  const handleLogin = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      // navegação é tratada no useEffect pós-login
    } catch (e: any) {
      Alert.alert('Erro', mapAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAnon = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInAnonymously(auth);
    } catch (e: any) {
      Alert.alert('Erro', mapAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    const e = email.trim();
    if (!isValidEmail(e)) return Alert.alert('Recuperar password', 'Escreve o teu email primeiro.');
    try {
      await sendPasswordResetEmail(auth, e);
      Alert.alert('Verifica o teu email', 'Enviámos um link para definires uma nova password.');
    } catch (err: any) {
      Alert.alert('Erro', mapAuthError(err));
    }
  };

  if (loading) {
    return <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: COLORS.bg2 }}>
      <ActivityIndicator color={COLORS.white} />
    </View>;
  }

  return (
    <LinearGradient colors={[COLORS.bg1, COLORS.bg2]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex:1, padding:20, justifyContent:'center' }}>
              <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: COLORS.border }}>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: COLORS.text, fontSize: 32, fontWeight: '800' }}>Conecta-te</Text>
                  <Text style={{ color: COLORS.sub, marginTop: 6 }}>Entra com email ou usa o modo convidado.</Text>
                </View>

                {/* email */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 6 }}>Email</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', backgroundColor: COLORS.input, borderRadius: 12, borderWidth: 1, borderColor: errEmail ? COLORS.error : 'transparent' }}>
                    <View style={{ paddingHorizontal: 10 }}>
                      <Ionicons name="mail-outline" size={20} color={COLORS.sub} />
                    </View>
                    <TextInput
                      placeholder="exemplo@email.com"
                      placeholderTextColor={COLORS.sub}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                      returnKeyType="next"
                      onSubmitEditing={() => passRef.current?.focus()}
                      style={{ flex:1, color: COLORS.text, paddingVertical: 12, paddingRight: 12 }}
                    />
                  </View>
                  {errEmail ? <Text style={{ color: COLORS.error, marginTop: 6 }}>{errEmail}</Text> : null}
                </View>

                {/* password */}
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 6 }}>Password</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', backgroundColor: COLORS.input, borderRadius: 12, borderWidth: 1, borderColor: errPass ? COLORS.error : 'transparent' }}>
                    <View style={{ paddingHorizontal: 10 }}>
                      <Ionicons name="lock-closed-outline" size={20} color={COLORS.sub} />
                    </View>
                    <TextInput
                      ref={passRef}
                      placeholder="••••••"
                      placeholderTextColor={COLORS.sub}
                      secureTextEntry={!showPass}
                      value={pass}
                      onChangeText={setPass}
                      returnKeyType="go"
                      onSubmitEditing={handleLogin}
                      style={{ flex:1, color: COLORS.text, paddingVertical: 12, paddingRight: 12 }}
                    />
                    <TouchableOpacity onPress={() => setShowPass(s => !s)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.sub} />
                    </TouchableOpacity>
                  </View>
                  {errPass ? <Text style={{ color: COLORS.error, marginTop: 6 }}>{errPass}</Text> : null}

                  <TouchableOpacity onPress={handleForgot} style={{ alignSelf:'flex-end', marginTop: 8 }}>
                    <Text style={{ color: COLORS.brandB, fontWeight: '600' }}>Esqueci a password</Text>
                  </TouchableOpacity>
                </View>

                {/* BOTÕES separados */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={!valid || busy}
                  style={{ backgroundColor: (!valid || busy) ? 'rgba(255,255,255,0.25)' : COLORS.brandA, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 }}
                >
                  {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Entrar</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate('SignUp')}
                  disabled={busy}
                  style={{ marginTop: 10, borderRadius: 12, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'transparent' }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>Criar conta</Text>
                </TouchableOpacity>

                {/* convidado */}
                <TouchableOpacity
                  onPress={handleAnon}
                  disabled={busy}
                  style={{ marginTop: 10, borderRadius: 12, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'transparent' }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>Entrar como convidado</Text>
                </TouchableOpacity>

                <Text style={{ color: COLORS.sub, textAlign:'center', marginTop: 12, fontSize: 12 }}>
                  Ao continuar aceitas os Termos e a Política de Privacidade.
                </Text>
              </View>

              <View style={{ alignItems:'center', marginTop: 16 }}>
                <Text style={{ color: COLORS.sub, fontSize: 12 }}>v0.1 • MVP</Text>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
