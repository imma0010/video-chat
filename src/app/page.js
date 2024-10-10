import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://video-chat-backend-2mw2.onrender.com');

const App = () => {
  const [stream, setStream] = useState();
  const [myPeerConnection, setMyPeerConnection] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const myVideo = useRef();
  const remoteVideo = useRef();
  const roomId = 'my-room'; // Static room ID
  const iceCandidateQueue = useRef([]); // Use useRef to persist across renders

  useEffect(() => {
    // Ask user for permission to access their webcam and microphone
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      setStream(currentStream);
      myVideo.current.srcObject = currentStream;

      const peerConnection = new RTCPeerConnection();
      setMyPeerConnection(peerConnection);

      currentStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, currentStream);
      });

      peerConnection.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        remoteVideo.current.srcObject = event.streams[0];
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', roomId, event.candidate);
        }
      };

      socket.on('ice-candidate', (candidate) => {
        if (peerConnection.remoteDescription) {
          peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => console.error('Error adding ICE candidate:', error));
        } else {
          iceCandidateQueue.current.push(candidate); // Queue the ICE candidate if remote description is not set
        }
      });

      socket.on('user-connected', () => {
        if (peerConnection.signalingState === 'stable') {
          createOffer(peerConnection);
        }
      });

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

      socket.on('answer', (answer) => {
        if (peerConnection.signalingState === 'have-local-offer') {
          peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => {
              processQueuedIceCandidates(peerConnection); // Process any queued ICE candidates
            })
            .catch(error => console.error('Error setting remote description:', error));
        }
      });

      socket.emit('join-room', roomId, socket.id);

      return () => {
        // Cleanup on component unmount
        socket.off('ice-candidate');
        socket.off('user-connected');
        socket.off('offer');
        socket.off('answer');
      };
    });

    const createOffer = (peerConnection) => {
      peerConnection.createOffer()
        .then((offer) => {
          return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
          socket.emit('offer', roomId, peerConnection.localDescription);
        })
        .catch(error => console.error('Error creating offer:', error));
    };

    const createAnswer = (peerConnection) => {
      peerConnection.createAnswer()
        .then((answer) => {
          return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
          socket.emit('answer', roomId, peerConnection.localDescription);
        })
        .catch(error => console.error('Error creating answer:', error));
    };

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
