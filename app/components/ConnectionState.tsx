'use client';
import { useAbly, useConnectionStateListener } from 'ably/react';
import { useState } from 'react';

export function ConnectionState() {
  const ably = useAbly();
  const [connectionState, setConnectionState] = useState(ably.connection.state);

  useConnectionStateListener((stateChange) => {
    setConnectionState(stateChange.current);
  });

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-gray-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-3 h-3 rounded-full ${getStatusColor(connectionState)}`}></div>
      <span className="text-sm font-medium capitalize">{connectionState}</span>
    </div>
  );
}