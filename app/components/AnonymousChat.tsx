'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAbly } from 'ably/react';
import { useWebRTC } from '../hooks/useWebRTC';

const FontImport = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap');
    body {
      font-family: 'Inter', sans-serif;
    }
  `}</style>
);

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them' | 'system';
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
      if (status === 'disconnected' || (status === 'connecting' && isStarted)) {
        addSystemMessage('User disconnected. Finding new partner...');
      } else if (status === 'connected') {
        setMessages([]); // Clear messages for the new chat
        addSystemMessage('Anonymous connection established. Say hello.');
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
    const newMessage: Message = { id: `system-${Date.now()}`, text, sender: 'system', timestamp: new Date() };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const handleStartChat = useCallback(async () => {
    setMessages([]);
    addSystemMessage('Searching for a stranger...');
    await start();
  }, [start, addSystemMessage]);

  const handleEndChat = useCallback(() => {
    addSystemMessage('Chat ended. Find someone new.');
    endChat();
  }, [endChat, addSystemMessage]);

  const handleSwitchPeer = useCallback(() => {
    addSystemMessage('Switching partners...');
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
    if (!isStarted) return 'Offline';
    switch (connectionStatus) {
      case 'idle': return 'Offline';
      case 'connecting': return 'Searching...';
      case 'connected': return `Connected`;
      case 'disconnected': return 'Searching...';
      case 'rejected': return 'Connection Rejected';
      default: return 'Unknown';
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-300 font-sans">
      <FontImport />
      <div className="flex flex-col flex-grow w-full max-w-lg mx-auto md:py-8">
        {/* Main Chat Container with Depth Effect */}
        <div className="flex flex-col flex-grow bg-zinc-900/70 md:rounded-2xl shadow-['inset_0_1px_0_#ffffff1a,0_8px_32px_#00000080'] backdrop-blur-xl overflow-hidden">

          {/* Header */}
          <header className="flex-shrink-0 p-4 border-b border-white/10 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold tracking-wider text-zinc-200">SECRET-PEER</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                <p className="text-sm font-mono text-zinc-400">{getStatusMessage()}</p>
              </div>
            </div>
            {isStarted && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSwitchPeer} 
                  disabled={!isConnected} 
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium transition-all hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-['inset_0_1px_0_#ffffff1a,0_1px_3px_#00000080']"
                >
                  Switch
                </button>
                <button 
                  onClick={handleEndChat} 
                  className="px-4 py-2 bg-rose-900/80 text-rose-200 rounded-lg text-sm font-medium transition-all hover:bg-rose-800/80 shadow-['inset_0_1px_0_#ffffff1a,0_1px_3px_#00000080']"
                >
                  End Chat
                </button>
              </div>
            )}
          </header>

          {/* Messages Area */}
          <div className="flex-grow p-4 overflow-y-auto">
            {!isStarted ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-center">
                <div className="text-6xl mb-4 opacity-50">🤫</div>
                <h2 className="text-xl font-medium text-zinc-400">Enter the shadows.</h2>
                <p className="mb-6">Click below to find a stranger.</p>
                <button 
                  onClick={handleStartChat} 
                  disabled={!ablyClient} 
                  className="px-8 py-3 bg-purple-800 text-purple-100 rounded-xl font-bold tracking-wide transition-all hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-['inset_0_1px_1px_#ffffff20,0_4px_8px_#000000a0']"
                >
                  START CHAT
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.sender === 'system' ? (
                      <div className="text-center text-xs text-zinc-500 font-mono py-2">{msg.text}</div>
                    ) : (
                      <div className={`flex items-end gap-2 ${msg.sender === 'me' ? 'flex-row-reverse' : ''}`}>
                        <div className={`max-w-[80%] px-4 py-2 rounded-2xl shadow-['inset_0_1px_0_#ffffff1a,0_1px_2px_#00000050'] ${
                          msg.sender === 'me' 
                            ? 'bg-purple-800/90 text-purple-100 rounded-br-none' 
                            : 'bg-zinc-800/80 text-zinc-300 rounded-bl-none'
                        }`}>
                          <p className="text-sm break-words">{msg.text}</p>
                        </div>
                        <p className="text-xs text-zinc-500 font-mono flex-shrink-0">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          {isStarted && (
            <div className="flex-shrink-0 p-4 border-t border-white/10 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={inputMessage} 
                  onChange={(e) => setInputMessage(e.target.value)} 
                  onKeyPress={handleKeyPress} 
                  placeholder={isConnected ? "Message..." : "Connecting..."}
                  className="flex-1 px-4 py-3 bg-zinc-800/50 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 placeholder-zinc-500 text-zinc-200 transition-all shadow-['inset_0_2px_4px_#00000080']"
                  disabled={!isConnected} 
                />
                <button 
                  onClick={handleSendMessage} 
                  disabled={!inputMessage.trim() || !isConnected} 
                  className="px-5 py-3 bg-purple-800 text-purple-100 rounded-lg font-medium transition-all hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-['inset_0_1px_1px_#ffffff20,0_2px_4px_#000000a0']"
                >
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