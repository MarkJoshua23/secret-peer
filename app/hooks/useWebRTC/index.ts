import { useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'simple-peer';
import { useWebRTCSignaling } from './useWebRTCSignaling';
import { useMatchmaking } from './useMatchMaking';
import { UseWebRTCProps, UseWebRTCReturn } from './types';
import Ably from 'ably';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export const useWebRTC = ({
  connectionType = 'random',
  targetPeerId,
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
  const [pairRoomId, setPairRoomId] = useState<string>('');
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const signalingPublishRef = useRef<((name: string, data: any) => void) | null>(null);
  const isInitiatorRef = useRef<boolean>(false);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const currentChannelRef = useRef<string>('');

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
        signalingPublishRef.current('webrtc-signal', {
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
    });

    peerRef.current = peer;
    return peer;
  }, [myPeerId, onRemoteStream, onConnectionChange, onDataChannelMessage, onError, onConnectionStatus, features]);

  // Get media stream
const getMediaStream = useCallback(async (options?: { audio?: boolean; video?: boolean }): Promise<MediaStream | null> => {
  if (!features.mediaStream && !options) return null;

  try {
    const streamOptions = {
      audio: options?.audio ?? mediaOptions.audio ?? false,
      video: options?.video ?? mediaOptions.video ?? false
    };
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

  // Handle match found from matchmaking
  const handleMatchFound = useCallback((
    matchedPeerId: string,
    roomId: string,
    isInitiator: boolean
  ) => {
    console.log(`🎉 Match found! Paired with ${matchedPeerId}, room: ${roomId}, initiator: ${isInitiator}`);
    
    setPairRoomId(roomId);
    setConnectedPeerId(matchedPeerId);
    isInitiatorRef.current = isInitiator;
    currentChannelRef.current = roomId;
    
    // Switch to the private pair channel for signaling
    if (ablyClientRef.current) {
      const pairChannel = ablyClientRef.current.channels.get(roomId);
      
      // Subscribe to WebRTC signals in the pair channel
      pairChannel.subscribe('webrtc-signal', (message) => {
        const { peerId: fromPeerId, targetPeerId, data } = message.data;
        
        if (targetPeerId && targetPeerId !== myPeerId) return;
        if (fromPeerId === myPeerId) return;
        
        console.log(`📨 Handling signal from ${fromPeerId}:`, data.type);
        
        // If we don't have a peer connection yet, create one as responder
        if (!peerRef.current && fromPeerId === matchedPeerId) {
          console.log(`🔗 Creating responder connection for matched peer: ${fromPeerId}`);
          createPeer(fromPeerId, false);
        }
        
        // Forward the signal to the peer connection
        if (peerRef.current && fromPeerId === matchedPeerId) {
          console.log(`📨 Forwarding signal to peer connection: ${data.type}`);
          peerRef.current.signal(data);
        }
      });
      
      // Update the publish function to use the pair channel
      signalingPublishRef.current = (eventName: string, data: any) => {
        pairChannel.publish(eventName, data);
      };
      
      // Start the WebRTC connection
      if (isInitiator) {
        console.log('🚀 Initiating WebRTC connection as initiator');
        createPeer(matchedPeerId, true);
      } else {
        console.log('⏳ Waiting for initiator signal as responder');
      }
    }
  }, [myPeerId, createPeer]);

  // Matchmaking hooks
  const matchmaking = useMatchmaking({
    onMatchFound: handleMatchFound,
    onError: (error) => {
      setError(error);
      onError(error);
    }
  });

  // Signaling callbacks (for direct connections)
  const signalingCallbacks = {
    onJoin: (peerId: string) => {
      console.log(`👋 Peer ${peerId} joined`);
    },
    onLeave: (peerId: string) => {
      console.log(`👋 Peer ${peerId} left`);
      if (peerId === connectedPeerId) {
        peerRef.current?.destroy();
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setConnectedPeerId(null);
      }
    },
    onSignal: (fromPeerId: string, data: any, targetPeerId?: string) => {
      if (targetPeerId && targetPeerId !== myPeerId) return;
      if (fromPeerId === myPeerId) return;

      console.log(`📨 Handling signal from ${fromPeerId}:`, data.type);
      
      if (!peerRef.current && fromPeerId === connectedPeerId) {
        console.log(`🔗 Creating responder connection for: ${fromPeerId}`);
        createPeer(fromPeerId, false);
      }
      
      if (peerRef.current && fromPeerId === connectedPeerId) {
        console.log(`📨 Forwarding signal to peer: ${data.type}`);
        peerRef.current.signal(data);
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

    setIsConnected(false);
    setConnectionStatus('disconnected');
    setConnectedPeerId(null);
    setError(null);
    setPairRoomId('');
    currentChannelRef.current = '';
  }, [stopMediaStream]);

  const start = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setConnectionStatus('connecting');
      onConnectionStatus('connecting');

      console.log('🔍 Starting connection...');

      if (connectionType === 'random') {
        // Use matchmaking system for random connections
        if (!ablyClientRef.current) {
          throw new Error('Ably client not initialized');
        }
        
        console.log('🎲 Starting random matchmaking...');
        await matchmaking.startSearch(ablyClientRef.current, myPeerId);
        
      } else if (connectionType === 'direct' && targetPeerId) {
        // Direct connection to specific peer (old behavior)
        const roomId = `pair-${myPeerId}-${targetPeerId}`;
        setPairRoomId(roomId);
        currentChannelRef.current = roomId;
        
        console.log('🎯 Direct connection mode');
        
        if (signalingPublishRef.current) {
          signaling.sendJoin(signalingPublishRef.current, myPeerId, roomId);
        }
        
        // Determine who is initiator based on lexicographic order
        const isInitiator = myPeerId > targetPeerId;
        isInitiatorRef.current = isInitiator;
        setConnectedPeerId(targetPeerId);
        
        createPeer(targetPeerId, isInitiator);
      }
      
      setIsStarted(true);
      console.log('✅ Connection process started');
      
    } catch (error) {
      console.error('❌ Error starting connection:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      onError(errorMessage);
      cleanup();
      setIsStarted(false);
      setConnectionStatus('idle');
      onConnectionStatus('disconnected');
    }
  }, [myPeerId, connectionType, targetPeerId, cleanup, onError, onConnectionStatus, matchmaking, signaling, createPeer]);

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

      if (connectionType === 'random') {
        if (!ablyClientRef.current) {
          throw new Error('Ably client not initialized');
        }
        
        console.log('🎲 Starting random matchmaking for call...');
        await matchmaking.startSearch(ablyClientRef.current, myPeerId);
        
      } else if (connectionType === 'direct' && targetPeerId) {
        const roomId = `pair-${myPeerId}-${targetPeerId}`;
        setPairRoomId(roomId);
        currentChannelRef.current = roomId;
        
        if (signalingPublishRef.current) {
          signaling.sendJoin(signalingPublishRef.current, myPeerId, roomId);
        }
        
        const isInitiator = myPeerId > targetPeerId;
        isInitiatorRef.current = isInitiator;
        setConnectedPeerId(targetPeerId);
        
        createPeer(targetPeerId, isInitiator);
      }
      
      setIsStarted(true);
      console.log('✅ Call started');
      
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
  }, [myPeerId, connectionType, targetPeerId, cleanup, onError, onConnectionStatus, matchmaking, signaling, getMediaStream, features.mediaStream, createPeer]);

  const stop = useCallback((): void => {
    console.log('🛑 Stopping P2P session');
    
    // Stop matchmaking if still searching
    if (matchmaking.isSearching) {
      matchmaking.stopSearch();
    }
    
    // Leave the current channel
    if (ablyClientRef.current && currentChannelRef.current) {
      const channel = ablyClientRef.current.channels.get(currentChannelRef.current);
      channel.unsubscribe();
    }
    
    cleanup();
    setIsStarted(false);
    setConnectionStatus('idle');
    onConnectionStatus('disconnected');
  }, [cleanup, onConnectionStatus, matchmaking]);

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

  const setAblyClient = useCallback((client: Ably.Realtime) => {
    ablyClientRef.current = client;
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
    setAblyClient, 
    localStreamRef,
    peerRef,
    dataChannelRef: { current: null },
  };
};