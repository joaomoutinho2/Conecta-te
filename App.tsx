import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { AuthProvider } from './src/context/AuthContext';

// Enable native screens for better performance
enableScreens();

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.container}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="auto" />
      </SafeAreaView>
    </AuthProvider>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#fff' } });
