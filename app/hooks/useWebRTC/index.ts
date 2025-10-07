import { useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'simple-peer';
import { useWebRTCSignaling } from './useWebRTCSignaling';
import { UseWebRTCProps, UseWebRTCReturn } from './types';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export const useWebRTC = ({
  connectionType = 'random',
  targetPeerId,
  roomId = 'anonymous-chat',
  onRemoteStream = () => {},
  onConnectionChange = () => {},
  onError = () => {},
  onDataChannelMessage = () => {},
  onConnectionStatus = () => {},
}: UseWebRTCProps = {}): UseWebRTCReturn => {
  const [isCallStarted, setIsCallStarted] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected'>('idle');
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const signalingPublishRef = useRef<((name: string, data: any) => void) | null>(null);

  // Generate unique peer ID
  const generatePeerId = useCallback(() => 
    `user-${Math.random().toString(36).substr(2, 8)}`, []);

  // Initialize peer ID on mount
  useEffect(() => {
    setMyPeerId(generatePeerId());
  }, [generatePeerId]);

  // Create peer connection
  const createPeer = useCallback((targetPeerId: string, initiator: boolean) => {
    console.log(`🔗 Creating ${initiator ? 'initiator' : 'responder'} connection to ${targetPeerId}`);
    
    const peer = new Peer({
      initiator,
      trickle: true,
      config: { iceServers: ICE_SERVERS },
      stream: localStreamRef.current || undefined,
    });

    peer.on('signal', (data) => {
      console.log(`📤 Sending signal to ${targetPeerId}:`, data.type);
      if (signalingPublishRef.current) {
        signalingPublishRef.current('webrtc-signaling', {
          type: 'signal',
          data,
          peerId: myPeerId,
          targetPeerId
        });
      }
    });

    peer.on('connect', () => {
      console.log(`✅ Connected to ${targetPeerId}`);
      setIsConnected(true);
      setConnectionStatus('connected');
      setConnectedPeerId(targetPeerId);
      onConnectionChange(true);
      onConnectionStatus('connected');
    });

    peer.on('data', (data) => {
      const message = data.toString();
      console.log(`📨 Received message from ${targetPeerId}:`, message);
      onDataChannelMessage(message);
    });

    peer.on('stream', (stream) => {
      console.log(`🎥 Received remote stream from ${targetPeerId}`);
      onRemoteStream(stream);
    });

    peer.on('error', (error) => {
      console.error(`❌ Peer error:`, error);
      const errorMessage = `Connection error: ${error.message}`;
      setError(errorMessage);
      onError(errorMessage);
    });

    peer.on('close', () => {
      console.log(`🔌 Connection closed with ${targetPeerId}`);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      setConnectedPeerId(null);
      onConnectionChange(false);
      onConnectionStatus('disconnected');
    });

    peerRef.current = peer;
    return peer;
  }, [myPeerId, onRemoteStream, onConnectionChange, onDataChannelMessage, onError, onConnectionStatus]);

  // Signaling callbacks
  const signalingCallbacks = {
    onJoin: (peerId: string) => {
      if (peerId !== myPeerId && connectionType === 'random' && isCallStarted && !isConnected) {
        console.log(`🤝 Peer ${peerId} joined, connecting automatically`);
        setConnectedPeerId(peerId);
        
        // Create connection - first peer to see the other becomes initiator
        const isInitiator = myPeerId < peerId; // Simple initiator decision
        createPeer(peerId, isInitiator);
      }
    },
    onLeave: (peerId: string) => {
      if (peerId === connectedPeerId) {
        console.log(`👋 Connected peer ${peerId} left`);
        peerRef.current?.destroy();
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setConnectedPeerId(null);
      }
    },
    onSignal: (fromPeerId: string, data: any, targetPeerId?: string) => {
      if (targetPeerId && targetPeerId !== myPeerId) return;

      console.log(`📨 Handling signal from ${fromPeerId}:`, data.type);
      
      if (!peerRef.current && localStreamRef.current) {
        // Create peer connection for incoming signal
        console.log(`🔗 Creating responder connection for ${fromPeerId}`);
        createPeer(fromPeerId, false);
      }
      
      peerRef.current?.signal(data);
    },
    onError: (error: string) => {
      setError(error);
      onError(error);
    }
  };

  const signaling = useWebRTCSignaling(signalingCallbacks);

  const cleanup = useCallback((): void => {
    // Stop local stream
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;

    // Destroy peer connection
    peerRef.current?.destroy();
    peerRef.current = null;

    setIsConnected(false);
    setConnectionStatus('disconnected');
    setConnectedPeerId(null);
    setError(null);
  }, []);

  const startCall = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setConnectionStatus('connecting');
      onConnectionStatus('connecting');

      // Get media stream (audio only for chat)
      if (navigator.mediaDevices?.getUserMedia) {
        console.log('🎤 Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: false,
          audio: true 
        });
        localStreamRef.current = stream;
      }

      console.log('✅ Ready for P2P connection');

      // Join the room via signaling
      if (signalingPublishRef.current) {
        signaling.sendJoin(signalingPublishRef.current, myPeerId, roomId);
      }
      
      setIsCallStarted(true);
      console.log('✅ Started P2P session');
      
    } catch (error) {
      console.error('❌ Error starting P2P session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      onError(errorMessage);
      cleanup();
      setIsCallStarted(false);
      setConnectionStatus('idle');
      onConnectionStatus('disconnected');
    }
  }, [myPeerId, roomId, cleanup, onError, onConnectionStatus, signaling]);

  const endCall = useCallback((): void => {
    console.log('🛑 Ending P2P session');
    
    // Send leave message via signaling
    if (signalingPublishRef.current) {
      signaling.sendLeave(signalingPublishRef.current, myPeerId, roomId);
    }
    
    cleanup();
    setIsCallStarted(false);
    setConnectionStatus('idle');
    onConnectionStatus('disconnected');
  }, [myPeerId, roomId, cleanup, onConnectionStatus, signaling]);

  const sendMessage = useCallback((message: string): void => {
    if (peerRef.current && (peerRef.current as any).connected) {
      peerRef.current.send(message);
      console.log(`📤 Sent message: ${message}`);
    } else {
      console.warn('⚠️ Cannot send message: peer not connected');
    }
  }, []);

  const handleSignalingMessage = useCallback((message: any): void => {
    signaling.handleSignalingMessage(message);
  }, [signaling]);

  const setSignalingPublish = useCallback((publish: (name: string, data: any) => void) => {
    signalingPublishRef.current = publish;
  }, []);

return {
  // State
  isCallStarted,
  isConnected,
  connectionStatus,
  myPeerId,
  connectedPeerId,
  error,
  
  // Methods
  startCall,
  endCall,
  sendMessage,
  
  // Signaling
  handleSignalingMessage,
  setSignalingPublish,
  
  
  localStreamRef,
  peerRef: peerRef, 
  dataChannelRef: { current: null },
};
};