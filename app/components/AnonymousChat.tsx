'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAbly } from 'ably/react';
import { useWebRTC } from '../hooks/useWebRTC'; // Adjust path if needed

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

  const ablyClient = useAbly();

  const {
    isStarted,
    isConnected,
    connectionStatus,
    myPeerId,
    error,
    start,
    endChat,
    switchPeer,
    sendMessage,
    setAblyClient,
  } = useWebRTC({
    connectionType: 'random',
    features: { dataChannel: true, mediaStream: false },
    onDataChannelMessage: (message: string) => {
      addMessage(message, 'them');
    },
    onConnectionStatus: (status) => {
      console.log(`🔌 Connection status: ${status}`);
      if (status === 'disconnected' && isStarted) {
        addSystemMessage('User disconnected. Finding another user...');
      } else if (status === 'connected') {
        addSystemMessage('Connected! You can start chatting now.');
      }
    },
    onError: (err) => {
      console.error('❌ WebRTC error:', err);
      addSystemMessage(`Error: ${err}`);
    },
  });

  useEffect(() => {
    if (ablyClient) {
      setAblyClient(ablyClient);
    }
  }, [ablyClient, setAblyClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback((text: string, sender: 'me' | 'them') => {
    const newMessage: Message = { id: Date.now().toString(), text, sender, timestamp: new Date() };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    const newMessage: Message = { id: `system-${Date.now()}`, text, sender: 'them', timestamp: new Date() };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const handleStartChat = useCallback(async () => {
    setMessages([]);
    addSystemMessage('Looking for someone to chat with...');
    await start();
  }, [start, addSystemMessage]);

  const handleEndChat = useCallback(() => {
    addSystemMessage('You ended the chat. Click "Start New Chat" to find someone new.');
    endChat();
  }, [endChat, addSystemMessage]);

  const handleSwitchPeer = useCallback(() => {
    addSystemMessage('Looking for a new chat partner...');
    switchPeer();
  }, [switchPeer, addSystemMessage]);

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
      case 'idle': return 'Ready to start a chat';
      case 'connecting': return 'Looking for someone to chat with...';
      case 'connected': return `Connected with a stranger!`;
      case 'disconnected': return 'Disconnected. Finding a new partner...';
      case 'rejected': return 'Connection was rejected';
      default: return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-100 text-green-800 border-green-200';
      case 'connecting': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'rejected':
      case 'disconnected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Anonymous Chat</h1>
          <p className="text-gray-600">Chat randomly with strangers securely using P2P WebRTC</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gray-50 border-b px-6 py-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor()}`}>{getStatusMessage()}</div>
                {isConnected && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>}
              </div>
              <div className="flex items-center space-x-2">
                {!isStarted ? (
                  <button onClick={handleStartChat} disabled={!ablyClient} className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-semibold">
                    Start New Chat
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button onClick={handleSwitchPeer} disabled={!isConnected} className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-semibold">
                      Switch
                    </button>
                    <button onClick={handleEndChat} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-semibold">
                      End Chat
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="h-96 overflow-y-auto p-6 bg-gray-50">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">💬</div>
                  <p className="text-lg">Start a chat to begin</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${msg.sender === 'me' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                      <div className="text-sm">{msg.text}</div>
                      <div className={`text-xs mt-1 ${msg.sender === 'me' ? 'text-blue-100' : 'text-gray-500'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          {isConnected && (
            <div className="border-t bg-white p-4">
              <div className="flex space-x-4">
                <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyPress={handleKeyPress} placeholder="Type a message..." className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={!isConnected} />
                <button onClick={handleSendMessage} disabled={!inputMessage.trim() || !isConnected} className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-semibold">
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnonymousChat() {
  return <AnonymousChatInner />;
}