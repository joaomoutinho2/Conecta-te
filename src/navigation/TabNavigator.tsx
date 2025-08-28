// src/navigation/TabNavigator.tsx
import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, InteractionManager } from 'react-native';

import InterestsScreen from '../screens/InterestsScreen';
import MatchScreen from '../screens/MatchScreen';
import ProfileScreen from '../screens/ProfileScreen';

import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { COLORS } from '../utils/colors';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let unsub: undefined | (() => void);
    const task = InteractionManager.runAfterInteractions(() => {
      const q = query(
        collection(db, 'matches'),
        where('participants', 'array-contains', uid),
        orderBy('lastMessageAt', 'desc'),
        limit(30)
      );
      unsub = onSnapshot(q, (qs) => {
        let count = 0;
        qs.forEach((d) => {
          const data = d.data() as any;
          const last = data?.lastMessageAt?.toMillis?.() ?? 0;
          const seen = data?.lastSeen?.[uid]?.toMillis?.() ?? 0;
          if (last > seen) count++;
        });
        setUnread(count);
      });
    });
    return () => {
      task.cancel();
      unsub && unsub();
    };
  }, [uid]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.sub,
        tabBarStyle: { backgroundColor: COLORS.bg, borderTopColor: COLORS.border },
        tabBarIcon: ({ color, size, focused }) => {
          const name =
            route.name === 'Interesses'
              ? focused ? 'pricetags' : 'pricetags-outline'
              : route.name === 'Matches'
              ? focused ? 'chatbubbles' : 'chatbubbles-outline'
              : focused ? 'person' : 'person-outline';
          return <Ionicons name={name as any} size={size} color={color} />;
        },
        tabBarLabel: ({ color, children }) => (
          <Text style={{ color, fontSize: 12, marginBottom: 2 }}>{children}</Text>
        ),
      })}
    >
      <Tab.Screen name="Interesses" component={InterestsScreen} />
      <Tab.Screen
        name="Matches"
        component={MatchScreen}
        options={{
          tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: COLORS.brand, color: 'white' },
        }}
      />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
