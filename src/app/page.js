"use client";
import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// Use the correct deployed WebSocket server URL
const socket = io('https://video-chat-backend-2mw2.onrender.com');

const App = () => {
  const [stream, setStream] = useState();
  const [myPeerConnection, setMyPeerConnection] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const myVideo = useRef();
  const remoteVideo = useRef();
  const roomId = 'my-room'; // Static room ID
  const iceCandidateQueue = useRef([]); // Persist across renders

  useEffect(() => {
    // Request camera and microphone permissions
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      setStream(currentStream);
      myVideo.current.srcObject = currentStream;

      // Setup peer connection with both STUN and TURN servers for NAT traversal
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }, // Google's free STUN server
          // {
          //   urls: 'turn:your-turn-server.com', // TURN server for relay when P2P fails
          //   username: 'your-username',
          //   credential: 'your-credential'
          // }
        ]
      });
      setMyPeerConnection(peerConnection);

      // Add local media stream tracks to peer connection
      currentStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, currentStream);
      });

      // Handle incoming remote stream
      peerConnection.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        remoteVideo.current.srcObject = event.streams[0];
      };

      // Handle ICE candidate gathering and exchange
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', roomId, event.candidate);
        }
      };

      // Receive ICE candidates and add them
      socket.on('ice-candidate', (candidate) => {
        if (peerConnection.remoteDescription) {
          peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => console.error('Error adding ICE candidate:', error));
        } else {
          iceCandidateQueue.current.push(candidate); // Queue the ICE candidate if remote description is not set
        }
      });

      // User connected event triggers an offer
      socket.on('user-connected', () => {
        if (peerConnection.signalingState === 'stable') {
          createOffer(peerConnection);
        }
      });

      // Handle incoming offer
      socket.on('offer', (offer) => {
        if (peerConnection.signalingState === 'stable') {
          peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => {
              createAnswer(peerConnection);
              processQueuedIceCandidates(peerConnection); // Process any queued ICE candidates
            })
            .catch(error => console.error('Error setting remote description:', error));
        }
      });

      // Handle incoming answer
      socket.on('answer', (answer) => {
        if (peerConnection.signalingState === 'have-local-offer') {
          peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => {
              processQueuedIceCandidates(peerConnection); // Process any queued ICE candidates
            })
            .catch(error => console.error('Error setting remote description:', error));
        }
      });

      // Join the room
      socket.emit('join-room', roomId, socket.id);

      return () => {
        // Clean up event listeners on unmount
        socket.off('ice-candidate');
        socket.off('user-connected');
        socket.off('offer');
        socket.off('answer');
      };
    });

    // Create an SDP offer and send it
    const createOffer = (peerConnection) => {
      peerConnection.createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
          socket.emit('offer', roomId, peerConnection.localDescription);
        })
        .catch(error => console.error('Error creating offer:', error));
    };

    // Create an SDP answer and send it
    const createAnswer = (peerConnection) => {
      peerConnection.createAnswer()
        .then((answer) => peerConnection.setLocalDescription(answer))
        .then(() => {
          socket.emit('answer', roomId, peerConnection.localDescription);
        })
        .catch(error => console.error('Error creating answer:', error));
    };

    // Process ICE candidates queued while waiting for SDP exchange to complete
    const processQueuedIceCandidates = (peerConnection) => {
      while (iceCandidateQueue.current.length > 0) {
        const candidate = iceCandidateQueue.current.shift();
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(error => console.error('Error adding ICE candidate:', error));
      }
    };
  }, []);

  return (
    <div>
      <h2>Video Call Application</h2>
      <div>
        <video ref={myVideo} autoPlay playsInline muted></video>
        <video ref={remoteVideo} autoPlay playsInline></video>
      </div>
    </div>
  );
};

export default App;
