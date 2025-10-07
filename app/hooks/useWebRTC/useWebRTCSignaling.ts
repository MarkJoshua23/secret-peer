import { useCallback } from 'react';
import { SignalingCallbacks } from './types';

export interface UseWebRTCSignalingReturn {
  handleSignalingMessage: (message: any) => void;
  sendJoin: (publish: (name: string, data: any) => void, peerId: string, roomId?: string) => void;
  sendLeave: (publish: (name: string, data: any) => void, peerId: string, roomId?: string) => void;
  sendSignal: (publish: (name: string, data: any) => void, fromPeerId: string, data: any, targetPeerId?: string) => void;
}

export const useWebRTCSignaling = (callbacks: SignalingCallbacks): UseWebRTCSignalingReturn => {
  const { onJoin, onLeave, onSignal, onError } = callbacks;

  const handleSignalingMessage = useCallback((message: any): void => {
    if (!message || typeof message !== 'object' || !message.type) {
      console.error('Invalid signaling message received:', message);
      onError('Invalid signaling message received');
      return;
    }

    const { type, data, peerId, targetPeerId, roomId } = message;

    console.log(`📨 Signaling: ${type} from ${peerId || 'unknown'}`);

    switch (type) {
      case 'join':
        if (peerId) {
          onJoin(peerId);
        }
        break;

      case 'signal':
        if (peerId && data) {
          onSignal(peerId, data, targetPeerId);
        }
        break;

      case 'leave':
        if (peerId) {
          onLeave(peerId);
        }
        break;

      default:
        console.warn('Unknown signaling message type:', type);
        onError(`Unknown signaling message type: ${type}`);
    }
  }, [onJoin, onLeave, onSignal, onError]);

  const sendJoin = useCallback((publish: (name: string, data: any) => void, peerId: string, roomId?: string): void => {
    console.log(`🚪 Sending join message as ${peerId} in room ${roomId || 'default'}`);
    publish('webrtc-signaling', {
      type: 'join',
      peerId,
      roomId
    });
  }, []);

  const sendLeave = useCallback((publish: (name: string, data: any) => void, peerId: string, roomId?: string): void => {
    console.log(`👋 Sending leave message as ${peerId}`);
    publish('webrtc-signaling', {
      type: 'leave',
      peerId,
      roomId
    });
  }, []);

  const sendSignal = useCallback((publish: (name: string, data: any) => void, fromPeerId: string, data: any, targetPeerId?: string): void => {
    console.log(`📤 Sending signal to ${targetPeerId || 'all'}:`, data.type);
    publish('webrtc-signaling', {
      type: 'signal',
      data,
      peerId: fromPeerId,
      targetPeerId
    });
  }, []);

  return {
    handleSignalingMessage,
    sendJoin,
    sendLeave,
    sendSignal,
  };
};