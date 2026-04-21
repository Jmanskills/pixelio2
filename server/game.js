const User = require('./models/User');
const Report = require('./models/Report');

// Game constants
const ARENA_SIZE = 40;
const PLAYER_SPEED = 0.15;
const PLAYER_MAX_HP = 100;

const SPELLS = {
  fireball:  { damage: 35, speed: 0.25, cooldown: 2000, color: 0xff6600, radius: 0.4, name: 'Rocket' },
  iceshard:  { damage: 15, speed: 0.55, cooldown: 800,  color: 0x44ddff, radius: 0.2, name: 'Blaster' },
  thunder:   { damage: 25, speed: 0.40, cooldown: 1400, color: 0xffee00, radius: 0.3, name: 'Zapper',   stun: 800 },
  shield:    { damage: 0,  speed: 0,    cooldown: 8000, color: 0x00ff88, radius: 0,   name: 'Shield',    duration: 3000 }
};

// Waiting queue and active rooms
let waitingPlayer = null;
const rooms = {}; // roomId -> room state

function createRoom(socket1, socket2) {
  const roomId = `room_${Date.now()}`;
  const state = {
    roomId,
    players: {
      [socket1.id]: createPlayerState(socket1.id, socket1.username, -8, 0, socket1.cosmetics || {}),
      [socket2.id]: createPlayerState(socket2.id, socket2.username,  8, 0, socket2.cosmetics || {})
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

function createPlayerState(id, username, x, z, cosmetics = {}) {
  return {
    id, username,
    x, y: 0, z,
    rotY: 0,
    hp: PLAYER_MAX_HP,
    shielded: false,
    stunned: false,
    spellCooldowns: { fireball: 0, iceshard: 0, thunder: 0, shield: 0 },
    alive: true,
    equippedSkin:  cosmetics.equippedSkin  || 'skin_default',
    equippedWeapon: cosmetics.equippedWeapon || 'weapon_default',
    equippedTitle: cosmetics.equippedTitle || 'title_wizard'
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

async function tickRoom(room, io) {
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
          // Award coins: 50 for win, 10 for loss
          try {
            await User.findOneAndUpdate({ username: room.players[proj.ownerId].username }, { $inc: { wins: 1, coins: 50 } });
            await User.findOneAndUpdate({ username: opp.username }, { $inc: { losses: 1, coins: 10 } });
          } catch(e) { console.error('Coin award error:', e); }
          io.to(room.roomId).emit('gameOver', {
            winnerId: proj.ownerId,
            winnerName: room.players[proj.ownerId].username,
            coinsEarned: { [proj.ownerId]: 50, [opponentId]: 10 }
          });
        }
      } else {
        io.to(room.roomId).emit('shieldBlocked', { playerId: opponentId, spellKey: proj.spellKey });
      }
    }
  }

  room.projectiles = room.projectiles.filter(p => !toRemove.includes(p.id));
}

// Online presence tracking
const onlineUsers = {}; // username -> socketId

function setupGameSockets(io) {
  _io = io;
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Register online presence WITHOUT joining the queue (called on menu load)
    socket.on('registerPresence', ({ username, cosmetics }) => {
      socket.username = username;
      socket.cosmetics = cosmetics || {};
      onlineUsers[username] = socket.id;
      io.emit('onlineStatus', { username, online: true });
    });

    socket.on('joinQueue', async ({ username, token, cosmetics }) => {
      socket.username = username;
      socket.cosmetics = cosmetics || {};

      // Track online users for friend system
      onlineUsers[username] = socket.id;
      io.emit('onlineStatus', { username, online: true });

      // Don't match with yourself
      if (waitingPlayer && waitingPlayer.id !== socket.id) {
        const room = createRoom(waitingPlayer, socket);
        const playerList = Object.values(room.players).map(p => ({
          id: p.id, username: p.username, x: p.x, z: p.z, hp: p.hp,
          equippedSkin: p.equippedSkin, equippedWeapon: p.equippedSpell, equippedTitle: p.equippedTitle
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
        const interval = setInterval(async () => {
          const r = rooms[room.roomId];
          if (!r || r.winner) { clearInterval(interval); return; }
          await tickRoom(r, io);
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

    socket.on('leaveQueue', () => {
      if (waitingPlayer && waitingPlayer.id === socket.id) {
        waitingPlayer = null;
      }
    });

    // ── PRACTICE MODE: solo match vs AI bot ──────────
    socket.on('startPractice', ({ username, cosmetics }) => {
      socket.username = username;
      socket.cosmetics = cosmetics || {};
      onlineUsers[username] = socket.id;

      const roomId = `practice_${socket.id}`;
      const botId  = `bot_${socket.id}`;

      const state = {
        roomId, isPractice: true, started: true, winner: null,
        players: {
          [socket.id]: createPlayerState(socket.id, username, -8, 0, cosmetics),
          [botId]:     createPlayerState(botId, 'Bot Opponent', 8, 0, {})
        },
        projectiles: []
      };

      rooms[roomId] = state;
      socket.roomId = roomId;
      socket.join(roomId);

      const playerList = Object.values(state.players).map(p => ({
        id: p.id, username: p.username, x: p.x, z: p.z, hp: p.hp,
        equippedSkin: p.equippedSkin, equippedWeapon: p.equippedSpell, equippedTitle: p.equippedTitle
      }));

      socket.emit('matchFound', { roomId, players: playerList });
      socket.emit('yourId', socket.id);

      // Bot AI tick
      let botAngle = 0;
      let botCooldown = 0;
      const interval = setInterval(async () => {
        const r = rooms[roomId];
        if (!r || r.winner) { clearInterval(interval); return; }

        // Bot movement — orbit the center
        botAngle += 0.02;
        const bot = r.players[botId];
        const player = r.players[socket.id];
        if (bot && bot.alive) {
          // Move bot toward player with some lag
          const dx = player.x - bot.x;
          const dz = player.z - bot.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist > 5) {
            bot.x += (dx / dist) * PLAYER_SPEED * 0.6;
            bot.z += (dz / dist) * PLAYER_SPEED * 0.6;
          }
          // Bot faces player
          bot.rotY = Math.atan2(-(player.x - bot.x), -(player.z - bot.z));

          // Bot fires at player every ~2 seconds
          const now = Date.now();
          if (now > botCooldown && dist < 18) {
            botCooldown = now + 1800 + Math.random() * 1200;
            const spells = ['fireball','iceshard','thunder'];
            const spell = spells[Math.floor(Math.random()*spells.length)];
            const s = SPELLS[spell];
            const dir = { x: player.x - bot.x, z: player.z - bot.z };
            const len = Math.sqrt(dir.x*dir.x + dir.z*dir.z);
            r.projectiles.push({
              id: `botproj_${Date.now()}_${Math.random()}`,
              ownerId: botId, spellKey: spell,
              x: bot.x, y: 1.0, z: bot.z,
              dirX: dir.x/len, dirZ: dir.z/len,
              speed: s.speed, damage: s.damage, stun: s.stun || 0,
              color: s.color, radius: s.radius, born: now
            });
          }
        }

        await tickRoom(r, io);
        io.to(roomId).emit('gameState', { players: r.players, projectiles: r.projectiles });
      }, 50);

      state.interval = interval;
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

    // Friend invite: send invite to online friend
    socket.on('sendInvite', ({ toUsername }) => {
      const targetSocketId = onlineUsers[toUsername];
      if (targetSocketId) {
        io.to(targetSocketId).emit('friendInvite', { fromUsername: socket.username });
      } else {
        socket.emit('inviteError', { message: `${toUsername} is not online.` });
      }
    });

    // Accept invite: put both in queue together
    socket.on('acceptInvite', ({ fromUsername }) => {
      const fromSocketId = onlineUsers[fromUsername];
      if (!fromSocketId) {
        socket.emit('inviteError', { message: `${fromUsername} is no longer online.` });
        return;
      }
      const fromSocket = io.sockets.sockets.get(fromSocketId);
      if (!fromSocket) return;

      // Cancel any existing queue spot
      if (waitingPlayer && (waitingPlayer.id === socket.id || waitingPlayer.id === fromSocket.id)) {
        waitingPlayer = null;
      }

      const room = createRoom(fromSocket, socket);
      const playerList = Object.values(room.players).map(p => ({
        id: p.id, username: p.username, x: p.x, z: p.z, hp: p.hp,
        equippedSkin: p.equippedSkin, equippedWeapon: p.equippedSpell, equippedTitle: p.equippedTitle
      }));
      io.to(room.roomId).emit('matchFound', { roomId: room.roomId, players: playerList });
      fromSocket.emit('yourId', fromSocket.id);
      socket.emit('yourId', socket.id);

      const interval = setInterval(async () => {
        const r = rooms[room.roomId];
        if (!r || r.winner) { clearInterval(interval); return; }
        await tickRoom(r, io);
        io.to(room.roomId).emit('gameState', { players: r.players, projectiles: r.projectiles });
      }, 50);
      room.interval = interval;
    });

    // Emotes — relay to opponent
    socket.on('emote', ({ emoteKey }) => {
      const room = rooms[socket.roomId];
      if (!room) return;
      const opponentId = getOpponentId(room, socket.id);
      if (opponentId) {
        io.to(opponentId).emit('opponentEmote', { emoteKey, fromId: socket.id });
      }
      // Echo back to sender too so they see their own emote
      socket.emit('myEmote', { emoteKey, fromId: socket.id });
    });

    socket.on('declineInvite', ({ fromUsername }) => {
      const fromSocketId = onlineUsers[fromUsername];
      if (fromSocketId) io.to(fromSocketId).emit('inviteDeclined', { byUsername: socket.username });
    });

    // Quit match — draw, no coins lost, both sent back to menu
    socket.on('quitMatch', () => {
      const room = rooms[socket.roomId];
      if (!room || room.winner) return;
      clearInterval(room.interval);
      room.winner = 'draw';
      io.to(room.roomId).emit('matchDraw', { quitterName: socket.username });
      delete rooms[socket.roomId];
    });

    // Report a player — save to DB
    socket.on('reportPlayer', async ({ reportedUsername, reason, details }) => {
      try {
        const safeDetails = (details || '').slice(0, 300);
        await Report.create({ reporterUsername: socket.username, reportedUsername, reason, details: safeDetails });
        socket.emit('reportReceived', { message: 'Report submitted. Thank you.' });
      } catch(e) { console.error('Report save error:', e); }
    });

    // Kick — admin only, sent from server via socket
    socket.on('adminKick', ({ targetUsername }) => {
      // Only trust this from server-side calls, validated there
      const targetSocketId = onlineUsers[targetUsername];
      if (targetSocketId) {
        io.to(targetSocketId).emit('kicked', { reason: 'You were kicked by an admin.' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      if (socket.username) {
        delete onlineUsers[socket.username];
        io.emit('onlineStatus', { username: socket.username, online: false });
      }
      if (waitingPlayer && waitingPlayer.id === socket.id) {
        waitingPlayer = null;
      }
      const room = rooms[socket.roomId];
      if (room && !room.winner) {
        clearInterval(room.interval);
        const opponentId = getOpponentId(room, socket.id);
        if (opponentId) io.to(opponentId).emit('opponentDisconnected');
        delete rooms[socket.roomId];
      }
    });
  });
}

module.exports = { setupGameSockets, SPELLS, getOnlineUsers: () => onlineUsers, getIO: () => _io, getRooms: () => rooms };
let _io = null;
