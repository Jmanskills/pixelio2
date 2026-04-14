// ═══════════════════════════════════════════════════
//  PIXELIO — CLIENT  (complete rewrite)
// ═══════════════════════════════════════════════════

// ── State ────────────────────────────────────────────
let socket = null, myId = null, profile = null, authToken = null;
let shopCatalog = [], currentShopTab = 'robe', currentTab = 'login';
let pendingInviteFrom = null;
let onlineFriends = new Set();

const ROBE_COLORS  = { robe_default:0x6a0dad, robe_crimson:0xcc1122, robe_ocean:0x0066cc, robe_forest:0x1a7a2a, robe_gold:0xd4a017, robe_shadow:0x1a1a2e, robe_rainbow:0xff44aa };
const SPELL_COLORS = { spell_default:null, spell_lava:0xff6600, spell_frost:0x88eeff, spell_venom:0x44ff44, spell_dark:0x220033, spell_solar:0xffdd00 };

// ── Screens ───────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
  document.getElementById(id).classList.add('active');
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
    if(!res.ok){errEl.textContent=data.error||'Authentication failed.';errEl.classList.remove('hidden');btn.disabled=false;btn.textContent='Enter the Arena';return;}
    authToken=data.token; profile=data.profile;
    localStorage.setItem('pixelio_token',authToken);
    closeAuthModal();
    await loadShopCatalog(); enterMainMenu();
  } catch {
    errEl.textContent='Network error. Try again.';errEl.classList.remove('hidden');
    btn.disabled=false; btn.textContent='Enter the Arena';
  }
}

function logout() {
  localStorage.removeItem('pixelio_token');
  authToken=null; profile=null; myId=null;
  if(socket){socket.disconnect();socket=null;}
  hideSplashLoading();
  showScreen('screen-splash');
  drawSplashWizard();
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
  document.getElementById('menu-title-badge').textContent = titleItem?titleItem.name:'Wizard';
  document.getElementById('lobby-username').textContent = profile.username;
  const robeColor = hexToCSS(ROBE_COLORS[profile.equippedRobe]||0x6a0dad);
  const av = document.getElementById('avatar-robe');
  av.style.cssText=`background:${robeColor};display:flex;align-items:center;justify-content:center;font-size:1.4rem;`;
  av.textContent='🧙';
}

function hexToCSS(hex) { return '#'+hex.toString(16).padStart(6,'0'); }

function menuNav(tab) {
  document.querySelectorAll('.menu-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.menu-panel').forEach(p=>p.classList.remove('active'));
  const navBtn=document.getElementById('nav-'+tab); if(navBtn)navBtn.classList.add('active');
  const panel=document.getElementById('panel-'+tab); if(panel)panel.classList.add('active');
  if(tab==='shop')    renderShop();
  if(tab==='friends') loadFriends();
  if(tab==='news')    loadNews();
  if(tab==='admin')   adminTab('users');
  if(tab==='profile') loadProfilePanel();
}

// ── Preview Canvas ────────────────────────────────────
function renderPreviewCanvas() {
  const canvas=document.getElementById('preview-canvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d'); const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const robeHex=ROBE_COLORS[profile?profile.equippedRobe:'robe_default']||0x6a0dad;
  const robeColor=hexToCSS(robeHex);
  const grd=ctx.createRadialGradient(w/2,h*.6,10,w/2,h*.6,90);
  grd.addColorStop(0,robeColor+'44'); grd.addColorStop(1,'transparent');
  ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(w/2,h-20,35,10,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=robeColor; ctx.beginPath(); ctx.moveTo(w/2-22,h-30); ctx.lineTo(w/2+22,h-30); ctx.lineTo(w/2+32,h-30); ctx.lineTo(w/2+28,h-100); ctx.lineTo(w/2-28,h-100); ctx.lineTo(w/2-32,h-30); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#f5d5a0'; ctx.beginPath(); ctx.arc(w/2,h-116,20,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#111122'; ctx.beginPath(); ctx.ellipse(w/2,h-134,28,7,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#111122'; ctx.beginPath(); ctx.moveTo(w/2-20,h-134); ctx.lineTo(w/2+20,h-134); ctx.lineTo(w/2,h-186); ctx.closePath(); ctx.fill();
  ctx.fillStyle=robeColor; ctx.font='14px serif'; ctx.textAlign='center'; ctx.fillText('★',w/2,h-155);
  ctx.strokeStyle='#8b5e3c'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(w/2+34,h-30); ctx.lineTo(w/2+38,h-145); ctx.stroke();
  ctx.fillStyle=robeColor; ctx.font='16px serif'; ctx.fillText('◆',w/2+36,h-148);
  if(profile){const spellColor=SPELL_COLORS[profile.equippedSpell];if(spellColor){ctx.fillStyle=hexToCSS(spellColor);ctx.globalAlpha=.6;ctx.fillText('◆',w/2+36,h-148);ctx.globalAlpha=1;}}
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
    const equipped=(item.category==='robe'&&profile.equippedRobe===item.id)||(item.category==='spell'&&profile.equippedSpell===item.id)||(item.category==='title'&&profile.equippedTitle===item.id);
    const card=document.createElement('div');
    card.className='shop-item'+(owned?' owned':'')+(equipped?' equipped':'');
    const preview=document.createElement('div'); preview.className='shop-preview';
    if(item.category==='robe'){preview.style.background=hexToCSS(item.color||0x6a0dad);preview.textContent='🧙';}
    else if(item.category==='spell'){preview.style.background=item.color?hexToCSS(item.color):'#9b30e8';preview.textContent='✨';}
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
    else if(owned){btn.textContent='Equip';btn.className+=' equip';btn.onclick=()=>equipItem(item.id);}
    else if(item.price===0){btn.textContent='Free — Equip';btn.className+=' equip';btn.onclick=()=>buyAndEquip(item.id,0);}
    else{btn.textContent='🪙 '+item.price;if(profile.coins<item.price)btn.disabled=true;btn.onclick=()=>buyAndEquip(item.id,item.price);}
    card.appendChild(preview); card.appendChild(name); card.appendChild(desc); card.appendChild(btn);
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
  document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
  const tabs=document.querySelectorAll('.admin-tab');
  const tabNames=['users','reports','news','give'];
  const idx=tabNames.indexOf(tab); if(tabs[idx])tabs[idx].classList.add('active');
  const panel=document.getElementById('admin-panel-'+tab); if(panel)panel.classList.add('active');
  if(tab==='reports')adminLoadReports();
  if(tab==='news')adminLoadNewsPanel();
  if(tab==='give')adminPopulateItemSelect();
}
async function adminSearchUsers() {
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
async function adminLoadReports() {
  const res=await apiFetch('/api/admin/reports','GET'); if(!res)return;
  const list=document.getElementById('admin-reports-list');
  if(!res.reports.length){list.innerHTML='<div class="admin-empty">No reports yet.</div>';return;}
  list.innerHTML=res.reports.map(r=>`<div class="admin-report-row ${r.status}"><div class="admin-report-header"><span class="admin-report-from">🚩 <strong>${escHtml(r.reporterUsername)}</strong> reported <strong>${escHtml(r.reportedUsername)}</strong></span><span class="tag tag-${r.status}">${r.status}</span></div><div class="admin-report-reason">Reason: ${escHtml(r.reason)}</div>${r.details?`<div class="admin-report-details">"${escHtml(r.details)}"</div>`:''}<div class="admin-report-meta">${new Date(r.createdAt).toLocaleString()}</div><div class="admin-report-actions"><button class="btn-small btn-accept" onclick="adminSetReportStatus('${r._id}','reviewed')">Mark Reviewed</button><button class="btn-small" onclick="adminSetReportStatus('${r._id}','dismissed')">Dismiss</button><button class="btn-small btn-decline" onclick="adminBan('${escHtml(r.reportedUsername)}')">Ban Player</button></div></div>`).join('');
}
async function adminSetReportStatus(id,status){await apiFetch(`/api/admin/reports/${id}/status`,'POST',{status});adminLoadReports();}
async function adminLoadNewsPanel() {
  const res=await fetch('/api/admin/news'); const data=await res.json();
  const list=document.getElementById('admin-news-list');
  if(!data.news||!data.news.length){list.innerHTML='<div class="admin-empty">No news posted yet.</div>';return;}
  list.innerHTML=data.news.map(n=>`<div class="admin-news-row"><div class="admin-news-title">${n.pinned?'📌 ':''}${escHtml(n.title)}</div><div class="admin-news-body">${escHtml(n.body)}</div><div class="admin-news-meta">${new Date(n.createdAt).toLocaleString()}</div><button class="btn-small btn-decline" onclick="adminDeleteNews('${n._id}')">Delete</button></div>`).join('');
}
async function adminPostNews() {
  const title=document.getElementById('admin-news-title').value.trim();
  const body=document.getElementById('admin-news-body').value.trim();
  const pinned=document.getElementById('admin-news-pinned').checked;
  if(!title||!body){showAdminMsg('Title and body required.');return;}
  const res=await apiFetch('/api/admin/news','POST',{title,body,pinned});
  if(res){showAdminMsg('News posted!');document.getElementById('admin-news-title').value='';document.getElementById('admin-news-body').value='';document.getElementById('admin-news-pinned').checked=false;adminLoadNewsPanel();}
}
async function adminDeleteNews(id){if(!confirm('Delete this news post?'))return;await apiFetch(`/api/admin/news/${id}`,'DELETE');adminLoadNewsPanel();}
function adminPopulateItemSelect() {
  const sel=document.getElementById('admin-give-item'); sel.innerHTML='<option value="">— Select item to give —</option>';
  ['robe','spell','title','emote'].forEach(cat=>{
    const items=shopCatalog.filter(i=>i.category===cat); if(!items.length)return;
    const og=document.createElement('optgroup'); og.label=cat.charAt(0).toUpperCase()+cat.slice(1)+'s';
    items.forEach(item=>{const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name+(item.price?` (🪙${item.price})`:' (Free)');og.appendChild(opt);});
    sel.appendChild(og);
  });
}
async function adminGiveItem() {
  const username=document.getElementById('admin-give-username').value.trim();
  const itemId=document.getElementById('admin-give-item').value;
  if(!username||!itemId){showAdminMsg('Username and item required.');return;}
  const res=await apiFetch('/api/admin/giveitem','POST',{username,itemId});
  showAdminMsg(res?res.message:'Error giving item.');
}
async function adminGiveCoins() {
  const username=document.getElementById('admin-coins-username').value.trim();
  const amount=parseInt(document.getElementById('admin-coins-amount').value);
  if(!username||!amount||amount<1){showAdminMsg('Username and valid amount required.');return;}
  const res=await apiFetch('/api/admin/givecoins','POST',{username,amount});
  showAdminMsg(res?res.message:'Error giving coins.');
}
function showAdminMsg(msg) {
  const el=document.getElementById('admin-give-msg'); if(!el){showReportConfirmation(msg);return;}
  el.textContent=msg;el.className='friend-msg success';el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),4000);
}

// ── Profile ───────────────────────────────────────────
const AVATARS = [
  {id:'wizard1',emoji:'🧙',label:'Classic Wizard',robeColor:'#6a0dad'},{id:'wizard2',emoji:'🧙',label:'Crimson Mage',robeColor:'#cc1122'},
  {id:'wizard3',emoji:'🧙',label:'Ocean Sorcerer',robeColor:'#0066cc'},{id:'wizard4',emoji:'🧙',label:'Forest Druid',robeColor:'#1a7a2a'},
  {id:'wizard5',emoji:'🧙',label:'Golden Archmage',robeColor:'#d4a017'},{id:'wizard6',emoji:'🧙',label:'Shadow Warlock',robeColor:'#1a1a2e'},
  {id:'wizard7',emoji:'🔮',label:'Crystal Seer',robeColor:'#88ddff'},{id:'wizard8',emoji:'⚡',label:'Storm Caller',robeColor:'#ffee00'},
  {id:'wizard9',emoji:'🔥',label:'Fire Sage',robeColor:'#ff4400'},{id:'wizard10',emoji:'❄️',label:'Frost Witch',robeColor:'#88ccff'},
  {id:'wizard11',emoji:'🌿',label:'Nature Shaman',robeColor:'#44aa44'},{id:'wizard12',emoji:'💀',label:'Death Mage',robeColor:'#330033'},
];

function loadProfilePanel() {
  if(!profile)return;
  document.getElementById('profile-username-display').textContent=profile.username;
  const titleItem=shopCatalog.find(i=>i.id===profile.equippedTitle);
  document.getElementById('profile-title-display').textContent=titleItem?titleItem.name:'Wizard';
  document.getElementById('profile-bio-input').value=profile.bio||'';
  document.getElementById('prof-wins').textContent=profile.wins;
  document.getElementById('prof-losses').textContent=profile.losses;
  document.getElementById('prof-coins').textContent=profile.coins;
  drawProfileAvatar('profile-avatar-canvas',profile.avatar||'wizard1',120,160);
  const av=AVATARS.find(a=>a.id===(profile.avatar||'wizard1'));
  document.getElementById('profile-avatar-label').textContent=av?av.label:'';
  buildAvatarGrid();
}

function buildAvatarGrid() {
  const grid=document.getElementById('avatar-grid'); if(!grid)return; grid.innerHTML='';
  AVATARS.forEach(av=>{
    const card=document.createElement('div'); card.className='avatar-option'+(profile.avatar===av.id?' selected':''); card.title=av.label; card.onclick=()=>selectAvatar(av.id);
    const cvs=document.createElement('canvas'); cvs.width=60;cvs.height=80; card.appendChild(cvs); drawProfileAvatar(cvs,av.id,60,80);
    const lbl=document.createElement('div'); lbl.className='avatar-option-label'; lbl.textContent=av.label; card.appendChild(lbl);
    grid.appendChild(card);
  });
}

function drawProfileAvatar(canvasOrId,avatarId,w,h) {
  const canvas=typeof canvasOrId==='string'?document.getElementById(canvasOrId):canvasOrId; if(!canvas)return;
  const ctx=canvas.getContext('2d'); const av=AVATARS.find(a=>a.id===avatarId)||AVATARS[0];
  ctx.clearRect(0,0,w,h);
  const grd=ctx.createRadialGradient(w/2,h*.6,5,w/2,h*.6,w*.6); grd.addColorStop(0,av.robeColor+'55'); grd.addColorStop(1,'transparent');
  ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
  const s=w/120;
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(w/2,h-10*s,22*s,6*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=av.robeColor; ctx.beginPath(); ctx.moveTo(w/2-18*s,h-18*s); ctx.lineTo(w/2+18*s,h-18*s); ctx.lineTo(w/2+22*s,h-18*s); ctx.lineTo(w/2+19*s,h-65*s); ctx.lineTo(w/2-19*s,h-65*s); ctx.lineTo(w/2-22*s,h-18*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(w/2,h-18*s); ctx.lineTo(w/2+22*s,h-18*s); ctx.lineTo(w/2+19*s,h-65*s); ctx.lineTo(w/2,h-65*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#f5d5a0'; ctx.beginPath(); ctx.arc(w/2,h-78*s,13*s,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#111122'; ctx.beginPath(); ctx.ellipse(w/2,h-88*s,18*s,5*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#111122'; ctx.beginPath(); ctx.moveTo(w/2-13*s,h-88*s); ctx.lineTo(w/2+13*s,h-88*s); ctx.lineTo(w/2,h-120*s); ctx.closePath(); ctx.fill();
  if(av.emoji!=='🧙'){ctx.font=`${14*s}px serif`;ctx.textAlign='center';ctx.fillText(av.emoji,w/2,h-98*s);}
  else{ctx.fillStyle=av.robeColor;ctx.font=`${10*s}px serif`;ctx.textAlign='center';ctx.fillText('★',w/2,h-102*s);}
}

async function selectAvatar(avatarId) {
  const res=await apiFetch('/api/profile','PATCH',{avatar:avatarId}); if(!res)return;
  profile=res.profile; loadProfilePanel(); renderPreviewCanvas(); updateMenuUI();
}
async function saveBio() {
  const bio=document.getElementById('profile-bio-input').value.trim();
  const res=await apiFetch('/api/profile','PATCH',{bio}); if(res){profile=res.profile;showReportConfirmation('Bio saved!');}
}
async function lookupProfile() {
  const username=document.getElementById('profile-lookup-input').value.trim(); if(!username)return;
  const resultEl=document.getElementById('profile-lookup-result');
  resultEl.innerHTML='<div style="color:var(--gray);font-size:.85rem">Searching...</div>';
  resultEl.classList.remove('hidden');
  try {
    const res=await fetch(`/api/profile/${encodeURIComponent(username)}`); const data=await res.json();
    if(!res.ok){resultEl.innerHTML=`<div class="profile-lookup-empty">${escHtml(data.error||'Not found')}</div>`;return;}
    const titleItem=shopCatalog.find(i=>i.id===data.equippedTitle);
    const titleName=titleItem?titleItem.name:'Wizard';
    const wr=data.wins+data.losses>0?Math.round(data.wins/(data.wins+data.losses)*100)+'%':'—';
    resultEl.innerHTML=`<div class="looked-up-card"><div class="looked-up-avatar" id="looked-up-canvas-wrap"></div><div class="looked-up-info"><div class="looked-up-name">${escHtml(data.username)}${data.isAdmin?'<span class="tag tag-admin">Admin</span>':''}</div><div class="looked-up-title">${escHtml(titleName)}</div>${data.bio?`<div class="looked-up-bio">"${escHtml(data.bio)}"</div>`:''}<div class="looked-up-stats"><span>🏆 ${data.wins}W</span><span>💀 ${data.losses}L</span><span>📊 ${wr}</span></div><div class="looked-up-since">Since ${new Date(data.createdAt).toLocaleDateString()}</div></div></div>`;
    setTimeout(()=>{const wrap=document.getElementById('looked-up-canvas-wrap');if(!wrap)return;const cvs=document.createElement('canvas');cvs.width=80;cvs.height=106;wrap.appendChild(cvs);drawProfileAvatar(cvs,data.avatar||'wizard1',80,106);},0);
  } catch{resultEl.innerHTML='<div class="profile-lookup-empty">Error looking up player.</div>';}
}

// ── Practice Mode ─────────────────────────────────────
function startPractice() {
  if(!socket)connectSocket();
  document.getElementById('lobby-username').textContent=profile.username;
  const lt=document.getElementById('lobby-title'); if(lt)lt.textContent='🤖 Starting Practice...';
  document.getElementById('lobby-msg').textContent='Setting up your training match...';
  showScreen('screen-lobby');
  setTimeout(()=>{
    socket.emit('startPractice',{username:profile.username,token:authToken,cosmetics:{equippedRobe:profile.equippedRobe,equippedSpell:profile.equippedSpell,equippedTitle:profile.equippedTitle}});
  },300);
}

// ═══════════════════════════════════════════════════
//  THREE.JS RENDERING
// ═══════════════════════════════════════════════════
let renderer,scene,camera,playerMeshes={},projMeshes={},animFrameId,gameRunning=false;
const CAMERA_DIST=14,CAMERA_HEIGHT=6;
const COOLDOWNS={fireball:2000,iceshard:800,thunder:1400,shield:8000};
const SPELL_KEYS={KeyQ:'fireball',KeyE:'iceshard',KeyR:'thunder',KeyF:'shield'};
const SPELL_SLOT_IDS={fireball:'spell-1',iceshard:'spell-2',thunder:'spell-3',shield:'spell-4'};
const cooldownTimers={fireball:0,iceshard:0,thunder:0,shield:0};
const keys={};let mouseX=0,pointerLocked=false,inputInterval=null;

function initThree() {
  const canvas=document.getElementById('game-canvas');
  renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true; renderer.setClearColor(0x0a0518);
  scene=new THREE.Scene(); scene.fog=new THREE.Fog(0x0a0518,30,80);
  camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,.1,200);
  camera.position.set(0,CAMERA_HEIGHT,CAMERA_DIST); camera.lookAt(0,0,0);
  buildArena();addLights();addSkybox();addTrees();
  window.addEventListener('resize',onResize); onResize();
}
function buildArena() {
  const gm=new THREE.MeshLambertMaterial({color:0x2d4a2d});
  const g=new THREE.Mesh(new THREE.PlaneGeometry(80,80,20,20),gm); g.rotation.x=-Math.PI/2;g.receiveShadow=true;scene.add(g);
  const path=new THREE.Mesh(new THREE.CircleGeometry(12,48),new THREE.MeshLambertMaterial({color:0x5a5058}));path.rotation.x=-Math.PI/2;path.position.y=.01;scene.add(path);
  const wm=new THREE.MeshLambertMaterial({color:0x7a6868});
  for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2;const w=new THREE.Mesh(new THREE.BoxGeometry(3,1.2,.5),wm);w.position.set(Math.cos(a)*13,.6,Math.sin(a)*13);w.rotation.y=a+Math.PI/2;w.castShadow=true;scene.add(w);}
  const ob=new THREE.Mesh(new THREE.CylinderGeometry(.2,.4,3,6),new THREE.MeshLambertMaterial({color:0x886688}));ob.position.set(0,1.5,0);ob.castShadow=true;scene.add(ob);
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.4),new THREE.MeshBasicMaterial({color:0x9b30e8}));crystal.position.set(0,3.4,0);scene.add(crystal);
  const cl=new THREE.PointLight(0x9b30e8,1.5,12);cl.position.set(0,3.5,0);scene.add(cl);
  (function ac(){const t=Date.now()*.001;crystal.rotation.y=t;crystal.position.y=3.4+Math.sin(t*2)*.08;cl.intensity=1.2+Math.sin(t*3)*.3;requestAnimationFrame(ac);})();
}
function addTrees(){const tm=new THREE.MeshLambertMaterial({color:0x5a3a1a}),lm=new THREE.MeshLambertMaterial({color:0x1a5c2a});[[-18,-18],[18,-18],[-18,18],[18,18],[0,-22],[0,22],[-22,0],[22,0],[-14,-24],[14,-24],[-24,14],[24,-14]].forEach(([x,z])=>{const h=4+Math.random()*3;const tr=new THREE.Mesh(new THREE.CylinderGeometry(.2,.35,h,6),tm);tr.position.set(x,h/2,z);tr.castShadow=true;scene.add(tr);for(let i=0;i<3;i++){const lf=new THREE.Mesh(new THREE.ConeGeometry(2-i*.3,2,7),lm);lf.position.set(x,h-.5+i*1.4,z);lf.castShadow=true;scene.add(lf);}});}
function addLights(){scene.add(new THREE.AmbientLight(0x334466,.8));const moon=new THREE.DirectionalLight(0x8899bb,.6);moon.position.set(10,20,10);moon.castShadow=true;scene.add(moon);const r1=new THREE.PointLight(0x4400aa,.8,40);r1.position.set(-15,8,-15);scene.add(r1);const r2=new THREE.PointLight(0x004488,.8,40);r2.position.set(15,8,15);scene.add(r2);}
function addSkybox(){const sky=new THREE.Mesh(new THREE.SphereGeometry(100,16,8),new THREE.MeshBasicMaterial({color:0x050312,side:THREE.BackSide}));scene.add(sky);const sv=[];for(let i=0;i<800;i++){const t=Math.random()*Math.PI*2,p=Math.acos(2*Math.random()-1),r=90;sv.push(r*Math.sin(p)*Math.cos(t),r*Math.cos(p),r*Math.sin(p)*Math.sin(t));}const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:.3})));}

function createWizardMesh(robeItemId,spellItemId){
  const rc=ROBE_COLORS[robeItemId]||0x6a0dad,sc=SPELL_COLORS[spellItemId]||rc;
  const g=new THREE.Group();const rm=new THREE.MeshLambertMaterial({color:rc});
  const robe=new THREE.Mesh(new THREE.CylinderGeometry(.3,.6,1.6,8),rm);robe.position.y=.8;robe.castShadow=true;g.add(robe);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,8,8),new THREE.MeshLambertMaterial({color:0xf5d5a0}));head.position.y=1.9;g.add(head);
  const hm=new THREE.MeshLambertMaterial({color:0x111122});const brim=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.08,12),hm);brim.position.y=2.1;g.add(brim);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(.3,.7,12),hm);cone.position.y=2.55;g.add(cone);
  const staff=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,2.2,6),new THREE.MeshLambertMaterial({color:0x8b5e3c}));staff.position.set(.55,1.1,0);staff.rotation.z=.1;g.add(staff);
  const cry=new THREE.Mesh(new THREE.OctahedronGeometry(.15),new THREE.MeshBasicMaterial({color:sc}));cry.position.set(.65,2.25,0);g.add(cry);
  const glow=new THREE.PointLight(sc,1.2,5);glow.position.set(.65,2.25,0);g.add(glow);
  const shield=new THREE.Mesh(new THREE.SphereGeometry(1.1,16,16),new THREE.MeshBasicMaterial({color:0x00ff88,transparent:true,opacity:.25,side:THREE.DoubleSide}));shield.position.y=1.0;shield.visible=false;g.add(shield);
  g.userData.shield=shield; return g;
}
function setShieldVisible(id,v){if(playerMeshes[id])playerMeshes[id].userData.shield.visible=v;}
const BSC={fireball:0xff4400,iceshard:0x88ddff,thunder:0xffee00};
function blendColors(c1,c2,t){const r1=(c1>>16)&0xff,g1=(c1>>8)&0xff,b1=c1&0xff,r2=(c2>>16)&0xff,g2=(c2>>8)&0xff,b2=c2&0xff;return(Math.round(r1+(r2-r1)*t)<<16)|(Math.round(g1+(g2-g1)*t)<<8)|Math.round(b1+(b2-b1)*t);}
function createProjectileMesh(spellKey,spellItemId){let c=BSC[spellKey]||0xffffff;const ov=SPELL_COLORS[spellItemId];if(ov)c=blendColors(c,ov,.5);const geo=spellKey==='iceshard'?new THREE.OctahedronGeometry(.2):new THREE.SphereGeometry(.25,8,8);const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:c}));m.add(new THREE.PointLight(c,1.5,4));return m;}

function startGame(players){
  _gameOverShown=false;hideGameOver();showScreen('screen-game');gameRunning=true;
  Object.values(playerMeshes).forEach(m=>scene.remove(m));Object.values(projMeshes).forEach(m=>scene.remove(m));playerMeshes={};projMeshes={};
  if(!renderer)initThree();
  players.forEach(p=>{const m=createWizardMesh(p.equippedRobe||'robe_default',p.equippedSpell||'spell_default');m.position.set(p.x,0,p.z);scene.add(m);playerMeshes[p.id]=m;});
  const me=players.find(p=>p.id===myId),opp=players.find(p=>p.id!==myId);
  const ti=id=>shopCatalog.find(i=>i.id===id);
  if(me){document.getElementById('hud-name-you').textContent=me.username;const t=ti(me.equippedTitle);document.getElementById('hud-title-you').textContent=t?t.name:'';}
  if(opp){document.getElementById('hud-name-opp').textContent=opp.username;const t=ti(opp.equippedTitle);document.getElementById('hud-title-opp').textContent=t?t.name:'';}
  updateMyHP(100);updateOppHP(100);
  aimbotEnabled=false;const ab=document.getElementById('admin-aimbot-btn');if(ab)ab.classList.toggle('hidden',!profile.isAdmin);
  setupInputListeners();renderLoop();
}
function updateGameState(state){
  Object.entries(state.players).forEach(([id,p])=>{if(!playerMeshes[id])return;playerMeshes[id].position.set(p.x,0,p.z);playerMeshes[id].rotation.y=p.rotY;playerMeshes[id].visible=p.alive;});
  const si=new Set(state.projectiles.map(p=>p.id));
  Object.keys(projMeshes).forEach(id=>{if(!si.has(id)){scene.remove(projMeshes[id]);delete projMeshes[id];}});
  state.projectiles.forEach(proj=>{
    if(!projMeshes[proj.id]){const ow=state.players[proj.ownerId];const sid=ow?(ow.equippedSpell||'spell_default'):'spell_default';const m=createProjectileMesh(proj.spellKey,sid);scene.add(m);projMeshes[proj.id]=m;}
    projMeshes[proj.id].position.set(proj.x,proj.y,proj.z);
    if(proj.spellKey==='iceshard'){projMeshes[proj.id].rotation.x+=.3;projMeshes[proj.id].rotation.z+=.2;}
  });
  if(myId&&state.players[myId]){const me=state.players[myId];camera.position.set(me.x+Math.sin(me.rotY)*CAMERA_DIST,CAMERA_HEIGHT,me.z+Math.cos(me.rotY)*CAMERA_DIST);camera.lookAt(me.x,1.5,me.z);}
}
function updateMyHP(hp){const pct=Math.max(0,hp)/100;document.getElementById('hud-hp-you').style.width=(pct*100)+'%';document.getElementById('hud-hp-text-you').textContent=Math.max(0,hp)+' HP';document.getElementById('hud-hp-you').style.background=pct>.5?'linear-gradient(90deg,#22cc44,#44ff66)':pct>.25?'linear-gradient(90deg,#cc8800,#ffaa00)':'linear-gradient(90deg,#cc2200,#ff4400)';}
function updateOppHP(hp){const pct=Math.max(0,hp)/100;document.getElementById('hud-hp-opp').style.width=(pct*100)+'%';document.getElementById('hud-hp-text-opp').textContent=Math.max(0,hp)+' HP';}
function flashHit(){const el=document.getElementById('hit-flash');el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}
function showStun(){const el=document.getElementById('stun-indicator');el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),900);}
function triggerCooldownUI(sk){const slot=document.getElementById(SPELL_SLOT_IDS[sk]);if(!slot)return;slot.classList.add('on-cooldown');const ov=document.getElementById('cd-'+sk);const start=Date.now();const dur=COOLDOWNS[sk];const tick=()=>{const pct=Math.min(1,(Date.now()-start)/dur);ov.style.transform=`scaleY(${1-pct})`;if(pct<1)requestAnimationFrame(tick);else{slot.classList.remove('on-cooldown');ov.style.transform='scaleY(0)';}};requestAnimationFrame(tick);}

function setupInputListeners(){
  document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);
  document.getElementById('game-canvas').addEventListener('click',()=>document.getElementById('game-canvas').requestPointerLock());
  document.addEventListener('pointerlockchange',()=>{pointerLocked=document.pointerLockElement===document.getElementById('game-canvas');});
  document.addEventListener('mousemove',onMouseMove);
  if(inputInterval)clearInterval(inputInterval); inputInterval=setInterval(sendInput,50);
}
function removeInputListeners(){document.removeEventListener('keydown',onKeyDown);document.removeEventListener('keyup',onKeyUp);document.removeEventListener('mousemove',onMouseMove);if(inputInterval){clearInterval(inputInterval);inputInterval=null;}}
function onMouseMove(e){if(pointerLocked)mouseX+=e.movementX*.003;}
function onKeyDown(e){
  keys[e.code]=true;
  if(e.code==='Tab'){e.preventDefault();if(gameRunning)toggleEmoteWheel();return;}
  if(e.code==='Escape'){hideEmoteWheel();return;}
  const spell=SPELL_KEYS[e.code];
  if(spell&&gameRunning){const now=Date.now();if(!cooldownTimers[spell]||cooldownTimers[spell]<=now){socket.emit('castSpell',{spellKey:spell});cooldownTimers[spell]=now+COOLDOWNS[spell];triggerCooldownUI(spell);}}
}
function onKeyUp(e){keys[e.code]=false;}

let aimbotEnabled=false;
function toggleAimbot(){aimbotEnabled=!aimbotEnabled;const btn=document.getElementById('admin-aimbot-btn');if(btn){btn.textContent=aimbotEnabled?'🎯 Aimbot: ON':'🎯 Aimbot: OFF';btn.style.background=aimbotEnabled?'#1a7a2a':'';}showReportConfirmation(aimbotEnabled?'🎯 Aimbot enabled!':'🎯 Aimbot disabled.');}
function runAimbot(){if(!aimbotEnabled||!gameRunning||!socket)return;const oi=Object.keys(playerMeshes).find(id=>id!==myId);if(!oi)return;const opp=playerMeshes[oi],my=playerMeshes[myId];if(!opp||!my)return;const dx=opp.position.x-my.position.x,dz=opp.position.z-my.position.z;mouseX=mouseX+(-Math.atan2(dx,dz)-mouseX)*.25;const now=Date.now();for(const sp of['iceshard','thunder','fireball']){if((cooldownTimers[sp]||0)<=now){socket.emit('castSpell',{spellKey:sp});cooldownTimers[sp]=now+COOLDOWNS[sp];triggerCooldownUI(sp);break;}}}
function sendInput(){if(!socket||!gameRunning)return;if(aimbotEnabled)runAimbot();let dx=0,dz=0;if(keys['KeyW']||keys['ArrowUp'])dz-=1;if(keys['KeyS']||keys['ArrowDown'])dz+=1;if(keys['KeyA']||keys['ArrowLeft'])dx-=1;if(keys['KeyD']||keys['ArrowRight'])dx+=1;const a=mouseX;socket.emit('playerInput',{dx:dx*Math.cos(a)+dz*Math.sin(a),dz:-dx*Math.sin(a)+dz*Math.cos(a),rotY:mouseX});}

let gameOverFrames=null;
function renderLoop(){if(!gameRunning&&!gameOverFrames)return;animFrameId=requestAnimationFrame(renderLoop);tickEmotes();renderer.render(scene,camera);if(!gameRunning&&gameOverFrames!==null){gameOverFrames--;if(gameOverFrames<=0){cancelAnimationFrame(animFrameId);animFrameId=null;gameOverFrames=null;}}}
function onResize(){if(!renderer)return;renderer.setSize(window.innerWidth,window.innerHeight);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();}

let _gameOverShown=false;
function showGameOver(){
  _gameOverShown=true;
  if(animFrameId){cancelAnimationFrame(animFrameId);animFrameId=null;}
  const gs=document.getElementById('screen-game');if(gs)gs.style.cssText='display:none!important';
  const go=document.getElementById('screen-gameover');go.style.cssText='display:flex!important;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;background:#08051a;';
}
function hideGameOver(){
  _gameOverShown=false;
  const go=document.getElementById('screen-gameover');go.style.cssText='display:none';
  const gs=document.getElementById('screen-game');if(gs)gs.style.cssText='';
}
function endGame(iWon,winnerName,disconnected,coinsEarned,quitterName){
  if(_gameOverShown)return;
  gameRunning=false;removeInputListeners();hideReportModal();hideEmoteWheel();
  const isDraw=iWon===null;
  document.getElementById('gameover-icon').textContent=isDraw?'🤝':iWon?'🏆':'💀';
  document.getElementById('gameover-title').textContent=isDraw?'DRAW':iWon?'YOU WIN!':'DEFEATED!';
  let sub;if(isDraw)sub=quitterName?`${quitterName} quit the match.`:'The match ended in a draw.';else if(disconnected)sub='Opponent disconnected — Victory!';else if(iWon)sub=`You defeated ${winnerName}!`;else sub=`${winnerName} wins this round.`;
  document.getElementById('gameover-sub').textContent=sub;
  document.getElementById('gameover-coins').textContent=coinsEarned>0?`+🪙 ${coinsEarned} coins earned!`:'';
  showGameOver();
}

function quitMatch(){if(!socket||!gameRunning)return;if(!confirm('Quit? Match ends as draw.'))return;socket.emit('quitMatch');}
function showReportModal(){document.getElementById('report-modal').classList.remove('hidden');const oppName=document.getElementById('hud-name-opp').textContent;document.getElementById('report-target-name').textContent=oppName;document.getElementById('report-username-hidden').value=oppName;}
function hideReportModal(){const m=document.getElementById('report-modal');if(m)m.classList.add('hidden');}
function submitReport(){const reason=document.getElementById('report-reason').value;const details=document.getElementById('report-details').value.trim();const reported=document.getElementById('report-username-hidden').value;if(!reason){alert('Please select a reason.');return;}socket.emit('reportPlayer',{reportedUsername:reported,reason,details});hideReportModal();}
function showReportConfirmation(message){const el=document.getElementById('report-confirmation');if(!el)return;el.textContent=message;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3000);}

// ── Emotes ────────────────────────────────────────────
const EMOTE_DEFS={wave:{emoji:'👋',label:'Wave',color:0x44ddff,bounce:'wave'},laugh:{emoji:'😂',label:'Laugh',color:0xffee44,bounce:'shake'},gg:{emoji:'🤝',label:'GG',color:0x44ff88,bounce:'nod'},flex:{emoji:'💪',label:'Flex',color:0xff8844,bounce:'flex'},angry:{emoji:'😤',label:'Angry',color:0xff3333,bounce:'shake'},dance:{emoji:'🕺',label:'Dance',color:0xcc44ff,bounce:'dance'},think:{emoji:'🤔',label:'Think',color:0xaaaaff,bounce:'nod'},fire:{emoji:'🔥',label:'Hype',color:0xff6600,bounce:'dance'}};
const activeEmoteParticles=[],wizardAnims={};let emoteWheelVisible=false;
function toggleEmoteWheel(){emoteWheelVisible=!emoteWheelVisible;const w=document.getElementById('emote-wheel');w.classList.toggle('hidden',!emoteWheelVisible);if(emoteWheelVisible)buildEmoteGrid();}
function hideEmoteWheel(){emoteWheelVisible=false;const el=document.getElementById('emote-wheel');if(el)el.classList.add('hidden');}
function buildEmoteGrid(){const grid=document.getElementById('emote-grid');if(!grid)return;grid.innerHTML='';Object.entries(EMOTE_DEFS).forEach(([key,def])=>{const owned=profile&&profile.inventory.includes('emote_'+key);const btn=document.createElement('button');btn.className='emote-item'+(owned?'':' emote-locked');btn.title=owned?def.label:def.label+' (Not owned)';if(owned)btn.onclick=()=>sendEmote(key);const icon=document.createElement('div');icon.textContent=def.emoji;const label=document.createElement('span');label.textContent=owned?def.label:'🔒';btn.appendChild(icon);btn.appendChild(label);grid.appendChild(btn);});}
function sendEmote(emoteKey){if(!socket||!gameRunning)return;if(!profile.inventory.includes('emote_'+emoteKey)){showReportConfirmation('Buy this emote in the Shop!');hideEmoteWheel();return;}hideEmoteWheel();socket.emit('emote',{emoteKey});}
function playEmote(emoteKey,fromId){const def=EMOTE_DEFS[emoteKey];if(!def)return;const mesh=playerMeshes[fromId];if(!mesh)return;wizardAnims[fromId]={type:def.bounce,startTime:Date.now(),duration:1800};spawnEmoteParticles(mesh.position,def);showFloatingEmoji(def.emoji,mesh.position);}
function spawnEmoteParticles(wp,def){for(let i=0;i<10;i++){const size=.08+Math.random()*.12;const geo=new THREE.OctahedronGeometry(size);const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:1}));const a=(i/10)*Math.PI*2;const sp=.025+Math.random()*.03;m.position.set(wp.x+(Math.random()-.5)*.8,wp.y+2.4+Math.random()*.4,wp.z+(Math.random()-.5)*.8);m.userData={vx:Math.cos(a)*sp,vy:.04+Math.random()*.04,vz:Math.sin(a)*sp,life:1.0,decay:.018+Math.random()*.012,spin:(Math.random()-.5)*.15};scene.add(m);activeEmoteParticles.push(m);}const fl=new THREE.PointLight(def.color,3,8);fl.position.set(wp.x,wp.y+2.5,wp.z);scene.add(fl);let fv=1.0;const fd=()=>{fv-=.05;fl.intensity=fv*3;if(fv>0)requestAnimationFrame(fd);else scene.remove(fl);};requestAnimationFrame(fd);}
function showFloatingEmoji(emoji,wp){const div=document.createElement('div');div.textContent=emoji;div.style.cssText='position:fixed;pointer-events:none;z-index:50;font-size:2.4rem;filter:drop-shadow(0 0 8px rgba(255,255,255,.8));';document.body.appendChild(div);const start=Date.now();div._wp={x:wp.x,y:wp.y+3.2,z:wp.z};const a=()=>{const t=(Date.now()-start)/2000;if(t>=1){div.remove();return;}const v=new THREE.Vector3(div._wp.x,div._wp.y+t*1.5,div._wp.z);v.project(camera);div.style.left=((v.x*.5+.5)*window.innerWidth-20)+'px';div.style.top=((-v.y*.5+.5)*window.innerHeight-20)+'px';div.style.opacity=t<.2?t/.2:t>.7?1-(t-.7)/.3:1;div.style.transform=`scale(${1+Math.sin(t*Math.PI)*.4})`;requestAnimationFrame(a);};requestAnimationFrame(a);}
function tickEmotes(){for(let i=activeEmoteParticles.length-1;i>=0;i--){const p=activeEmoteParticles[i];const d=p.userData;p.position.x+=d.vx;p.position.y+=d.vy;p.position.z+=d.vz;d.vy-=.002;d.vx*=.97;d.vz*=.97;p.rotation.x+=d.spin;p.rotation.z+=d.spin*.7;d.life-=d.decay;p.material.opacity=Math.max(0,d.life);if(d.life<=0){scene.remove(p);activeEmoteParticles.splice(i,1);}}const now=Date.now();for(const[id,anim]of Object.entries(wizardAnims)){const mesh=playerMeshes[id];if(!mesh){delete wizardAnims[id];continue;}const t=(now-anim.startTime)/anim.duration;if(t>=1){mesh.position.y=0;mesh.rotation.z=0;mesh.rotation.x=0;mesh.scale.set(1,1,1);delete wizardAnims[id];continue;}const ph=t*Math.PI*2;switch(anim.type){case 'wave':mesh.rotation.z=Math.sin(ph*2)*.25;mesh.position.y=Math.abs(Math.sin(ph))*.3;break;case 'shake':mesh.position.x+=Math.sin(ph*8)*.04;mesh.rotation.z=Math.sin(ph*8)*.15;break;case 'nod':mesh.rotation.x=Math.sin(ph*3)*.2;mesh.position.y=Math.abs(Math.sin(ph*1.5))*.15;break;case 'flex':mesh.position.y=Math.abs(Math.sin(ph*2))*.5;mesh.rotation.z=Math.sin(ph)*.3;mesh.scale.set(1+Math.abs(Math.sin(ph))*.15,1+Math.abs(Math.sin(ph))*.1,1);break;case 'dance':mesh.position.y=Math.abs(Math.sin(ph*3))*.4;mesh.rotation.y+=.08;mesh.position.x+=Math.sin(ph*4)*.05;break;}}}
function clearEmotes(){activeEmoteParticles.forEach(p=>scene&&scene.remove(p));activeEmoteParticles.length=0;for(const k in wizardAnims)delete wizardAnims[k];}

// ── Socket ────────────────────────────────────────────
function connectSocket(){
  if(socket&&socket.connected)return;
  socket=io();
  socket.on('connect',()=>{socket.emit('registerPresence',{username:profile.username,cosmetics:{equippedRobe:profile.equippedRobe,equippedSpell:profile.equippedSpell,equippedTitle:profile.equippedTitle}});});
  socket.on('yourId',id=>{myId=id;});
  socket.on('matchFound',({players})=>{startGame(players);});
  socket.on('gameState',state=>{if(gameRunning)updateGameState(state);});
  socket.on('playerHit',({playerId,hp,stunned})=>{if(playerId===myId){flashHit();updateMyHP(hp);if(stunned)showStun();}else updateOppHP(hp);});
  socket.on('shieldActivated',({playerId})=>{setShieldVisible(playerId,true);});
  socket.on('shieldExpired',({playerId})=>{setShieldVisible(playerId,false);});
  socket.on('shieldBlocked',({playerId})=>{const m=playerMeshes[playerId];if(m&&m.userData.shield){m.userData.shield.visible=true;setTimeout(()=>{if(m.userData.shield)m.userData.shield.visible=false;},400);} });
  socket.on('gameOver',({winnerId,winnerName,coinsEarned})=>{const iWon=winnerId===myId;const earned=coinsEarned?(coinsEarned[myId]||0):0;if(earned>0)profile.coins+=earned;endGame(iWon,winnerName,false,earned);});
  socket.on('opponentDisconnected',()=>endGame(true,profile.username,true,50));
  socket.on('kicked',({reason})=>{gameRunning=false;if(animFrameId){cancelAnimationFrame(animFrameId);animFrameId=null;}hideGameOver();socket.disconnect();socket=null;alert('⚠️ '+(reason||'You were kicked by an admin.'));showScreen('screen-splash');hideSplashLoading();drawSplashWizard();localStorage.removeItem('pixelio_token');});
  socket.on('matchDraw',({quitterName})=>{endGame(null,null,false,0,quitterName);});
  socket.on('reportReceived',({message})=>{showReportConfirmation(message);});
  socket.on('opponentEmote',({emoteKey,fromId})=>{playEmote(emoteKey,fromId);});
  socket.on('myEmote',({emoteKey,fromId})=>{playEmote(emoteKey,fromId);});
  socket.on('onlineStatus',({username,online})=>{if(online)onlineFriends.add(username);else onlineFriends.delete(username);renderFriends();});
  socket.on('friendInvite',({fromUsername})=>{pendingInviteFrom=fromUsername;document.getElementById('invite-from').textContent=fromUsername;document.getElementById('invite-toast').classList.remove('hidden');});
  socket.on('inviteDeclined',({byUsername})=>{showReportConfirmation(`${byUsername} declined your invite.`);});
  socket.on('inviteError',({message})=>{showReportConfirmation(message);});
  socket.on('waiting',({message})=>{document.getElementById('lobby-msg').textContent=message;});
}
function joinQueue(){
  if(!socket)connectSocket();
  document.getElementById('lobby-username').textContent=profile.username;
  const lt=document.getElementById('lobby-title');if(lt)lt.textContent='⚔️ Finding Opponent...';
  document.getElementById('lobby-msg').textContent='Searching for an opponent...';
  showScreen('screen-lobby');
  socket.emit('joinQueue',{username:profile.username,token:authToken,cosmetics:{equippedRobe:profile.equippedRobe,equippedSpell:profile.equippedSpell,equippedTitle:profile.equippedTitle}});
}

// ── API Helper ────────────────────────────────────────
async function apiFetch(url,method,body){
  try{
    const opts={method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken}};
    if(body&&method!=='GET')opts.body=JSON.stringify(body);
    const res=await fetch(url,opts);const data=await res.json();
    if(!res.ok){
      const errMsg=data.error||'An error occurred.';
      const adminEl=document.getElementById('admin-give-msg');
      const msgEl=document.getElementById('friend-msg');
      const adminPanel=document.getElementById('panel-admin');
      if(adminEl&&adminPanel&&adminPanel.classList.contains('active')){adminEl.textContent=errMsg;adminEl.className='friend-msg error';adminEl.classList.remove('hidden');}
      else if(msgEl){msgEl.textContent=errMsg;msgEl.className='friend-msg error';msgEl.classList.remove('hidden');}
      else showReportConfirmation('Error: '+errMsg);
      return null;
    }
    return data;
  }catch(e){console.error('apiFetch:',e);return null;}
}


// ── Splash Wizard ─────────────────────────────────────
function drawSplashWizard() {
  const canvas = document.getElementById('splash-wizard-canvas');
  if(!canvas) return;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,w,h);

  // Glow background
  const grd = ctx.createRadialGradient(w/2,h*.55,20,w/2,h*.55,w*.55);
  grd.addColorStop(0,'rgba(180,80,255,0.35)');
  grd.addColorStop(1,'transparent');
  ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);

  const s = w/200; // scale

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(w/2,h-20*s,50*s,12*s,0,0,Math.PI*2); ctx.fill();

  // Robe (large)
  ctx.fillStyle='#7b00d4';
  ctx.beginPath();
  ctx.moveTo(w/2-45*s,h-25*s);
  ctx.lineTo(w/2+45*s,h-25*s);
  ctx.lineTo(w/2+55*s,h-25*s);
  ctx.lineTo(w/2+48*s,h-130*s);
  ctx.lineTo(w/2-48*s,h-130*s);
  ctx.lineTo(w/2-55*s,h-25*s);
  ctx.closePath(); ctx.fill();

  // Robe shading
  ctx.fillStyle='rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(w/2+5*s,h-25*s);
  ctx.lineTo(w/2+55*s,h-25*s);
  ctx.lineTo(w/2+48*s,h-130*s);
  ctx.lineTo(w/2+5*s,h-130*s);
  ctx.closePath(); ctx.fill();

  // Robe highlight
  ctx.fillStyle='rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(w/2-5*s,h-25*s);
  ctx.lineTo(w/2-55*s,h-25*s);
  ctx.lineTo(w/2-48*s,h-130*s);
  ctx.lineTo(w/2-5*s,h-130*s);
  ctx.closePath(); ctx.fill();

  // Star pattern on robe
  ctx.fillStyle='rgba(255,220,0,0.6)';
  ctx.font=`${14*s}px serif`; ctx.textAlign='center';
  ctx.fillText('★', w/2-20*s, h-70*s);
  ctx.fillText('★', w/2+18*s, h-55*s);
  ctx.fillText('✦', w/2, h-90*s);

  // Head
  ctx.fillStyle='#f5c896';
  ctx.beginPath(); ctx.arc(w/2,h-150*s,28*s,0,Math.PI*2); ctx.fill();

  // Eyes
  ctx.fillStyle='#222';
  ctx.beginPath(); ctx.arc(w/2-9*s,h-152*s,4*s,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(w/2+9*s,h-152*s,4*s,0,Math.PI*2); ctx.fill();

  // Smile
  ctx.strokeStyle='#222'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.arc(w/2,h-145*s,8*s,0.2,Math.PI-0.2); ctx.stroke();

  // Hat brim
  ctx.fillStyle='#1a0a3a';
  ctx.beginPath(); ctx.ellipse(w/2,h-176*s,36*s,9*s,0,0,Math.PI*2); ctx.fill();

  // Hat cone
  ctx.fillStyle='#1a0a3a';
  ctx.beginPath();
  ctx.moveTo(w/2-28*s,h-176*s);
  ctx.lineTo(w/2+28*s,h-176*s);
  ctx.lineTo(w/2+2*s,h-260*s);
  ctx.lineTo(w/2-2*s,h-260*s);
  ctx.closePath(); ctx.fill();

  // Hat star
  ctx.fillStyle='#f0c040';
  ctx.font=`${16*s}px serif`; ctx.textAlign='center';
  ctx.fillText('⭐', w/2, h-215*s);

  // Staff
  ctx.strokeStyle='#6b4c2a'; ctx.lineWidth=6*s;
  ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(w/2+60*s,h-30*s);
  ctx.lineTo(w/2+72*s,h-230*s);
  ctx.stroke();

  // Staff crystal glow
  const cg=ctx.createRadialGradient(w/2+72*s,h-235*s,2,w/2+72*s,h-235*s,20*s);
  cg.addColorStop(0,'rgba(160,80,255,1)');
  cg.addColorStop(.5,'rgba(100,40,200,.6)');
  cg.addColorStop(1,'transparent');
  ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(w/2+72*s,h-235*s,20*s,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#cc88ff';
  ctx.font=`${18*s}px serif`; ctx.textAlign='center';
  ctx.fillText('◆', w/2+72*s, h-228*s);

  // Floating magic particles
  const now = Date.now();
  for(let i=0;i<6;i++){
    const t = (now/1200+i*1.1)%(Math.PI*2);
    const px = w/2 + Math.cos(t+i)*65*s;
    const py = h-150*s + Math.sin(t*1.3+i)*40*s - i*8*s;
    const alpha = (Math.sin(now/600+i)+1)/2*.7+.3;
    ctx.fillStyle=`rgba(200,120,255,${alpha})`;
    ctx.font=`${(8+i%3*3)*s}px serif`;
    ctx.fillText(['✦','★','◆','•','✧','⋆'][i], px, py);
  }
}

// Animate splash wizard
let _splashAnimId = null;
function startSplashAnimation() {
  if(_splashAnimId) cancelAnimationFrame(_splashAnimId);
  const canvas = document.getElementById('splash-wizard-canvas');
  if(!canvas) return;
  function loop() {
    drawSplashWizard();
    _splashAnimId = requestAnimationFrame(loop);
  }
  loop();
}
function stopSplashAnimation() {
  if(_splashAnimId){ cancelAnimationFrame(_splashAnimId); _splashAnimId=null; }
}
// ══════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  spawnParticles('particles');
  startSplashAnimation();

  // Auth modal
  document.getElementById('btn-auth-submit').addEventListener('click', doAuth);
  document.getElementById('auth-password').addEventListener('keydown', e => { if(e.key==='Enter') doAuth(); });
  document.getElementById('btn-auth-close').addEventListener('click', closeAuthModal);
  // Close modal on backdrop click
  document.getElementById('auth-modal').addEventListener('click', e => { if(e.target===document.getElementById('auth-modal')) closeAuthModal(); });
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Play
  document.getElementById('btn-play-game').addEventListener('click', joinQueue);
  document.getElementById('btn-practice-game').addEventListener('click', startPractice);

  // Lobby
  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    if(socket) socket.emit('leaveQueue');
    const lt=document.getElementById('lobby-title'); if(lt) lt.textContent='⚔️ Finding Opponent...';
    enterMainMenu();
  });

  // In-game
  document.getElementById('btn-quit-match').addEventListener('click', quitMatch);
  document.getElementById('btn-report-player').addEventListener('click', showReportModal);
  document.getElementById('btn-report-submit').addEventListener('click', submitReport);
  document.getElementById('btn-report-cancel').addEventListener('click', hideReportModal);
  document.getElementById('btn-emote-toggle').addEventListener('click', toggleEmoteWheel);

  // Friends
  document.getElementById('btn-send-request').addEventListener('click', sendFriendRequest);
  document.getElementById('friend-search-input').addEventListener('keydown', e => { if(e.key==='Enter') sendFriendRequest(); });

  // Profile
  document.getElementById('btn-save-bio').addEventListener('click', saveBio);
  document.getElementById('btn-lookup-profile').addEventListener('click', lookupProfile);
  document.getElementById('profile-lookup-input').addEventListener('keydown', e => { if(e.key==='Enter') lookupProfile(); });

  // Invite toast
  document.getElementById('btn-accept-invite').addEventListener('click', () => {
    if(!pendingInviteFrom) return;
    socket.emit('acceptInvite', {fromUsername: pendingInviteFrom});
    document.getElementById('invite-toast').classList.add('hidden');
    const lt=document.getElementById('lobby-title'); if(lt) lt.textContent='⚔️ Finding Opponent...';
    showScreen('screen-lobby');
    document.getElementById('lobby-msg').textContent='Connecting to match...';
    pendingInviteFrom=null;
  });
  document.getElementById('btn-decline-invite').addEventListener('click', () => {
    if(pendingInviteFrom) socket.emit('declineInvite', {fromUsername: pendingInviteFrom});
    document.getElementById('invite-toast').classList.add('hidden');
    pendingInviteFrom=null;
  });

  // Game over
  document.getElementById('btn-play-again').addEventListener('click', () => {
    hideGameOver();
    if(renderer){Object.values(playerMeshes).forEach(m=>scene.remove(m));Object.values(projMeshes).forEach(m=>scene.remove(m));playerMeshes={};projMeshes={};}
    clearEmotes(); joinQueue();
  });
  document.getElementById('btn-gameover-menu').addEventListener('click', () => {
    hideGameOver();
    if(renderer){Object.values(playerMeshes).forEach(m=>scene.remove(m));Object.values(projMeshes).forEach(m=>scene.remove(m));playerMeshes={};projMeshes={};}
    clearEmotes(); enterMainMenu();
  });

  const loggedIn = await tryAutoLogin();
  if(!loggedIn) showScreen('screen-splash');
});
