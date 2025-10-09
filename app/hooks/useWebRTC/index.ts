import { useState, useRef, useCallback, useEffect } from "react";
import Peer from "simple-peer";
import { useMatchmaking } from "./useMatchMaking";
import { UseWebRTCProps, UseWebRTCReturn } from "./types";
import Ably from "ably";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
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
}: UseWebRTCProps): UseWebRTCReturn => {
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "disconnected" | "rejected">("idle");
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const pairChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  
  const closeHandlerRef = useRef<(() => void) | null>(null);
  
  const isUnmountingRef = useRef(false);
  const connectionStatusRef = useRef(connectionStatus);

  useEffect(() => {
    isUnmountingRef.current = false;
    connectionStatusRef.current = connectionStatus;
    return () => { isUnmountingRef.current = true; };
  }, [connectionStatus]);

  const cleanup = useCallback(() => {
    console.log("🧹 Cleaning up WebRTC connection...");
    if (peerRef.current) {
      if (closeHandlerRef.current) {
        peerRef.current.off('close', closeHandlerRef.current);
      }
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (pairChannelRef.current) {
      pairChannelRef.current.unsubscribe();
      pairChannelRef.current.detach();
      pairChannelRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (!isUnmountingRef.current) {
      setConnectedPeerId(null);
      onConnectionChange(false);
    }
  }, [onConnectionChange]);
  
  const matchmaking = useMatchmaking({
    onMatchFound: (matchedPeerId, roomId, isInitiator) => {
       if (connectionStatusRef.current !== 'connecting') {
        console.warn(`Match found but in wrong state: ${connectionStatusRef.current}. Ignoring.`);
        return;
      }
      handleMatchFound(matchedPeerId, roomId, isInitiator);
    },
    onError: (err) => { 
      if (!isUnmountingRef.current) {
        setError(err); 
        onError(err);
        setConnectionStatus("disconnected");
      }
    },
  });

  const createPeer = useCallback((targetPeerId: string, initiator: boolean) => {
    if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
    }

    console.log(`🔗 Creating ${initiator ? "initiator" : "responder"} connection to ${targetPeerId}`);
    const peer = new Peer({
      initiator,
      trickle: true,
      config: { iceServers: ICE_SERVERS },
      stream: localStreamRef.current || undefined,
    });

    peer.on("signal", (data) => {
      console.log(`📤 [SIGNAL SENT] Type: ${data.type}, To: ${targetPeerId}`);
      pairChannelRef.current?.publish("webrtc-signal", { type: "signal", data, peerId: myPeerId });
    });

    peer.on("connect", () => {
      console.log(`✅✅✅✅✅✅✅✅✅✅ CONNECTED to ${targetPeerId} ✅✅✅✅✅✅✅✅✅✅`);
      if (!isUnmountingRef.current) {
        setConnectedPeerId(targetPeerId);
        setConnectionStatus("connected");
        onConnectionChange(true);
        onConnectionStatus("connected");
      }
    });

    peer.on("data", (data) => onDataChannelMessage(data.toString()));
    peer.on("stream", (stream) => onRemoteStream(stream));

    peer.on("error", (err) => {
      console.error("❌ Peer error:", err);
      if (!isUnmountingRef.current) {
        setError(err.message);
        onError(err.message);
      }
    });

    const handleClose = () => {
      console.log(`🔌 Connection closed with ${targetPeerId}`);
      if (connectionStatusRef.current === 'connected' && !isUnmountingRef.current) {
        cleanup();
        setConnectionStatus("disconnected");
        onConnectionStatus("disconnected");
      }
    };
    closeHandlerRef.current = handleClose;
    peer.on("close", handleClose);

    peerRef.current = peer;
    return peer;
  }, [cleanup, myPeerId, onConnectionChange, onConnectionStatus, onDataChannelMessage, onError, onRemoteStream]);


  const start = useCallback(async () => {
    if (!myPeerId || !ablyClientRef.current) {
      onError("Connection service not ready.");
      return;
    }
    console.log("🚀🚀🚀 STARTING NEW SEARCH 🚀🚀🚀");
    setIsStarted(true);
    setConnectionStatus("connecting");
    onConnectionStatus("connecting");
    cleanup();
    await matchmaking.startSearch(ablyClientRef.current, myPeerId);
  }, [myPeerId, cleanup, matchmaking, onError, onConnectionStatus]);

  const stop = useCallback(() => {
    console.log("🛑🛑🛑 STOPPING SESSION 🛑🛑🛑");
    setIsStarted(false);
    setConnectionStatus("idle");
    onConnectionStatus("idle");
    matchmaking.stopSearch();
    cleanup();
  }, [cleanup, matchmaking, onConnectionStatus]);
  
  function handleMatchFound(matchedPeerId: string, roomId: string, isInitiator: boolean) {
    console.log(`🎉 Match found! Paired with ${matchedPeerId}, room: ${roomId}, initiator: ${isInitiator}`);
    const channel = ablyClientRef.current!.channels.get(roomId);
    pairChannelRef.current = channel;

    channel.subscribe("webrtc-signal", (message) => {
      const { type, data, peerId: fromPeerId } = message.data;
      if (fromPeerId === myPeerId) return;

      if (type === 'end-chat' || type === 'switch-peer') {
        console.log(`👋 Peer initiated ${type}. Finding new chat...`);
        start();
        return;
      }

      if (type === 'responder-ready' && isInitiator) {
        console.log("...Initiator confirms responder is ready. Creating initiator peer.");
        createPeer(matchedPeerId, true);
        return;
      }

      if (type === "signal") {
        if (data.type === 'offer' && !isInitiator && !peerRef.current) {
          const peer = createPeer(fromPeerId, false);
          peer.signal(data);
          return;
        }
        if (peerRef.current) {
          peerRef.current.signal(data);
        }
      }
    });

    if (!isInitiator) {
      console.log("...I am the responder. Announcing readiness.");
      channel.publish("webrtc-signal", { type: "responder-ready", peerId: myPeerId });
    }
  }

  const endChat = useCallback(async () => {
    console.log("👋 User initiated end chat.");
    try {
      await pairChannelRef.current?.publish("webrtc-signal", { type: "end-chat", peerId: myPeerId });
    } catch (error) {
      console.error("Failed to publish end-chat signal:", error);
    }
    stop();
  }, [myPeerId, stop]);
  
  const switchPeer = useCallback(async () => {
    console.log("🔄 User initiated switch peer.");
    try {
      await pairChannelRef.current?.publish("webrtc-signal", { type: "switch-peer", peerId: myPeerId });
    } catch (error) {
        console.error("Failed to publish switch-peer signal:", error);
    }
    start();
  }, [myPeerId, start]);

  const sendMessage = useCallback((message: string) => {
    if (peerRef.current?.connected && features.dataChannel) {
      peerRef.current.send(message);
    }
  }, [features.dataChannel]);

  const setAblyClient = useCallback((client: Ably.Realtime) => {
    ablyClientRef.current = client;
    if (client?.auth.clientId) {
      console.log(`🔑 Synchronizing Peer ID with Ably clientId: ${client.auth.clientId}`);
      setMyPeerId(client.auth.clientId);
    }
  }, []);

  const getMediaStream = useCallback(async (options?: { audio?: boolean; video?: boolean; }): Promise<MediaStream | null> => {
    return localStreamRef.current;
  }, []);

  const stopMediaStream = useCallback((): void => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, []);


  return {
    isStarted,
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    myPeerId,
    connectedPeerId,
    error,
    start,
    stop,
    endChat,
    switchPeer,
    sendMessage,
    setAblyClient,
    localStreamRef,
    peerRef,
    startCall: async () => {},
    sendFile: () => {},
    toggleMedia: async () => {},
    stopMediaStream: stopMediaStream,
    getMediaStream,
    dataChannelRef: { current: null },
  };
};
