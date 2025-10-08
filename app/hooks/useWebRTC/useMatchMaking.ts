
import { useCallback, useRef, useState } from 'react';
import Ably from 'ably';

interface UseMatchmakingProps {
  onMatchFound: (matchedPeerId: string, pairRoomId: string, isInitiator: boolean) => void;
  onError: (error: string) => void;
}

export const useMatchmaking = ({ onMatchFound, onError }: UseMatchmakingProps) => {
  const [isSearching, setIsSearching] = useState(false);
  const lobbyChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const myPeerIdRef = useRef<string>('');
  const matchedRef = useRef<boolean>(false);

  const startSearch = useCallback(async (
    ablyClient: Ably.Realtime,
    myPeerId: string
  ) => {
    try {
      setIsSearching(true);
      myPeerIdRef.current = myPeerId;
      matchedRef.current = false;

      const lobbyChannel = ablyClient.channels.get('anonymous-chat-lobby');
      lobbyChannelRef.current = lobbyChannel;

      console.log('🔍 Joining matchmaking lobby...');

      // Subscribe to match request messages
      lobbyChannel.subscribe('match-request', async (message) => {
        if (matchedRef.current) return; // Already matched
        
        const { fromPeerId, pairRoomId } = message.data;
        
        if (fromPeerId === myPeerId) return; // Ignore own messages

        console.log(`🎯 Received match request from ${fromPeerId}`);
        
        // Mark as matched immediately to prevent double-matching
        matchedRef.current = true;
        
        // Accept the match
        lobbyChannel.publish('match-accept', {
          fromPeerId: myPeerId,
          toPeerId: fromPeerId,
          pairRoomId
        });

        console.log(`✅ Accepted match with ${fromPeerId}`);

        // Clean up lobby
        await lobbyChannel.presence.leave();
        lobbyChannel.unsubscribe();
        
        // You're the responder (second to join)
        onMatchFound(fromPeerId, pairRoomId, false);
        setIsSearching(false);
      });

      // Subscribe to match accept messages
      lobbyChannel.subscribe('match-accept', async (message) => {
        if (matchedRef.current) return; // Already matched
        
        const { fromPeerId, toPeerId, pairRoomId } = message.data;
        
        if (toPeerId !== myPeerId) return; // Not for us

        console.log(`✅ Match accepted by ${fromPeerId}`);
        
        // Mark as matched
        matchedRef.current = true;
        
        // Clean up lobby
        await lobbyChannel.presence.leave();
        lobbyChannel.unsubscribe();
        
        // You're the initiator (first to request)
        onMatchFound(fromPeerId, pairRoomId, true);
        setIsSearching(false);
      });

      // Enter presence to indicate we're searching
      await lobbyChannel.presence.enter({ 
        status: 'searching',
        timestamp: Date.now()
      });

      console.log('👤 Entered lobby presence');

      // Get current presence members (one-time fetch, no subscription to presence events)
      const presenceMembers = await lobbyChannel.presence.get();
      
      console.log(`👥 Found ${presenceMembers.length} users in lobby`);

      // Filter for available peers (exclude ourselves)
      const availablePeers = presenceMembers.filter((member) => 
        member.clientId !== myPeerId && 
        member.data?.status === 'searching'
      );

      console.log(`✨ ${availablePeers.length} available peers for matching`);

      if (availablePeers.length > 0 && !matchedRef.current) {
        // Pick a random peer
        const randomIndex = Math.floor(Math.random() * availablePeers.length);
        const targetPeer = availablePeers[randomIndex];
        
        // Generate unique pair room ID
        const pairRoomId = `pair-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`🔗 Requesting match with ${targetPeer.clientId} in room ${pairRoomId}`);
        
        // Send match request
        lobbyChannel.publish('match-request', {
          fromPeerId: myPeerId,
          pairRoomId
        });

        // Stay in presence until match is accepted
      } else {
        console.log('⏳ No peers available, waiting for someone to join...');
      }

    } catch (error) {
      console.error('❌ Matchmaking error:', error);
      onError(error instanceof Error ? error.message : 'Matchmaking failed');
      setIsSearching(false);
    }
  }, [onMatchFound, onError]);

  const stopSearch = useCallback(async () => {
    try {
      if (lobbyChannelRef.current) {
        console.log('🛑 Leaving matchmaking lobby');
        await lobbyChannelRef.current.presence.leave();
        lobbyChannelRef.current.unsubscribe();
        lobbyChannelRef.current = null;
      }
      matchedRef.current = false;
      setIsSearching(false);
    } catch (error) {
      console.error('Error stopping search:', error);
    }
  }, []);

  return {
    isSearching,
    startSearch,
    stopSearch
  };
};