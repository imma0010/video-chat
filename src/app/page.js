'use client';

import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const VideoChat = ({ appointmentId, token }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const peerConnectionRef = useRef(null);  // Store the peer connection in a ref
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const connectionStarted = useRef(false);  // Ensure the connection is started only once

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL);  // Connect to the signaling server

    // Join the appointment room with token
    socket.emit('joinAppointment', { token, appointmentId });

    // First peer to connect becomes the caller
    socket.on('caller', () => {
      if (!connectionStarted.current) {
        console.log('Connected as caller');
        startWebRTCConnection(socket, true);  // Start WebRTC as the caller
        connectionStarted.current = true;
      }
    });

    // Second peer to connect becomes the answerer
    socket.on('answerer', () => {
      if (!connectionStarted.current) {
        console.log('Connected as answerer');
        startWebRTCConnection(socket, false);  // Start WebRTC as the answerer
        connectionStarted.current = true;
      }
    });

    socket.on('error', (data) => {
      console.error(data);
    });

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();  // Close WebRTC connection on unmount
      }
      socket.disconnect();  // Disconnect socket on unmount
    };
  }, [appointmentId, token]);

  const startWebRTCConnection = (socket, isCaller) => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
    };

    const peerConnection = new RTCPeerConnection(config);
    peerConnectionRef.current = peerConnection;  // Save peerConnection to ref

    // Get local media stream
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;  // Display local video
      }

      stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    }).catch((error) => {
      console.error('Error accessing media devices:', error);
    });

    // If this peer is the caller, create and send an offer
    if (isCaller) {
      peerConnection.createOffer().then((offer) => {
        console.log('Sending offer:', offer);
        return peerConnection.setLocalDescription(offer);
      }).then(() => {
        socket.emit('offer', peerConnection.localDescription);  // Send the offer to the other peer
      }).catch((error) => {
        console.error('Error creating offer:', error);
      });
    }

    // Handle incoming offer (for the answerer)
    socket.on('offer', (offer) => {
      console.log('Received offer:', offer);  // Log the received offer
      peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        return peerConnection.createAnswer();  // Create an answer in response to the offer
      }).then((answer) => {
        console.log('Sending answer:', answer);  // Log the answer
        return peerConnection.setLocalDescription(answer);
      }).then(() => {
        socket.emit('answer', peerConnection.localDescription);  // Send the answer back to the caller
      }).catch((error) => {
        console.error('Error handling offer/answer exchange:', error);
      });
    });

    // Handle incoming answer (for the caller)
    socket.on('answer', (answer) => {
      console.log('Received answer:', answer);  // Log the received answer
      peerConnection.setRemoteDescription(new RTCSessionDescription(answer)).catch((error) => {
        console.error('Error setting remote description:', error);
      });
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate:', event.candidate);
        socket.emit('iceCandidate', event.candidate);  // Send ICE candidates to the other peer
      }
    };

    socket.on('iceCandidate', (candidate) => {
      console.log('Received ICE candidate:', candidate);
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
        console.error('Error adding received ICE candidate:', error);
      });
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];  // Display remote video
      }
    };
  };

  return (
    <div>
      <video ref={localVideoRef} autoPlay muted playsInline />
      <video ref={remoteVideoRef} autoPlay playsInline />
    </div>
  );
};

export default VideoChat;
