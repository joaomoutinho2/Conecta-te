import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../utils/colors';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const pwOK = (p: string) => p.length >= 6;

export default function SignUpScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailOk = useMemo(() => isValidEmail(email.trim()), [email]);
  const passOk = useMemo(() => pwOK(pass), [pass]);
  const confirmOk = useMemo(() => confirm === pass && pwOK(confirm), [confirm, pass]);

  const confirmRef = useRef<TextInput>(null);

  const handleCreate = async () => {
    if (!emailOk || !passOk || !confirmOk || busy) return;
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      // doc base (sem completar perfil ainda)
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: email.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        profileCompleted: false
      }, { merge: true });

      Alert.alert('Conta criada!', 'Vamos configurar o teu perfil.');
      navigation.replace('ProfileSetup');
    } catch (e: any) {
      const code = (e?.code || '').replace('auth/', '');
      const table: Record<string, string> = {
        'email-already-in-use': 'Esse email já tem conta.',
        'invalid-email': 'Email inválido.',
        'weak-password': 'A password deve ter pelo menos 6 caracteres.',
        'network-request-failed': 'Sem ligação à internet.',
      };
      Alert.alert('Erro', table[code] || 'Não foi possível criar a conta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.bg1, COLORS.bg2]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex:1, padding:20, justifyContent:'center' }}>
              <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: 10 }}>Criar conta</Text>

                {/* email */}
                <Text style={{ color: COLORS.text, fontWeight: '700', marginBottom: 6 }}>Email</Text>
                <View style={{ flexDirection:'row', alignItems:'center', backgroundColor: COLORS.input, borderRadius: 12, borderWidth: 1, borderColor: emailOk || !email ? 'transparent' : COLORS.error }}>
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
                    onSubmitEditing={() => confirmRef.current?.focus()}
                    style={{ flex:1, color: COLORS.text, paddingVertical: 12, paddingRight: 12 }}
                  />
                </View>

                {/* password */}
                <Text style={{ color: COLORS.text, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>Password</Text>
                <View style={{ flexDirection:'row', alignItems:'center', backgroundColor: COLORS.input, borderRadius: 12, borderWidth: 1, borderColor: passOk || !pass ? 'transparent' : COLORS.error }}>
                  <View style={{ paddingHorizontal: 10 }}>
                    <Ionicons name="lock-closed-outline" size={20} color={COLORS.sub} />
                  </View>
                  <TextInput
                    placeholder="mínimo 6 caracteres"
                    placeholderTextColor={COLORS.sub}
                    secureTextEntry={!showPass}
                    value={pass}
                    onChangeText={setPass}
                    returnKeyType="next"
                    style={{ flex:1, color: COLORS.text, paddingVertical: 12, paddingRight: 12 }}
                  />
                  <TouchableOpacity onPress={() => setShowPass(s => !s)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.sub} />
                  </TouchableOpacity>
                </View>

                {/* confirm */}
                <Text style={{ color: COLORS.text, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>Confirmar password</Text>
                <View style={{ flexDirection:'row', alignItems:'center', backgroundColor: COLORS.input, borderRadius: 12, borderWidth: 1, borderColor: confirmOk || !confirm ? 'transparent' : COLORS.error }}>
                  <View style={{ paddingHorizontal: 10 }}>
                    <Ionicons name="checkmark-done-outline" size={20} color={COLORS.sub} />
                  </View>
                  <TextInput
                    ref={confirmRef}
                    placeholder="repete a password"
                    placeholderTextColor={COLORS.sub}
                    secureTextEntry={!showPass}
                    value={confirm}
                    onChangeText={setConfirm}
                    returnKeyType="go"
                    onSubmitEditing={handleCreate}
                    style={{ flex:1, color: COLORS.text, paddingVertical: 12, paddingRight: 12 }}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={!(emailOk && passOk && confirmOk) || busy}
                  style={{ backgroundColor: (!(emailOk && passOk && confirmOk) || busy) ? 'rgba(255,255,255,0.25)' : COLORS.brand, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 }}
                >
                  {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Criar conta</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf:'center', marginTop: 12 }}>
                  <Text style={{ color: COLORS.sub }}>Já tenho conta</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
