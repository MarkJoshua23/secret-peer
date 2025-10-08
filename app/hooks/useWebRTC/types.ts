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
  connectionType?: 'random' | 'private';
  targetPeerId?: string;
  roomId?: string;
  
  // Feature configuration
  features?: {
    dataChannel?: boolean;    // For messaging
    mediaStream?: boolean;    // For audio/video calls
  };
  
  // Media options (only used if mediaStream is true)
  mediaOptions?: { audio: boolean; video: boolean };
  
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
  isStarted: boolean;
  isConnected: boolean;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected';
  myPeerId: string;
  connectedPeerId: string | null;
  error: string | null;
  
  // Core methods
  start: () => Promise<void>;                 // For messging
  stop: () => void;
  sendMessage: (message: string) => void;
  
  // Media methods
  startCall: (mediaOptions?: { audio: boolean; video: boolean }) => Promise<void>;
  toggleMedia: (options: { audio?: boolean; video?: boolean }) => Promise<void>;
  getMediaStream: (options?: { audio: boolean; video: boolean }) => Promise<MediaStream | null>;
  stopMediaStream: () => void;
  
  // Extended methods
  sendFile: (file: File) => void;
  
  // Signaling
  handleSignalingMessage: (message: any) => void;
  setSignalingPublish: (publish: (name: string, data: any) => void) => void;
  
  // Refs
  localStreamRef: React.RefObject<MediaStream | null>;
  peerRef: React.RefObject<any | null>;
  dataChannelRef: React.RefObject<any | null>;
}

export interface SignalingCallbacks {
  onJoin: (peerId: string) => void;
  onLeave: (peerId: string) => void;
  onSignal: (fromPeerId: string, data: any, targetPeerId?: string) => void;
  onError: (error: string) => void;
}