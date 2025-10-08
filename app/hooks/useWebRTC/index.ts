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
  features = {
    dataChannel: true,
    mediaStream: false,
  },
  mediaOptions = { audio: false, video: false },
  onRemoteStream = () => {},
  onConnectionChange = () => {},
  onError = () => {},
  onDataChannelMessage = () => {},
  onConnectionStatus = () => {},
}: UseWebRTCProps = {}): UseWebRTCReturn => {
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected'>('idle');
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const signalingPublishRef = useRef<((name: string, data: any) => void) | null>(null);
  const joinedPeersRef = useRef<Set<string>>(new Set());
  const isInitiatorRef = useRef<boolean>(false);
  const connectionAttemptedRef = useRef<boolean>(false);

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
    
    const peerOptions: Peer.Options = {
      initiator,
      trickle: true,
      config: { iceServers: ICE_SERVERS },
    };

    if (features.mediaStream && localStreamRef.current) {
      peerOptions.stream = localStreamRef.current;
    }

    const peer = new Peer(peerOptions);

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
      connectionAttemptedRef.current = false; // Reset for reconnection
    });

    if (features.dataChannel) {
      peer.on('data', (data) => {
        const message = data.toString();
        console.log(`📨 Received message from ${targetPeerId}:`, message);
        onDataChannelMessage(message);
      });
    }

    if (features.mediaStream) {
      peer.on('stream', (stream) => {
        console.log(`🎥 Received remote stream from ${targetPeerId}`);
        onRemoteStream(stream);
      });
    }

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
      joinedPeersRef.current.delete(targetPeerId);
      connectionAttemptedRef.current = false; // Allow reconnection
    });

    peerRef.current = peer;
    return peer;
  }, [myPeerId, onRemoteStream, onConnectionChange, onDataChannelMessage, onError, onConnectionStatus, features]);

  // Get media stream
  const getMediaStream = useCallback(async (options?: { audio: boolean; video: boolean }): Promise<MediaStream | null> => {
    if (!features.mediaStream && !options) return null;

    try {
      const streamOptions = options || mediaOptions;
      console.log('🎤 Requesting media access...', streamOptions);
      const stream = await navigator.mediaDevices.getUserMedia(streamOptions);
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error('❌ Error getting media stream:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to access media devices';
      setError(errorMessage);
      onError(errorMessage);
      return null;
    }
  }, [features.mediaStream, mediaOptions, onError]);

  const stopMediaStream = useCallback((): void => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
  }, []);

  // Connect to a specific peer
  const connectToPeer = useCallback((targetPeerId: string) => {
    if (connectionAttemptedRef.current || peerRef.current) {
      console.log('⚠️ Connection already attempted or in progress');
      return;
    }

    console.log(`🎯 Connecting to peer: ${targetPeerId}`);
    connectionAttemptedRef.current = true;
    setConnectedPeerId(targetPeerId);

    // FIXED LOGIC: The SECOND user to join becomes the initiator
    const myJoinTime = Array.from(joinedPeersRef.current).indexOf(myPeerId);
    const targetJoinTime = Array.from(joinedPeersRef.current).indexOf(targetPeerId);
    
    // The peer who joined later becomes the initiator
    const isInitiator = myJoinTime > targetJoinTime;
    isInitiatorRef.current = isInitiator;
    
    console.log(`🎯 ${myPeerId} is ${isInitiator ? 'initiator' : 'responder'} (my join time: ${myJoinTime}, target join time: ${targetJoinTime})`);
    
    createPeer(targetPeerId, isInitiator);
  }, [myPeerId, createPeer]);

  // Signaling callbacks
  const signalingCallbacks = {
    onJoin: (peerId: string) => {
      if (peerId === myPeerId) return;
      
      console.log(`🤝 Peer ${peerId} joined the room`);
      joinedPeersRef.current.add(peerId);
      
      // Log current room state
      console.log(`👥 Room now has ${joinedPeersRef.current.size} peers:`, Array.from(joinedPeersRef.current));
      
      // For random connections: connect when we have exactly 2 peers in the room
      if (connectionType === 'random' && isStarted && !isConnected && !peerRef.current) {
        const availablePeers = Array.from(joinedPeersRef.current).filter(id => id !== myPeerId);
        
        console.log(`🔍 Available peers: ${availablePeers.length}`, availablePeers);
        
        // Only connect when we have exactly one other peer (2 total in room)
        if (availablePeers.length === 1) {
          const targetPeer = availablePeers[0];
          console.log(`🎯 Found one other peer, connecting to: ${targetPeer}`);
          connectToPeer(targetPeer);
        } else if (availablePeers.length > 1) {
          console.log(`⚠️ Multiple peers available, connecting to first one: ${availablePeers[0]}`);
          connectToPeer(availablePeers[0]);
        }
      }
    },
    onLeave: (peerId: string) => {
      console.log(`👋 Peer ${peerId} left the room`);
      joinedPeersRef.current.delete(peerId);
      
      if (peerId === connectedPeerId) {
        console.log(`🔌 Connected peer ${peerId} left`);
        peerRef.current?.destroy();
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setConnectedPeerId(null);
        
        // For random connections: try to connect to another peer if available
        if (connectionType === 'random' && isStarted) {
          const availablePeers = Array.from(joinedPeersRef.current).filter(id => id !== myPeerId);
          if (availablePeers.length > 0) {
            console.log(`🔄 Reconnecting to available peer: ${availablePeers[0]}`);
            // Small delay before reconnecting
            setTimeout(() => {
              connectToPeer(availablePeers[0]);
            }, 1000);
          }
        }
      }
    },
    onSignal: (fromPeerId: string, data: any, targetPeerId?: string) => {
      if (targetPeerId && targetPeerId !== myPeerId) return;
      if (fromPeerId === myPeerId) return;

      console.log(`📨 Handling signal from ${fromPeerId}:`, data.type);
      
      // If we don't have a peer connection yet but we're expecting this peer, create responder
      if (!peerRef.current && isStarted && fromPeerId === connectedPeerId) {
        console.log(`🔗 Creating responder connection for expected peer: ${fromPeerId}`);
        // We're the responder (first user)
        createPeer(fromPeerId, false);
      }
      
      // Forward the signal to the peer connection if it exists and it's from our connected peer
      if (peerRef.current && fromPeerId === connectedPeerId) {
        console.log(`📨 Forwarding signal to peer connection: ${data.type}`);
        peerRef.current.signal(data);
      } else if (peerRef.current && fromPeerId !== connectedPeerId) {
        console.warn(`⚠️ Received signal from unexpected peer: ${fromPeerId}, expected: ${connectedPeerId}`);
      }
    },
    onError: (error: string) => {
      setError(error);
      onError(error);
    }
  };

  const signaling = useWebRTCSignaling(signalingCallbacks);

  const cleanup = useCallback((): void => {
    stopMediaStream();
    peerRef.current?.destroy();
    peerRef.current = null;
    joinedPeersRef.current.clear();
    connectionAttemptedRef.current = false;

    setIsConnected(false);
    setConnectionStatus('disconnected');
    setConnectedPeerId(null);
    setError(null);
  }, [stopMediaStream]);

  const start = useCallback(async (): Promise<void> => {
  try {
    setError(null);
    setConnectionStatus('connecting');
    onConnectionStatus('connecting');

    console.log('✅ Starting P2P connection for messaging');

    // Only clear connection state, NOT joined peers
    // joinedPeersRef.current.clear(); // ← REMOVE THIS LINE
    connectionAttemptedRef.current = false;
    
    // Add ourselves to the room if not already there
    if (!joinedPeersRef.current.has(myPeerId)) {
      joinedPeersRef.current.add(myPeerId);
    }

    // Join the room via signaling
    if (signalingPublishRef.current) {
      signaling.sendJoin(signalingPublishRef.current, myPeerId, roomId);
    }
    
    setIsStarted(true);
    console.log('✅ Started P2P messaging session');
    
    // Check if there are already peers in the room to connect to
    if (connectionType === 'random') {
      setTimeout(() => {
        const availablePeers = Array.from(joinedPeersRef.current).filter(id => id !== myPeerId);
        console.log(`🔄 Post-start check: ${availablePeers.length} peers available:`, availablePeers);
        if (availablePeers.length > 0 && !peerRef.current && !connectionAttemptedRef.current) {
          console.log(`🔗 Initiating connection to: ${availablePeers[0]}`);
          connectToPeer(availablePeers[0]);
        }
      }, 500);
    }
    
  } catch (error) {
    console.error('❌ Error starting P2P session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setError(errorMessage);
    onError(errorMessage);
    cleanup();
    setIsStarted(false);
    setConnectionStatus('idle');
    onConnectionStatus('disconnected');
  }
}, [myPeerId, roomId, cleanup, onError, onConnectionStatus, signaling, connectionType, connectToPeer]);

  const startCall = useCallback(async (callMediaOptions?: { audio: boolean; video: boolean }): Promise<void> => {
  try {
    setError(null);
    setConnectionStatus('connecting');
    onConnectionStatus('connecting');

    const stream = await getMediaStream(callMediaOptions);
    if (!stream && features.mediaStream) {
      throw new Error('Failed to get media stream');
    }

    console.log('✅ Starting P2P call with media');

    // Only clear connection state, NOT joined peers
    // joinedPeersRef.current.clear(); // ← REMOVE THIS LINE
    connectionAttemptedRef.current = false;
    
    // Add ourselves if not already there
    if (!joinedPeersRef.current.has(myPeerId)) {
      joinedPeersRef.current.add(myPeerId);
    }

    if (signalingPublishRef.current) {
      signaling.sendJoin(signalingPublishRef.current, myPeerId, roomId);
    }
    
    setIsStarted(true);
    console.log('✅ Started P2P call session');
    
    if (connectionType === 'random') {
      setTimeout(() => {
        const availablePeers = Array.from(joinedPeersRef.current).filter(id => id !== myPeerId);
        console.log(`🔄 Post-start check: ${availablePeers.length} peers available:`, availablePeers);
        if (availablePeers.length > 0 && !peerRef.current && !connectionAttemptedRef.current) {
          console.log(`🔗 Initiating connection to: ${availablePeers[0]}`);
          connectToPeer(availablePeers[0]);
        }
      }, 500);
    }
    
  } catch (error) {
    console.error('❌ Error starting call:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setError(errorMessage);
    onError(errorMessage);
    cleanup();
    setIsStarted(false);
    setConnectionStatus('idle');
    onConnectionStatus('disconnected');
  }
}, [myPeerId, roomId, cleanup, onError, onConnectionStatus, signaling, getMediaStream, features.mediaStream, connectionType, connectToPeer]);

  const stop = useCallback((): void => {
    console.log('🛑 Stopping P2P session');
    
    if (signalingPublishRef.current) {
      signaling.sendLeave(signalingPublishRef.current, myPeerId, roomId);
    }
    
    cleanup();
    setIsStarted(false);
    setConnectionStatus('idle');
    onConnectionStatus('disconnected');
  }, [myPeerId, roomId, cleanup, onConnectionStatus, signaling]);

  const sendMessage = useCallback((message: string): void => {
    if (peerRef.current && (peerRef.current as any).connected && features.dataChannel) {
      peerRef.current.send(message);
      console.log(`📤 Sent message: ${message}`);
    } else {
      console.warn('⚠️ Cannot send message: peer not connected or data channel disabled');
    }
  }, [features.dataChannel]);

  const sendFile = useCallback((file: File): void => {
    if (!features.dataChannel) {
      console.warn('⚠️ Data channel not enabled for file sharing');
      return;
    }
    console.log('File sharing not yet implemented', file);
  }, [features.dataChannel]);

  const toggleMedia = useCallback(async (options: { audio?: boolean; video?: boolean }): Promise<void> => {
    if (!isStarted) {
      console.warn('⚠️ Cannot toggle media: session not started');
      return;
    }
    try {
      const newOptions = { ...mediaOptions, ...options };
      await getMediaStream(newOptions);
      console.log('✅ Media toggled', newOptions);
    } catch (error) {
      console.error('❌ Error toggling media:', error);
      onError(`Failed to toggle media: ${error}`);
    }
  }, [isStarted, mediaOptions, getMediaStream, onError]);

  const handleSignalingMessage = useCallback((message: any): void => {
    signaling.handleSignalingMessage(message);
  }, [signaling]);

  const setSignalingPublish = useCallback((publish: (name: string, data: any) => void) => {
    signalingPublishRef.current = publish;
  }, []);

  return {
    isStarted,
    isConnected,
    connectionStatus,
    myPeerId,
    connectedPeerId,
    error,
    start,
    stop,
    sendMessage,
    startCall,
    sendFile,
    toggleMedia,
    getMediaStream,
    stopMediaStream,
    handleSignalingMessage,
    setSignalingPublish,
    localStreamRef,
    peerRef,
    dataChannelRef: { current: null },
  };
};