import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/RootNavigator';

WebBrowser.maybeCompleteAuthSession();

type LoginScreenNavigation = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: { navigation: LoginScreenNavigation }) {
  const { user, loading } = useAuth();

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: '547765500925-vui262islf9v2qeu8i6npmf6mrkht4sa.apps.googleusercontent.com',
    iosClientId: '547765500925-j369c2rl2gmlg2gb38b6cpv00p6oiivh.apps.googleusercontent.com',
    webClientId: '547765500925-c5dc9i5no2s5kse060kh48fbagtg4vrm.apps.googleusercontent.com',
    redirectUri: 'conectate://redirect', // bate com "scheme" do app.json
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params as any;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential).catch(console.error);
    }
  }, [response]);

  useEffect(() => {
    if (!loading && user) navigation.replace('Interests');
  }, [user, loading]);

  if (loading) return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator /></View>;

  return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:12 }}>
      <Text style={{ fontSize:24, fontWeight:'700' }}>Conecta-te</Text>

      <TouchableOpacity
        onPress={() => promptAsync()}
        style={{ padding:12, backgroundColor:'#4285F4', borderRadius:8 }}
        disabled={!request}
      >
        <Text style={{ color:'#fff', fontWeight:'600' }}>Entrar com Google</Text>
      </TouchableOpacity>

      {/* Email básico – útil enquanto testas */}
      <TouchableOpacity
        onPress={async () => {
          try {
            await createUserWithEmailAndPassword(auth, 'teste@exemplo.com', '123456');
          } catch {
            await signInWithEmailAndPassword(auth, 'teste@exemplo.com', '123456');
          }
        }}
        style={{ padding:12, backgroundColor:'#111', borderRadius:8 }}
      >
        <Text style={{ color:'#fff' }}>Entrar rápido (Email de teste)</Text>
      </TouchableOpacity>
    </View>
  );
}
