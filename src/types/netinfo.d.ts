declare module '@react-native-community/netinfo' {
  export interface NetInfoState {
    isConnected?: boolean | null;
    isInternetReachable?: boolean | null;
  }
  export type NetInfoListener = (state: NetInfoState) => void;
  export function addEventListener(listener: NetInfoListener): () => void;
  export function fetch(): Promise<NetInfoState>;
  const _default: {
    addEventListener: typeof addEventListener;
    fetch: typeof fetch;
  };
  export default _default;
}
