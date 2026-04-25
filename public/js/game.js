// ═══════════════════════════════════════════════════
//  PIXELIO — CLIENT  (complete rewrite)
// ═══════════════════════════════════════════════════

// ── State ────────────────────────────────────────────
let socket = null, myId = null, profile = null, authToken = null;
let shopCatalog = [], currentShopTab = 'skin', currentTab = 'login';
let pendingInviteFrom = null;
let onlineFriends = new Set();

const SKIN_COLORS = {
  skin_default:0x1a88ff, skin_crimson:0xcc1122, skin_ocean:0x0066cc,
  skin_forest:0x2a6e1a,  skin_gold:0xd4a017,   skin_shadow:0x1a1a2e, skin_rainbow:0xff44aa
};
const WEAPON_COLORS = {
  weapon_default:0x9b30e8, weapon_laser:0xff0088, weapon_freeze:0x88eeff,
  weapon_plasma:0x44ff44,  weapon_rocket:0xff6600, weapon_thunder:0xffee00
};
const WEAPON_COLORS_FX = WEAPON_COLORS; // alias

// ── Screens ───────────────────────────────────────────
function showScreen(id) {
  // Manage each screen explicitly
  const screens = ['screen-splash','screen-mainmenu','screen-lobby','screen-game'];
  screens.forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (sid === 'screen-game') {
      // NEVER use display:none — kills WebGL. Use visibility instead.
      const active = (sid === id);
      el.style.visibility = active ? 'visible' : 'hidden';
      el.style.pointerEvents = active ? 'all' : 'none';
      el.style.zIndex = active ? '12' : '9';
    } else {
      const active = (sid === id);
      el.style.display = active ? 'flex' : 'none';
      el.style.zIndex = active ? '15' : '';
    }
  });
  // Sync .active class for CSS that depends on it
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-login').classList.toggle('active', tab==='login');
  document.getElementById('tab-register').classList.toggle('active', tab==='register');
  document.getElementById('auth-error').classList.add('hidden');
}
function spawnParticles(containerId) {
  const container = document.getElementById(containerId); if(!container) return;
  const colors = ['#9b30e8','#f0c040','#00e5cc','#4488ff','#ff6644'];
  for(let i=0;i<40;i++){const p=document.createElement('div');p.className='particle';const size=Math.random()*6+2;p.style.cssText=`width:${size}px;height:${size}px;left:${Math.random()*100}%;bottom:${Math.random()*20}%;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${Math.random()*8+6}s;animation-delay:${Math.random()*8}s;`;container.appendChild(p);}
}

// ── Auth ──────────────────────────────────────────────
function openAuthModal(tab) {
  switchTab(tab || 'login');
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('auth-username').focus(), 100);
}
function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
}

function showSplashLoading() {
  const el = document.getElementById('splash-loading');
  if(el) el.style.display = 'flex';
}
function hideSplashLoading() {
  const el = document.getElementById('splash-loading');
  if(el) el.style.display = 'none';
}

async function tryAutoLogin() {
  const saved = localStorage.getItem('pixelio_token');
  if(!saved) return false;
  showSplashLoading();
  try {
    const res = await fetch('/api/auth/me', { headers:{ Authorization:'Bearer '+saved } });
    if(!res.ok) throw new Error('invalid');
    const data = await res.json();
    authToken = saved; profile = data.profile;
    await loadShopCatalog();
    enterMainMenu(); return true;
  } catch {
    localStorage.removeItem('pixelio_token');
    hideSplashLoading();
    return false;
  }
}

async function doAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error'); errEl.classList.add('hidden');
  if(!username||!password){errEl.textContent='Please enter username and password.';errEl.classList.remove('hidden');return;}
  const endpoint = currentTab==='login'?'/api/auth/login':'/api/auth/register';
  const btn = document.getElementById('btn-auth-submit');
  btn.disabled = true; btn.textContent = 'Loading...';
  try {
    const res = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const data = await res.json();
    if(!res.ok){errEl.textContent=data.error||'Authentication failed.';errEl.classList.remove('hidden');btn.disabled=false;btn.textContent='Play Now!';return;}
    authToken=data.token; profile=data.profile;
    localStorage.setItem('pixelio_token',authToken);
    closeAuthModal();
    await loadShopCatalog(); enterMainMenu();
  } catch {
    errEl.textContent='Network error. Try again.';errEl.classList.remove('hidden');
    btn.disabled=false; btn.textContent='Play Now!';
  }
}

function logout() {
  localStorage.removeItem('pixelio_token');
  authToken=null; profile=null; myId=null;
  if(socket){socket.disconnect();socket=null;}
  hideSplashLoading();
  showScreen('screen-splash');
  drawSplashPlayer();
}

// ── Main Menu ─────────────────────────────────────────
function enterMainMenu() {
  stopSplashAnimation();
  updateMenuUI();
  showScreen('screen-mainmenu');
  spawnParticles('menu-particles');
  renderPreviewCanvas();
  menuNav('play');
  connectSocket();
  loadFriends();
  loadNews();
  const adminBtn = document.getElementById('nav-admin');
  if(adminBtn) adminBtn.style.display = (profile&&profile.isAdmin)?'flex':'none';
}

function updateMenuUI() {
  if(!profile) return;
  document.getElementById('menu-username').textContent = profile.username;
  document.getElementById('menu-coins').textContent = '🪙 '+profile.coins;
  document.getElementById('shop-coins').textContent = profile.coins;
  document.getElementById('menu-wl').textContent = `${profile.wins}W / ${profile.losses}L`;
  document.getElementById('stat-wins').textContent = profile.wins;
  document.getElementById('stat-losses').textContent = profile.losses;
  const wr = profile.wins+profile.losses>0 ? Math.round(profile.wins/(profile.wins+profile.losses)*100)+'%' : '—';
  document.getElementById('stat-ratio').textContent = wr;
  const titleItem = shopCatalog.find(i=>i.id===profile.equippedTitle);
  document.getElementById('menu-title-badge').textContent = titleItem? titleItem.name : 'Player';
  document.getElementById('lobby-username').textContent = profile.username;
  const robeColor = hexToCSS(SKIN_COLORS[profile.equippedSkin]||0x6a0dad);
  const av = document.getElementById('avatar-skin');
  av.style.cssText=`background:${robeColor};display:flex;align-items:center;justify-content:center;font-size:1.4rem;`;
  av.textContent='🧙';
}

function hexToCSS(hex) { return '#'+hex.toString(16).padStart(6,'0'); }

function menuNav(tab) {
  document.querySelectorAll('.menu-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.menu-panel').forEach(p=>p.classList.remove('active'));
  const navBtn=document.getElementById('nav-'+tab); if(navBtn)navBtn.classList.add('active');
  const panel=document.getElementById('panel-'+tab); if(panel)panel.classList.add('active');
  if(tab==='shop')        renderShop();
  if(tab==='friends')     loadFriends();
  if(tab==='news')        loadNews();
  if(tab==='admin')       adminTab('users');
  if(tab==='profile')     loadProfilePanel();
  if(tab==='leaderboard') loadLeaderboard('wins');
  if(tab==='settings')    loadSettings();
  if(tab==='locker') {
    // Activate first tab button
    document.querySelectorAll('.locker-tab').forEach(t => t.classList.remove('active'));
    const firstTab = document.getElementById('ltab-skin');
    if (firstTab) firstTab.classList.add('active');
    currentLockerTab = 'skin';
    renderLocker('skin');
  }
}

// ── Preview Canvas ────────────────────────────────────
function renderPreviewCanvas() {
  const canvas=document.getElementById('preview-canvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d'); const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const robeHex=SKIN_COLORS[profile?profile.equippedSkin:'skin_default']||0x6a0dad;
  const c=hexToCSS(robeHex);
  const s=w/120;
  // Glow
  const grd=ctx.createRadialGradient(w/2,h*.6,5,w/2,h*.6,w*.55);
  grd.addColorStop(0,c+'44');grd.addColorStop(1,'transparent');
  ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
  // Shadow
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(w/2,h-12*s,26*s,7*s,0,0,Math.PI*2);ctx.fill();
  // Legs
  ctx.fillStyle='#334455';
  ctx.fillRect(w/2-14*s,h-50*s,11*s,38*s);
  ctx.fillRect(w/2+3*s,h-50*s,11*s,38*s);
  // Shoes
  ctx.fillStyle='#222';ctx.fillRect(w/2-15*s,h-16*s,14*s,7*s);ctx.fillRect(w/2+3*s,h-16*s,14*s,7*s);
  // Body
  ctx.fillStyle=c;ctx.fillRect(w/2-18*s,h-100*s,36*s,52*s);
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(w/2+2*s,h-100*s,16*s,52*s);
  // Arms
  ctx.fillStyle=c;ctx.fillRect(w/2-30*s,h-98*s,13*s,38*s);ctx.fillRect(w/2+17*s,h-98*s,13*s,38*s);
  // Gun
  ctx.fillStyle='#333';ctx.fillRect(w/2+30*s,h-72*s,22*s,9*s);
  ctx.fillStyle='#555';ctx.fillRect(w/2+47*s,h-70*s,14*s,5*s);
  // Neck+Head
  ctx.fillStyle='#f5c896';ctx.fillRect(w/2-5*s,h-110*s,10*s,13*s);
  ctx.fillRect(w/2-16*s,h-142*s,32*s,34*s);
  // Eyes
  ctx.fillStyle='#222';ctx.fillRect(w/2-10*s,h-133*s,6*s,6*s);ctx.fillRect(w/2+4*s,h-133*s,6*s,6*s);
  ctx.fillStyle='#fff';ctx.fillRect(w/2-9*s,h-132*s,3*s,3*s);ctx.fillRect(w/2+5*s,h-132*s,3*s,3*s);
  // Helmet
  ctx.fillStyle=c;ctx.fillRect(w/2-17*s,h-145*s,34*s,8*s);ctx.fillRect(w/2-14*s,h-168*s,28*s,25*s);
  ctx.fillStyle='rgba(100,200,255,0.4)';ctx.fillRect(w/2-12*s,h-158*s,24*s,14*s);
  // Star
  ctx.fillStyle='#ffdd00';ctx.font=(9*s)+'px serif';ctx.textAlign='center';ctx.fillText('★',w/2,h-150*s);
}

// ── Shop ──────────────────────────────────────────────
async function loadShopCatalog() {
  try{ const res=await fetch('/api/shop'); const data=await res.json(); shopCatalog=data.items||[]; }catch{shopCatalog=[];}
}

function shopTab(tab) {
  currentShopTab=tab;
  document.querySelectorAll('.shop-tab').forEach(t=>t.classList.remove('active'));
  if(event&&event.target) event.target.classList.add('active');
  renderShop();
}

function renderShop() {
  const grid=document.getElementById('shop-items-grid'); if(!grid)return;
  grid.innerHTML='';
  const items=shopCatalog.filter(i=>i.category===currentShopTab);
  items.forEach(item=>{
    const owned=profile.inventory.includes(item.id);
    const equipped=(item.category==='skin'&&profile.equippedSkin===item.id)||(item.category==='weapon'&&profile.equippedWeapon===item.id)||(item.category==='title'&&profile.equippedTitle===item.id);
    const card=document.createElement('div');
    card.className='shop-item'+(owned?' owned':'')+(equipped?' equipped':'');
    const preview=document.createElement('div'); preview.className='shop-preview';
    if(item.category==='skin'){preview.style.background=hexToCSS(item.color||0x6a0dad);preview.textContent='🧙';}
    else if(item.category==='weapon'){preview.style.background=item.color?hexToCSS(item.color):'#9b30e8';preview.textContent='✨';}
    else if(item.category==='emote'){preview.style.background='#1a1030';preview.style.fontSize='1.8rem';preview.textContent=item.preview||'😄';}
    else{preview.style.background=item.preview||'#f0c040';preview.textContent='🏷️';}
    const name=document.createElement('div'); name.className='shop-item-name'; name.textContent=item.name;
    const desc=document.createElement('div'); desc.className='shop-item-desc'; desc.textContent=item.description;
    if(equipped){const b=document.createElement('div');b.className='shop-item-status equipped';b.textContent='Equipped';card.appendChild(b);}
    else if(owned){const b=document.createElement('div');b.className='shop-item-status owned';b.textContent='Owned';card.appendChild(b);}
    const btn=document.createElement('button'); btn.className='shop-item-btn';
    if(item.category==='emote'){
      if(owned){btn.textContent='✓ Unlocked';btn.className+=' equipped-btn';btn.disabled=true;}
      else if(item.price===0){btn.textContent='Free — Unlock';btn.className+=' equip';btn.onclick=()=>buyAndEquip(item.id,0);}
      else{btn.textContent='🪙 '+item.price;if(profile.coins<item.price)btn.disabled=true;btn.onclick=()=>buyAndEquip(item.id,item.price);}
    }else if(equipped){btn.textContent='✓ Equipped';btn.className+=' equipped-btn';btn.disabled=true;}
    else if(owned){
      btn.textContent='Equip';btn.className+=' equip';btn.onclick=()=>equipItem(item.id);
    }
    else if(item.price===0){btn.textContent='Free — Equip';btn.className+=' equip';btn.onclick=()=>buyAndEquip(item.id,0);}
    else{btn.textContent='🪙 '+item.price;if(profile.coins<item.price)btn.disabled=true;btn.onclick=()=>buyAndEquip(item.id,item.price);}
    card.appendChild(preview); card.appendChild(name); card.appendChild(desc); card.appendChild(btn);
    // Gift button for all paid items (whether you own it or not)
    if(item.price > 0 && item.category !== 'emote') {
      const gb = document.createElement('button');
      gb.className = 'shop-item-btn gift-btn';
      gb.textContent = '🎁 Gift to Friend';
      gb.onclick = () => openGiftModal(item);
      card.appendChild(gb);
    }
    grid.appendChild(card);
  });
}

async function buyAndEquip(itemId,price) {
  if(price>0){const res=await apiFetch('/api/shop/buy','POST',{itemId});if(!res)return;profile=res.profile;}
  const item=shopCatalog.find(i=>i.id===itemId);
  if(item&&item.category==='emote'){
    if(price===0&&!profile.inventory.includes(itemId)){const res=await apiFetch('/api/shop/buy','POST',{itemId});if(res)profile=res.profile;}
    updateMenuUI();renderShop();return;
  }
  await equipItem(itemId);
}
async function equipItem(itemId) {
  const res=await apiFetch('/api/shop/equip','POST',{itemId});if(!res)return;
  profile=res.profile; updateMenuUI(); renderShop(); renderPreviewCanvas();
}

// ── Friends ───────────────────────────────────────────
async function loadFriends() {
  const res=await apiFetch('/api/friends','GET'); if(!res)return;
  profile.friends=res.friends; profile.friendRequests=res.friendRequests;
  renderFriends(); updateRequestBadge();
}

function renderFriends() {
  const reqList=document.getElementById('requests-list');
  const reqSection=document.getElementById('requests-section');
  reqList.innerHTML='';
  if(!profile.friendRequests||profile.friendRequests.length===0){reqSection.style.display='none';}
  else{
    reqSection.style.display='';
    profile.friendRequests.forEach(username=>{
      const item=document.createElement('div'); item.className='friend-item';
      item.innerHTML=`<div class="friend-item-left"><div class="friend-dot ${onlineFriends.has(username)?'online':''}"></div><div><div class="friend-name">${escHtml(username)}</div></div></div><div class="friend-item-right"><button class="btn-small btn-accept" onclick="respondRequest('${escHtml(username)}','accept')">Accept</button><button class="btn-small btn-decline" onclick="respondRequest('${escHtml(username)}','decline')">Decline</button></div>`;
      reqList.appendChild(item);
    });
  }
  const list=document.getElementById('friends-list'); list.innerHTML='';
  if(!profile.friends||profile.friends.length===0){list.innerHTML='<div class="friends-empty">No friends yet. Add some above!</div>';return;}
  profile.friends.forEach(username=>{
    const online=onlineFriends.has(username);
    const item=document.createElement('div'); item.className='friend-item';
    item.innerHTML=`<div class="friend-item-left"><div class="friend-dot ${online?'online':''}"></div><div><div class="friend-name">${escHtml(username)}</div><div class="friend-title">${online?'🟢 Online':'⚫ Offline'}</div></div></div><div class="friend-item-right">${online?`<button class="btn-small" onclick="inviteFriend('${escHtml(username)}')">⚔️ Invite</button>`:''}<button class="btn-small btn-decline" onclick="removeFriend('${escHtml(username)}')">Remove</button></div>`;
    list.appendChild(item);
  });
}

function updateRequestBadge() {
  const badge=document.getElementById('friends-badge');
  const count=profile.friendRequests?profile.friendRequests.length:0;
  if(count>0){badge.textContent=count;badge.classList.remove('hidden');}else badge.classList.add('hidden');
}

async function sendFriendRequest() {
  const input=document.getElementById('friend-search-input'); const username=input.value.trim(); if(!username)return;
  const msgEl=document.getElementById('friend-msg'); msgEl.classList.add('hidden');
  const res=await apiFetch('/api/friends/request','POST',{username});
  if(res&&res.message){msgEl.textContent=res.message;msgEl.className='friend-msg success';msgEl.classList.remove('hidden');input.value='';}
}
async function respondRequest(username,action) {
  const endpoint=action==='accept'?'/api/friends/accept':'/api/friends/decline';
  const res=await apiFetch(endpoint,'POST',{username});
  if(res&&res.profile)profile=res.profile;
  await loadFriends();
}
async function removeFriend(username) {
  const res=await apiFetch('/api/friends/remove','POST',{username});
  if(res&&res.profile)profile=res.profile;
  await loadFriends();
}
function inviteFriend(username) {
  if(!socket)return;
  socket.emit('sendInvite',{toUsername:username});
  const msgEl=document.getElementById('friend-msg');
  msgEl.textContent=`Invite sent to ${username}!`;msgEl.className='friend-msg success';msgEl.classList.remove('hidden');
  setTimeout(()=>msgEl.classList.add('hidden'),3000);
}

// ── News ──────────────────────────────────────────────
async function loadNews() {
  try{const res=await fetch('/api/admin/news');const data=await res.json();renderNews(data.news||[]);}catch{renderNews([]);}
}
function renderNews(newsList) {
  const el=document.getElementById('news-list'); if(!el)return;
  if(!newsList.length){el.innerHTML='<div class="news-empty">No news yet.</div>';return;}
  el.innerHTML=newsList.map(n=>`<div class="news-item ${n.pinned?'pinned':''}">${n.pinned?'<div class="news-pin">📌 Pinned</div>':''}<div class="news-item-title">${escHtml(n.title)}</div><div class="news-item-body">${escHtml(n.body)}</div><div class="news-item-meta">— ${escHtml(n.author)} · ${new Date(n.createdAt).toLocaleDateString()}</div></div>`).join('');
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ── Admin ─────────────────────────────────────────────
let currentAdminTab='users';
function adminTab(tab) {
  currentAdminTab=tab;
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  const tabNames=['users','reports','news','give'];
  const tabs=document.querySelectorAll('.admin-tab');
  const idx=tabNames.indexOf(tab); if(tabs[idx])tabs[idx].classList.add('active');
  const panel=document.getElementById('admin-panel-'+tab);
  if(panel){panel.classList.add('active');panel.style.display='flex';}
  if(tab==='reports')adminLoadReports();
  if(tab==='news')adminLoadNewsPanel();
  if(tab==='give')adminPopulateItemSelect();
}
async function adminSearchUsers(){
  const search=document.getElementById('admin-user-search').value.trim();
  const res=await apiFetch(`/api/admin/users?search=${encodeURIComponent(search)}`,'GET'); if(!res)return;
  const list=document.getElementById('admin-users-list');
  if(!res.users.length){list.innerHTML='<div class="admin-empty">No users found.</div>';return;}
  list.innerHTML=res.users.map(u=>`<div class="admin-user-row"><div class="admin-user-info"><span class="admin-user-name">${escHtml(u.username)}</span><span class="admin-user-tags">${u.isAdmin?'<span class="tag tag-admin">Admin</span>':''}${u.isBanned?'<span class="tag tag-ban">Banned</span>':''}</span><span class="admin-user-meta">W:${u.wins} L:${u.losses} 🪙${u.coins}</span></div><div class="admin-user-actions">${!u.isBanned?`<button class="btn-small btn-decline" onclick="adminBan('${escHtml(u.username)}')">Ban</button>`:`<button class="btn-small btn-accept" onclick="adminUnban('${escHtml(u.username)}')">Unban</button>`}${!u.isAdmin?`<button class="btn-small" onclick="adminMakeAdmin('${escHtml(u.username)}')">Make Admin</button>`:`<button class="btn-small btn-decline" onclick="adminRemoveAdmin('${escHtml(u.username)}')">Remove Admin</button>`}<button class="btn-small" onclick="adminKick('${escHtml(u.username)}')">Kick</button></div></div>`).join('');
}
async function adminBan(u){const r=prompt(`Ban reason for ${u}:`);if(r===null)return;const res=await apiFetch('/api/admin/ban','POST',{username:u,reason:r});if(res){showAdminMsg(res.message);adminSearchUsers();}}
async function adminUnban(u){const res=await apiFetch('/api/admin/unban','POST',{username:u});if(res){showAdminMsg(res.message);adminSearchUsers();}}
async function adminMakeAdmin(u){if(!confirm(`Make ${u} an admin?`))return;const res=await apiFetch('/api/admin/makeadmin','POST',{username:u});if(res){showAdminMsg(res.message);adminSearchUsers();}}
async function adminRemoveAdmin(u){if(!confirm(`Remove admin from ${u}?`))return;const res=await apiFetch('/api/admin/removeadmin','POST',{username:u});if(res){showAdminMsg(res.message);adminSearchUsers();}}
async function adminKick(u){if(!confirm(`Kick ${u}?`))return;const res=await apiFetch('/api/admin/kick','POST',{username:u});if(res)showAdminMsg(res.message||res.error);}
async function adminLoadReports(){
  const res=await apiFetch('/api/admin/reports','GET'); if(!res)return;
  const list=document.getElementById('admin-reports-list');
  if(!res.reports.length){list.innerHTML='<div class="admin-empty">No reports.</div>';return;}
  list.innerHTML=res.reports.map(r=>`<div class="admin-report-row ${r.status}"><div class="admin-report-header"><span>🚩 <strong>${escHtml(r.reporterUsername)}</strong> reported <strong>${escHtml(r.reportedUsername)}</strong></span><span class="tag tag-${r.status}">${r.status}</span></div><div class="admin-report-reason">Reason: ${escHtml(r.reason)}</div>${r.details?`<div>"${escHtml(r.details)}"</div>`:''}<div class="admin-report-meta">${new Date(r.createdAt).toLocaleString()}</div><div class="admin-report-actions"><button class="btn-small btn-accept" onclick="adminSetReportStatus('${r._id}','reviewed')">Reviewed</button><button class="btn-small" onclick="adminSetReportStatus('${r._id}','dismissed')">Dismiss</button><button class="btn-small btn-decline" onclick="adminBan('${escHtml(r.reportedUsername)}')">Ban Player</button></div></div>`).join('');
}
async function adminSetReportStatus(id,status){await apiFetch(`/api/admin/reports/${id}/status`,'POST',{status});adminLoadReports();}
async function adminLoadNewsPanel(){
  const res=await fetch('/api/admin/news'); const data=await res.json();
  const list=document.getElementById('admin-news-list');
  if(!data.news||!data.news.length){list.innerHTML='<div class="admin-empty">No news yet.</div>';return;}
  list.innerHTML=data.news.map(n=>`<div class="admin-news-row"><div class="admin-news-title">${n.pinned?'📌 ':''}${escHtml(n.title)}</div><div class="admin-news-body">${escHtml(n.body)}</div><div class="admin-news-meta">${new Date(n.createdAt).toLocaleString()}</div><button class="btn-small btn-decline" onclick="adminDeleteNews('${n._id}')">Delete</button></div>`).join('');
}
async function adminPostNews(){
  const title=document.getElementById('admin-news-title').value.trim();
  const body=document.getElementById('admin-news-body').value.trim();
  const pinned=document.getElementById('admin-news-pinned').checked;
  if(!title||!body){showAdminMsg('Title and body required.');return;}
  const res=await apiFetch('/api/admin/news','POST',{title,body,pinned});
  if(res){showAdminMsg('News posted!');document.getElementById('admin-news-title').value='';document.getElementById('admin-news-body').value='';document.getElementById('admin-news-pinned').checked=false;adminLoadNewsPanel();}
}
async function adminDeleteNews(id){if(!confirm('Delete?'))return;await apiFetch(`/api/admin/news/${id}`,'DELETE');adminLoadNewsPanel();}
function adminPopulateItemSelect(){
  const sel=document.getElementById('admin-give-item'); sel.innerHTML='<option value="">— Select item —</option>';
  ['skin','weapon','title','emote'].forEach(cat=>{
    const items=shopCatalog.filter(i=>i.category===cat); if(!items.length)return;
    const og=document.createElement('optgroup'); og.label=cat.charAt(0).toUpperCase()+cat.slice(1)+'s';
    items.forEach(item=>{const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name+(item.price?` (🪙${item.price})`:' (Free)');og.appendChild(opt);});
    sel.appendChild(og);
  });
}
async function adminGiveItem(){
  const username=document.getElementById('admin-give-username').value.trim();
  const itemId=document.getElementById('admin-give-item').value;
  if(!username||!itemId){showAdminMsg('Username and item required.');return;}
  const res=await apiFetch('/api/admin/giveitem','POST',{username,itemId});
  showAdminMsg(res?res.message:'Error.');
}
async function adminGiveCoins(){
  const username=document.getElementById('admin-coins-username').value.trim();
  const amount=parseInt(document.getElementById('admin-coins-amount').value);
  if(!username||!amount||amount<1){showAdminMsg('Username and amount required.');return;}
  const res=await apiFetch('/api/admin/givecoins','POST',{username,amount});
  showAdminMsg(res?res.message:'Error.');
}
async function adminRemoveCoins(){
  const username=document.getElementById('admin-removecoins-username').value.trim();
  const amount=parseInt(document.getElementById('admin-removecoins-amount').value);
  if(!username||!amount||amount<1){showAdminMsg('Username and amount required.');return;}
  const res=await apiFetch('/api/admin/removecoins','POST',{username,amount});
  showAdminMsg(res?res.message:'Error.');
}
async function adminRemoveSkin(){
  const username=document.getElementById('admin-removeskin-username').value.trim();
  const itemId=document.getElementById('admin-removeskin-itemid').value.trim();
  if(!username||!itemId){showAdminMsg('Username and item ID required.');return;}
  const res=await apiFetch('/api/admin/removeskin','POST',{username,itemId});
  showAdminMsg(res?res.message:'Error.');
}
// ── Admin: Matches, Announce, TempBan, Mute ──────────
async function adminLoadMatches() {
  const res = await apiFetch('/api/admin/matches', 'GET');
  const list = document.getElementById('admin-matches-list');
  if (!res) { list.innerHTML = '<div class="admin-empty">Failed to load.</div>'; return; }
  if (!res.matches.length) { list.innerHTML = '<div class="admin-empty">No active matches right now.</div>'; return; }
  list.innerHTML = res.matches.map(m => `
    <div class="admin-user-row">
      <div class="admin-user-info">
        <span class="admin-user-name">${m.isPractice ? '🤖 Practice' : '⚔️ Match'}</span>
        <span class="admin-user-meta">${m.players.map(p => `${escHtml(p.username)} (${p.hp}HP)`).join(' vs ')}</span>
      </div>
    </div>`).join('');
}

async function adminSendAnnouncement() {
  const message = document.getElementById('admin-announce-text').value.trim();
  const msgEl = document.getElementById('admin-announce-msg');
  if (!message) { msgEl.textContent = 'Enter a message first.'; msgEl.className = 'friend-msg error'; msgEl.classList.remove('hidden'); return; }
  const res = await apiFetch('/api/admin/announce', 'POST', { message });
  msgEl.textContent = res ? res.message : 'Error sending.';
  msgEl.className = 'friend-msg ' + (res ? 'success' : 'error');
  msgEl.classList.remove('hidden');
  if (res) document.getElementById('admin-announce-text').value = '';
  setTimeout(() => msgEl.classList.add('hidden'), 4000);
}

async function adminTempBan() {
  const username = document.getElementById('admin-tempban-username').value.trim();
  const hours    = document.getElementById('admin-tempban-hours').value;
  const reason   = document.getElementById('admin-tempban-reason').value.trim();
  if (!username || !hours) { showAdminMsg('Username and hours required.'); return; }
  const res = await apiFetch('/api/admin/tempban', 'POST', { username, hours: Number(hours), reason });
  showAdminMsg(res ? res.message : 'Error.');
}

async function adminMutePlayer() {
  const username = document.getElementById('admin-mute-username').value.trim();
  const minutes  = document.getElementById('admin-mute-minutes').value;
  if (!username || !minutes) { showAdminMsg('Username and minutes required.'); return; }
  const res = await apiFetch('/api/admin/mute', 'POST', { username, minutes: Number(minutes) });
  showAdminMsg(res ? res.message : 'Error.');
}

async function adminUnmutePlayer() {
  const username = document.getElementById('admin-mute-username').value.trim();
  if (!username) { showAdminMsg('Enter a username.'); return; }
  const res = await apiFetch('/api/admin/unmute', 'POST', { username });
  showAdminMsg(res ? res.message : 'Error.');
}

// ── Aimbot (admin only, in-game) ──────────────────────
let aimbotEnabled = false;
function toggleAimbot() {
  aimbotEnabled = !aimbotEnabled;
  const btn = document.getElementById('admin-aimbot-btn');
  if (btn) { btn.textContent = aimbotEnabled ? '🎯 Aimbot: ON' : '🎯 Aimbot: OFF'; btn.style.background = aimbotEnabled ? '#1a4a1a' : ''; }
  showReportConfirmation(aimbotEnabled ? '🎯 Aimbot enabled.' : '🎯 Aimbot off.');
}
function runAimbot() {
  if (!aimbotEnabled || !gameRunning || !socket) return;
  const oppId = Object.keys(playerMeshes).find(id => id !== myId); if (!oppId) return;
  const opp = playerMeshes[oppId], myMesh = playerMeshes[myId]; if (!opp || !myMesh) return;
  const dx = opp.position.x - myMesh.position.x, dz = opp.position.z - myMesh.position.z;
  mouseX = mouseX + (-Math.atan2(dx, dz) - mouseX) * 0.25;
  const now = Date.now();
  for (const wk of ['iceshard', 'thunder', 'fireball']) {
    if ((cooldownTimers[wk] || 0) <= now) {
      socket.emit('castSpell', { spellKey: wk });
      cooldownTimers[wk] = now + COOLDOWNS[wk];
      triggerCooldownUI(wk);
      break;
    }
  }
}

function showAdminMsg(msg){
  const el=document.getElementById('admin-give-msg'); if(!el){showReportConfirmation(msg);return;}
  el.textContent=msg;el.className='friend-msg success';el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),4000);
}

// ── Profile ───────────────────────────────────────────
const AVATARS=[
  {id:'player1', emoji:'🎮',label:'Default',       skinColor:'#1a88ff'},
  {id:'player2', emoji:'🔴',label:'Red Squad',     skinColor:'#cc1122'},
  {id:'player3', emoji:'🔵',label:'Blue Squad',    skinColor:'#0066cc'},
  {id:'player4', emoji:'🟢',label:'Camo Squad',    skinColor:'#2a6e1a'},
  {id:'player5', emoji:'🌟',label:'Gold Squad',    skinColor:'#d4a017'},
  {id:'player6', emoji:'⬛',label:'Stealth Squad', skinColor:'#1a1a2e'},
  {id:'player7', emoji:'💎',label:'Crystal Squad', skinColor:'#88ddff'},
  {id:'player8', emoji:'⚡',label:'Storm Squad',   skinColor:'#ffee00'},
  {id:'player9', emoji:'🔥',label:'Fire Squad',    skinColor:'#ff4400'},
  {id:'player10',emoji:'❄️',label:'Ice Squad',     skinColor:'#88ccff'},
  {id:'player11',emoji:'🌿',label:'Nature Squad',  skinColor:'#44aa44'},
  {id:'player12',emoji:'🖤',label:'Stealth Dark',  skinColor:'#330033'},
];

function loadProfilePanel(){
  if(!profile)return;
  document.getElementById('profile-username-display').textContent=profile.username;
  const titleItem=shopCatalog.find(i=>i.id===profile.equippedTitle);
  document.getElementById('profile-title-display').textContent=titleItem?titleItem.name:'Player';
  document.getElementById('profile-bio-input').value=profile.bio||'';
  document.getElementById('prof-wins').textContent=profile.wins;
  document.getElementById('prof-losses').textContent=profile.losses;
  document.getElementById('prof-coins').textContent=profile.coins;
  drawProfileAvatar('profile-avatar-canvas',profile.avatar||'player1',120,160);
  const av=AVATARS.find(a=>a.id===(profile.avatar||'player1'));
  document.getElementById('profile-avatar-label').textContent=av?av.label:'';
  buildAvatarGrid();
}
function buildAvatarGrid(){
  const grid=document.getElementById('avatar-grid'); if(!grid)return; grid.innerHTML='';
  AVATARS.forEach(av=>{
    const card=document.createElement('div'); card.className='avatar-option'+(profile.avatar===av.id?' selected':''); card.title=av.label; card.onclick=()=>selectAvatar(av.id);
    const cvs=document.createElement('canvas'); cvs.width=60;cvs.height=80; card.appendChild(cvs); drawProfileAvatar(cvs,av.id,60,80);
    const lbl=document.createElement('div'); lbl.className='avatar-option-label'; lbl.textContent=av.label; card.appendChild(lbl);
    grid.appendChild(card);
  });
}
function drawProfileAvatar(canvasOrId,avatarId,w,h){
  const canvas=typeof canvasOrId==='string'?document.getElementById(canvasOrId):canvasOrId; if(!canvas)return;
  const ctx=canvas.getContext('2d'); const av=AVATARS.find(a=>a.id===avatarId)||AVATARS[0];
  ctx.clearRect(0,0,w,h);
  const s=w/120;
  const grd=ctx.createRadialGradient(w/2,h*.6,5,w/2,h*.6,w*.6); grd.addColorStop(0,av.skinColor+'55'); grd.addColorStop(1,'transparent');
  ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
  // Shadow
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(w/2,h-10*s,22*s,6*s,0,0,Math.PI*2); ctx.fill();
  // Legs
  ctx.fillStyle='#334455'; ctx.fillRect(w/2-14*s,h-50*s,11*s,38*s); ctx.fillRect(w/2+3*s,h-50*s,11*s,38*s);
  // Body
  ctx.fillStyle=av.skinColor; ctx.fillRect(w/2-18*s,h-100*s,36*s,52*s);
  ctx.fillStyle='rgba(0,0,0,.18)'; ctx.fillRect(w/2+2*s,h-100*s,16*s,52*s);
  // Arms
  ctx.fillStyle=av.skinColor; ctx.fillRect(w/2-30*s,h-98*s,13*s,38*s); ctx.fillRect(w/2+17*s,h-98*s,13*s,38*s);
  // Gun
  ctx.fillStyle='#333'; ctx.fillRect(w/2+30*s,h-72*s,22*s,9*s); ctx.fillStyle='#555'; ctx.fillRect(w/2+47*s,h-70*s,14*s,5*s);
  // Head
  ctx.fillStyle='#f5c896'; ctx.fillRect(w/2-14*s,h-138*s,28*s,30*s);
  // Eyes
  ctx.fillStyle='#222'; ctx.fillRect(w/2-9*s,h-130*s,5*s,5*s); ctx.fillRect(w/2+4*s,h-130*s,5*s,5*s);
  // Helmet
  ctx.fillStyle=av.skinColor; ctx.fillRect(w/2-16*s,h-143*s,32*s,10*s); ctx.fillRect(w/2-13*s,h-163*s,26*s,22*s);
  ctx.fillStyle='rgba(100,200,255,0.4)'; ctx.fillRect(w/2-11*s,h-153*s,22*s,12*s);
  // Star / emoji
  ctx.font=`${9*s}px serif`; ctx.textAlign='center'; ctx.fillStyle='#ffdd00'; ctx.fillText('★',w/2,h-148*s);
}
async function selectAvatar(avatarId){
  const res=await apiFetch('/api/profile','PATCH',{avatar:avatarId}); if(!res)return;
  profile=res.profile; loadProfilePanel(); renderPreviewCanvas(); updateMenuUI();
}
async function saveBio(){
  const bio=document.getElementById('profile-bio-input').value.trim();
  const res=await apiFetch('/api/profile','PATCH',{bio}); if(res){profile=res.profile;showReportConfirmation('Bio saved!');}
}
async function lookupProfile(){
  const username=document.getElementById('profile-lookup-input').value.trim(); if(!username)return;
  const resultEl=document.getElementById('profile-lookup-result');
  resultEl.innerHTML='<div style="color:var(--gray);font-size:.85rem">Searching...</div>'; resultEl.classList.remove('hidden');
  try{
    const res=await fetch(`/api/profile/${encodeURIComponent(username)}`); const data=await res.json();
    if(!res.ok){resultEl.innerHTML=`<div class="profile-lookup-empty">${escHtml(data.error||'Not found')}</div>`;return;}
    const titleItem=shopCatalog.find(i=>i.id===data.equippedTitle); const titleName=titleItem?titleItem.name:'Player';
    const wr=data.wins+data.losses>0?Math.round(data.wins/(data.wins+data.losses)*100)+'%':'—';
    resultEl.innerHTML=`<div class="looked-up-card"><div class="looked-up-avatar" id="looked-up-canvas-wrap"></div><div class="looked-up-info"><div class="looked-up-name">${escHtml(data.username)}${data.isAdmin?'<span class="tag tag-admin">Admin</span>':''}</div><div class="looked-up-title">${escHtml(titleName)}</div>${data.bio?`<div class="looked-up-bio">"${escHtml(data.bio)}"</div>`:''}<div class="looked-up-stats"><span>🏆 ${data.wins}W</span><span>💀 ${data.losses}L</span><span>📊 ${wr}</span></div><div class="looked-up-since">Since ${new Date(data.createdAt).toLocaleDateString()}</div></div></div>`;
    setTimeout(()=>{const wrap=document.getElementById('looked-up-canvas-wrap');if(!wrap)return;const cvs=document.createElement('canvas');cvs.width=80;cvs.height=106;wrap.appendChild(cvs);drawProfileAvatar(cvs,data.avatar||'player1',80,106);},0);
  }catch{resultEl.innerHTML='<div class="profile-lookup-empty">Error looking up player.</div>';}
}

// ── Practice Mode ─────────────────────────────────────
function startPractice(){
  if(!socket)connectSocket();
  document.getElementById('lobby-username').textContent=profile.username;
  const lt=document.getElementById('lobby-title');if(lt)lt.textContent='🤖 Practice Mode';
  document.getElementById('lobby-msg').textContent='Setting up your match...';
  showScreen('screen-lobby');
  setTimeout(()=>{ socket.emit('startPractice',{username:profile.username,token:authToken,cosmetics:{equippedSkin:profile.equippedSkin,equippedWeapon:profile.equippedWeapon,equippedTitle:profile.equippedTitle}}); },300);
}

// ── Leaderboard ───────────────────────────────────────
let currentLbType='wins';
async function loadLeaderboard(type){
  currentLbType=type||currentLbType;
  const list=document.getElementById('lb-list'); if(!list)return;
  list.innerHTML='<div class="lb-loading">Loading...</div>';
  try{
    const res=await fetch(`/api/leaderboard?type=${currentLbType}`); const data=await res.json();
    if(!data.board||!data.board.length){list.innerHTML='<div class="lb-empty">No players yet!</div>';return;}
    list.innerHTML=data.board.map((p,i)=>{
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      const isMe=profile&&p.username===profile.username;
      const titleItem=shopCatalog.find(t=>t.id===p.equippedTitle); const titleName=titleItem?titleItem.name:'';
      let statVal='';
      if(currentLbType==='wins')statVal=`🏆 ${p.wins} wins`;
      if(currentLbType==='coins')statVal=`🪙 ${p.coins} coins`;
      if(currentLbType==='kd')statVal=`📊 ${p.kd} K/D`;
      return `<div class="lb-row ${isMe?'lb-me':''}"><div class="lb-rank">${medal||('#'+p.rank)}</div><div class="lb-info"><div class="lb-name">${escHtml(p.username)}${p.isAdmin?'<span class="tag tag-admin" style="margin-left:6px">Admin</span>':''}</div><div class="lb-title">${escHtml(titleName)}</div></div><div class="lb-stat">${statVal}</div><div class="lb-sub">${p.wins}W ${p.losses}L</div></div>`;
    }).join('');
  }catch{list.innerHTML='<div class="lb-empty">Failed to load.</div>';}
}
function lbTab(type,btn){
  document.querySelectorAll('.lb-tab').forEach(t=>t.classList.remove('active'));
  if(btn)btn.classList.add('active');
  loadLeaderboard(type);
}

// ── Settings ──────────────────────────────────────────
const SETTINGS_KEY='pixelio_settings';
function loadSettings(){
  const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
  const sens=saved.sensitivity!==undefined?saved.sensitivity:5;
  const sensEl=document.getElementById('setting-sensitivity'); const sensVal=document.getElementById('setting-sensitivity-val');
  if(sensEl){sensEl.value=sens;if(sensVal)sensVal.textContent=sens;}
  const el=id=>document.getElementById(id);
  if(el('setting-fps'))el('setting-fps').checked=saved.fps||false;
  if(el('setting-damage'))el('setting-damage').checked=saved.damage!==false;
  if(el('setting-sfx'))el('setting-sfx').checked=saved.sfx!==false;
  if(el('setting-music'))el('setting-music').checked=saved.music||false;
  if(el('settings-username'))el('settings-username').textContent=profile?profile.username:'';
  applySensitivity(sens);
}
function applySensitivity(val){window._mouseSensitivity=(val/5)*0.003;}
function saveSettings(){
  const sens=parseInt(document.getElementById('setting-sensitivity').value);
  const fps=document.getElementById('setting-fps').checked;
  const damage=document.getElementById('setting-damage').checked;
  const sfx=document.getElementById('setting-sfx').checked;
  const music=document.getElementById('setting-music').checked;
  localStorage.setItem(SETTINGS_KEY,JSON.stringify({sensitivity:sens,fps,damage,sfx,music}));
  applySensitivity(sens);
  const msg=document.getElementById('settings-saved-msg');
  if(msg){msg.classList.remove('hidden');setTimeout(()=>msg.classList.add('hidden'),2000);}
}
(function(){const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');applySensitivity(saved.sensitivity!==undefined?saved.sensitivity:5);})();

// ── Gifting ───────────────────────────────────────────
function openGiftModal(item){
  document.getElementById('gift-item-name').textContent=item.name;
  document.getElementById('gift-item-id').value=item.id;
  document.getElementById('gift-username').value='';
  document.getElementById('gift-error').classList.add('hidden');
  document.getElementById('gift-cost-line').textContent=`Cost: 🪙 ${item.price} (your balance: 🪙 ${profile.coins})`;
  document.getElementById('gift-modal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('gift-username').focus(),100);
}
function closeGiftModal(){document.getElementById('gift-modal').classList.add('hidden');}
async function sendGift(){
  const toUsername=document.getElementById('gift-username').value.trim();
  const itemId=document.getElementById('gift-item-id').value;
  const errEl=document.getElementById('gift-error'); errEl.classList.add('hidden');
  if(!toUsername){errEl.textContent='Enter a username.';errEl.classList.remove('hidden');return;}
  const btn=document.getElementById('btn-gift-send'); btn.disabled=true; btn.textContent='Sending...';
  const res=await apiFetch('/api/shop/gift','POST',{toUsername,itemId});
  btn.disabled=false; btn.textContent='Send Gift 🎁';
  if(!res)return;
  profile=res.profile; updateMenuUI(); renderShop(); closeGiftModal(); showReportConfirmation(res.message);
}

// ═══════════════════════════════════════════════════
//  THREE.JS RENDERING
// ═══════════════════════════════════════════════════
let renderer,scene,camera,playerMeshes={},projMeshes={},animFrameId,gameRunning=false;
const CAMERA_DIST=14,CAMERA_HEIGHT=6;
const WEAPON_KEYS={KeyQ:'fireball',KeyE:'iceshard',KeyR:'thunder',KeyF:'shield'};
const WEAPON_SLOT_IDS={fireball:'spell-1',iceshard:'spell-2',thunder:'spell-3',shield:'spell-4'};
const COOLDOWNS={fireball:2000,iceshard:800,thunder:1400,shield:8000};
const cooldownTimers={fireball:0,iceshard:0,thunder:0,shield:0};
const keys={};let mouseX=0,pointerLocked=false,inputInterval=null;

function initThree(){
  const canvas=document.getElementById('game-canvas');
  renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true; renderer.setClearColor(0x0a0c18);
  scene=new THREE.Scene(); scene.fog=new THREE.Fog(0x0a0c18,35,90);
  camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,.1,200);
  camera.position.set(0,CAMERA_HEIGHT,CAMERA_DIST); camera.lookAt(0,0,0);
  buildArena(); addLights(); addSkybox(); addTrees();
  window.addEventListener('resize',onResize); onResize();
}

function addTrees(){
  const trunkMat=new THREE.MeshLambertMaterial({color:0x5a3a1a});
  const leafMat=new THREE.MeshLambertMaterial({color:0x1a5c2a});
  [[-18,-18],[18,-18],[-18,18],[18,18],[0,-22],[0,22],[-22,0],[22,0],[-14,-24],[14,-24],[-24,14],[24,-14]].forEach(([x,z])=>{
    const h=5+Math.random()*3;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2,.35,h,6),trunkMat); trunk.position.set(x,h/2,z); trunk.castShadow=true; scene.add(trunk);
    for(let i=0;i<3;i++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(2-i*.3,2,7),leafMat); leaf.position.set(x,h-.5+i*1.4,z); leaf.castShadow=true; scene.add(leaf);}
  });
}

function addLights(){
  scene.add(new THREE.AmbientLight(0x334455,.9));
  const sun=new THREE.DirectionalLight(0xfff8e7,1.1); sun.position.set(12,24,10); sun.castShadow=true; sun.shadow.mapSize.width=1024; sun.shadow.mapSize.height=1024; scene.add(sun);
  const fill=new THREE.DirectionalLight(0x334466,.4); fill.position.set(-8,10,-8); scene.add(fill);
}

function addSkybox(){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(100,16,8),new THREE.MeshBasicMaterial({color:0x1a2a4a,side:THREE.BackSide})); scene.add(sky);
  const starVerts=[];
  for(let i=0;i<600;i++){const t=Math.random()*Math.PI*2,p=Math.acos(2*Math.random()-1),r=90;starVerts.push(r*Math.sin(p)*Math.cos(t),r*Math.cos(p),r*Math.sin(p)*Math.sin(t));}
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(starVerts,3));
  scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:.25})));
}

function createWizardMesh(skinItemId,weaponItemId){
  const sc=SKIN_COLORS[skinItemId]||0x1a88ff;
  const wc=(WEAPON_COLORS_FX&&WEAPON_COLORS_FX[weaponItemId])||(WEAPON_COLORS&&WEAPON_COLORS[weaponItemId])||0x9b30e8;
  const group=new THREE.Group();
  const bodyMat=new THREE.MeshLambertMaterial({color:sc});
  const darkMat=new THREE.MeshLambertMaterial({color:0x111122});
  const skinMat=new THREE.MeshLambertMaterial({color:0xf5c896});
  const bootMat=new THREE.MeshLambertMaterial({color:0x333344});
  // Boots
  const bootL=new THREE.Mesh(new THREE.BoxGeometry(.28,.2,.36),bootMat); bootL.position.set(-.17,.1,.03); group.add(bootL);
  const bootR=new THREE.Mesh(new THREE.BoxGeometry(.28,.2,.36),bootMat); bootR.position.set(.17,.1,.03); group.add(bootR);
  // Legs
  const legL=new THREE.Mesh(new THREE.BoxGeometry(.24,.6,.28),darkMat); legL.position.set(-.17,.5,0); legL.castShadow=true; group.add(legL);
  const legR=new THREE.Mesh(new THREE.BoxGeometry(.24,.6,.28),darkMat); legR.position.set(.17,.5,0); legR.castShadow=true; group.add(legR);
  // Torso
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.6,.72,.38),bodyMat); torso.position.y=1.16; torso.castShadow=true; group.add(torso);
  // Arms
  const armL=new THREE.Mesh(new THREE.BoxGeometry(.22,.58,.26),bodyMat); armL.position.set(-.42,1.1,0); armL.castShadow=true; group.add(armL);
  const armR=new THREE.Mesh(new THREE.BoxGeometry(.22,.58,.26),bodyMat); armR.position.set(.42,1.1,0); armR.castShadow=true; group.add(armR);
  // Hands
  const handL=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.22),skinMat); handL.position.set(-.42,.74,0); group.add(handL);
  const handR=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.22),skinMat); handR.position.set(.42,.74,0); group.add(handR);
  // Neck + Head
  const neck=new THREE.Mesh(new THREE.BoxGeometry(.2,.18,.2),skinMat); neck.position.y=1.61; group.add(neck);
  const head=new THREE.Mesh(new THREE.BoxGeometry(.46,.46,.44),skinMat); head.position.y=1.93; head.castShadow=true; group.add(head);
  const eyeMat=new THREE.MeshBasicMaterial({color:0x111122});
  const eyeL=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.06),eyeMat); eyeL.position.set(-.12,1.95,.23); group.add(eyeL);
  const eyeR=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.06),eyeMat); eyeR.position.set(.12,1.95,.23); group.add(eyeR);
  // Helmet
  const helmet=new THREE.Mesh(new THREE.BoxGeometry(.52,.26,.5),bodyMat); helmet.position.y=2.22; group.add(helmet);
  const helmetBrim=new THREE.Mesh(new THREE.BoxGeometry(.56,.08,.18),bodyMat); helmetBrim.position.set(0,2.12,.26); group.add(helmetBrim);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(.36,.12,.06),new THREE.MeshBasicMaterial({color:wc,transparent:true,opacity:.5})); visor.position.set(0,1.97,.25); group.add(visor);
  // Backpack
  const bpack=new THREE.Mesh(new THREE.BoxGeometry(.36,.44,.2),new THREE.MeshLambertMaterial({color:0x223344})); bpack.position.set(0,1.1,-.28); group.add(bpack);
  // Gun
  const gunGrp=new THREE.Group(); gunGrp.position.set(.42,.8,.18);
  const gunBody=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.5),new THREE.MeshLambertMaterial({color:0x222233})); gunBody.position.z=.05; gunGrp.add(gunBody);
  const gunBarrel=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.38),new THREE.MeshLambertMaterial({color:0x333344})); gunBarrel.position.set(0,.04,.34); gunGrp.add(gunBarrel);
  const muzzle=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.06),new THREE.MeshBasicMaterial({color:wc})); muzzle.position.z=.54; gunGrp.add(muzzle);
  group.add(gunGrp);
  const glow=new THREE.PointLight(wc,.8,2.5); glow.position.set(.42,.8,.7); group.add(glow);
  // Shield
  const shield=new THREE.Mesh(new THREE.SphereGeometry(1.15,16,12),new THREE.MeshBasicMaterial({color:0x44ffcc,transparent:true,opacity:.2,side:THREE.DoubleSide}));
  shield.position.y=1.1; shield.visible=false; group.add(shield);
  group.userData.shield=shield;
  return group;
}

function setShieldVisible(id,v){if(playerMeshes[id])playerMeshes[id].userData.shield.visible=v;}

const BASE_WEAPON_COLORS={fireball:0xff6600,iceshard:0x44ddff,thunder:0xffee00};
function blendColors(c1,c2,t){const r1=(c1>>16)&0xff,g1=(c1>>8)&0xff,b1=c1&0xff,r2=(c2>>16)&0xff,g2=(c2>>8)&0xff,b2=c2&0xff;return(Math.round(r1+(r2-r1)*t)<<16)|(Math.round(g1+(g2-g1)*t)<<8)|Math.round(b1+(b2-b1)*t);}

function createProjectileMesh(spellKey,weaponItemId){
  let c=BASE_WEAPON_COLORS[spellKey]||0xffffff;
  const ov=(WEAPON_COLORS_FX&&WEAPON_COLORS_FX[weaponItemId])||(WEAPON_COLORS&&WEAPON_COLORS[weaponItemId]);
  if(ov)c=blendColors(c,ov,.5);
  const geo=spellKey==='iceshard'?new THREE.OctahedronGeometry(.15):new THREE.SphereGeometry(.18,8,8);
  const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:c})); m.add(new THREE.PointLight(c,1.2,3)); return m;
}

function startGame(players){
  hideGameOver();
  if(!renderer)initThree();
  showScreen('screen-game'); gameRunning=true;
  if(scene){Object.values(playerMeshes).forEach(m=>scene.remove(m));Object.values(projMeshes).forEach(m=>scene.remove(m));}
  playerMeshes={};projMeshes={};
  players.forEach(p=>{const m=createWizardMesh(p.equippedSkin||'skin_default',p.equippedWeapon||'weapon_default');m.position.set(p.x,0,p.z);scene.add(m);playerMeshes[p.id]=m;});
  const me=players.find(p=>p.id===myId),opp=players.find(p=>p.id!==myId);
  const ti=id=>shopCatalog.find(i=>i.id===id);
  if(me){document.getElementById('hud-name-you').textContent=me.username;const t=ti(me.equippedTitle);document.getElementById('hud-title-you').textContent=t?t.name:'';}
  if(opp){document.getElementById('hud-name-opp').textContent=opp.username;const t=ti(opp.equippedTitle);document.getElementById('hud-title-opp').textContent=t?t.name:'';}
  updateMyHP(100);updateOppHP(100);
  // Show aimbot button for admins
  const aimbotBtn=document.getElementById('admin-aimbot-btn');
  if(aimbotBtn)aimbotBtn.classList.toggle('hidden',!profile||!profile.isAdmin);
  aimbotEnabled=false;
  setupInputListeners();renderLoop();
}

function updateGameState(state){
  Object.entries(state.players).forEach(([id,p])=>{if(!playerMeshes[id])return;playerMeshes[id].position.set(p.x,0,p.z);playerMeshes[id].rotation.y=p.rotY;playerMeshes[id].visible=p.alive;});
  const si=new Set(state.projectiles.map(p=>p.id));
  Object.keys(projMeshes).forEach(id=>{if(!si.has(id)){scene.remove(projMeshes[id]);delete projMeshes[id];}});
  state.projectiles.forEach(proj=>{
    if(!projMeshes[proj.id]){const ow=state.players[proj.ownerId];const wid=ow?(ow.equippedWeapon||'weapon_default'):'weapon_default';const m=createProjectileMesh(proj.spellKey,wid);scene.add(m);projMeshes[proj.id]=m;}
    projMeshes[proj.id].position.set(proj.x,proj.y,proj.z);
    if(proj.spellKey==='iceshard'){projMeshes[proj.id].rotation.x+=.3;projMeshes[proj.id].rotation.z+=.2;}
  });
  if(myId&&state.players[myId]){const me=state.players[myId];camera.position.set(me.x+Math.sin(me.rotY)*CAMERA_DIST,CAMERA_HEIGHT,me.z+Math.cos(me.rotY)*CAMERA_DIST);camera.lookAt(me.x,1.5,me.z);}
}

function updateMyHP(hp){const pct=Math.max(0,hp)/100;document.getElementById('hud-hp-you').style.width=(pct*100)+'%';document.getElementById('hud-hp-text-you').textContent=Math.max(0,hp)+' HP';document.getElementById('hud-hp-you').style.background=pct>.5?'linear-gradient(90deg,#22cc44,#44ff66)':pct>.25?'linear-gradient(90deg,#cc8800,#ffaa00)':'linear-gradient(90deg,#cc2200,#ff4400)';}
function updateOppHP(hp){const pct=Math.max(0,hp)/100;document.getElementById('hud-hp-opp').style.width=(pct*100)+'%';document.getElementById('hud-hp-text-opp').textContent=Math.max(0,hp)+' HP';}
function flashHit(){const el=document.getElementById('hit-flash');el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}
function showStun(){const el=document.getElementById('stun-indicator');el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),900);}
function triggerCooldownUI(wk){const slot=document.getElementById(WEAPON_SLOT_IDS[wk]);if(!slot)return;slot.classList.add('on-cooldown');const ov=document.getElementById('cd-'+wk);const start=Date.now();const dur=COOLDOWNS[wk];const tick=()=>{const pct=Math.min(1,(Date.now()-start)/dur);ov.style.transform=`scaleY(${1-pct})`;if(pct<1)requestAnimationFrame(tick);else{slot.classList.remove('on-cooldown');ov.style.transform='scaleY(0)';}};requestAnimationFrame(tick);}

function setupInputListeners(){
  document.addEventListener('keydown',onKeyDown); document.addEventListener('keyup',onKeyUp);
  document.getElementById('game-canvas').addEventListener('click',()=>document.getElementById('game-canvas').requestPointerLock());
  document.addEventListener('pointerlockchange',()=>{pointerLocked=document.pointerLockElement===document.getElementById('game-canvas');});
  document.addEventListener('mousemove',onMouseMove);
  if(inputInterval)clearInterval(inputInterval); inputInterval=setInterval(sendInput,50);
}
function removeInputListeners(){document.removeEventListener('keydown',onKeyDown);document.removeEventListener('keyup',onKeyUp);document.removeEventListener('mousemove',onMouseMove);if(inputInterval){clearInterval(inputInterval);inputInterval=null;}}
function onMouseMove(e){if(pointerLocked)mouseX+=e.movementX*(window._mouseSensitivity||.003);}
function onKeyDown(e){
  keys[e.code]=true;
  if(e.code==='Tab'){e.preventDefault();if(gameRunning)toggleEmoteWheel();return;}
  if(e.code==='Escape'){hideEmoteWheel();return;}
  const wk=WEAPON_KEYS[e.code];
  if(wk&&gameRunning){const now=Date.now();if(!cooldownTimers[wk]||cooldownTimers[wk]<=now){socket.emit('castSpell',{spellKey:wk});cooldownTimers[wk]=now+COOLDOWNS[wk];triggerCooldownUI(wk);}}
}
function onKeyUp(e){keys[e.code]=false;}
function sendInput(){
  if(!socket||!gameRunning)return;
  if(typeof runAimbot==='function')runAimbot();
  let dx=0,dz=0;
  if(keys['KeyW']||keys['ArrowUp'])dz-=1; if(keys['KeyS']||keys['ArrowDown'])dz+=1;
  if(keys['KeyA']||keys['ArrowLeft'])dx-=1; if(keys['KeyD']||keys['ArrowRight'])dx+=1;
  const a=mouseX; socket.emit('playerInput',{dx:dx*Math.cos(a)+dz*Math.sin(a),dz:-dx*Math.sin(a)+dz*Math.cos(a),rotY:mouseX});
}

function renderLoop(){if(!gameRunning)return;animFrameId=requestAnimationFrame(renderLoop);tickEmotes();renderer.render(scene,camera);}
function onResize(){if(!renderer)return;renderer.setSize(window.innerWidth,window.innerHeight);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();}

function endGame(iWon,winnerName,disconnected,coinsEarned,quitterName){
  if(!gameRunning)return;
  gameRunning=false; if(animFrameId){cancelAnimationFrame(animFrameId);animFrameId=null;}
  removeInputListeners(); hideReportModal(); hideEmoteWheel();
  const isDraw=iWon===null;
  document.getElementById('gameover-icon').textContent=isDraw?'🤝':iWon?'🏆':'💀';
  document.getElementById('gameover-title').textContent=isDraw?'DRAW':iWon?'YOU WIN!':'DEFEATED!';
  let sub;
  if(isDraw)sub=quitterName?`${quitterName} quit.`:'Draw!';
  else if(disconnected)sub='Opponent disconnected — you win!';
  else if(iWon)sub=`You defeated ${winnerName}!`;
  else sub=`${winnerName} wins this round.`;
  document.getElementById('gameover-sub').textContent=sub;
  document.getElementById('gameover-coins').textContent=coinsEarned>0?`+🪙 ${coinsEarned} coins!`:'';
  const go=document.getElementById('screen-gameover');
  go.style.display='flex'; go.style.position='fixed'; go.style.inset='0'; go.style.zIndex='99999';
  go.style.alignItems='center'; go.style.justifyContent='center'; go.style.background='#0a0c18'; go.style.flexDirection='column';
}
function hideGameOver(){const go=document.getElementById('screen-gameover');go.style.display='none';}

function quitMatch(){if(!socket||!gameRunning)return;if(!confirm('Quit? Match ends as draw.'))return;socket.emit('quitMatch');}
function showReportModal(){document.getElementById('report-modal').classList.remove('hidden');const oppName=document.getElementById('hud-name-opp').textContent;document.getElementById('report-target-name').textContent=oppName;document.getElementById('report-username-hidden').value=oppName;}
function hideReportModal(){const m=document.getElementById('report-modal');if(m)m.classList.add('hidden');}
function submitReport(){const reason=document.getElementById('report-reason').value;const details=document.getElementById('report-details').value.trim();const reported=document.getElementById('report-username-hidden').value;if(!reason){alert('Please select a reason.');return;}socket.emit('reportPlayer',{reportedUsername:reported,reason,details});hideReportModal();}
function showReportConfirmation(message){const el=document.getElementById('report-confirmation');if(!el)return;el.textContent=message;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3000);}

// ── Emotes ────────────────────────────────────────────
const EMOTE_DEFS={wave:{emoji:'👋',label:'Wave',color:0x44ddff,bounce:'wave'},laugh:{emoji:'😂',label:'Laugh',color:0xffee44,bounce:'shake'},gg:{emoji:'🤝',label:'GG',color:0x44ff88,bounce:'nod'},flex:{emoji:'💪',label:'Flex',color:0xff8844,bounce:'flex'},angry:{emoji:'😤',label:'Angry',color:0xff3333,bounce:'shake'},dance:{emoji:'🕺',label:'Dance',color:0xcc44ff,bounce:'dance'},think:{emoji:'🤔',label:'Think',color:0xaaaaff,bounce:'nod'},fire:{emoji:'🔥',label:'Hype',color:0xff6600,bounce:'dance'}};
const activeEmoteParticles=[],playerAnims={};let emoteWheelVisible=false;
function toggleEmoteWheel(){emoteWheelVisible=!emoteWheelVisible;const w=document.getElementById('emote-wheel');w.classList.toggle('hidden',!emoteWheelVisible);if(emoteWheelVisible)buildEmoteGrid();}
function hideEmoteWheel(){emoteWheelVisible=false;const el=document.getElementById('emote-wheel');if(el)el.classList.add('hidden');}
function buildEmoteGrid(){const grid=document.getElementById('emote-grid');if(!grid)return;grid.innerHTML='';Object.entries(EMOTE_DEFS).forEach(([key,def])=>{const owned=profile&&profile.inventory.includes('emote_'+key);const btn=document.createElement('button');btn.className='emote-item'+(owned?'':' emote-locked');btn.title=owned?def.label:def.label+' (Not owned)';if(owned)btn.onclick=()=>sendEmote(key);const icon=document.createElement('div');icon.textContent=def.emoji;const label=document.createElement('span');label.textContent=owned?def.label:'🔒';btn.appendChild(icon);btn.appendChild(label);grid.appendChild(btn);});}
function sendEmote(emoteKey){if(!socket||!gameRunning)return;if(!profile.inventory.includes('emote_'+emoteKey)){showReportConfirmation('Buy in Shop!');hideEmoteWheel();return;}hideEmoteWheel();socket.emit('emote',{emoteKey});}
function playEmote(emoteKey,fromId){const def=EMOTE_DEFS[emoteKey];if(!def)return;const mesh=playerMeshes[fromId];if(!mesh)return;playerAnims[fromId]={type:def.bounce,startTime:Date.now(),duration:1800};spawnEmoteParticles(mesh.position,def);showFloatingEmoji(def.emoji,mesh.position);}
function spawnEmoteParticles(wp,def){for(let i=0;i<10;i++){const size=.08+Math.random()*.12;const geo=new THREE.OctahedronGeometry(size);const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:1}));const a=(i/10)*Math.PI*2;const sp=.025+Math.random()*.03;m.position.set(wp.x+(Math.random()-.5)*.8,wp.y+2.4+Math.random()*.4,wp.z+(Math.random()-.5)*.8);m.userData={vx:Math.cos(a)*sp,vy:.04+Math.random()*.04,vz:Math.sin(a)*sp,life:1.0,decay:.018+Math.random()*.012,spin:(Math.random()-.5)*.15};scene.add(m);activeEmoteParticles.push(m);}const fl=new THREE.PointLight(def.color,3,8);fl.position.set(wp.x,wp.y+2.5,wp.z);scene.add(fl);let fv=1.0;const fd=()=>{fv-=.05;fl.intensity=fv*3;if(fv>0)requestAnimationFrame(fd);else scene.remove(fl);};requestAnimationFrame(fd);}
function showFloatingEmoji(emoji,wp){const div=document.createElement('div');div.textContent=emoji;div.style.cssText='position:fixed;pointer-events:none;z-index:50;font-size:2.4rem;filter:drop-shadow(0 0 8px rgba(255,255,255,.8));';document.body.appendChild(div);const start=Date.now();div._wp={x:wp.x,y:wp.y+3.2,z:wp.z};const animate=()=>{const t=(Date.now()-start)/2000;if(t>=1){div.remove();return;}const v=new THREE.Vector3(div._wp.x,div._wp.y+t*1.5,div._wp.z);v.project(camera);div.style.left=((v.x*.5+.5)*window.innerWidth-20)+'px';div.style.top=((-v.y*.5+.5)*window.innerHeight-20)+'px';div.style.opacity=t<.2?t/.2:t>.7?1-(t-.7)/.3:1;div.style.transform=`scale(${1+Math.sin(t*Math.PI)*.4})`;requestAnimationFrame(animate);};requestAnimationFrame(animate);}
function tickEmotes(){for(let i=activeEmoteParticles.length-1;i>=0;i--){const p=activeEmoteParticles[i];const d=p.userData;p.position.x+=d.vx;p.position.y+=d.vy;p.position.z+=d.vz;d.vy-=.002;d.vx*=.97;d.vz*=.97;p.rotation.x+=d.spin;p.rotation.z+=d.spin*.7;d.life-=d.decay;p.material.opacity=Math.max(0,d.life);if(d.life<=0){scene.remove(p);activeEmoteParticles.splice(i,1);}}
  const now=Date.now();for(const[id,anim]of Object.entries(playerAnims)){const mesh=playerMeshes[id];if(!mesh){delete playerAnims[id];continue;}const t=(now-anim.startTime)/anim.duration;if(t>=1){mesh.position.y=0;mesh.rotation.z=0;mesh.rotation.x=0;mesh.scale.set(1,1,1);delete playerAnims[id];continue;}const ph=t*Math.PI*2;switch(anim.type){case 'wave':mesh.rotation.z=Math.sin(ph*2)*.25;mesh.position.y=Math.abs(Math.sin(ph))*.3;break;case 'shake':mesh.position.x+=Math.sin(ph*8)*.04;mesh.rotation.z=Math.sin(ph*8)*.15;break;case 'nod':mesh.rotation.x=Math.sin(ph*3)*.2;mesh.position.y=Math.abs(Math.sin(ph*1.5))*.15;break;case 'flex':mesh.position.y=Math.abs(Math.sin(ph*2))*.5;mesh.rotation.z=Math.sin(ph)*.3;mesh.scale.set(1+Math.abs(Math.sin(ph))*.15,1,1);break;case 'dance':mesh.position.y=Math.abs(Math.sin(ph*3))*.4;mesh.rotation.y+=.08;break;}}}
function clearEmotes(){activeEmoteParticles.forEach(p=>scene&&scene.remove(p));activeEmoteParticles.length=0;for(const k in playerAnims)delete playerAnims[k];}

// ── Socket ────────────────────────────────────────────
function connectSocket(){
  if(socket&&socket.connected)return;
  socket=io();
  socket.on('connect',()=>{socket.emit('registerPresence',{username:profile.username,cosmetics:{equippedSkin:profile.equippedSkin,equippedWeapon:profile.equippedWeapon,equippedTitle:profile.equippedTitle}});});
  socket.on('yourId',id=>{myId=id;});
  socket.on('matchFound',({players})=>{startGame(players);});
  socket.on('gameState',state=>{if(gameRunning)updateGameState(state);});
  socket.on('playerHit',({playerId,hp,stunned})=>{if(playerId===myId){flashHit();updateMyHP(hp);if(stunned)showStun();}else updateOppHP(hp);});
  socket.on('shieldActivated',({playerId})=>{setShieldVisible(playerId,true);});
  socket.on('shieldExpired',({playerId})=>{setShieldVisible(playerId,false);});
  socket.on('shieldBlocked',({playerId})=>{const m=playerMeshes[playerId];if(m&&m.userData.shield){m.userData.shield.visible=true;setTimeout(()=>{if(m.userData.shield)m.userData.shield.visible=false;},400);}});
  socket.on('gameOver',({winnerId,winnerName,coinsEarned})=>{const iWon=winnerId===myId;const earned=coinsEarned?(coinsEarned[myId]||0):0;if(earned>0)profile.coins+=earned;endGame(iWon,winnerName,false,earned);});
  socket.on('opponentDisconnected',()=>endGame(true,profile.username,true,50));
  socket.on('kicked',({reason})=>{gameRunning=false;if(animFrameId){cancelAnimationFrame(animFrameId);animFrameId=null;}hideGameOver();socket.disconnect();socket=null;alert('⚠️ '+(reason||'Kicked by admin.'));showScreen('screen-splash');hideSplashLoading();drawSplashPlayer();localStorage.removeItem('pixelio_token');});
  socket.on('matchDraw',({quitterName})=>{endGame(null,null,false,0,quitterName);});
  socket.on('reportReceived',({message})=>{showReportConfirmation(message);});
  socket.on('opponentEmote',({emoteKey,fromId})=>{playEmote(emoteKey,fromId);});
  socket.on('myEmote',({emoteKey,fromId})=>{playEmote(emoteKey,fromId);});
  socket.on('onlineStatus',({username,online})=>{if(online)onlineFriends.add(username);else onlineFriends.delete(username);renderFriends();});
  socket.on('friendInvite',({fromUsername})=>{pendingInviteFrom=fromUsername;document.getElementById('invite-from').textContent=fromUsername;document.getElementById('invite-toast').classList.remove('hidden');});
  socket.on('inviteDeclined',({byUsername})=>{showReportConfirmation(`${byUsername} declined.`);});
  socket.on('inviteError',({message})=>{showReportConfirmation(message);});
  socket.on('waiting',({message})=>{document.getElementById('lobby-msg').textContent=message;});
  socket.on('announcement',({message,from})=>{
    const el=document.getElementById('report-confirmation');
    if(el){el.textContent='📢 Admin '+from+': '+message;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),8000);}
  });
  socket.on('muted',({minutes})=>{
    window._isMuted=true; window._muteUntil=Date.now()+minutes*60000;
    showReportConfirmation('🔇 You have been muted for '+minutes+' minutes.');
  });
  socket.on('unmuted',()=>{
    window._isMuted=false; window._muteUntil=0;
    showReportConfirmation('🔊 You have been unmuted.');
  });
}
function joinQueue(){
  if(!socket)connectSocket();
  document.getElementById('lobby-username').textContent=profile.username;
  const lt=document.getElementById('lobby-title');if(lt)lt.textContent='🎮 Finding Match...';
  document.getElementById('lobby-msg').textContent='Searching for an opponent...';
  showScreen('screen-lobby');
  socket.emit('joinQueue',{username:profile.username,token:authToken,cosmetics:{equippedSkin:profile.equippedSkin,equippedWeapon:profile.equippedWeapon,equippedTitle:profile.equippedTitle}});
}

// ── API Helper ────────────────────────────────────────
async function apiFetch(url,method,body){
  try{
    const opts={method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken}};
    if(body&&method!=='GET')opts.body=JSON.stringify(body);
    const res=await fetch(url,opts); const data=await res.json();
    if(!res.ok){
      const errMsg=data.error||'An error occurred.';
      const msgEl=document.getElementById('friend-msg');
      const adminEl=document.getElementById('admin-give-msg');
      const adminPanel=document.getElementById('panel-admin');
      if(adminEl&&adminPanel&&adminPanel.classList.contains('active')){adminEl.textContent=errMsg;adminEl.className='friend-msg error';adminEl.classList.remove('hidden');}
      else if(msgEl){msgEl.textContent=errMsg;msgEl.className='friend-msg error';msgEl.classList.remove('hidden');}
      else showReportConfirmation('Error: '+errMsg);
      return null;
    }
    return data;
  }catch(e){console.error('apiFetch:',e);return null;}
}

// ══════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  spawnParticles('particles');
  startSplashAnimation();

  // Settings slider live
  const sensSlider=document.getElementById('setting-sensitivity');
  const sensVal=document.getElementById('setting-sensitivity-val');
  if(sensSlider)sensSlider.addEventListener('input',()=>{if(sensVal)sensVal.textContent=sensSlider.value;applySensitivity(parseInt(sensSlider.value));});

  // Auth
  document.getElementById('btn-auth-submit').addEventListener('click',doAuth);
  document.getElementById('auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth();});
  document.getElementById('btn-auth-close').addEventListener('click',closeAuthModal);
  document.getElementById('auth-modal').addEventListener('click',e=>{if(e.target===document.getElementById('auth-modal'))closeAuthModal();});
  document.getElementById('btn-logout').addEventListener('click',logout);

  // Play
  document.getElementById('btn-play-game').addEventListener('click',joinQueue);
  document.getElementById('btn-practice-game').addEventListener('click',startPractice);

  // Lobby
  document.getElementById('btn-leave-lobby').addEventListener('click',()=>{if(socket)socket.emit('leaveQueue');enterMainMenu();});

  // In-game
  document.getElementById('btn-quit-match').addEventListener('click',quitMatch);
  document.getElementById('btn-report-player').addEventListener('click',showReportModal);
  document.getElementById('btn-report-submit').addEventListener('click',submitReport);
  document.getElementById('btn-report-cancel').addEventListener('click',hideReportModal);
  document.getElementById('btn-emote-toggle').addEventListener('click',toggleEmoteWheel);

  // Friends
  document.getElementById('btn-send-request').addEventListener('click',sendFriendRequest);
  document.getElementById('friend-search-input').addEventListener('keydown',e=>{if(e.key==='Enter')sendFriendRequest();});

  // Profile
  document.getElementById('btn-save-bio').addEventListener('click',saveBio);
  document.getElementById('btn-lookup-profile').addEventListener('click',lookupProfile);
  document.getElementById('profile-lookup-input').addEventListener('keydown',e=>{if(e.key==='Enter')lookupProfile();});

  // Settings
  document.getElementById('btn-save-settings').addEventListener('click',saveSettings);
  document.getElementById('btn-settings-logout').addEventListener('click',logout);

  // Gift
  document.getElementById('btn-gift-send').addEventListener('click',sendGift);
  document.getElementById('btn-gift-cancel').addEventListener('click',closeGiftModal);
  document.getElementById('gift-username').addEventListener('keydown',e=>{if(e.key==='Enter')sendGift();});
  document.getElementById('gift-modal').addEventListener('click',e=>{if(e.target===document.getElementById('gift-modal'))closeGiftModal();});

  // Invite toast
  document.getElementById('btn-accept-invite').addEventListener('click',()=>{
    if(!pendingInviteFrom)return;
    socket.emit('acceptInvite',{fromUsername:pendingInviteFrom});
    document.getElementById('invite-toast').classList.add('hidden');
    const lt=document.getElementById('lobby-title');if(lt)lt.textContent='🎮 Connecting...';
    showScreen('screen-lobby');
    document.getElementById('lobby-msg').textContent='Connecting to match...';
    pendingInviteFrom=null;
  });
  document.getElementById('btn-decline-invite').addEventListener('click',()=>{
    if(pendingInviteFrom)socket.emit('declineInvite',{fromUsername:pendingInviteFrom});
    document.getElementById('invite-toast').classList.add('hidden');
    pendingInviteFrom=null;
  });

  // Game over
  document.getElementById('btn-play-again').addEventListener('click',()=>{
    hideGameOver();
    if(scene){Object.values(playerMeshes).forEach(m=>scene.remove(m));Object.values(projMeshes).forEach(m=>scene.remove(m));}
    playerMeshes={};projMeshes={};clearEmotes();joinQueue();
  });
  document.getElementById('btn-gameover-menu').addEventListener('click',()=>{
    hideGameOver();
    if(scene){Object.values(playerMeshes).forEach(m=>scene.remove(m));Object.values(projMeshes).forEach(m=>scene.remove(m));}
    playerMeshes={};projMeshes={};clearEmotes();enterMainMenu();
  });

  const loggedIn=await tryAutoLogin();
  if(!loggedIn)showScreen('screen-splash');
});

// ── buildArena (battle themed) ───────────────────────
function buildArena() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80,80,20,20), new THREE.MeshLambertMaterial({color:0x3a5c2a}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14,48), new THREE.MeshLambertMaterial({color:0x5a5a6a}));
  floor.rotation.x=-Math.PI/2; floor.position.y=.01; scene.add(floor);
  const mark = new THREE.Mesh(new THREE.RingGeometry(11,12,48), new THREE.MeshLambertMaterial({color:0x4444aa}));
  mark.rotation.x=-Math.PI/2; mark.position.y=.02; scene.add(mark);
  const crateMat = new THREE.MeshLambertMaterial({color:0x8b6914});
  [[5,0,5],[-5,0,5],[5,0,-5],[-5,0,-5],[0,0,8],[0,0,-8]].forEach(([x,y,z])=>{
    const crate=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),crateMat); crate.position.set(x,.6,z); crate.castShadow=true; crate.receiveShadow=true; scene.add(crate);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(1.22,.1,1.22),new THREE.MeshLambertMaterial({color:0xcc9922})); stripe.position.set(x,1.26,z); scene.add(stripe);
  });
  const barrierMat = new THREE.MeshLambertMaterial({color:0x666677});
  for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2;const bar=new THREE.Mesh(new THREE.BoxGeometry(3.2,.8,.4),barrierMat);bar.position.set(Math.cos(a)*13,.4,Math.sin(a)*13);bar.rotation.y=a+Math.PI/2;bar.castShadow=true;scene.add(bar);}
  const dropBase=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,.2,8),new THREE.MeshLambertMaterial({color:0x886600})); dropBase.position.y=.1; scene.add(dropBase);
  const dropBox=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),new THREE.MeshLambertMaterial({color:0xffaa00})); dropBox.position.y=.7; dropBox.castShadow=true; scene.add(dropBox);
  const supplyLight=new THREE.PointLight(0xffaa00,1.2,8); supplyLight.position.set(0,1.5,0); scene.add(supplyLight);
  (function pulse(){const t=Date.now()*.001;supplyLight.intensity=1.0+Math.sin(t*3)*.4;dropBox.rotation.y=t*.5;requestAnimationFrame(pulse);})();
}

// ── Locker ────────────────────────────────────────────
let currentLockerTab = 'skin';
const LOCKER_TAB_LABELS = { skin:'skins', weapon:'weapon skins', title:'titles', emote:'emotes' };

function lockerTab(tab, btn) {
  currentLockerTab = tab;
  document.querySelectorAll('.locker-tab').forEach(t => t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderLocker(tab);
}

function renderLocker(tab) {
  currentLockerTab = tab || currentLockerTab;
  const grid = document.getElementById('locker-grid'); if(!grid) return;
  const countEl = document.getElementById('locker-count');
  const owned = shopCatalog.filter(i => i.category === currentLockerTab && profile.inventory.includes(i.id));
  const total = shopCatalog.filter(i => i.category === currentLockerTab).length;
  if(countEl) countEl.textContent = `${owned.length} / ${total} ${LOCKER_TAB_LABELS[currentLockerTab]||currentLockerTab+'s'} owned`;
  const lpc = document.getElementById('locker-preview-canvas');
  if(lpc) renderPreviewCanvas(lpc);
  grid.innerHTML = '';
  if(!owned.length){
    grid.innerHTML=`<div class="locker-empty">You don't own any ${LOCKER_TAB_LABELS[currentLockerTab]||currentLockerTab+'s'} yet.<br/>Visit the <strong>Shop</strong> to get some!</div>`;
    return;
  }
  owned.forEach(item => {
    const isEquipped =
      (item.category==='skin'   && profile.equippedSkin   === item.id) ||
      (item.category==='weapon' && profile.equippedWeapon === item.id) ||
      (item.category==='title'  && profile.equippedTitle  === item.id);
    const card = document.createElement('div');
    card.className = 'locker-card' + (isEquipped ? ' locker-equipped' : '');
    const prev = document.createElement('div'); prev.className = 'locker-preview';
    if(item.category==='skin'){
      const c=SKIN_COLORS[item.id]||0x1a88ff; prev.style.background='#'+c.toString(16).padStart(6,'0'); prev.textContent='🧍';
    } else if(item.category==='weapon'){
      const col=item.color?'#'+item.color.toString(16).padStart(6,'0'):'#1a0a2e';
      prev.style.background=`radial-gradient(circle at 50% 50%,${col}88,#0a0518)`; prev.textContent=item.preview||'🔫'; prev.style.fontSize='1.8rem';
    } else if(item.category==='emote'){
      prev.textContent=item.preview||'😄'; prev.style.background='#1a1030'; prev.style.fontSize='2rem';
    } else {
      prev.style.background='#1a1408'; prev.style.border='1px solid '+(item.preview||'#f0c040'); prev.textContent='🏷️';
    }
    const name = document.createElement('div'); name.className='locker-item-name'; name.textContent=item.name;
    const statusRow = document.createElement('div'); statusRow.className='locker-status-row';
    if(isEquipped){
      const badge=document.createElement('span'); badge.className='locker-badge equipped'; badge.textContent='✓ Equipped'; statusRow.appendChild(badge);
    } else if(item.category!=='emote'){
      const btn=document.createElement('button'); btn.className='locker-equip-btn'; btn.textContent='Equip'; btn.onclick=()=>equipItemFromLocker(item.id); statusRow.appendChild(btn);
    } else {
      const badge=document.createElement('span'); badge.className='locker-badge owned'; badge.textContent='✓ Owned'; statusRow.appendChild(badge);
    }
    card.appendChild(prev); card.appendChild(name); card.appendChild(statusRow); grid.appendChild(card);
  });
}

async function equipItemFromLocker(itemId) {
  const res = await apiFetch('/api/shop/equip','POST',{itemId}); if(!res) return;
  profile = res.profile; updateMenuUI(); renderLocker(currentLockerTab); renderPreviewCanvas(); showReportConfirmation('✅ Equipped!');
}
