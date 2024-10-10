"use client";
import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
import 'webrtc-adapter';

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

    // Wait for socket connection
    socket.on('connect', () => {
      console.log(`Connected to socket server with ID ${socket.id}`);

      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
        myVideo.current.srcObject = currentStream;

        const peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Use public STUN server for testing
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
          if (remoteStream && remoteStream.getTracks().length > 0) {
            remoteVideo.current.srcObject = remoteStream;
          } else {
            console.error('Received remote stream has no tracks');
          }
        };

        // ICE candidate handling
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('Sending ICE candidate:', event.candidate);
            socket.emit('ice-candidate', roomId, event.candidate, socket.id);
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
        socket.on('ice-candidate', (candidate, senderId) => {
          if (senderId !== socket.id) {
            console.log('Received ICE candidate:', candidate);
            if (myPeerConnection.current.remoteDescription) {
              myPeerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
                console.error('Error adding received ICE candidate:', error);
              });
            } else {
              console.log('Remote description not set yet, queueing ICE candidate.');
              iceCandidateQueue.current.push(candidate);
            }
          }
        });

        // When a user connects, send an offer
        socket.on('user-connected', (userId) => {
          if (userId !== socket.id) {
            console.log('User connected:', userId);
            createOffer();
          }
        });

        // Handle receiving an offer
        socket.on('offer', (offer, senderId) => {
          if (senderId !== socket.id) {
            console.log('Received offer from:', senderId);
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
          }
        });

        // Handle receiving an answer
        socket.on('answer', (answer, senderId) => {
          if (senderId !== socket.id) {
            console.log('Received answer from:', senderId);
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
          }
        });

        // Join room after connection
        socket.emit('join-room', roomId, socket.id);
        console.log(`Joined room ${roomId} with ID ${socket.id}`);

        return () => {
          socket.off('ice-candidate');
          socket.off('user-connected');
          socket.off('offer');
          socket.off('answer');
        };
      }).catch((error) => {
        console.error('Error accessing media devices:', error);
      });
    });

    // Create and send SDP offer
    const createOffer = async () => {
      try {
        console.log('Creating offer...');
        const offer = await myPeerConnection.current.createOffer();
        await myPeerConnection.current.setLocalDescription(offer);
        console.log('Offer set as local description:', myPeerConnection.current.localDescription);
        socket.emit('offer', roomId, myPeerConnection.current.localDescription, socket.id);
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    };

    // Create and send SDP answer
    const createAnswer = async () => {
      try {
        console.log('Creating answer...');
        const answer = await myPeerConnection.current.createAnswer();
        await myPeerConnection.current.setLocalDescription(answer);
        console.log('Answer set as local description:', myPeerConnection.current.localDescription);
        socket.emit('answer', roomId, myPeerConnection.current.localDescription, socket.id);
      } catch (error) {
        console.error('Error creating answer:', error);
      }
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
