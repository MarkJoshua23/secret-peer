import { useCallback, useRef } from 'react';
import { WebRTCConfig } from './types';

export interface ConnectionCallbacks {
  onRemoteStream: (stream: MediaStream) => void;
  onDataChannelMessage: (message: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
}

export interface UseWebRTCConnectionsReturn {
  createPeerConnection: (isInitiator: boolean, localStream?: MediaStream) => RTCPeerConnection;
  closePeerConnection: () => void;
  sendMessage: (message: string) => void;
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  dataChannelRef: React.MutableRefObject<RTCDataChannel | null>;
}

const DEFAULT_CONFIG: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  trickle: true
};

export const useWebRTCConnections = (
  myPeerId: string,
  config: WebRTCConfig = DEFAULT_CONFIG,
  callbacks: ConnectionCallbacks
): UseWebRTCConnectionsReturn => {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const { onRemoteStream, onDataChannelMessage, onConnected, onDisconnected, onError } = callbacks;

  const createDataChannel = useCallback((peer: RTCPeerConnection): RTCDataChannel => {
    const dataChannel = peer.createDataChannel('chat', {
      ordered: true
    });

    dataChannel.onopen = () => {
      console.log(`📨 Data channel opened`);
      dataChannelRef.current = dataChannel;
    };

    dataChannel.onmessage = (event) => {
      console.log(`📨 Message received:`, event.data);
      onDataChannelMessage(event.data);
    };

    dataChannel.onerror = (error) => {
      console.error(`❌ Data channel error:`, error);
      onError(`Data channel error: ${error}`);
    };

    dataChannel.onclose = () => {
      console.log(`🔌 Data channel closed`);
      dataChannelRef.current = null;
    };

    return dataChannel;
  }, [onDataChannelMessage, onError]);

  const setupDataChannelHandler = useCallback((peer: RTCPeerConnection): void => {
    peer.ondatachannel = (event) => {
      const dataChannel = event.channel;
      
      dataChannel.onopen = () => {
        console.log(`📨 Incoming data channel opened`);
        dataChannelRef.current = dataChannel;
      };

      dataChannel.onmessage = (event) => {
        console.log(`📨 Message received:`, event.data);
        onDataChannelMessage(event.data);
      };

      dataChannel.onerror = (error) => {
        console.error(`❌ Incoming data channel error:`, error);
        onError(`Data channel error: ${error}`);
      };

      dataChannelRef.current = dataChannel;
    };
  }, [onDataChannelMessage, onError]);

  const createPeerConnection = useCallback((
    isInitiator: boolean, 
    localStream?: MediaStream
  ): RTCPeerConnection => {
    console.log(`🔗 Creating ${isInitiator ? 'initiator' : 'responder'} connection`);
    
    const peer = new RTCPeerConnection({
      iceServers: config.iceServers || DEFAULT_CONFIG.iceServers!
    });

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
      });
    }

    // Set up data channels
    if (isInitiator) {
      createDataChannel(peer);
    } else {
      setupDataChannelHandler(peer);
    }

    // Handle incoming streams
    peer.ontrack = (event) => {
      console.log(`🎥 Received remote stream`);
      const remoteStream = event.streams[0];
      onRemoteStream(remoteStream);
    };

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`❄️ Generated ICE candidate`);
      }
    };

    peer.onconnectionstatechange = () => {
      console.log(`🔌 Connection state: ${peer.connectionState}`);
      
      switch (peer.connectionState) {
        case 'connected':
          onConnected();
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          onDisconnected();
          closePeerConnection();
          break;
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log(`❄️ ICE connection state: ${peer.iceConnectionState}`);
    };

    peerConnectionRef.current = peer;
    return peer;
  }, [createDataChannel, setupDataChannelHandler, onRemoteStream, onConnected, onDisconnected, onError]);

  const closePeerConnection = useCallback((): void => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    
    console.log(`🔌 Closed peer connection`);
  }, []);

  const sendMessage = useCallback((message: string): void => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(message);
      console.log(`📤 Sent message: ${message}`);
    } else {
      console.warn(`⚠️ Cannot send message: data channel not open`);
    }
  }, []);

  return {
    createPeerConnection,
    closePeerConnection,
    sendMessage,
    peerConnectionRef,
    dataChannelRef,
  };
};