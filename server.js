const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function getMembers(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return [];
  }

  const members = [];

  if (room.hostId) {
    members.push({
      id: room.hostId,
      name: room.hostName || 'Host',
      role: 'host'
    });
  }

  for (const viewer of room.viewers.values()) {
    members.push({
      id: viewer.id,
      name: viewer.name,
      role: 'viewer'
    });
  }

  return members;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomCode, userName, role }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const name = String(userName || 'Visitante').trim() || 'Visitante';

    if (!code) {
      socket.emit('room-error', { message: 'Código da sala obrigatório.' });
      return;
    }

    if (role === 'host') {
      const room = {
        hostId: socket.id,
        hostName: name,
        viewers: new Map()
      };

      rooms.set(code, room);
      socket.join(code);
      socket.emit('room-joined', {
        roomCode: code,
        role: 'host',
        members: getMembers(code)
      });
      io.to(code).emit('room-state', {
        roomCode: code,
        members: getMembers(code),
        hostName: name
      });
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      socket.emit('room-error', { message: 'Sala não encontrada. Verifique o código.' });
      return;
    }

    socket.join(code);
    room.viewers.set(socket.id, { id: socket.id, name });
    socket.emit('room-joined', {
      roomCode: code,
      role: 'viewer',
      hostId: room.hostId,
      members: getMembers(code)
    });

    io.to(code).emit('room-state', {
      roomCode: code,
      members: getMembers(code),
      hostName: room.hostName
    });
  });

  socket.on('leave-room', ({ roomCode }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      return;
    }

    const isHost = room.hostId === socket.id;
    socket.leave(code);

    if (isHost) {
      rooms.delete(code);
      io.to(code).emit('room-closed', { roomCode: code });
      io.in(code).socketsLeave(code);
      return;
    }

    room.viewers.delete(socket.id);
    io.to(code).emit('room-state', {
      roomCode: code,
      members: getMembers(code),
      hostName: room.hostName
    });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      const isHost = room.hostId === socket.id;

      if (isHost) {
        rooms.delete(code);
        io.to(code).emit('room-closed', { roomCode: code });
        io.in(code).socketsLeave(code);
        continue;
      }

      if (room.viewers.has(socket.id)) {
        room.viewers.delete(socket.id);
        io.to(code).emit('room-state', {
          roomCode: code,
          members: getMembers(code),
          hostName: room.hostName
        });
      }
    }
  });

  socket.on('offer', ({ roomCode, offer, receiverId }) => {
    io.to(receiverId).emit('offer', {
      roomCode,
      offer,
      senderId: socket.id
    });
  });

  socket.on('answer', ({ roomCode, answer, receiverId }) => {
    io.to(receiverId).emit('answer', {
      roomCode,
      answer,
      senderId: socket.id
    });
  });

  socket.on('ice-candidate', ({ roomCode, candidate, receiverId }) => {
    io.to(receiverId).emit('ice-candidate', {
      roomCode,
      candidate,
      senderId: socket.id
    });
  });

  socket.on('host-screen-state', ({ roomCode, isLive }) => {
    socket.to(roomCode).emit('host-screen-state', {
      roomCode,
      isLive
    });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
