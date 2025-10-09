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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopSearch = useCallback(async () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (lobbyChannelRef.current) {
      console.log('🛑 Leaving matchmaking lobby and unsubscribing...');
      lobbyChannelRef.current.unsubscribe();
      await lobbyChannelRef.current.presence.leave();
      lobbyChannelRef.current = null;
    }
    setIsSearching(false);
  }, []);

  const startSearch = useCallback(async (
    ablyClient: Ably.Realtime,
    myPeerId: string
  ) => {
    await stopSearch();
    
    setIsSearching(true);
    myPeerIdRef.current = myPeerId;
    matchedRef.current = false; 

    try {
      const lobbyChannel = ablyClient.channels.get('anonymous-chat-lobby');
      lobbyChannelRef.current = lobbyChannel;

      console.log('🔍 Joining matchmaking lobby...');

      lobbyChannel.subscribe('match-made', (message) => {
        if (matchedRef.current) return;
        const { initiatorPeerId, targetPeerId, pairRoomId } = message.data;
        if (targetPeerId === myPeerId) {
          console.log(`✅ Match announcement received from ${initiatorPeerId}.`);
          matchedRef.current = true;
          onMatchFound(initiatorPeerId, pairRoomId, false);
          stopSearch();
        }
      });
      
      const attemptMatch = async () => {
        if (matchedRef.current) return;
        
        const presenceMembers = await lobbyChannel.presence.get();
        const availablePeers = presenceMembers.filter(
          (member) => member.clientId !== myPeerId
        );

        console.log(`[${myPeerId}] attempting match, found ${availablePeers.length} peer(s).`);

        if (availablePeers.length > 0) {
          const partner = availablePeers[0];

          if (myPeerId < partner.clientId) {
            console.log(`🔗 [${myPeerId}] Rule PASSED. I will initiate match with ${partner.clientId}.`);
            matchedRef.current = true;

            const pairRoomId = `pair-${myPeerId}-${partner.clientId}`;
            
            lobbyChannel.publish('match-made', {
              initiatorPeerId: myPeerId,
              targetPeerId: partner.clientId,
              pairRoomId
            });

            onMatchFound(partner.clientId, pairRoomId, true);
            stopSearch();
          } else {
             console.log(`[${myPeerId}] Rule FAILED. I will wait for ${partner.clientId} to initiate.`);
          }
        }
      };

      lobbyChannel.presence.subscribe('enter', (presenceMessage) => {
        if (matchedRef.current || presenceMessage.clientId === myPeerId) return;
        console.log(`👤 New peer ${presenceMessage.clientId} entered lobby. Re-evaluating match...`);
        setTimeout(() => attemptMatch(), 500); 
      });

      await lobbyChannel.presence.enter();
      console.log('👤 Entered lobby presence. Looking for an existing user.');
      
      setTimeout(() => attemptMatch(), 500);

      searchTimeoutRef.current = setTimeout(() => {
        if (!isSearching || matchedRef.current) return;
        console.log('⏳ Matchmaking timed out. No suitable peer found.');
        onError("Could not find anyone to chat with.");
        stopSearch();
      }, 30000);

    } catch (error) {
      console.error('❌ Matchmaking error:', error);
      onError(error instanceof Error ? error.message : 'Matchmaking failed');
      stopSearch();
    }
  }, [onMatchFound, onError, stopSearch]);

  return {
    isSearching,
    startSearch,
    stopSearch
  };
};