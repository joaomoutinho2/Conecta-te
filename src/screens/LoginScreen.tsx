// src/screens/LoginScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, SafeAreaView, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../utils/colors';

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
  };
  return table[code] || 'Falha na autenticação.';
};

export default function LoginScreen({ navigation }: any) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const canLogin = useMemo(() => isValidEmail(email) && pass.length >= 6, [email, pass]);

  const handleLogin = async () => {
    if (!canLogin || busy) return;
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e: any) {
      Alert.alert('Erro de login', mapAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Recuperar palavra-passe', 'Escreve o teu email primeiro.');
      return;
    }
    try {
      setBusy(true);
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Recuperação enviada', 'Verifica o teu email para redefinir a palavra-passe.');
    } catch (e: any) {
      Alert.alert('Erro', mapAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.bg1, COLORS.bg2]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex:1, padding:20, gap:16 }}>
              {/* Cabeçalho */}
              <View style={{ alignItems:'center', marginTop: 12, marginBottom: 4 }}>
                <Ionicons name="sparkles" size={40} color={COLORS.white} />
                <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '800', marginTop: 8 }}>Bem-vindo(a)</Text>
                <Text style={{ color: COLORS.sub, marginTop: 4 }}>Entra para descobrires pessoas com os mesmos interesses</Text>
              </View>

              {/* Email/password */}
              <View style={{ gap:12, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
                <View style={{ flexDirection:'row', alignItems:'center', gap: 10, backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 12 }}>
                  <Ionicons name="mail" size={20} color={COLORS.sub} />
                  <TextInput
                    placeholder="Email"
                    placeholderTextColor={COLORS.sub}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    style={{ flex:1, color: COLORS.text, paddingVertical: 12 }}
                  />
                </View>
                <View style={{ flexDirection:'row', alignItems:'center', gap: 10, backgroundColor: COLORS.input, borderRadius: 12, paddingHorizontal: 12 }}>
                  <Ionicons name="lock-closed" size={20} color={COLORS.sub} />
                  <TextInput
                    placeholder="Password"
                    placeholderTextColor={COLORS.sub}
                    secureTextEntry
                    value={pass}
                    onChangeText={setPass}
                    style={{ flex:1, color: COLORS.text, paddingVertical: 12 }}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={!canLogin || busy}
                  style={{ backgroundColor: (!canLogin || busy) ? '#3f3f46' : COLORS.brand, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                >
                  {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Entrar</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleForgot} style={{ alignSelf:'center', marginTop: 8 }}>
                  <Text style={{ color: COLORS.sub }}>Esqueci-me da palavra-passe</Text>
                </TouchableOpacity>
              </View>

              {/* Criar conta */}
              <TouchableOpacity
                onPress={() => navigation.navigate('SignUp')}
                disabled={busy}
                style={{ marginTop: 6, borderRadius: 12, alignItems: 'center', paddingVertical: 14, borderWidth:1, borderColor: COLORS.border, backgroundColor: 'transparent' }}
              >
                <Text style={{ color: COLORS.text, fontWeight: '700' }}>Criar conta</Text>
              </TouchableOpacity>

              <View style={{ alignItems:'center', marginTop: 12 }}>
                <Text style={{ color: COLORS.sub, fontSize: 12 }}>v0.1 • MVP</Text>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
