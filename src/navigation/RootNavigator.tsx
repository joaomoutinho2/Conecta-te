import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import LoginScreen from '../screens/LoginScreen';
import InterestsScreen from '../screens/InterestsScreen';
import MatchScreen from '../screens/MatchScreen';
import ChatScreen from '../screens/ChatScreen';
import { useAuth } from '../context/AuthContext';

export type RootStackParamList = {
  Login: undefined;
  Interests: undefined;
  Match: undefined;
  Chat: { matchId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Interests" component={InterestsScreen} />
          <Stack.Screen name="Match" component={MatchScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
