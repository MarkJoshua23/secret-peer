'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useChannel, useAbly } from 'ably/react';
import { useWebRTC } from '../hooks/useWebRTC';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: Date;
}

function AnonymousChatInner() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get Ably client instance
  const ablyClient = useAbly();

  const {
    isStarted,
    isConnected,
    connectionStatus,
    myPeerId,
    connectedPeerId,
    error,
    start,
    stop,
    sendMessage,
    handleSignalingMessage,
    setSignalingPublish,
    setAblyClient, 
    localStreamRef,
    peerRef, 
    dataChannelRef,
    // Call methods are available but not used
    startCall,
    sendFile,
    toggleMedia,
    getMediaStream,
    stopMediaStream,
  } = useWebRTC({
    connectionType: 'random',

    features: {
      dataChannel: true,    // Enable messaging
      mediaStream: false,   // Disable media for chat-only
    },
    onDataChannelMessage: (message: string) => {
      console.log(`💬 Received message: ${message}`);
      addMessage(message, 'them');
    },
    onConnectionStatus: (status) => {
      console.log(`🔌 Connection status: ${status}`);
      if (status === 'disconnected') {
        addSystemMessage('User disconnected. Finding another user...');
      } else if (status === 'connected') {
        addSystemMessage('Connected! You can start chatting now.');
      }
    },
    onError: (error) => {
      console.error('❌ WebRTC error:', error);
      addSystemMessage(`Error: ${error}`);
    },
  });

  // Set Ably client in WebRTC hook
  useEffect(() => {
    if (ablyClient) {
      console.log('✅ Ably connected successfully!');
      setAblyClient(ablyClient);
    }
  }, [ablyClient, setAblyClient]);



  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback((text: string, sender: 'me' | 'them') => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    const newMessage: Message = {
      id: `system-${Date.now()}`,
      text,
      sender: 'them', // System messages show as "them"
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const handleStartChat = useCallback(async () => {
    console.log('🚀 Starting anonymous chat...');
    setMessages([]);
    addSystemMessage('Looking for someone to chat with...');
    await start(); // This will trigger matchmaking
  }, [start, addSystemMessage]);

  const handleEndChat = useCallback(() => {
    console.log('🛑 Ending chat...');
    if (isConnected) {
      addSystemMessage('Chat ended. Click "Start New Chat" to find someone new.');
    }
    stop();
  }, [stop, isConnected, addSystemMessage]);

  const handleSendMessage = useCallback(() => {
    if (inputMessage.trim() && isConnected) {
      sendMessage(inputMessage);
      addMessage(inputMessage, 'me');
      setInputMessage('');
    }
  }, [inputMessage, isConnected, sendMessage, addMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const getStatusMessage = () => {
    switch (connectionStatus) {
      case 'idle':
        return 'Ready to start a chat';
      case 'connecting':
        return 'Looking for someone to chat with...';
      case 'connected':
        return `Connected with a stranger!`;
      case 'disconnected':
        return 'Disconnected';
      case 'rejected':
        return 'Connection was rejected';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'rejected':
      case 'disconnected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Anonymous Chat
          </h1>
          <p className="text-gray-600">
            Chat randomly with strangers securely using P2P WebRTC
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Status Bar */}
          <div className="bg-gray-50 border-b px-6 py-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor()}`}>
                  {getStatusMessage()}
                </div>
                {isConnected && (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-green-600">Live</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  Your ID: <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{myPeerId}</code>
                </div>
                
                {!isStarted ? (
                  <button
                    onClick={handleStartChat}
                    disabled={!ablyClient}
                    className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold transition-colors shadow-md"
                  >
                    Start New Chat
                  </button>
                ) : (
                  <button
                    onClick={handleEndChat}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors shadow-md"
                  >
                    End Chat
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 px-6 py-4">
              <div className="flex justify-between items-start">
                <div className="text-red-700">
                  <strong>Error: </strong>{error}
                </div>
                <button className="text-red-500 hover:text-red-700 ml-4">
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div className="h-96 overflow-y-auto p-6 bg-gray-50">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">💬</div>
                  <p className="text-lg">No messages yet</p>
                  <p className="text-sm">Start a chat to begin conversation</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${
                        message.sender === 'me'
                          ? 'bg-blue-500 text-white rounded-br-none'
                          : 'bg-gray-200 text-gray-800 rounded-bl-none'
                      }`}
                    >
                      <div className="text-sm">{message.text}</div>
                      <div
                        className={`text-xs mt-1 ${
                          message.sender === 'me' ? 'text-blue-100' : 'text-gray-500'
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          {isConnected && (
            <div className="border-t bg-white p-4">
              <div className="flex space-x-4">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!isConnected}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || !isConnected}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Debug Info */}
          <div className="bg-gray-50 border-t px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
              <div className="text-center">
                <div className="font-semibold">Status</div>
                <div className={connectionStatus === 'connected' ? 'text-green-600' : 'text-gray-600'}>
                  {connectionStatus}
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold">Connected To</div>
                <div className="font-mono text-xs truncate">
                  {connectedPeerId || 'None'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold">Messages</div>
                <div>{messages.filter(m => m.sender === 'them').length} received</div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 text-center shadow-md">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="font-semibold mb-2">Secure & Private</h3>
            <p className="text-gray-600 text-sm">
              End-to-end encrypted P2P connections. No messages stored on servers.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 text-center shadow-md">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="font-semibold mb-2">Anonymous</h3>
            <p className="text-gray-600 text-sm">
              Chat with random strangers. No accounts or personal info required.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 text-center shadow-md">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="font-semibold mb-2">Instant</h3>
            <p className="text-gray-600 text-sm">
              Real-time messaging with low latency using WebRTC data channels.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnonymousChat() {
  return <AnonymousChatInner />;
}