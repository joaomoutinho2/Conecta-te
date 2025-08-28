import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';

// Add your types here or import them
// import { MatchDoc } from '../types';
import { useNavigation } from '@react-navigation/native';

type MatchDoc = {
  id: string;
  participants?: string[];
  peer?: { name?: string; avatar?: string | null; uid?: string };
  lastMessageText?: string;
};

const ConversationsScreen: React.FC = () => {
  // You need to define these variables or get them from context/hooks
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MatchDoc[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [uid, setUid] = useState<string | null>('your-uid'); // Replace with actual logic
  // Define your navigation param types
  type RootStackParamList = {
	Chat: { matchId: string; peer: { uid: string; name?: string; avatar?: string | null } };
	// ...other routes
  };

  const navigation = useNavigation<any>();

  const refresh = () => {
	// Implement your refresh logic here
  };

  const openChat = (m: MatchDoc) => {
	const peerUid = (m.participants || []).find((p) => p !== uid);
	navigation.navigate &&
	  navigation.navigate(
		'Chat' as never,
		{ matchId: m.id, peer: { uid: peerUid || '', name: m.peer?.name, avatar: m.peer?.avatar || null } } as never
	  );
  };

  if (!uid) return null;

  return (
	<View style={{ flex: 1, backgroundColor: '#fff' }}>
	  {loading ? (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
		  <ActivityIndicator size="large" />
		</View>
	  ) : (
		<FlatList
		  data={items}
		  keyExtractor={(it) => it.id}
		  refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
		  renderItem={({ item }) => (
			<TouchableOpacity
			  onPress={() => openChat(item)}
			  style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
			>
			  <Text style={{ fontWeight: '600', fontSize: 16 }}>
				{(item.peer?.name || 'Conversa')}
			  </Text>
			  <Text style={{ color: '#6b7280', marginTop: 4 }} numberOfLines={1}>
				{item.lastMessageText || '—'}
			  </Text>
			</TouchableOpacity>
		  )}
		  ListEmptyComponent={
			<View style={{ padding: 24 }}>
			  <Text style={{ color: '#6b7280' }}>Sem conversas.</Text>
			</View>
		  }
		/>
	  )}

	  {usingFallback && (
		<View style={{ padding: 8, alignItems: 'center' }}>
		  <Text style={{ fontSize: 12, color: '#9ca3af' }}>
			A ordenar localmente. (Podes criar o índice para otimizar.)
		  </Text>
		</View>
	  )}
	</View>
  );
};

export default ConversationsScreen;