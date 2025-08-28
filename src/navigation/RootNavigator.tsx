// src/navigation/RootNavigator.tsx
import React from 'react';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import TabNavigator from './TabNavigator';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import ChatScreen from '../screens/ChatScreen';

const COLORS = {
  bg: '#0f172a',
};

type RootStackParamList = {
  Auth: undefined;
  Setup: undefined;
  Tabs: undefined;
  Chat: { mid: string; otherUid: string };
};

const Root = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator();
const SetupStack = createNativeStackNavigator();

function AuthFlow() {
  return (
    <AuthStack.Navigator
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function SetupFlow() {
  return (
    <SetupStack.Navigator screenOptions={{ headerShown: false }}>
      <SetupStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
    </SetupStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, profileCompleted, loading } = useAuth();

  if (loading) {
    // ecrã de loading simples enquanto determinamos o gate
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        // Sem sessão → fluxo de autenticação
        <Root.Screen name="Auth" component={AuthFlow} />
      ) : !profileCompleted ? (
        // Com sessão mas sem perfil completo → fluxo de setup
        <Root.Screen name="Setup" component={SetupFlow} />
      ) : (
        // App principal
        <>
          <Root.Screen name="Tabs" component={TabNavigator} />
          {/* Chat fora das tabs para poder abrir em modal/pilha separada */}
          <Root.Screen
            name="Chat"
            component={ChatScreen}
            options={{ presentation: 'card', headerShown: false }}
          />
        </>
      )}
    </Root.Navigator>
  );
}
