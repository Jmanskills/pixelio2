// Game constants
const ARENA_SIZE = 40;
const PLAYER_SPEED = 0.15;
const PLAYER_MAX_HP = 100;

const SPELLS = {
  fireball:  { damage: 35, speed: 0.25, cooldown: 2000, color: 0xff4400, radius: 0.4, name: 'Fireball' },
  iceshard:  { damage: 15, speed: 0.55, cooldown: 800,  color: 0x88ddff, radius: 0.2, name: 'Ice Shard' },
  thunder:   { damage: 25, speed: 0.40, cooldown: 1400, color: 0xffee00, radius: 0.3, name: 'Thunderbolt', stun: 800 },
  shield:    { damage: 0,  speed: 0,    cooldown: 8000, color: 0x00ff88, radius: 0,   name: 'Arcane Shield', duration: 3000 }
};

// Waiting queue and active rooms
let waitingPlayer = null;
const rooms = {}; // roomId -> room state

function createRoom(socket1, socket2) {
  const roomId = `room_${Date.now()}`;

  const state = {
    roomId,
    players: {
      [socket1.id]: createPlayerState(socket1.id, socket1.username, -8, 0),
      [socket2.id]: createPlayerState(socket2.id, socket2.username,  8, 0)
    },
    projectiles: [],
    tick: 0,
    started: true,
    winner: null
  };

  rooms[roomId] = state;
  socket1.roomId = roomId;
  socket2.roomId = roomId;
  socket1.join(roomId);
  socket2.join(roomId);

  return state;
}

function createPlayerState(id, username, x, z) {
  return {
    id, username,
    x, y: 0, z,
    rotY: 0,
    hp: PLAYER_MAX_HP,
    shielded: false,
    stunned: false,
    spellCooldowns: { fireball: 0, iceshard: 0, thunder: 0, shield: 0 },
    alive: true
  };
}

function getOpponentId(room, playerId) {
  return Object.keys(room.players).find(id => id !== playerId);
}

function handleMove(room, playerId, input) {
  const p = room.players[playerId];
  if (!p || !p.alive || p.stunned) return;

  const { dx, dz, rotY } = input;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) {
    const nx = dx / len;
    const nz = dz / len;
    p.x = Math.max(-ARENA_SIZE / 2, Math.min(ARENA_SIZE / 2, p.x + nx * PLAYER_SPEED));
    p.z = Math.max(-ARENA_SIZE / 2, Math.min(ARENA_SIZE / 2, p.z + nz * PLAYER_SPEED));
  }
  p.rotY = rotY;
}

function handleCastSpell(room, playerId, spellKey, io) {
  const p = room.players[playerId];
  if (!p || !p.alive || p.stunned) return;

  const spell = SPELLS[spellKey];
  if (!spell) return;

  const now = Date.now();
  if ((p.spellCooldowns[spellKey] || 0) > now) return;
  p.spellCooldowns[spellKey] = now + spell.cooldown;

  if (spellKey === 'shield') {
    p.shielded = true;
    io.to(room.roomId).emit('shieldActivated', { playerId });
    setTimeout(() => {
      p.shielded = false;
      io.to(room.roomId).emit('shieldExpired', { playerId });
    }, spell.duration);
    return;
  }

  // Direction from player's rotation
  const dirX = -Math.sin(p.rotY);
  const dirZ = -Math.cos(p.rotY);

  const projectile = {
    id: `proj_${Date.now()}_${Math.random()}`,
    ownerId: playerId,
    spellKey,
    x: p.x + dirX * 1.2,
    y: 1.0,
    z: p.z + dirZ * 1.2,
    dirX,
    dirZ,
    speed: spell.speed,
    damage: spell.damage,
    stun: spell.stun || 0,
    color: spell.color,
    radius: spell.radius,
    born: now
  };
  room.projectiles.push(projectile);
}

function tickRoom(room, io) {
  if (!room.started || room.winner) return;

  const now = Date.now();
  const toRemove = [];

  for (const proj of room.projectiles) {
    // Move projectile
    proj.x += proj.dirX * proj.speed;
    proj.z += proj.dirZ * proj.speed;

    // Out of bounds check
    if (Math.abs(proj.x) > ARENA_SIZE || Math.abs(proj.z) > ARENA_SIZE || now - proj.born > 6000) {
      toRemove.push(proj.id);
      continue;
    }

    // Collision check with opponent
    const opponentId = getOpponentId(room, proj.ownerId);
    if (!opponentId) continue;
    const opp = room.players[opponentId];
    if (!opp || !opp.alive) continue;

    const dx = proj.x - opp.x;
    const dz = proj.z - opp.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 1.0 + proj.radius) {
      toRemove.push(proj.id);

      if (!opp.shielded) {
        opp.hp = Math.max(0, opp.hp - proj.damage);

        if (proj.stun > 0) {
          opp.stunned = true;
          setTimeout(() => { opp.stunned = false; }, proj.stun);
        }

        io.to(room.roomId).emit('playerHit', {
          playerId: opponentId,
          hp: opp.hp,
          damage: proj.damage,
          spellKey: proj.spellKey,
          stunned: proj.stun > 0
        });

        if (opp.hp <= 0) {
          opp.alive = false;
          room.winner = proj.ownerId;
          io.to(room.roomId).emit('gameOver', {
            winnerId: proj.ownerId,
            winnerName: room.players[proj.ownerId].username
          });
        }
      } else {
        io.to(room.roomId).emit('shieldBlocked', { playerId: opponentId, spellKey: proj.spellKey });
      }
    }
  }

  room.projectiles = room.projectiles.filter(p => !toRemove.includes(p.id));
}

function setupGameSockets(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('joinQueue', ({ username, token }) => {
      socket.username = username;

      if (waitingPlayer && waitingPlayer.id !== socket.id) {
        const room = createRoom(waitingPlayer, socket);
        const playerList = Object.values(room.players).map(p => ({
          id: p.id, username: p.username, x: p.x, z: p.z, hp: p.hp
        }));

        io.to(room.roomId).emit('matchFound', {
          roomId: room.roomId,
          players: playerList,
          yourId: null // each client gets told individually below
        });

        // Tell each player their own id
        waitingPlayer.emit('yourId', waitingPlayer.id);
        socket.emit('yourId', socket.id);

        waitingPlayer = null;

        // Start tick loop for this room
        const interval = setInterval(() => {
          const r = rooms[room.roomId];
          if (!r || r.winner) { clearInterval(interval); return; }
          tickRoom(r, io);
          io.to(room.roomId).emit('gameState', {
            players: r.players,
            projectiles: r.projectiles
          });
        }, 50); // 20 ticks/sec

        room.interval = interval;
      } else {
        waitingPlayer = socket;
        socket.emit('waiting', { message: 'Waiting for an opponent...' });
      }
    });

    socket.on('playerInput', ({ dx, dz, rotY }) => {
      const room = rooms[socket.roomId];
      if (!room) return;
      handleMove(room, socket.id, { dx, dz, rotY });
    });

    socket.on('castSpell', ({ spellKey }) => {
      const room = rooms[socket.roomId];
      if (!room) return;
      handleCastSpell(room, socket.id, spellKey, io);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      if (waitingPlayer && waitingPlayer.id === socket.id) {
        waitingPlayer = null;
      }
      const room = rooms[socket.roomId];
      if (room && !room.winner) {
        clearInterval(room.interval);
        const opponentId = getOpponentId(room, socket.id);
        if (opponentId) {
          io.to(opponentId).emit('opponentDisconnected');
        }
        delete rooms[socket.roomId];
      }
    });
  });
}

module.exports = { setupGameSockets, SPELLS };
