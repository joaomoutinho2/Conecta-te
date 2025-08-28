// src/components/MessageItem.tsx
import React from 'react';
import { View, Text } from 'react-native';

function MessageItem({ msg, self }: { msg: any; self: boolean }) {
  return (
	<View style={{ paddingVertical: 6, alignItems: self ? 'flex-end' : 'flex-start' }}>
	  <View style={{ maxWidth: '85%', padding: 10, borderRadius: 10, backgroundColor: self ? '#DCF8C6' : '#FFF' }}>
		<Text>{msg.text}</Text>
	  </View>
	</View>
  );
}
export default React.memo(MessageItem);
