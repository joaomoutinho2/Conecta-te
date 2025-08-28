// src/navigation/RootNavigator.tsx
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import TabNavigator from './TabNavigator';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import ChatScreen from '../screens/ChatScreen';

const Root = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, profileCompleted, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0f172a' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Root.Screen name="Login" component={LoginScreen} />
          <Root.Screen name="SignUp" component={SignUpScreen} />
        </>
      ) : !profileCompleted ? (
        <Root.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      ) : (
        <>
          <Root.Screen name="Tabs" component={TabNavigator} />
          <Root.Screen name="Chat" component={ChatScreen} />
        </>
      )}
    </Root.Navigator>
  );
}
