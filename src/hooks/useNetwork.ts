import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Firestore, disableNetwork, enableNetwork } from 'firebase/firestore';

export default function useNetwork(db?: Firestore) {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(connected);
    });

    NetInfo.fetch().then((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(connected);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db) return;
    if (isConnected) {
      enableNetwork(db).catch(() => {});
    } else {
      disableNetwork(db).catch(() => {});
    }
  }, [db, isConnected]);

  return { isConnected };
}
