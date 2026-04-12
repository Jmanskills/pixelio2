// ═══════════════════════════════════════════════════
//  PIXELIO — CLIENT
// ═══════════════════════════════════════════════════

// ── App State ───────────────────────────────────────
let socket = null;
let myId = null;
let profile = null;   // full user profile from server
let authToken = null;
let shopCatalog = [];
let currentShopTab = 'robe';
let currentTab = 'login';
let pendingInviteFrom = null;
let onlineFriends = new Set();

const ROBE_COLORS = {
  robe_default: 0x6a0dad, robe_crimson: 0xcc1122, robe_ocean: 0x0066cc,
  robe_forest: 0x1a7a2a,  robe_gold: 0xd4a017,   robe_shadow: 0x1a1a2e, robe_rainbow: 0xff44aa
};
const SPELL_COLORS = {
  spell_default: null, spell_lava: 0xff6600, spell_frost: 0x88eeff,
  spell_venom: 0x44ff44, spell_dark: 0x220033, spell_solar: 0xffdd00
};

// ── Screen helpers ───────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  document.getElementById(id).classList.add('active');
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-error').classList.add('hidden');
}

// ── Particles ────────────────────────────────────────
function spawnParticles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const colors = ['#9b30e8','#f0c040','#00e5cc','#4488ff','#ff6644'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 2;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;bottom:${Math.random()*20}%;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${Math.random()*8+6}s;animation-delay:${Math.random()*8}s;`;
    container.appendChild(p);
  }
}

// ══════════════════════════════════════════════════════
//  AUTH & SESSION
// ══════════════════════════════════════════════════════
async function tryAutoLogin() {
  const saved = localStorage.getItem('pixelio_token');
  if (!saved) return false;
  document.getElementById('splash-auth-wrap').classList.add('hidden');
  document.getElementById('splash-loading').classList.remove('hidden');
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + saved } });
    if (!res.ok) throw new Error('invalid');
    const data = await res.json();
    authToken = saved;
    profile = data.profile;
    await loadShopCatalog();
    enterMainMenu();
    return true;
  } catch {
    localStorage.removeItem('pixelio_token');
    document.getElementById('splash-auth-wrap').classList.remove('hidden');
    document.getElementById('splash-loading').classList.add('hidden');
    return false;
  }
}

async function doAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');
  if (!username || !password) { errEl.textContent = 'Please enter username and password.'; errEl.classList.remove('hidden'); return; }
  const endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Authentication failed.'; errEl.classList.remove('hidden'); return; }
    authToken = data.token;
    profile = data.profile;
    localStorage.setItem('pixelio_token', authToken);
    await loadShopCatalog();
    enterMainMenu();
  } catch { errEl.textContent = 'Network error. Try again.'; errEl.classList.remove('hidden'); }
}

function logout() {
  localStorage.removeItem('pixelio_token');
  authToken = null; profile = null; myId = null;
  if (socket) { socket.disconnect(); socket = null; }
  showScreen('screen-splash');
  document.getElementById('splash-auth-wrap').classList.remove('hidden');
  document.getElementById('splash-loading').classList.add('hidden');
}

// ══════════════════════════════════════════════════════
//  MAIN MENU
// ══════════════════════════════════════════════════════
function enterMainMenu() {
  updateMenuUI();
  showScreen('screen-mainmenu');
  spawnParticles('menu-particles');
  renderPreviewCanvas();
  menuNav('play');
  connectSocket();
  loadFriends();
}

function updateMenuUI() {
  if (!profile) return;
  document.getElementById('menu-username').textContent = profile.username;
  document.getElementById('menu-coins').textContent = '🪙 ' + profile.coins;
  document.getElementById('shop-coins').textContent = profile.coins;
  document.getElementById('menu-wl').textContent = `${profile.wins}W / ${profile.losses}L`;
  document.getElementById('stat-wins').textContent = profile.wins;
  document.getElementById('stat-losses').textContent = profile.losses;
  const wr = profile.wins + profile.losses > 0
    ? Math.round(profile.wins / (profile.wins + profile.losses) * 100) + '%'
    : '—';
  document.getElementById('stat-ratio').textContent = wr;

  // Title badge
  const titleItem = shopCatalog.find(i => i.id === profile.equippedTitle);
  document.getElementById('menu-title-badge').textContent = titleItem ? titleItem.name : 'Wizard';
  document.getElementById('lobby-username').textContent = profile.username;

  // Avatar robe color
  const robeColor = hexToCSS(ROBE_COLORS[profile.equippedRobe] || 0x6a0dad);
  const av = document.getElementById('avatar-robe');
  av.style.background = robeColor;
  av.textContent = '🧙';
  av.style.display = 'flex';
  av.style.alignItems = 'center';
  av.style.justifyContent = 'center';
  av.style.fontSize = '1.4rem';
}

function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

function menuNav(tab) {
  document.querySelectorAll('.menu-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('nav-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  if (tab === 'shop') renderShop();
  if (tab === 'friends') loadFriends();
}

// ── Mini wizard preview canvas ───────────────────────
function renderPreviewCanvas() {
  const canvas = document.getElementById('preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const robeHex = ROBE_COLORS[profile ? profile.equippedRobe : 'robe_default'] || 0x6a0dad;
  const robeColor = hexToCSS(robeHex);

  // Background glow
  const grd = ctx.createRadialGradient(w/2, h*0.6, 10, w/2, h*0.6, 90);
  grd.addColorStop(0, robeColor + '44');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(w/2, h-20, 35, 10, 0, 0, Math.PI*2);
  ctx.fill();

  // Robe body (trapezoid)
  ctx.fillStyle = robeColor;
  ctx.beginPath();
  ctx.moveTo(w/2-22, h-30);
  ctx.lineTo(w/2+22, h-30);
  ctx.lineTo(w/2+32, h-30);
  ctx.lineTo(w/2+28, h-100);
  ctx.lineTo(w/2-28, h-100);
  ctx.lineTo(w/2-32, h-30);
  ctx.closePath();
  ctx.fill();

  // Darker robe shading
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(w/2+2, h-30);
  ctx.lineTo(w/2+32, h-30);
  ctx.lineTo(w/2+28, h-100);
  ctx.lineTo(w/2+2, h-100);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = '#f5d5a0';
  ctx.beginPath();
  ctx.arc(w/2, h-116, 20, 0, Math.PI*2);
  ctx.fill();

  // Hat brim
  ctx.fillStyle = '#111122';
  ctx.beginPath();
  ctx.ellipse(w/2, h-134, 28, 7, 0, 0, Math.PI*2);
  ctx.fill();

  // Hat cone
  ctx.fillStyle = '#111122';
  ctx.beginPath();
  ctx.moveTo(w/2-20, h-134);
  ctx.lineTo(w/2+20, h-134);
  ctx.lineTo(w/2, h-186);
  ctx.closePath();
  ctx.fill();

  // Hat star
  ctx.fillStyle = robeColor;
  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', w/2, h-155);

  // Staff
  ctx.strokeStyle = '#8b5e3c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w/2+34, h-30);
  ctx.lineTo(w/2+38, h-145);
  ctx.stroke();

  // Staff crystal
  ctx.fillStyle = robeColor;
  ctx.font = '16px serif';
  ctx.fillText('◆', w/2+36, h-148);

  // Spell effect tint on staff crystal if custom spell
  const spellColor = SPELL_COLORS[profile ? profile.equippedSpell : 'spell_default'];
  if (spellColor) {
    ctx.fillStyle = hexToCSS(spellColor);
    ctx.globalAlpha = 0.6;
    ctx.font = '16px serif';
    ctx.fillText('◆', w/2+36, h-148);
    ctx.globalAlpha = 1;
  }

  // Title badge
  if (profile) {
    const titleItem = shopCatalog.find(i => i.id === profile.equippedTitle);
    if (titleItem && titleItem.name !== 'Wizard') {
      ctx.fillStyle = titleItem.preview || '#f0c040';
      ctx.font = 'bold 11px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText(titleItem.name.toUpperCase(), w/2, h-10);
    }
  }
}

// ══════════════════════════════════════════════════════
//  SHOP
// ══════════════════════════════════════════════════════
async function loadShopCatalog() {
  try {
    const res = await fetch('/api/shop');
    const data = await res.json();
    shopCatalog = data.items || [];
  } catch { shopCatalog = []; }
}

function shopTab(tab) {
  currentShopTab = tab;
  document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderShop();
}

function renderShop() {
  const grid = document.getElementById('shop-items-grid');
  grid.innerHTML = '';
  const items = shopCatalog.filter(i => i.category === currentShopTab);
  items.forEach(item => {
    const owned = profile.inventory.includes(item.id);
    const equipped =
      (item.category === 'robe'  && profile.equippedRobe  === item.id) ||
      (item.category === 'spell' && profile.equippedSpell === item.id) ||
      (item.category === 'title' && profile.equippedTitle === item.id);

    const card = document.createElement('div');
    card.className = 'shop-item' + (owned ? ' owned' : '') + (equipped ? ' equipped' : '');

    // Preview swatch
    const preview = document.createElement('div');
    preview.className = 'shop-preview';
    if (item.category === 'robe') {
      preview.style.background = hexToCSS(item.color || 0x6a0dad);
      preview.textContent = '🧙';
    } else if (item.category === 'spell') {
      preview.style.background = item.color ? hexToCSS(item.color) : '#9b30e8';
      preview.textContent = '✨';
    } else {
      preview.style.background = item.preview || '#f0c040';
      preview.textContent = '🏷️';
    }

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = item.name;

    const desc = document.createElement('div');
    desc.className = 'shop-item-desc';
    desc.textContent = item.description;

    // Status badge
    if (equipped) {
      const badge = document.createElement('div');
      badge.className = 'shop-item-status equipped';
      badge.textContent = 'Equipped';
      card.appendChild(badge);
    } else if (owned) {
      const badge = document.createElement('div');
      badge.className = 'shop-item-status owned';
      badge.textContent = 'Owned';
      card.appendChild(badge);
    }

    // Action button
    const btn = document.createElement('button');
    btn.className = 'shop-item-btn';
    if (equipped) {
      btn.textContent = '✓ Equipped';
      btn.className += ' equipped-btn';
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = 'Equip';
      btn.className += ' equip';
      btn.onclick = () => equipItem(item.id);
    } else if (item.price === 0) {
      btn.textContent = 'Free — Equip';
      btn.className += ' equip';
      btn.onclick = () => buyAndEquip(item.id, 0);
    } else {
      btn.textContent = '🪙 ' + item.price;
      if (profile.coins < item.price) btn.disabled = true;
      btn.onclick = () => buyAndEquip(item.id, item.price);
    }

    card.appendChild(preview);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(btn);
    grid.appendChild(card);
  });
}

async function buyAndEquip(itemId, price) {
  if (price > 0) {
    const res = await apiFetch('/api/shop/buy', 'POST', { itemId });
    if (!res) return;
    profile = res.profile;
  }
  await equipItem(itemId);
}

async function equipItem(itemId) {
  const res = await apiFetch('/api/shop/equip', 'POST', { itemId });
  if (!res) return;
  profile = res.profile;
  updateMenuUI();
  renderShop();
  renderPreviewCanvas();
}

// ══════════════════════════════════════════════════════
//  FRIENDS
// ══════════════════════════════════════════════════════
async function loadFriends() {
  const res = await apiFetch('/api/friends', 'GET');
  if (!res) return;
  profile.friends = res.friends;
  profile.friendRequests = res.friendRequests;
  renderFriends();
  updateRequestBadge();
}

function renderFriends() {
  // Requests
  const reqList = document.getElementById('requests-list');
  const reqSection = document.getElementById('requests-section');
  reqList.innerHTML = '';
  if (profile.friendRequests.length === 0) {
    reqSection.style.display = 'none';
  } else {
    reqSection.style.display = '';
    profile.friendRequests.forEach(username => {
      const item = document.createElement('div');
      item.className = 'friend-item';
      item.innerHTML = `
        <div class="friend-item-left">
          <div class="friend-dot ${onlineFriends.has(username) ? 'online' : ''}"></div>
          <div><div class="friend-name">${username}</div></div>
        </div>
        <div class="friend-item-right">
          <button class="btn-small btn-accept" onclick="respondRequest('${username}','accept')">Accept</button>
          <button class="btn-small btn-decline" onclick="respondRequest('${username}','decline')">Decline</button>
        </div>`;
      reqList.appendChild(item);
    });
  }

  // Friends list
  const list = document.getElementById('friends-list');
  list.innerHTML = '';
  if (profile.friends.length === 0) {
    list.innerHTML = '<div class="friends-empty">No friends yet. Add some above!</div>';
    return;
  }
  profile.friends.forEach(username => {
    const online = onlineFriends.has(username);
    const item = document.createElement('div');
    item.className = 'friend-item';
    item.innerHTML = `
      <div class="friend-item-left">
        <div class="friend-dot ${online ? 'online' : ''}"></div>
        <div>
          <div class="friend-name">${username}</div>
          <div class="friend-title">${online ? '🟢 Online' : '⚫ Offline'}</div>
        </div>
      </div>
      <div class="friend-item-right">
        ${online ? `<button class="btn-small" onclick="inviteFriend('${username}')">⚔️ Invite</button>` : ''}
        <button class="btn-small btn-decline" onclick="removeFriend('${username}')">Remove</button>
      </div>`;
    list.appendChild(item);
  });
}

function updateRequestBadge() {
  const badge = document.getElementById('friends-badge');
  const count = profile.friendRequests ? profile.friendRequests.length : 0;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function sendFriendRequest() {
  const input = document.getElementById('friend-search-input');
  const username = input.value.trim();
  if (!username) return;
  const msgEl = document.getElementById('friend-msg');
  msgEl.classList.add('hidden');
  const res = await apiFetch('/api/friends/request', 'POST', { username });
  if (res && res.message) {
    msgEl.textContent = res.message;
    msgEl.className = 'friend-msg success';
    msgEl.classList.remove('hidden');
    input.value = '';
  }
}

async function respondRequest(username, action) {
  const endpoint = action === 'accept' ? '/api/friends/accept' : '/api/friends/decline';
  const res = await apiFetch(endpoint, 'POST', { username });
  if (res && res.profile) { profile = res.profile; }
  await loadFriends();
}

async function removeFriend(username) {
  const res = await apiFetch('/api/friends/remove', 'POST', { username });
  if (res && res.profile) { profile = res.profile; }
  await loadFriends();
}

function inviteFriend(username) {
  if (!socket) return;
  socket.emit('sendInvite', { toUsername: username });
  const msgEl = document.getElementById('friend-msg');
  msgEl.textContent = `Invite sent to ${username}!`;
  msgEl.className = 'friend-msg success';
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 3000);
}

// ══════════════════════════════════════════════════════
//  SOCKET CONNECTION
// ══════════════════════════════════════════════════════
function connectSocket() {
  if (socket && socket.connected) return;
  socket = io();

  socket.on('connect', () => {
    // Register online presence only — NOT joining the queue
    socket.emit('registerPresence', {
      username: profile.username,
      cosmetics: {
        equippedRobe: profile.equippedRobe,
        equippedSpell: profile.equippedSpell,
        equippedTitle: profile.equippedTitle
      }
    });
  });

  socket.on('yourId', id => { myId = id; });

  socket.on('matchFound', ({ players }) => {
    startGame(players);
  });

  socket.on('gameState', state => {
    if (gameRunning) updateGameState(state);
  });

  socket.on('playerHit', ({ playerId, hp, spellKey, stunned }) => {
    if (playerId === myId) { flashHit(); updateMyHP(hp); if (stunned) showStun(); }
    else updateOppHP(hp);
  });

  socket.on('shieldActivated', ({ playerId }) => { setShieldVisible(playerId, true); });
  socket.on('shieldExpired',   ({ playerId }) => { setShieldVisible(playerId, false); });

  socket.on('gameOver', ({ winnerId, winnerName, coinsEarned }) => {
    const iWon = winnerId === myId;
    const earned = coinsEarned ? (coinsEarned[myId] || 0) : 0;
    if (earned > 0) profile.coins += earned;
    endGame(iWon, winnerName, false, earned);
  });

  socket.on('opponentDisconnected', () => endGame(true, profile.username, true, 50));

  socket.on('matchDraw', ({ quitterName }) => {
    endGame(null, null, false, 0, quitterName);
  });

  socket.on('reportReceived', ({ message }) => {
    showReportConfirmation(message);
  });

  socket.on('opponentEmote', ({ emoteKey, fromId }) => {
    playEmote(emoteKey, fromId);
  });

  socket.on('myEmote', ({ emoteKey, fromId }) => {
    playEmote(emoteKey, fromId);
  });

  // Online presence from server
  socket.on('onlineStatus', ({ username, online }) => {
    if (online) onlineFriends.add(username);
    else onlineFriends.delete(username);
    renderFriends();
  });

  // Friend invites
  socket.on('friendInvite', ({ fromUsername }) => {
    pendingInviteFrom = fromUsername;
    document.getElementById('invite-from').textContent = fromUsername;
    document.getElementById('invite-toast').classList.remove('hidden');
  });

  socket.on('inviteDeclined', ({ byUsername }) => {
    alert(`${byUsername} declined your invite.`);
  });

  socket.on('inviteError', ({ message }) => {
    alert(message);
  });

  socket.on('waiting', ({ message }) => {
    document.getElementById('lobby-msg').textContent = message;
  });
}

function joinQueue() {
  if (!socket) connectSocket();
  document.getElementById('lobby-username').textContent = profile.username;
  showScreen('screen-lobby');
  socket.emit('joinQueue', {
    username: profile.username,
    token: authToken,
    cosmetics: {
      equippedRobe: profile.equippedRobe,
      equippedSpell: profile.equippedSpell,
      equippedTitle: profile.equippedTitle
    }
  });
}

// ══════════════════════════════════════════════════════
//  THREE.JS RENDERING
// ══════════════════════════════════════════════════════
let renderer, scene, camera;
let playerMeshes = {};
let projMeshes   = {};
let animFrameId;
let gameRunning  = false;

const CAMERA_DIST   = 14;
const CAMERA_HEIGHT = 6;
const COOLDOWNS = { fireball: 2000, iceshard: 800, thunder: 1400, shield: 8000 };
const SPELL_KEYS = { KeyQ: 'fireball', KeyE: 'iceshard', KeyR: 'thunder', KeyF: 'shield' };
const SPELL_SLOT_IDS = { fireball: 'spell-1', iceshard: 'spell-2', thunder: 'spell-3', shield: 'spell-4' };
const cooldownTimers = { fireball: 0, iceshard: 0, thunder: 0, shield: 0 };

const keys  = {};
let mouseX  = 0;
let pointerLocked = false;
let inputInterval = null;

function initThree() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x0a0518);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0518, 30, 80);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DIST);
  camera.lookAt(0, 0, 0);

  buildArena();
  addLights();
  addSkybox();
  addTrees();

  window.addEventListener('resize', onResize);
  onResize();
}

function buildArena() {
  // Ground
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x2d4a2d });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 20, 20), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Stone path
  const path = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshLambertMaterial({ color: 0x5a5058 }));
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  scene.add(path);

  // Wall segments
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a6868 });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.5), wallMat);
    wall.position.set(Math.cos(angle) * 13, 0.6, Math.sin(angle) * 13);
    wall.rotation.y = angle + Math.PI / 2;
    wall.castShadow = true;
    scene.add(wall);
  }

  // Obelisk
  const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 3, 6), new THREE.MeshLambertMaterial({ color: 0x886688 }));
  obelisk.position.set(0, 1.5, 0);
  obelisk.castShadow = true;
  scene.add(obelisk);

  // Crystal
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0x9b30e8 }));
  crystal.position.set(0, 3.4, 0);
  scene.add(crystal);
  const crystalLight = new THREE.PointLight(0x9b30e8, 1.5, 12);
  crystalLight.position.set(0, 3.5, 0);
  scene.add(crystalLight);
  (function animCrystal() {
    const t = Date.now() * 0.001;
    crystal.rotation.y = t;
    crystal.position.y = 3.4 + Math.sin(t * 2) * 0.08;
    crystalLight.intensity = 1.2 + Math.sin(t * 3) * 0.3;
    requestAnimationFrame(animCrystal);
  })();
}

function addTrees() {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
  const leafMat  = new THREE.MeshLambertMaterial({ color: 0x1a5c2a });
  [[- 18,-18],[18,-18],[-18,18],[18,18],[0,-22],[0,22],[-22,0],[22,0],[-14,-24],[14,-24],[-24,14],[24,-14]].forEach(([x,z]) => {
    const h = 4 + Math.random() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, h, 6), trunkMat);
    trunk.position.set(x, h/2, z); trunk.castShadow = true; scene.add(trunk);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(2 - i*0.3, 2, 7), leafMat);
      leaf.position.set(x, h - 0.5 + i * 1.4, z); leaf.castShadow = true; scene.add(leaf);
    }
  });
}

function addLights() {
  scene.add(new THREE.AmbientLight(0x334466, 0.8));
  const moon = new THREE.DirectionalLight(0x8899bb, 0.6);
  moon.position.set(10, 20, 10); moon.castShadow = true; scene.add(moon);
  const r1 = new THREE.PointLight(0x4400aa, 0.8, 40); r1.position.set(-15, 8, -15); scene.add(r1);
  const r2 = new THREE.PointLight(0x004488, 0.8, 40); r2.position.set( 15, 8,  15); scene.add(r2);
}

function addSkybox() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8), new THREE.MeshBasicMaterial({ color: 0x050312, side: THREE.BackSide }));
  scene.add(sky);
  const starVerts = [];
  for (let i = 0; i < 800; i++) {
    const theta = Math.random() * Math.PI * 2, phi = Math.acos(2*Math.random()-1), r = 90;
    starVerts.push(r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 })));
}

// ── Wizard mesh with cosmetics ───────────────────────
function createWizardMesh(robeItemId, spellItemId) {
  const robeColor  = ROBE_COLORS[robeItemId]  || 0x6a0dad;
  const spellColor = SPELL_COLORS[spellItemId] || robeColor;
  const group = new THREE.Group();

  const robeMat = new THREE.MeshLambertMaterial({ color: robeColor });

  // Robe
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 1.6, 8), robeMat);
  robe.position.y = 0.8; robe.castShadow = true; group.add(robe);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshLambertMaterial({ color: 0xf5d5a0 }));
  head.position.y = 1.9; group.add(head);

  // Hat
  const hatMat = new THREE.MeshLambertMaterial({ color: 0x111122 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), hatMat);
  brim.position.y = 2.1; group.add(brim);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), hatMat);
  cone.position.y = 2.55; group.add(cone);

  // Staff
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0x8b5e3c }));
  staff.position.set(0.55, 1.1, 0); staff.rotation.z = 0.1; group.add(staff);

  // Staff crystal (spell color)
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: spellColor }));
  crystal.position.set(0.65, 2.25, 0); group.add(crystal);

  // Crystal glow light
  const glow = new THREE.PointLight(spellColor, 1.2, 5);
  glow.position.set(0.65, 2.25, 0); group.add(glow);

  // Shield bubble
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  shield.position.y = 1.0; shield.visible = false; group.add(shield);

  group.userData.shield = shield;
  return group;
}

function setShieldVisible(id, v) {
  if (playerMeshes[id]) playerMeshes[id].userData.shield.visible = v;
}

// ── Projectile mesh ──────────────────────────────────
const BASE_SPELL_COLORS = { fireball: 0xff4400, iceshard: 0x88ddff, thunder: 0xffee00 };

function createProjectileMesh(spellKey, spellItemId) {
  let color = BASE_SPELL_COLORS[spellKey] || 0xffffff;
  const override = SPELL_COLORS[spellItemId];
  if (override) {
    // Tint the base color with the equipped spell color
    color = blendColors(color, override, 0.5);
  }
  const geo = spellKey === 'iceshard' ? new THREE.OctahedronGeometry(0.2) : new THREE.SphereGeometry(0.25, 8, 8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  mesh.add(new THREE.PointLight(color, 1.5, 4));
  return mesh;
}

function blendColors(c1, c2, t) {
  const r1=(c1>>16)&0xff, g1=(c1>>8)&0xff, b1=c1&0xff;
  const r2=(c2>>16)&0xff, g2=(c2>>8)&0xff, b2=c2&0xff;
  return (Math.round(r1+(r2-r1)*t)<<16)|(Math.round(g1+(g2-g1)*t)<<8)|Math.round(b1+(b2-b1)*t);
}

// ── Start game ───────────────────────────────────────
function startGame(players) {
  showScreen('screen-game');
  gameRunning = true;

  Object.values(playerMeshes).forEach(m => scene.remove(m));
  Object.values(projMeshes).forEach(m => scene.remove(m));
  playerMeshes = {}; projMeshes = {};

  if (!renderer) initThree();

  players.forEach(p => {
    const mesh = createWizardMesh(p.equippedRobe || 'robe_default', p.equippedSpell || 'spell_default');
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    playerMeshes[p.id] = mesh;
  });

  const me  = players.find(p => p.id === myId);
  const opp = players.find(p => p.id !== myId);

  const titleItem = id => shopCatalog.find(i => i.id === id);

  if (me) {
    document.getElementById('hud-name-you').textContent = me.username;
    const t = titleItem(me.equippedTitle);
    document.getElementById('hud-title-you').textContent = t ? t.name : '';
  }
  if (opp) {
    document.getElementById('hud-name-opp').textContent = opp.username;
    const t = titleItem(opp.equippedTitle);
    document.getElementById('hud-title-opp').textContent = t ? t.name : '';
  }

  updateMyHP(100); updateOppHP(100);
  setupInputListeners();
  renderLoop();
}

function updateGameState(state) {
  Object.entries(state.players).forEach(([id, p]) => {
    if (!playerMeshes[id]) return;
    playerMeshes[id].position.set(p.x, 0, p.z);
    playerMeshes[id].rotation.y = p.rotY;
    playerMeshes[id].visible = p.alive;
  });

  const serverIds = new Set(state.projectiles.map(p => p.id));
  Object.keys(projMeshes).forEach(id => {
    if (!serverIds.has(id)) { scene.remove(projMeshes[id]); delete projMeshes[id]; }
  });
  state.projectiles.forEach(proj => {
    if (!projMeshes[proj.id]) {
      const owner = state.players[proj.ownerId];
      const spellItemId = owner ? (owner.equippedSpell || 'spell_default') : 'spell_default';
      const mesh = createProjectileMesh(proj.spellKey, spellItemId);
      scene.add(mesh);
      projMeshes[proj.id] = mesh;
    }
    projMeshes[proj.id].position.set(proj.x, proj.y, proj.z);
    if (proj.spellKey === 'iceshard') { projMeshes[proj.id].rotation.x += 0.3; projMeshes[proj.id].rotation.z += 0.2; }
  });

  if (myId && state.players[myId]) {
    const me = state.players[myId];
    updateCamera(me.x, me.z, me.rotY);
  }
}

function updateCamera(px, pz, rotY) {
  const camX = px + Math.sin(rotY) * CAMERA_DIST;
  const camZ = pz + Math.cos(rotY) * CAMERA_DIST;
  camera.position.set(camX, CAMERA_HEIGHT, camZ);
  camera.lookAt(px, 1.5, pz);
}

function updateMyHP(hp) {
  const pct = Math.max(0, hp) / 100;
  document.getElementById('hud-hp-you').style.width = (pct*100)+'%';
  document.getElementById('hud-hp-text-you').textContent = Math.max(0,hp)+' HP';
  const bar = document.getElementById('hud-hp-you');
  bar.style.background = pct > 0.5 ? 'linear-gradient(90deg,#22cc44,#44ff66)' : pct > 0.25 ? 'linear-gradient(90deg,#cc8800,#ffaa00)' : 'linear-gradient(90deg,#cc2200,#ff4400)';
}

function updateOppHP(hp) {
  const pct = Math.max(0, hp) / 100;
  document.getElementById('hud-hp-opp').style.width = (pct*100)+'%';
  document.getElementById('hud-hp-text-opp').textContent = Math.max(0,hp)+' HP';
}

function flashHit() {
  const el = document.getElementById('hit-flash');
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

function showStun() {
  const el = document.getElementById('stun-indicator');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 900);
}

function triggerCooldownUI(spellKey) {
  const slotId = SPELL_SLOT_IDS[spellKey];
  const slot = document.getElementById(slotId);
  if (!slot) return;
  slot.classList.add('on-cooldown');
  const duration = COOLDOWNS[spellKey];
  const overlay = document.getElementById('cd-' + spellKey);
  const start = Date.now();
  const tick = () => {
    const pct = Math.min(1, (Date.now()-start)/duration);
    overlay.style.transform = `scaleY(${1-pct})`;
    if (pct < 1) requestAnimationFrame(tick);
    else { slot.classList.remove('on-cooldown'); overlay.style.transform = 'scaleY(0)'; }
  };
  requestAnimationFrame(tick);
}

// ── Input ────────────────────────────────────────────
function setupInputListeners() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.getElementById('game-canvas').addEventListener('click', () => document.getElementById('game-canvas').requestPointerLock());
  document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === document.getElementById('game-canvas'); });
  document.addEventListener('mousemove', onMouseMove);
  if (inputInterval) clearInterval(inputInterval);
  inputInterval = setInterval(sendInput, 50);
}

function removeInputListeners() {
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);
  document.removeEventListener('mousemove', onMouseMove);
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
}

function onMouseMove(e) { if (pointerLocked) mouseX += e.movementX * 0.003; }

function onKeyDown(e) {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); if (gameRunning) toggleEmoteWheel(); return; }
  if (e.code === 'Escape') { hideEmoteWheel(); return; }
  const spell = SPELL_KEYS[e.code];
  if (spell && gameRunning) {
    const now = Date.now();
    if (!cooldownTimers[spell] || cooldownTimers[spell] <= now) {
      socket.emit('castSpell', { spellKey: spell });
      cooldownTimers[spell] = now + COOLDOWNS[spell];
      triggerCooldownUI(spell);
    }
  }
}

function onKeyUp(e) { keys[e.code] = false; }

function sendInput() {
  if (!socket || !gameRunning) return;
  let dx = 0, dz = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dz -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dz += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
  const angle = mouseX;
  const rdx =  dx * Math.cos(angle) + dz * Math.sin(angle);
  const rdz = -dx * Math.sin(angle) + dz * Math.cos(angle);
  socket.emit('playerInput', { dx: rdx, dz: rdz, rotY: mouseX });
}

function renderLoop() {
  animFrameId = requestAnimationFrame(renderLoop);
  // Animate emotes
  tickEmotes();
  renderer.render(scene, camera);
  // Stop loop only after gameover screen is fully shown and stable
  if (!gameRunning && gameOverFrames !== null) {
    gameOverFrames--;
    if (gameOverFrames <= 0) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
      gameOverFrames = null;
    }
  }
}

let gameOverFrames = null;

function onResize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// ── Game over ────────────────────────────────────────
function endGame(iWon, winnerName, disconnected, coinsEarned, quitterName) {
  gameRunning = false;
  removeInputListeners();
  hideReportModal();
  hideEmoteWheel();

  // Keep rendering 120 more frames so the 3D scene stays visible under the overlay
  gameOverFrames = 120;

  const isDraw = iWon === null;

  document.getElementById('gameover-icon').textContent  = isDraw ? '🤝' : iWon ? '🏆' : '💀';
  document.getElementById('gameover-title').textContent = isDraw ? 'DRAW' : iWon ? 'YOU WIN!' : 'DEFEATED!';

  let sub;
  if (isDraw) sub = quitterName ? `${quitterName} quit the match.` : 'The match ended in a draw.';
  else if (disconnected) sub = 'Opponent disconnected — Victory!';
  else if (iWon) sub = `You defeated ${winnerName}!`;
  else sub = `${winnerName} wins this round.`;

  document.getElementById('gameover-sub').textContent = sub;
  document.getElementById('gameover-coins').textContent = coinsEarned > 0 ? `+🪙 ${coinsEarned} coins earned!` : '';

  // Show gameover screen ON TOP of game screen (don't hide game screen)
  document.getElementById('screen-gameover').style.display = 'flex';
  document.getElementById('screen-gameover').classList.add('active');
}

// ══════════════════════════════════════════════════════
//  API HELPER
// ══════════════════════════════════════════════════════
// ── Quit match ───────────────────────────────────────
function quitMatch() {
  if (!socket || !gameRunning) return;
  if (!confirm('Are you sure you want to quit? The match will end as a draw.')) return;
  socket.emit('quitMatch');
}

// ── Report player ────────────────────────────────────
function showReportModal() {
  document.getElementById('report-modal').classList.remove('hidden');
  // Fill in opponent name
  const oppName = document.getElementById('hud-name-opp').textContent;
  document.getElementById('report-target-name').textContent = oppName;
  document.getElementById('report-username-hidden').value = oppName;
}

function hideReportModal() {
  const modal = document.getElementById('report-modal');
  if (modal) modal.classList.add('hidden');
}

function submitReport() {
  const reason = document.getElementById('report-reason').value;
  const details = document.getElementById('report-details').value.trim();
  const reported = document.getElementById('report-username-hidden').value;
  if (!reason) { alert('Please select a reason.'); return; }
  socket.emit('reportPlayer', { reportedUsername: reported, reason, details });
  hideReportModal();
}

function showReportConfirmation(message) {
  const el = document.getElementById('report-confirmation');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ═══════════════════════════════════════════════════
//  EMOTE SYSTEM
// ═══════════════════════════════════════════════════
const EMOTE_DEFS = {
  wave:  { emoji: '👋', label: 'Wave',   color: 0x44ddff, particles: 'sparkle', bounce: 'wave'  },
  laugh: { emoji: '😂', label: 'Laugh',  color: 0xffee44, particles: 'burst',   bounce: 'shake' },
  gg:    { emoji: '🤝', label: 'GG',     color: 0x44ff88, particles: 'hearts',  bounce: 'nod'   },
  flex:  { emoji: '💪', label: 'Flex',   color: 0xff8844, particles: 'burst',   bounce: 'flex'  },
  angry: { emoji: '😤', label: 'Angry',  color: 0xff3333, particles: 'smoke',   bounce: 'shake' },
  dance: { emoji: '🕺', label: 'Dance',  color: 0xcc44ff, particles: 'music',   bounce: 'dance' },
  think: { emoji: '🤔', label: 'Think',  color: 0xaaaaff, particles: 'dots',    bounce: 'nod'   },
  fire:  { emoji: '🔥', label: 'Hype',   color: 0xff6600, particles: 'fire',    bounce: 'dance' },
};

// Active 3D emote particles
const activeEmoteParticles = [];
// Active canvas overlays (floating emoji)
const activeFloatingEmojis = [];
// Wizard bounce animations
const wizardAnims = {}; // playerId -> { type, startTime, duration }

let emoteWheelVisible = false;

function toggleEmoteWheel() {
  emoteWheelVisible = !emoteWheelVisible;
  document.getElementById('emote-wheel').classList.toggle('hidden', !emoteWheelVisible);
}

function hideEmoteWheel() {
  emoteWheelVisible = false;
  const el = document.getElementById('emote-wheel');
  if (el) el.classList.add('hidden');
}

function sendEmote(emoteKey) {
  if (!socket || !gameRunning) return;
  hideEmoteWheel();
  socket.emit('emote', { emoteKey });
}

function playEmote(emoteKey, fromId) {
  const def = EMOTE_DEFS[emoteKey];
  if (!def) return;
  const mesh = playerMeshes[fromId];
  if (!mesh) return;

  // 1. Start wizard bounce animation
  wizardAnims[fromId] = { type: def.bounce, startTime: Date.now(), duration: 1800 };

  // 2. Spawn 3D particles above wizard
  spawnEmoteParticles(mesh.position, def);

  // 3. Show floating emoji in screen space
  showFloatingEmoji(def.emoji, mesh.position);
}

// ── 3D Particle burst ────────────────────────────────
function spawnEmoteParticles(worldPos, def) {
  const count = def.particles === 'burst' ? 14 : def.particles === 'hearts' ? 8 : def.particles === 'music' ? 6 : 10;

  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.12;
    let geo, color;

    if (def.particles === 'hearts') {
      geo = new THREE.SphereGeometry(size, 6, 6);
      color = 0xff4488;
    } else if (def.particles === 'fire') {
      geo = new THREE.SphereGeometry(size * 1.4, 6, 6);
      color = [0xff6600, 0xff3300, 0xffaa00][i % 3];
    } else if (def.particles === 'music') {
      geo = new THREE.BoxGeometry(size, size * 2, size);
      color = def.color;
    } else if (def.particles === 'smoke') {
      geo = new THREE.SphereGeometry(size * 1.5, 5, 5);
      color = 0x888888;
    } else {
      geo = new THREE.OctahedronGeometry(size);
      color = def.color;
    }

    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);

    // Start just above wizard head
    mesh.position.set(
      worldPos.x + (Math.random() - 0.5) * 0.8,
      worldPos.y + 2.4 + Math.random() * 0.4,
      worldPos.z + (Math.random() - 0.5) * 0.8
    );

    const angle = (i / count) * Math.PI * 2;
    const speed = 0.025 + Math.random() * 0.03;
    mesh.userData = {
      vx: Math.cos(angle) * speed,
      vy: 0.04 + Math.random() * 0.04,
      vz: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.018 + Math.random() * 0.012,
      spin: (Math.random() - 0.5) * 0.15
    };

    scene.add(mesh);
    activeEmoteParticles.push(mesh);
  }

  // Point light flash
  const flash = new THREE.PointLight(def.color, 3, 8);
  flash.position.set(worldPos.x, worldPos.y + 2.5, worldPos.z);
  scene.add(flash);
  let flashLife = 1.0;
  const fadeFlash = () => {
    flashLife -= 0.05;
    flash.intensity = flashLife * 3;
    if (flashLife > 0) requestAnimationFrame(fadeFlash);
    else scene.remove(flash);
  };
  requestAnimationFrame(fadeFlash);
}

// ── Floating emoji overlay ────────────────────────────
function showFloatingEmoji(emoji, worldPos) {
  const canvas = document.getElementById('game-canvas');
  const div = document.createElement('div');
  div.className = 'floating-emoji';
  div.textContent = emoji;
  div.style.position = 'fixed';
  div.style.pointerEvents = 'none';
  div.style.zIndex = '50';
  div.style.fontSize = '2.4rem';
  div.style.filter = 'drop-shadow(0 0 8px rgba(255,255,255,0.8))';
  div.style.transition = 'none';
  document.body.appendChild(div);

  const startTime = Date.now();
  const duration  = 2000;
  // Store world position to project each frame
  div._worldPos = { x: worldPos.x, y: worldPos.y + 3.2, z: worldPos.z };

  const animate = () => {
    const elapsed = Date.now() - startTime;
    const t = elapsed / duration;
    if (t >= 1) { div.remove(); return; }

    // Project world pos to screen
    const vec = new THREE.Vector3(div._worldPos.x, div._worldPos.y + t * 1.5, div._worldPos.z);
    vec.project(camera);
    const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;

    div.style.left = (x - 20) + 'px';
    div.style.top  = (y - 20) + 'px';
    div.style.opacity = t < 0.2 ? t / 0.2 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    div.style.transform = `scale(${1 + Math.sin(t * Math.PI) * 0.4})`;
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

// ── Tick emotes each frame ───────────────────────────
function tickEmotes() {
  // Update particles
  for (let i = activeEmoteParticles.length - 1; i >= 0; i--) {
    const p = activeEmoteParticles[i];
    const d = p.userData;
    p.position.x += d.vx;
    p.position.y += d.vy;
    p.position.z += d.vz;
    d.vy -= 0.002; // gravity
    d.vx *= 0.97;
    d.vz *= 0.97;
    p.rotation.x += d.spin;
    p.rotation.z += d.spin * 0.7;
    d.life -= d.decay;
    p.material.opacity = Math.max(0, d.life);
    if (d.life <= 0) {
      scene.remove(p);
      activeEmoteParticles.splice(i, 1);
    }
  }

  // Update wizard bounce animations
  const now = Date.now();
  for (const [playerId, anim] of Object.entries(wizardAnims)) {
    const mesh = playerMeshes[playerId];
    if (!mesh) { delete wizardAnims[playerId]; continue; }
    const t = (now - anim.startTime) / anim.duration;
    if (t >= 1) { mesh.position.y = 0; delete wizardAnims[playerId]; continue; }

    const phase = t * Math.PI * 2;
    switch (anim.type) {
      case 'wave':
        mesh.rotation.z = Math.sin(phase * 2) * 0.25;
        mesh.position.y = Math.abs(Math.sin(phase)) * 0.3;
        break;
      case 'shake':
        mesh.position.x += Math.sin(phase * 8) * 0.04;
        mesh.rotation.z = Math.sin(phase * 8) * 0.15;
        break;
      case 'nod':
        mesh.rotation.x = Math.sin(phase * 3) * 0.2;
        mesh.position.y = Math.abs(Math.sin(phase * 1.5)) * 0.15;
        break;
      case 'flex':
        mesh.position.y = Math.abs(Math.sin(phase * 2)) * 0.5;
        mesh.rotation.z = Math.sin(phase) * 0.3;
        mesh.scale.set(1 + Math.abs(Math.sin(phase)) * 0.15, 1 + Math.abs(Math.sin(phase)) * 0.1, 1);
        break;
      case 'dance':
        mesh.position.y = Math.abs(Math.sin(phase * 3)) * 0.4;
        mesh.rotation.y += 0.08;
        mesh.position.x += Math.sin(phase * 4) * 0.05;
        break;
    }
  }

  // Clean scale after flex
  for (const [playerId] of Object.entries(playerMeshes)) {
    if (!wizardAnims[playerId]) {
      playerMeshes[playerId].scale.set(1, 1, 1);
      playerMeshes[playerId].rotation.x = 0;
      playerMeshes[playerId].rotation.z = 0;
    }
  }
}

function clearEmotes() {
  activeEmoteParticles.forEach(p => scene && scene.remove(p));
  activeEmoteParticles.length = 0;
  for (const key in wizardAnims) delete wizardAnims[key];
}

async function apiFetch(url, method, body) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken }
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) {
      const msgEl = document.getElementById('friend-msg');
      if (msgEl) { msgEl.textContent = data.error || 'Error.'; msgEl.className = 'friend-msg error'; msgEl.classList.remove('hidden'); }
      return null;
    }
    return data;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  spawnParticles('particles');

  // Auth screen
  document.getElementById('btn-auth-submit').addEventListener('click', doAuth);
  document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Play button → queue
  document.getElementById('btn-play-game').addEventListener('click', joinQueue);
  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    if (socket) socket.emit('leaveQueue');
    enterMainMenu();
  });

  // In-game buttons
  document.getElementById('btn-quit-match').addEventListener('click', quitMatch);
  document.getElementById('btn-report-player').addEventListener('click', showReportModal);
  document.getElementById('btn-report-submit').addEventListener('click', submitReport);
  document.getElementById('btn-report-cancel').addEventListener('click', hideReportModal);
  document.getElementById('btn-emote-toggle').addEventListener('click', toggleEmoteWheel);

  // Friends
  document.getElementById('btn-send-request').addEventListener('click', sendFriendRequest);
  document.getElementById('friend-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendFriendRequest(); });

  // Invite toast
  document.getElementById('btn-accept-invite').addEventListener('click', () => {
    if (!pendingInviteFrom) return;
    socket.emit('acceptInvite', { fromUsername: pendingInviteFrom });
    document.getElementById('invite-toast').classList.add('hidden');
    showScreen('screen-lobby');
    document.getElementById('lobby-msg').textContent = 'Connecting to match...';
    pendingInviteFrom = null;
  });
  document.getElementById('btn-decline-invite').addEventListener('click', () => {
    if (pendingInviteFrom) socket.emit('declineInvite', { fromUsername: pendingInviteFrom });
    document.getElementById('invite-toast').classList.add('hidden');
    pendingInviteFrom = null;
  });

  // Game over buttons
  document.getElementById('btn-play-again').addEventListener('click', () => {
    document.getElementById('screen-gameover').classList.remove('active');
    document.getElementById('screen-gameover').style.display = '';
    document.getElementById('screen-game').classList.remove('active');
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    gameOverFrames = null;
    if (renderer) {
      Object.values(playerMeshes).forEach(m => scene.remove(m));
      Object.values(projMeshes).forEach(m => scene.remove(m));
      playerMeshes = {}; projMeshes = {};
    }
    clearEmotes();
    joinQueue();
  });
  document.getElementById('btn-gameover-menu').addEventListener('click', () => {
    document.getElementById('screen-gameover').classList.remove('active');
    document.getElementById('screen-gameover').style.display = '';
    document.getElementById('screen-game').classList.remove('active');
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    gameOverFrames = null;
    if (renderer) {
      Object.values(playerMeshes).forEach(m => scene.remove(m));
      Object.values(projMeshes).forEach(m => scene.remove(m));
      playerMeshes = {}; projMeshes = {};
    }
    clearEmotes();
    enterMainMenu();
  });

  // Try auto-login from saved token
  const loggedIn = await tryAutoLogin();
  if (!loggedIn) showScreen('screen-splash');
});
