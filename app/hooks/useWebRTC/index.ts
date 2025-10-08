import { useState, useRef, useCallback, useEffect } from "react";
import Peer from "simple-peer";
import { useWebRTCSignaling } from "./useWebRTCSignaling";
import { useMatchmaking } from "./useMatchMaking";
import { UseWebRTCProps, UseWebRTCReturn } from "./types";
import Ably from "ably";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const useWebRTC = ({
  connectionType = "random",
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
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected" | "rejected"
  >("idle");
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairRoomId, setPairRoomId] = useState<string>("");

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const signalingPublishRef = useRef<
    ((name: string, data: any) => void) | null
  >(null);
  const isInitiatorRef = useRef<boolean>(false);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const currentChannelRef = useRef<string>("");

  // BUG FIX: Use a ref to track the session status to prevent stale closures.
  const isStartedRef = useRef(isStarted);
  useEffect(() => {
    isStartedRef.current = isStarted;
  }, [isStarted]);

  // Generate unique peer ID
  const generatePeerId = useCallback(
    () => `user-${Math.random().toString(36).substr(2, 8)}`,
    []
  );

  // Initialize peer ID on mount
  useEffect(() => {
    setMyPeerId(generatePeerId());
  }, [generatePeerId]);

  const stopMediaStream = useCallback((): void => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);

  const cleanup = useCallback((): void => {
    stopMediaStream();
    peerRef.current?.destroy();
    peerRef.current = null;
    setIsConnected(false);
    setConnectionStatus("disconnected");
    setConnectedPeerId(null);
    setError(null);
    setPairRoomId("");
    currentChannelRef.current = "";
  }, [stopMediaStream]);

  // Matchmaking hooks need to be defined before they are used in `stop`
  const matchmaking = useMatchmaking({
    onMatchFound: handleMatchFound, // handleMatchFound is defined below
    onError: (error) => {
      setError(error);
      onError(error);
    },
  });

  const stop = useCallback((): void => {
    console.log("🛑 Stopping P2P session");

    if (matchmaking.isSearching) {
      matchmaking.stopSearch();
    }

    if (ablyClientRef.current && currentChannelRef.current) {
      const channel = ablyClientRef.current.channels.get(
        currentChannelRef.current
      );
      channel.unsubscribe();
    }

    cleanup();
    setIsStarted(false);
    setConnectionStatus("idle");
    onConnectionStatus("disconnected");
  }, [cleanup, onConnectionStatus, matchmaking]);

  // Re-enter matchmaking after a disconnect/switch
  const reconnectToMatchmaking = useCallback(async () => {
    console.log("🔄 Re-entering matchmaking...");

    peerRef.current?.destroy();
    peerRef.current = null;
    if (ablyClientRef.current && currentChannelRef.current) {
      ablyClientRef.current.channels
        .get(currentChannelRef.current)
        .unsubscribe();
    }
    setIsConnected(false);
    setConnectedPeerId(null);
    setPairRoomId("");
    currentChannelRef.current = "";

    setConnectionStatus("connecting");
    onConnectionStatus("connecting");

    if (ablyClientRef.current && myPeerId) {
      await matchmaking.startSearch(ablyClientRef.current, myPeerId);
    } else {
      console.error(
        "❌ Cannot reconnect to matchmaking, Ably client or PeerId missing. Stopping."
      );
      stop();
    }
  }, [myPeerId, onConnectionStatus, matchmaking, stop]);

  // Create peer connection
  const createPeer = useCallback(
    (targetPeerId: string, initiator: boolean) => {
      console.log(
        `🔗 Creating ${
          initiator ? "initiator" : "responder"
        } connection to ${targetPeerId}`
      );

      const peerOptions: Peer.Options = {
        initiator,
        trickle: true,
        config: { iceServers: ICE_SERVERS },
      };
      if (features.mediaStream && localStreamRef.current) {
        peerOptions.stream = localStreamRef.current;
      }

      const peer = new Peer(peerOptions);

      peer.on("signal", (data) => {
        console.log(`📤 Sending signal to ${targetPeerId}:`, data.type);
        if (signalingPublishRef.current) {
          signalingPublishRef.current("webrtc-signal", {
            type: "signal",
            data,
            peerId: myPeerId,
            targetPeerId,
          });
        }
      });

      peer.on("connect", () => {
        console.log(`✅ Connected to ${targetPeerId}`);
        setIsConnected(true);
        setConnectionStatus("connected");
        setConnectedPeerId(targetPeerId);
        onConnectionChange(true);
        onConnectionStatus("connected");
      });

      if (features.dataChannel) {
        peer.on("data", (data) => {
          const message = data.toString();
          onDataChannelMessage(message);
        });
      }

      if (features.mediaStream) {
        peer.on("stream", (stream) => onRemoteStream(stream));
      }

      peer.on("error", (err) => {
        console.error(`❌ Peer error:`, err);
        const errorMessage = `Connection error: ${err.message}`;
        setError(errorMessage);
        onError(errorMessage);
      });

      peer.on("close", () => {
        console.log(`🔌 Connection closed with ${targetPeerId}`);
        if (isStartedRef.current && connectionStatus === "connected") {
          reconnectToMatchmaking();
        }
      });

      peerRef.current = peer;
      return peer;
    },
    [
      myPeerId,
      features,
      connectionStatus,
      onRemoteStream,
      onConnectionChange,
      onDataChannelMessage,
      onError,
      onConnectionStatus,
      reconnectToMatchmaking,
    ]
  );

  // This function can be called by the matchmaking hook at any time.
  function handleMatchFound(
    matchedPeerId: string,
    roomId: string,
    isInitiator: boolean
  ) {
    // BUG FIX: If the session was stopped, ignore any lingering match events.
    if (!isStartedRef.current) {
      console.warn(
        " Stale matchmaking event received after session was stopped. Ignoring."
      );
      return;
    }

    console.log(
      `🎉 Match found! Paired with ${matchedPeerId}, room: ${roomId}, initiator: ${isInitiator}`
    );

    setPairRoomId(roomId);
    setConnectedPeerId(matchedPeerId);
    isInitiatorRef.current = isInitiator;
    currentChannelRef.current = roomId;

    if (ablyClientRef.current) {
      const pairChannel = ablyClientRef.current.channels.get(roomId);

      pairChannel.subscribe("webrtc-signal", (message) => {
        const { type, peerId: fromPeerId, targetPeerId, data } = message.data;

        if (
          (targetPeerId && targetPeerId !== myPeerId) ||
          fromPeerId === myPeerId
        )
          return;

        if (type === "end-chat" && fromPeerId === matchedPeerId) {
          console.log("👋 Peer ended the chat. Finding a new one.");
          reconnectToMatchmaking();
          return;
        }

        if (type === "switch-peer" && fromPeerId === matchedPeerId) {
          console.log("🔄 Peer initiated a switch. Finding a new one.");
          reconnectToMatchmaking();
          return;
        }

        if (type === "signal") {
          if (!peerRef.current && fromPeerId === matchedPeerId) {
            createPeer(fromPeerId, false);
          }
          if (peerRef.current && fromPeerId === matchedPeerId) {
            peerRef.current.signal(data);
          }
        }
      });

      signalingPublishRef.current = (eventName: string, data: any) =>
        pairChannel.publish(eventName, data);

      if (isInitiator) {
        createPeer(matchedPeerId, true);
      }
    }
  }

  const getMediaStream = useCallback(
    async (options?: {
      audio?: boolean;
      video?: boolean;
    }): Promise<MediaStream | null> => {
      if (!features.mediaStream && !options) return null;

      try {
        const streamOptions = {
          audio: options?.audio ?? mediaOptions.audio ?? false,
          video: options?.video ?? mediaOptions.video ?? false,
        };
        console.log("🎤 Requesting media access...", streamOptions);
        const stream = await navigator.mediaDevices.getUserMedia(streamOptions);
        localStreamRef.current = stream;
        return stream;
      } catch (error) {
        console.error("❌ Error getting media stream:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to access media devices";
        setError(errorMessage);
        onError(errorMessage);
        return null;
      }
    },
    [features.mediaStream, mediaOptions, onError]
  );

  const signalingCallbacks = {
    onJoin: (peerId: string) => {
      console.log(`👋 Peer ${peerId} joined`);
    },
    onLeave: (peerId: string) => {
      console.log(`👋 Peer ${peerId} left`);
      if (peerId === connectedPeerId) {
        peerRef.current?.destroy();
        setIsConnected(false);
        setConnectionStatus("disconnected");
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
    },
  };

  const signaling = useWebRTCSignaling(signalingCallbacks);

  const start = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setConnectionStatus("connecting");
      onConnectionStatus("connecting");
      console.log("🔍 Starting connection...");

      if (connectionType === "random") {
        if (!ablyClientRef.current) {
          throw new Error("Ably client not initialized");
        }
        console.log("🎲 Starting random matchmaking...");
        await matchmaking.startSearch(ablyClientRef.current, myPeerId);
      } else if (connectionType === 'direct' && targetPeerId) {
        const roomId = `pair-${myPeerId}-${targetPeerId}`;
        setPairRoomId(roomId);
        currentChannelRef.current = roomId;
        
        console.log('🎯 Direct connection mode');
        
        if (signalingPublishRef.current) {
          signaling.sendJoin(signalingPublishRef.current, myPeerId, roomId);
        }
        
        const isInitiator = myPeerId > targetPeerId;
        isInitiatorRef.current = isInitiator;
        setConnectedPeerId(targetPeerId);
        
        createPeer(targetPeerId, isInitiator);
      }

      setIsStarted(true);
      console.log("✅ Connection process started");
    } catch (error) {
      console.error("❌ Error starting connection:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(errorMessage);
      onError(errorMessage);
      cleanup();
      setIsStarted(false);
      setConnectionStatus("idle");
      onConnectionStatus("disconnected");
    }
  }, [
    myPeerId,
    connectionType,
    targetPeerId,
    cleanup,
    onError,
    onConnectionStatus,
    matchmaking,
    signaling,
    createPeer,
  ]);

  const startCall = useCallback(
    async (callMediaOptions?: {
      audio: boolean;
      video: boolean;
    }): Promise<void> => {
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
    },
    [
      myPeerId,
      connectionType,
      targetPeerId,
      cleanup,
      onError,
      onConnectionStatus,
      matchmaking,
      signaling,
      getMediaStream,
      features.mediaStream,
      createPeer,
    ]
  );

  const endChat = useCallback(() => {
    console.log("🛑 User initiated end chat.");
    if (signalingPublishRef.current && connectedPeerId) {
      signalingPublishRef.current("webrtc-signal", {
        type: "end-chat",
        peerId: myPeerId,
        targetPeerId: connectedPeerId,
      });
    }
    stop();
  }, [myPeerId, connectedPeerId, stop]);

  const switchPeer = useCallback(() => {
    console.log("🔄 User initiated switch peer.");
    if (signalingPublishRef.current && connectedPeerId) {
      signalingPublishRef.current("webrtc-signal", {
        type: "switch-peer",
        peerId: myPeerId,
        targetPeerId: connectedPeerId,
      });
    }
    reconnectToMatchmaking();
  }, [myPeerId, connectedPeerId, reconnectToMatchmaking]);

  const sendMessage = useCallback(
    (message: string): void => {
      if (
        peerRef.current &&
        (peerRef.current as any).connected &&
        features.dataChannel
      ) {
        peerRef.current.send(message);
      } else {
        console.warn(
          "⚠️ Cannot send message: peer not connected or data channel disabled"
        );
      }
    },
    [features.dataChannel]
  );

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

  const setAblyClient = useCallback((client: Ably.Realtime) => {
    ablyClientRef.current = client;
  }, []);

  const handleSignalingMessage = useCallback(
    (message: any): void => {
      signaling.handleSignalingMessage(message);
    },
    [signaling]
  );

  const setSignalingPublish = useCallback(
    (publish: (name: string, data: any) => void) => {
      signalingPublishRef.current = publish;
    },
    []
  );

  return {
    isStarted,
    isConnected,
    connectionStatus,
    myPeerId,
    connectedPeerId,
    error,
    start,
    stop,
    endChat,
    switchPeer,
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
