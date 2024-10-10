"use client";
import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://video-chat-backend-2mw2.onrender.com');

const App = () => {
  const [stream, setStream] = useState();
  const [myPeerConnection, setMyPeerConnection] = useState();
  const [remoteStream, setRemoteStream] = useState(new MediaStream());
  const myVideo = useRef();
  const remoteVideo = useRef();
  const roomId = 'my-room'; 
  const iceCandidateQueue = useRef([]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      setStream(currentStream);
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
      setMyPeerConnection(peerConnection);

      // Add local stream tracks
      currentStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, currentStream);
      });

      // Handle incoming remote track
      peerConnection.ontrack = (event) => {
        console.log('ontrack event received:', event);
        event.streams[0].getTracks().forEach(track => {
          console.log('Adding remote track to remote stream:', track);
          remoteStream.addTrack(track);
        });
        remoteVideo.current.srcObject = remoteStream; 
      };

      // Fallback for onaddstream if ontrack doesn't work (older browsers)
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

      // ICE connection state change handler
      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state changed to:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
          console.error('ICE connection failed.');
        }
      };

      // Handling incoming ICE candidates
      socket.on('ice-candidate', (candidate) => {
        console.log('Received ICE candidate:', candidate);
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(error => {
          console.error('Error adding received ICE candidate:', error);
        });
      });

      // When a user connects, send an offer
      socket.on('user-connected', () => {
        console.log('User connected, creating offer...');
        createOffer(peerConnection);
      });

      // Handle receiving an offer
      socket.on('offer', (offer) => {
        console.log('Received offer:', offer);
        peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
          .then(() => createAnswer(peerConnection))
          .catch(error => console.error('Error setting remote description:', error));
      });

      // Handle receiving an answer
      socket.on('answer', (answer) => {
        console.log('Received answer:', answer);
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
          .catch(error => console.error('Error setting remote description:', error));
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
    const createOffer = (peerConnection) => {
      console.log('Creating offer...');
      peerConnection.createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
          console.log('Offer set as local description:', peerConnection.localDescription);
          socket.emit('offer', roomId, peerConnection.localDescription);
        })
        .catch(error => console.error('Error creating offer:', error));
    };

    // Create and send SDP answer
    const createAnswer = (peerConnection) => {
      console.log('Creating answer...');
      peerConnection.createAnswer()
        .then((answer) => peerConnection.setLocalDescription(answer))
        .then(() => {
          console.log('Answer set as local description:', peerConnection.localDescription);
          socket.emit('answer', roomId, peerConnection.localDescription);
        })
        .catch(error => console.error('Error creating answer:', error));
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
