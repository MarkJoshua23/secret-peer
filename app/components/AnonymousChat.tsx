'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAbly } from 'ably/react';
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
      case 'connected': return 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50';
      case 'connecting': return 'bg-amber-900/30 text-amber-400 border-amber-800/50';
      case 'rejected':
      case 'disconnected': return 'bg-rose-900/30 text-rose-400 border-rose-800/50';
      default: return 'bg-slate-800/30 text-slate-400 border-slate-700/50';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-4 md:p-8 text-slate-200">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-wider mb-2 bg-clip-text text-transparent bg-gradient-to-r from-slate-300 to-slate-500">
            SECRET-PEER
          </h1>
          <p className="text-slate-500 text-sm">Private peer-to-peer conversations with strangers</p>
        </div>
        <div className="bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl">
          <div className="border-b border-slate-700/50 px-6 py-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full text-sm font-mono border ${getStatusColor()}`}>
                  {getStatusMessage()}
                </div>
                {isConnected && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>}
              </div>
              <div className="flex items-center space-x-2">
                {!isStarted ? (
                  <button 
                    onClick={handleStartChat} 
                    disabled={!ablyClient} 
                    className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-200 px-5 py-2 rounded-lg font-medium transition-all duration-200"
                  >
                    START NEW CHAT
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={handleSwitchPeer} 
                      disabled={!isConnected} 
                      className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-200 px-5 py-2 rounded-lg font-medium transition-all duration-200"
                    >
                      SWITCH
                    </button>
                    <button 
                      onClick={handleEndChat} 
                      className="bg-rose-900/50 hover:bg-rose-800/50 text-rose-300 px-5 py-2 rounded-lg font-medium transition-all duration-200"
                    >
                      END CHAT
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="h-96 overflow-y-auto p-6 bg-slate-900/30">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-600">
                <div className="text-center">
                  <div className="text-5xl mb-4 opacity-30">👁️</div>
                  <p className="text-lg font-mono">Initiate a connection...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-xs md:max-w-md px-4 py-3 rounded-xl font-mono text-sm ${
                        msg.sender === 'me' 
                          ? 'bg-slate-700 text-slate-100 rounded-br-none' 
                          : 'bg-slate-800/70 text-slate-300 rounded-bl-none'
                      }`}
                    >
                      <div>{msg.text}</div>
                      <div className={`text-xs mt-1 opacity-70 font-mono ${
                        msg.sender === 'me' ? 'text-slate-400' : 'text-slate-500'
                      }`}>
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
            <div className="border-t border-slate-700/50 bg-slate-900/20 p-4">
              <div className="flex space-x-3">
                <input 
                  type="text" 
                  value={inputMessage} 
                  onChange={(e) => setInputMessage(e.target.value)} 
                  onKeyPress={handleKeyPress} 
                  placeholder="Enter message..." 
                  className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-500 placeholder-slate-500 text-slate-200 font-mono"
                  disabled={!isConnected} 
                />
                <button 
                  onClick={handleSendMessage} 
                  disabled={!inputMessage.trim() || !isConnected} 
                  className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-200 px-5 py-3 rounded-lg font-medium transition-all duration-200"
                >
                  SEND
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