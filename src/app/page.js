"use client";
import { useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://video-chat-backend-2mw2.onrender.com');

const App = () => {
  const myVideo = useRef(null);
  const remoteVideo = useRef(null);
  const roomId = 'my-room';
  const iceCandidateQueue = useRef([]);
  const myPeerConnection = useRef(null);

  useEffect(() => {
    const supportsWebRTC = () => {
      return !!(
        window.RTCPeerConnection &&
        window.navigator.mediaDevices &&
        window.MediaStream
      );
    };

    if (!supportsWebRTC()) {
      console.error('WebRTC is not supported in this browser');
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      myVideo.current.srcObject = currentStream;

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              'stun:bn-turn2.xirsys.com',
              'turn:bn-turn2.xirsys.com:80?transport=udp',
              'turn:bn-turn2.xirsys.com:3478?transport=udp',
              'turn:bn-turn2.xirsys.com:80?transport=tcp',
              'turn:bn-turn2.xirsys.com:3478?transport=tcp',
              'turns:bn-turn2.xirsys.com:443?transport=tcp',
              'turns:bn-turn2.xirsys.com:5349?transport=tcp'
            ],
            username: 'VKflMZ9VGzaGKJx40fds8nBUmPIO18HUWk3wpIQEp9QLr7Q2NY9oGmDa2L1myiAjAAAAAGcH_dViYWJlbA==',
            credential: 'fd2612b6-8722-11ef-af47-0242ac140004'
          }
        ]
      });
      myPeerConnection.current = peerConnection;

      // Add local stream tracks to peer connection
      currentStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, currentStream);
      });

      // Handle incoming remote track
      peerConnection.ontrack = (event) => {
        console.log('ontrack event received:', event);
        const [remoteStream] = event.streams;
        if (remoteStream) {
          remoteVideo.current.srcObject = remoteStream;
        }
      };

      // Fallback for onaddstream (for older browsers)
      peerConnection.onaddstream = (event) => {
        console.log('onaddstream event received:', event);
        remoteVideo.current.srcObject = event.stream;
      };

      // ICE candidate handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate:', event.candidate);
          socket.emit('ice-candidate', roomId, event.candidate);
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state changed to:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
          console.error('ICE connection failed.');
        }
      };

      // Handle incoming ICE candidates
      socket.on('ice-candidate', (candidate) => {
        console.log('Received ICE candidate:', candidate);
        if (myPeerConnection.current.remoteDescription) {
          myPeerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
            console.error('Error adding received ICE candidate:', error);
          });
        } else {
          console.log('Remote description not set yet, queueing ICE candidate.');
          iceCandidateQueue.current.push(candidate);
        }
      });

      // When a user connects, send an offer
      socket.on('user-connected', () => {
        console.log('User connected, creating offer...');
        createOffer();
      });

      // Handle receiving an offer
      socket.on('offer', (offer) => {
        console.log('Received offer:', offer);
        myPeerConnection.current
          .setRemoteDescription(new RTCSessionDescription(offer))
          .then(() => {
            // Process queued ICE candidates
            iceCandidateQueue.current.forEach((candidate) => {
              myPeerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
                console.error('Error adding queued ICE candidate:', error);
              });
            });
            iceCandidateQueue.current = [];
            createAnswer();
          })
          .catch((error) => console.error('Error setting remote description:', error));
      });

      // Handle receiving an answer
      socket.on('answer', (answer) => {
        console.log('Received answer:', answer);
        myPeerConnection.current
          .setRemoteDescription(new RTCSessionDescription(answer))
          .then(() => {
            // Process queued ICE candidates
            iceCandidateQueue.current.forEach((candidate) => {
              myPeerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
                console.error('Error adding queued ICE candidate:', error);
              });
            });
            iceCandidateQueue.current = [];
          })
          .catch((error) => {
            console.error('Error setting remote description:', error);
          });
      });

      // Join room
      socket.emit('join-room', roomId, socket.id);
      console.log(`Joined room ${roomId} with ID ${socket.id}`);

      return () => {
        socket.off('ice-candidate');
        socket.off('user-connected');
        socket.off('offer');
        socket.off('answer');
      };
    });

    // Create and send SDP offer
    const createOffer = () => {
      console.log('Creating offer...');
      myPeerConnection.current
        .createOffer()
        .then((offer) => myPeerConnection.current.setLocalDescription(offer))
        .then(() => {
          console.log('Offer set as local description:', myPeerConnection.current.localDescription);
          socket.emit('offer', roomId, myPeerConnection.current.localDescription);
        })
        .catch((error) => console.error('Error creating offer:', error));
    };

    // Create and send SDP answer
    const createAnswer = () => {
      console.log('Creating answer...');
      myPeerConnection.current
        .createAnswer()
        .then((answer) => myPeerConnection.current.setLocalDescription(answer))
        .then(() => {
          console.log('Answer set as local description:', myPeerConnection.current.localDescription);
          socket.emit('answer', roomId, myPeerConnection.current.localDescription);
        })
        .catch((error) => console.error('Error creating answer:', error));
    };
  }, []);

  return (
    <div>
      <h2>Video Call Application</h2>
      <div>
        <video ref={myVideo} autoPlay playsInline muted style={{ width: '45%' }}></video>
        <video ref={remoteVideo} autoPlay playsInline style={{ width: '45%' }}></video>
      </div>
    </div>
  );
};

export default App;
