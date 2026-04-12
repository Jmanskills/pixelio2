// ═══════════════════════════════════════════════════════════
//  WIZARD DUEL — CLIENT
// ═══════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────
let socket = null;
let myId = null;
let myUsername = null;
let authToken = null;
let gameRunning = false;
let gameState = null;
let currentTab = 'login';

const cooldownTimers = { fireball: 0, iceshard: 0, thunder: 0, shield: 0 };
const COOLDOWNS = { fireball: 2000, iceshard: 800, thunder: 1400, shield: 8000 };
const SPELL_KEYS = { KeyQ: 'fireball', KeyE: 'iceshard', KeyR: 'thunder', KeyF: 'shield' };

// ── Screen helpers ─────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-error').classList.add('hidden');
}

// ── Menu particles ─────────────────────────────────────────
function spawnParticles() {
  const container = document.getElementById('particles');
  const colors = ['#9b30e8', '#f0c040', '#00e5cc', '#4488ff', '#ff6644'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 2;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      bottom:${Math.random()*20}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${Math.random()*8+6}s;
      animation-delay:${Math.random()*8}s;
    `;
    container.appendChild(p);
  }
}

// ── Auth ───────────────────────────────────────────────────
async function doAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');

  if (!username || !password) {
    errEl.textContent = 'Please enter username and password.';
    errEl.classList.remove('hidden');
    return;
  }

  const endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Authentication failed.';
      errEl.classList.remove('hidden');
      return;
    }
    authToken = data.token;
    myUsername = data.username;
    joinLobby();
  } catch (e) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.remove('hidden');
  }
}

// ── Lobby / Socket ─────────────────────────────────────────
function joinLobby() {
  document.getElementById('lobby-username').textContent = myUsername;
  showScreen('screen-lobby');

  if (socket) socket.disconnect();
  socket = io();

  socket.on('connect', () => {
    socket.emit('joinQueue', { username: myUsername, token: authToken });
    document.getElementById('lobby-msg').textContent = 'Searching for an opponent...';
  });

  socket.on('waiting', ({ message }) => {
    document.getElementById('lobby-msg').textContent = message;
  });

  socket.on('yourId', (id) => { myId = id; });

  socket.on('matchFound', ({ players }) => {
    startGame(players);
  });

  socket.on('gameState', (state) => {
    if (gameRunning) updateGameState(state);
  });

  socket.on('playerHit', ({ playerId, hp, damage, spellKey, stunned }) => {
    if (playerId === myId) {
      flashHit();
      updateMyHP(hp);
      if (stunned) showStun();
    } else {
      updateOppHP(hp);
    }
  });

  socket.on('shieldActivated', ({ playerId }) => {
    if (playerMeshes[playerId]) {
      setShieldVisible(playerId, true);
    }
  });

  socket.on('shieldExpired', ({ playerId }) => {
    setShieldVisible(playerId, false);
  });

  socket.on('shieldBlocked', ({ playerId }) => {
    showFloatingText('Blocked!', playerMeshes[playerId]);
  });

  socket.on('gameOver', ({ winnerId, winnerName }) => {
    endGame(winnerId === myId, winnerName);
  });

  socket.on('opponentDisconnected', () => {
    endGame(true, myUsername, true);
  });
}

// ═══════════════════════════════════════════════════════════
//  THREE.JS RENDERING
// ═══════════════════════════════════════════════════════════
let renderer, scene, camera;
let playerMeshes = {};     // id -> { body, shield }
let projMeshes = {};       // id -> mesh
let groundMesh, skyMesh;
let animFrameId;

// Camera follow
let cameraAngleX = 0.4;
let cameraAngleY = 0;
const CAMERA_DIST = 14;
const CAMERA_HEIGHT = 6;

// Input state
const keys = {};
let mouseX = 0, mouseY = 0;
let pointerLocked = false;

function initThree() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  // Ground — mossy stone courtyard
  const groundGeo = new THREE.PlaneGeometry(80, 80, 20, 20);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x2d4a2d });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Stone path circle
  const pathGeo = new THREE.CircleGeometry(12, 48);
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x5a5058 });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  scene.add(path);

  // Arena boundary wall segments (low stone walls)
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a6868 });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const wallGeo = new THREE.BoxGeometry(3, 1.2, 0.5);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(Math.cos(angle) * 13, 0.6, Math.sin(angle) * 13);
    wall.rotation.y = angle + Math.PI / 2;
    wall.castShadow = true;
    scene.add(wall);
  }

  // Central fountain / obelisk
  const obeliskGeo = new THREE.CylinderGeometry(0.2, 0.4, 3, 6);
  const obeliskMat = new THREE.MeshLambertMaterial({ color: 0x886688 });
  const obelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
  obelisk.position.set(0, 1.5, 0);
  obelisk.castShadow = true;
  scene.add(obelisk);

  // Glowing crystal on top of obelisk
  const crystalGeo = new THREE.OctahedronGeometry(0.4);
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x9b30e8 });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.position.set(0, 3.4, 0);
  scene.add(crystal);

  // Crystal point light
  const crystalLight = new THREE.PointLight(0x9b30e8, 1.5, 12);
  crystalLight.position.set(0, 3.5, 0);
  scene.add(crystalLight);

  // Animate crystal
  (function animateCrystal() {
    const t = Date.now() * 0.001;
    crystal.rotation.y = t;
    crystal.position.y = 3.4 + Math.sin(t * 2) * 0.08;
    crystalLight.intensity = 1.2 + Math.sin(t * 3) * 0.3;
    requestAnimationFrame(animateCrystal);
  })();
}

function addTrees() {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
  const leafMat  = new THREE.MeshLambertMaterial({ color: 0x1a5c2a });

  const positions = [
    [-18, -18], [18, -18], [-18, 18], [18, 18],
    [0, -22], [0, 22], [-22, 0], [22, 0],
    [-14, -24], [14, -24], [-24, 14], [24, -14]
  ];

  positions.forEach(([x, z]) => {
    const height = 4 + Math.random() * 3;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, height, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, height / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    for (let i = 0; i < 3; i++) {
      const r = 1.5 - i * 0.3;
      const leafGeo = new THREE.ConeGeometry(r + 0.5, 2, 7);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(x, height - 0.5 + i * 1.4, z);
      leaf.castShadow = true;
      scene.add(leaf);
    }
  });
}

function addLights() {
  scene.add(new THREE.AmbientLight(0x334466, 0.8));

  const moon = new THREE.DirectionalLight(0x8899bb, 0.6);
  moon.position.set(10, 20, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.width = 1024;
  moon.shadow.mapSize.height = 1024;
  scene.add(moon);

  // Rim lights for drama
  const rimL = new THREE.PointLight(0x4400aa, 0.8, 40);
  rimL.position.set(-15, 8, -15);
  scene.add(rimL);

  const rimR = new THREE.PointLight(0x004488, 0.8, 40);
  rimR.position.set(15, 8, 15);
  scene.add(rimR);
}

function addSkybox() {
  // Simple gradient sky using a large sphere
  const skyGeo = new THREE.SphereGeometry(100, 16, 8);
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x050312,
    side: THREE.BackSide
  });
  skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  for (let i = 0; i < 800; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 90;
    starVerts.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 });
  scene.add(new THREE.Points(starGeo, starMat));
}

// ── Wizard mesh ──────────────────────────────────────────────
function createWizardMesh(color) {
  const group = new THREE.Group();

  // Robe body
  const robeGeo = new THREE.CylinderGeometry(0.3, 0.6, 1.6, 8);
  const robeMat = new THREE.MeshLambertMaterial({ color });
  const robe = new THREE.Mesh(robeGeo, robeMat);
  robe.position.y = 0.8;
  robe.castShadow = true;
  group.add(robe);

  // Head
  const headGeo = new THREE.SphereGeometry(0.28, 8, 8);
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf5d5a0 });
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);

  // Hat brim
  const brimGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12);
  const hatMat  = new THREE.MeshLambertMaterial({ color: 0x111122 });
  const brim = new THREE.Mesh(brimGeo, hatMat);
  brim.position.y = 2.1;
  group.add(brim);

  // Hat cone
  const coneGeo = new THREE.ConeGeometry(0.3, 0.7, 12);
  const cone = new THREE.Mesh(coneGeo, hatMat);
  cone.position.y = 2.55;
  group.add(cone);

  // Staff
  const staffGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6);
  const staffMat = new THREE.MeshLambertMaterial({ color: 0x8b5e3c });
  const staff = new THREE.Mesh(staffGeo, staffMat);
  staff.position.set(0.55, 1.1, 0);
  staff.rotation.z = 0.1;
  group.add(staff);

  // Staff crystal
  const staffCrystalGeo = new THREE.OctahedronGeometry(0.15);
  const staffCrystalMat = new THREE.MeshBasicMaterial({ color });
  const staffCrystal = new THREE.Mesh(staffCrystalGeo, staffCrystalMat);
  staffCrystal.position.set(0.65, 2.25, 0);
  group.add(staffCrystal);

  // Shield bubble (hidden by default)
  const shieldGeo = new THREE.SphereGeometry(1.1, 16, 16);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88, transparent: true, opacity: 0.25, side: THREE.DoubleSide
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.position.y = 1.0;
  shield.visible = false;
  group.add(shield);

  // Name label is handled via HUD, not 3D text

  group.userData.shield = shield;
  group.userData.staffCrystal = staffCrystal;

  return group;
}

function setShieldVisible(playerId, visible) {
  const mesh = playerMeshes[playerId];
  if (mesh && mesh.userData.shield) {
    mesh.userData.shield.visible = visible;
  }
}

// ── Projectile mesh ─────────────────────────────────────────
const PROJ_COLORS = {
  fireball:  0xff4400,
  iceshard:  0x88ddff,
  thunder:   0xffee00,
};

function createProjectileMesh(spellKey) {
  const color = PROJ_COLORS[spellKey] || 0xffffff;
  const geo = spellKey === 'iceshard'
    ? new THREE.OctahedronGeometry(0.2)
    : new THREE.SphereGeometry(0.25, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);

  // Glow point light
  const light = new THREE.PointLight(color, 1.5, 4);
  mesh.add(light);

  return mesh;
}

// ── Game start ──────────────────────────────────────────────
function startGame(players) {
  showScreen('screen-game');
  gameRunning = true;
  gameState = null;

  // Reset old meshes
  Object.values(playerMeshes).forEach(m => scene.remove(m));
  Object.values(projMeshes).forEach(m => scene.remove(m));
  playerMeshes = {};
  projMeshes = {};

  if (!renderer) initThree();

  // Create wizard meshes
  players.forEach(p => {
    const isMe = p.id === myId;
    const color = isMe ? 0x9b30e8 : 0xe83030;
    const mesh = createWizardMesh(color);
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    playerMeshes[p.id] = mesh;
  });

  // HUD names
  const me = players.find(p => p.id === myId);
  const opp = players.find(p => p.id !== myId);
  if (me)  document.getElementById('hud-name-you').textContent = me.username;
  if (opp) document.getElementById('hud-name-opp').textContent = opp.username;
  updateMyHP(100);
  updateOppHP(100);

  setupInputListeners();
  renderLoop();
}

// ── Update from server ──────────────────────────────────────
function updateGameState(state) {
  gameState = state;

  // Update player meshes
  Object.entries(state.players).forEach(([id, p]) => {
    if (!playerMeshes[id]) return;
    const mesh = playerMeshes[id];
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.rotY;
    mesh.visible = p.alive;
  });

  // Projectiles — add/remove
  const serverProjIds = new Set(state.projectiles.map(p => p.id));

  // Remove stale
  Object.keys(projMeshes).forEach(id => {
    if (!serverProjIds.has(id)) {
      scene.remove(projMeshes[id]);
      delete projMeshes[id];
    }
  });

  // Add/update
  state.projectiles.forEach(proj => {
    if (!projMeshes[proj.id]) {
      const mesh = createProjectileMesh(proj.spellKey);
      scene.add(mesh);
      projMeshes[proj.id] = mesh;
    }
    projMeshes[proj.id].position.set(proj.x, proj.y, proj.z);
    if (proj.spellKey === 'iceshard') {
      projMeshes[proj.id].rotation.x += 0.3;
      projMeshes[proj.id].rotation.z += 0.2;
    }
  });

  // Update camera to follow me
  if (myId && state.players[myId]) {
    const me = state.players[myId];
    updateCamera(me.x, me.z, me.rotY);
  }
}

function updateCamera(px, pz, rotY) {
  const camX = px - Math.sin(rotY) * CAMERA_DIST;
  const camZ = pz - Math.cos(rotY) * CAMERA_DIST;
  camera.position.set(camX, CAMERA_HEIGHT, camZ);
  camera.lookAt(px, 1.5, pz);
}

// ── HP / HUD updates ────────────────────────────────────────
function updateMyHP(hp) {
  const pct = Math.max(0, hp) / 100;
  document.getElementById('hud-hp-you').style.width = (pct * 100) + '%';
  document.getElementById('hud-hp-text-you').textContent = Math.max(0, hp) + ' HP';
  const bar = document.getElementById('hud-hp-you');
  bar.style.background = pct > 0.5
    ? 'linear-gradient(90deg,#22cc44,#44ff66)'
    : pct > 0.25
      ? 'linear-gradient(90deg,#cc8800,#ffaa00)'
      : 'linear-gradient(90deg,#cc2200,#ff4400)';
}

function updateOppHP(hp) {
  const pct = Math.max(0, hp) / 100;
  document.getElementById('hud-hp-opp').style.width = (pct * 100) + '%';
  document.getElementById('hud-hp-text-opp').textContent = Math.max(0, hp) + ' HP';
}

// ── Hit flash ───────────────────────────────────────────────
function flashHit() {
  const el = document.getElementById('hit-flash');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ── Stun indicator ──────────────────────────────────────────
function showStun() {
  const el = document.getElementById('stun-indicator');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 900);
}

// ── Cooldown UI ─────────────────────────────────────────────
const SPELL_SLOT_IDS = { fireball: 'spell-1', iceshard: 'spell-2', thunder: 'spell-3', shield: 'spell-4' };

function triggerCooldownUI(spellKey) {
  const slotId = SPELL_SLOT_IDS[spellKey];
  const slot = document.getElementById(slotId);
  if (!slot) return;

  slot.classList.add('on-cooldown');
  const duration = COOLDOWNS[spellKey];
  const overlay = document.getElementById('cd-' + spellKey);
  const start = Date.now();

  const tick = () => {
    const elapsed = Date.now() - start;
    const pct = Math.min(1, elapsed / duration);
    overlay.style.transform = `scaleY(${1 - pct})`;
    if (pct < 1) {
      requestAnimationFrame(tick);
    } else {
      slot.classList.remove('on-cooldown');
      overlay.style.transform = 'scaleY(0)';
    }
  };
  requestAnimationFrame(tick);
}

// ── Input ───────────────────────────────────────────────────
let inputInterval = null;

function setupInputListeners() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);
  document.getElementById('game-canvas').addEventListener('click', requestPointerLock);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);

  // Send input to server at 20hz
  if (inputInterval) clearInterval(inputInterval);
  inputInterval = setInterval(sendInput, 50);
}

function removeInputListeners() {
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup',   onKeyUp);
  document.removeEventListener('pointerlockchange', onPointerLockChange);
  document.removeEventListener('mousemove', onMouseMove);
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
}

function requestPointerLock() {
  document.getElementById('game-canvas').requestPointerLock();
}

function onPointerLockChange() {
  pointerLocked = document.pointerLockElement === document.getElementById('game-canvas');
}

function onMouseMove(e) {
  if (!pointerLocked) return;
  mouseX += e.movementX * 0.003;
}

function onKeyDown(e) {
  keys[e.code] = true;
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

  // Rotate movement relative to camera facing
  const angle = mouseX;
  const rdx = dx * Math.cos(angle) - dz * Math.sin(angle);
  const rdz = dx * Math.sin(angle) + dz * Math.cos(angle);

  socket.emit('playerInput', { dx: rdx, dz: rdz, rotY: mouseX });
}

// ── Render loop ─────────────────────────────────────────────
function renderLoop() {
  if (!gameRunning) return;
  animFrameId = requestAnimationFrame(renderLoop);
  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// ── Game Over ───────────────────────────────────────────────
function endGame(iWon, winnerName, disconnected = false) {
  gameRunning = false;
  removeInputListeners();
  cancelAnimationFrame(animFrameId);

  document.getElementById('gameover-icon').textContent  = iWon ? '🏆' : '💀';
  document.getElementById('gameover-title').textContent = iWon ? 'YOU WIN!' : 'DEFEATED!';

  let sub = '';
  if (disconnected) sub = 'Opponent disconnected — Victory by default!';
  else if (iWon)    sub = `You defeated ${winnerName}!`;
  else              sub = `${winnerName} wins this round.`;

  document.getElementById('gameover-sub').textContent = sub;
  showScreen('screen-gameover');
}

// ─── Floating text (unused but available) ──────────────────
function showFloatingText(text, mesh) {
  // Could use a 2D canvas overlay — kept simple for now
  console.log(`[Effect] ${text}`);
}

// ═══════════════════════════════════════════════════════════
//  BUTTON BINDINGS
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  spawnParticles();

  document.getElementById('btn-start-game').addEventListener('click', () => {
    showScreen('screen-auth');
  });

  document.getElementById('btn-back-menu').addEventListener('click', () => {
    showScreen('screen-menu');
  });

  document.getElementById('btn-auth-submit').addEventListener('click', doAuth);

  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doAuth();
  });

  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    if (socket) socket.disconnect();
    showScreen('screen-menu');
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    // Clean up scene
    if (renderer) {
      Object.values(playerMeshes).forEach(m => scene.remove(m));
      Object.values(projMeshes).forEach(m => scene.remove(m));
      playerMeshes = {};
      projMeshes = {};
    }
    joinLobby();
  });

  document.getElementById('btn-gameover-menu').addEventListener('click', () => {
    if (socket) socket.disconnect();
    showScreen('screen-menu');
  });
});
