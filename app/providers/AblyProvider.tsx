'use client';
import { AblyProvider } from 'ably/react';
import { ReactNode, useEffect, useState } from 'react';
import * as Ably from 'ably';

interface AblyProviderProps {
  children: ReactNode;
}

export default function CustomAblyProvider({ children }: AblyProviderProps) {
  const [client, setClient] = useState<Ably.Realtime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initAbly = async () => {
      try {
        console.log('Fetching Ably token request...');
        const response = await fetch('/api/ably-token');
        
        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`);
        }
        
        const tokenRequest = await response.json();
        console.log('Token request received:', tokenRequest);
        
        console.log('Initializing Ably client with authCallback...');
        
        // Use authCallback to provide the token request
        const client = new Ably.Realtime({
          authCallback: async (data, callback) => {
            // Return the token request object directly
            callback(null, tokenRequest);
          },
          clientId: tokenRequest.clientId
        });
        
        // Wait for connection to be established
        await new Promise((resolve, reject) => {
          client.connection.once('connected', () => {
            console.log('Ably connected successfully!');
            resolve(true);
          });
          
          client.connection.once('failed', (error) => {
            reject(new Error(`Connection failed: ${error}`));
          });
          
          // Timeout after 10 seconds
          setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });
        
        setClient(client);
        
      } catch (error) {
        console.error('Failed to initialize Ably:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    initAbly();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-bold mb-2">Ably Connection Error</h2>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing Secret-Peer...</p>
        </div>
      </div>
    );
  }

  return (
    <AblyProvider client={client}>
      {children}
    </AblyProvider>
  );
}