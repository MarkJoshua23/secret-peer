'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useChannel, ChannelProvider } from 'ably/react';
import { useWebRTC } from '../hooks/useWebRTC';

// Video component for better reusability
interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  title: string;
  isLive?: boolean;
  isMuted?: boolean;
}

const VideoPlayer = ({ 
  videoRef, 
  stream, 
  title, 
  isLive = false,
  isMuted = false 
}: VideoPlayerProps) => (
  <div className="bg-gray-900 rounded-lg overflow-hidden shadow-lg">
    <div className="flex justify-between items-center bg-gray-800 px-4 py-2">
      <h3 className="text-white text-sm font-medium">{title}</h3>
      <div className="flex items-center space-x-3">
        {stream && (
          <div className="flex space-x-1">
            {stream.getVideoTracks().map(track => (
              <div 
                key={track.id}
                className={`w-2 h-2 rounded-full ${track.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                title={track.enabled ? 'Video enabled' : 'Video disabled'}
              />
            ))}
            {stream.getAudioTracks().map(track => (
              <div 
                key={track.id}
                className={`w-2 h-2 rounded-full ${track.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                title={track.enabled ? 'Audio enabled' : 'Audio disabled'}
              />
            ))}
          </div>
        )}
        {isLive && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-green-400">Live</span>
          </div>
        )}
      </div>
    </div>
    <video
      ref={videoRef}
      autoPlay
      muted={isMuted}
      playsInline
      className="w-full h-64 md:h-80 object-cover bg-black"
    />
    {!stream && (
      <div className="flex items-center justify-center bg-black bg-opacity-50 h-64 md:h-80">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
          <p className="text-sm">No video stream</p>
        </div>
      </div>
    )}
  </div>
);

// Connection status component
const ConnectionStatus = ({ 
  isConnected, 
  isCallStarted, 
  roomPeersCount,
  activeConnections 
}: {
  isConnected: boolean;
  isCallStarted: boolean;
  roomPeersCount: number;
  activeConnections: number;
}) => {
  if (isConnected) {
    return (
      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
        Connected ({activeConnections} peer{activeConnections !== 1 ? 's' : ''})
      </div>
    );
  }

  if (isCallStarted && roomPeersCount > 0) {
    return (
      <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
        Connecting... ({roomPeersCount} peer{roomPeersCount !== 1 ? 's' : ''} in room)
      </div>
    );
  }

  if (isCallStarted) {
    return (
      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
        Waiting for peers...
      </div>
    );
  }

  return null;
};

function VideoCallInner() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    isCallStarted,
    isConnected,
    roomPeers,
    myPeerId,
    error,
    startCall,
    endCall,
    sendMessage,
    localStreamRef,
    peersRef,
    handleChannelMessage,
  } = useWebRTC({
    onRemoteStream: (stream) => {
      console.log('🎥 Setting remote video stream');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    },
    onConnectionChange: (connected) => {
      console.log('🔌 Connection state changed:', connected);
    },
    onError: (error) => {
      console.error('❌ WebRTC error:', error);
      setLocalError(error);
    },
  });

  // Use Ably channel
  const { channel, publish } = useChannel('webrtc-video-call', (ablyMessage) => {
    console.log('📨 Ably message received:', ablyMessage.data);
    handleChannelMessage(ablyMessage.data, publish);
  });

  // Set local video stream when available
  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current) {
      console.log('🎥 Setting local video stream');
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamRef.current]);

  const handleStartCall = useCallback(async () => {
    console.log('🚀 Starting call...');
    setLocalError(null);
    await startCall(publish);
  }, [startCall, publish]);

  const handleEndCall = useCallback(() => {
    console.log('🛑 Ending call...');
    endCall();
    
    // Clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setLocalError(null);
  }, [endCall]);

  const handleSendMessage = useCallback(() => {
    const message = `Hello from ${myPeerId} at ${new Date().toLocaleTimeString()}`;
    console.log('📤 Sending message:', message);
    sendMessage(message);
  }, [myPeerId, sendMessage]);

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          WebRTC Video Call
        </h1>
        
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
          {/* Header with Connection Status */}
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-sm text-gray-600">
              Your ID: <code className="bg-gray-100 px-2 py-1 rounded font-mono">{myPeerId}</code>
            </div>
            <ConnectionStatus 
              isConnected={isConnected}
              isCallStarted={isCallStarted}
              roomPeersCount={roomPeers.length}
              activeConnections={peersRef.current.size}
            />
          </div>

          {/* Error Display */}
          {displayError && (
            <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <strong>Error: </strong>{displayError}
                </div>
                <button 
                  onClick={() => setLocalError(null)}
                  className="text-red-800 hover:text-red-900 ml-4 text-lg"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Video Containers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
            <VideoPlayer
              videoRef={localVideoRef}
              stream={localStreamRef.current}
              title="You"
              isMuted={true}
            />
            <VideoPlayer
              videoRef={remoteVideoRef}
              stream={remoteVideoRef.current?.srcObject as MediaStream}
              title="Remote"
              isLive={isConnected}
            />
          </div>

          {/* Controls */}
          <div className="flex justify-center space-x-4 mb-6">
            {!isCallStarted ? (
              <button
                onClick={handleStartCall}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md flex items-center space-x-2"
              >
                <span>Join Call</span>
              </button>
            ) : (
              <button
                onClick={handleEndCall}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md flex items-center space-x-2"
              >
                <span>Leave Call</span>
              </button>
            )}
            
            {isConnected && (
              <button
                onClick={handleSendMessage}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md"
              >
                Send Test Message
              </button>
            )}
          </div>

          {/* Connection Info */}
          <div className="mt-6 p-4 md:p-6 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold mb-4 text-gray-800 flex items-center">
              Connection Information
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-3">
                <InfoRow label="Status" value={
                  <span className={`font-medium ${
                    isConnected ? 'text-green-600' : 
                    isCallStarted ? 'text-yellow-600' : 'text-gray-600'
                  }`}>
                    {isConnected ? 'Connected' : 
                     isCallStarted ? 'Connecting...' : 'Not Connected'}
                  </span>
                } />
                <InfoRow label="Your Peer ID" value={
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">{myPeerId}</code>
                } />
                <InfoRow label="Active Connections" value={peersRef.current.size} />
              </div>
              <div className="space-y-3">
                <InfoRow label="Peers in Room" value={roomPeers.length} />
                <InfoRow label="Local Stream" value={
                  <StatusIndicator isActive={!!localStreamRef.current} />
                } />
                <InfoRow label="Remote Stream" value={
                  <StatusIndicator isActive={isConnected} />
                } />
              </div>
            </div>
            
            {/* Peer List */}
            {roomPeers.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h4 className="font-medium mb-3 text-gray-700">Peers in Room:</h4>
                <div className="flex flex-wrap gap-2">
                  {roomPeers.map(peerId => (
                    <PeerBadge 
                      key={peerId} 
                      peerId={peerId} 
                      isConnected={peersRef.current.has(peerId)} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper components
const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-center">
    <span className="text-gray-600">{label}:</span>
    {value}
  </div>
);

const StatusIndicator = ({ isActive }: { isActive: boolean }) => (
  <span className={`inline-flex items-center ${isActive ? 'text-green-600' : 'text-red-600'}`}>
    <span className={`w-2 h-2 rounded-full mr-2 ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
    {isActive ? 'Active' : 'Inactive'}
  </span>
);

const PeerBadge = ({ peerId, isConnected }: { peerId: string; isConnected: boolean }) => (
  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
    isConnected 
      ? 'bg-green-100 text-green-800 border border-green-200'
      : 'bg-gray-100 text-gray-600 border border-gray-200'
  }`}>
    {peerId}
    {isConnected && <span className="ml-1">✓</span>}
  </div>
);

// Outer component that provides the ChannelProvider
export default function VideoCall() {
  return (
    <ChannelProvider channelName="webrtc-video-call">
      <VideoCallInner />
    </ChannelProvider>
  );
}