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

// types.ts
export type ConnectionType = 'random' | 'direct';

export interface UseWebRTCProps {
  connectionType?: ConnectionType;
  targetPeerId?: string;
  roomId?: string;
  features?: {
    dataChannel?: boolean;
    mediaStream?: boolean;
  };
  mediaOptions?: {
    audio?: boolean;
    video?: boolean;
  };
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionChange?: (isConnected: boolean) => void;
  onError?: (error: string) => void;
  onDataChannelMessage?: (message: string) => void;
  onConnectionStatus?: (status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected') => void;
}

export interface UseWebRTCReturn {
  isStarted: boolean;
  isConnected: boolean;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected';
  myPeerId: string;
  connectedPeerId: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  sendMessage: (message: string) => void;
  startCall: (callMediaOptions?: { audio: boolean; video: boolean }) => Promise<void>;
  sendFile: (file: File) => void;
  toggleMedia: (options: { audio?: boolean; video?: boolean }) => Promise<void>;
  getMediaStream: (options?: { audio?: boolean; video?: boolean }) => Promise<MediaStream | null>;
  stopMediaStream: () => void;
  handleSignalingMessage: (message: any) => void;
  setSignalingPublish: (publish: (name: string, data: any) => void) => void;
  setAblyClient: (client: any) => void; // Add this
  localStreamRef: React.RefObject<MediaStream | null>;
  peerRef: React.RefObject<any>;
  dataChannelRef: React.RefObject<any>;
}

export interface SignalingCallbacks {
  onJoin: (peerId: string) => void;
  onLeave: (peerId: string) => void;
  onSignal: (fromPeerId: string, data: any, targetPeerId?: string) => void;
  onError: (error: string) => void;
}