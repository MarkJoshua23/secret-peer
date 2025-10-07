export interface SignalMessage {
  type: 'join' | 'signal' | 'leave' | 'peer-list';
  data?: any;
  peerId?: string;
  targetPeerId?: string;
  roomId?: string;
}

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  trickle?: boolean;
}

export interface UseWebRTCProps {
  // Connection type
  connectionType?: 'random' | 'private'; // random: connect to anyone, private: connect to specific peer
  targetPeerId?: string; // For private connections
  roomId?: string; // For random connections in the same room
  
  // Callbacks
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: string) => void;
  onDataChannelMessage?: (message: string) => void;
  onConnectionStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'rejected') => void;
  
  config?: WebRTCConfig;
}

export interface UseWebRTCReturn {
  // State
  isCallStarted: boolean;
  isConnected: boolean;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected';
  myPeerId: string;
  connectedPeerId: string | null;
  error: string | null;
  
  // Methods
  startCall: () => Promise<void>;
  endCall: () => void;
  sendMessage: (message: string) => void;
  
  // Signaling
  handleSignalingMessage: (message: any) => void;
  setSignalingPublish: (publish: (name: string, data: any) => void) => void;
  
  // Refs - Updated for simple-peer
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  peerRef: React.MutableRefObject<any | null>; // simple-peer instance
  dataChannelRef: React.MutableRefObject<any | null>; // Not needed with simple-peer
}

export interface SignalingCallbacks {
  onJoin: (peerId: string) => void;
  onLeave: (peerId: string) => void;
  onSignal: (fromPeerId: string, data: any, targetPeerId?: string) => void;
  onError: (error: string) => void;
}