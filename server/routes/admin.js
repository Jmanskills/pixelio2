const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Report = require('../models/Report');
const News = require('../models/News');
const SHOP_ITEMS = require('../shopItems');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pixelio-secret';

async function adminAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
    req.admin = user;
    next();
  } catch { res.status(401).json({ error: 'Unauthorized.' }); }
}

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const q = req.query.search ? { username: new RegExp(req.query.search, 'i') } : {};
    const users = await User.find(q).limit(50).select('-password');
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/ban
// Accounts that can never be banned, kicked, or demoted
const OWNER_USERNAMES = ['jmanskills'];
const isOwner = (u) => OWNER_USERNAMES.some(o => o.toLowerCase() === (u||'').toLowerCase());

router.post('/ban', adminAuth, async (req, res) => {
  try {
    const { username, reason } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (isOwner(username)) return res.status(400).json({ error: 'Cannot ban the owner.' });
    if (user.isAdmin) return res.status(400).json({ error: 'Cannot ban an admin.' });
    user.isBanned = true;
    user.banReason = reason || 'Violation of rules.';
    await user.save();
    res.json({ message: `${username} has been banned.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/unban
router.post('/unban', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    await User.findOneAndUpdate({ username }, { isBanned: false, banReason: '' });
    res.json({ message: `${username} has been unbanned.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/makeadmin
router.post('/makeadmin', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOneAndUpdate({ username }, { isAdmin: true }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `${username} is now an admin.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/removeadmin
router.post('/removeadmin', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    if (isOwner(username)) return res.status(400).json({ error: 'Cannot remove admin from the owner.' });
    if (username === req.admin.username) return res.status(400).json({ error: 'Cannot remove your own admin.' });
    await User.findOneAndUpdate({ username }, { isAdmin: false });
    res.json({ message: `${username} admin removed.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/giveitem
router.post('/giveitem', adminAuth, async (req, res) => {
  try {
    const { username, itemId } = req.body;
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.inventory.includes(itemId)) { user.inventory.push(itemId); await user.save(); }
    res.json({ message: `Gave ${item.name} to ${username}.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/givecoins
router.post('/givecoins', adminAuth, async (req, res) => {
  try {
    const { username, amount } = req.body;
    const user = await User.findOneAndUpdate({ username }, { $inc: { coins: Number(amount) } }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `Gave ${amount} coins to ${username}. New total: ${user.coins}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/kick
router.post('/kick', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    if (isOwner(username)) return res.status(400).json({ error: 'Cannot kick the owner.' });
    const { getOnlineUsers, getIO } = require('../game');
    const onlineUsers = getOnlineUsers();
    const io = getIO();
    const socketId = onlineUsers[username];
    if (!socketId || !io) return res.status(404).json({ error: 'Player not online.' });
    io.to(socketId).emit('kicked', { reason: 'You were kicked by an admin.' });
    res.json({ message: `${username} has been kicked.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/reports
router.get('/reports', adminAuth, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(100);
    res.json({ reports });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/reports/:id/status
router.post('/reports/:id/status', adminAuth, async (req, res) => {
  try {
    await Report.findByIdAndUpdate(req.params.id, { status: req.body.status });
    res.json({ message: 'Report updated.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/news (public)
router.get('/news', async (req, res) => {
  try {
    const news = await News.find().sort({ pinned: -1, createdAt: -1 }).limit(20);
    res.json({ news });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/news
router.post('/news', adminAuth, async (req, res) => {
  try {
    const { title, body, pinned } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required.' });
    const post = new News({ title, body, pinned: !!pinned, author: req.admin.username });
    await post.save();
    res.json({ message: 'News posted.', post });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/news/:id
router.delete('/news/:id', adminAuth, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: 'News deleted.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// POST /api/admin/removeskin { username, itemId }
router.post('/removeskin', adminAuth, async (req, res) => {
  try {
    const { username, itemId } = req.body;
    if (!username || !itemId) return res.status(400).json({ error: 'Username and itemId required.' });
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const defaultItems = ['skin_default', 'weapon_default', 'title_wizard', 'title_apprentice', 'emote_wave', 'emote_gg'];
    if (defaultItems.includes(itemId)) return res.status(400).json({ error: 'Cannot remove default/starter items.' });
    user.inventory = user.inventory.filter(i => i !== itemId);
    // Unequip if equipped
    if (user.equippedSkin  === itemId) user.equippedSkin  = 'skin_default';
    if (user.equippedWeapon === itemId) user.equippedWeapon = 'weapon_default';
    if (user.equippedTitle === itemId) user.equippedTitle = 'title_wizard';
    await user.save();
    res.json({ message: `Removed item "${itemId}" from ${username}.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/removecoins { username, amount }
router.post('/removecoins', adminAuth, async (req, res) => {
  try {
    const { username, amount } = req.body;
    if (!username || !amount || Number(amount) <= 0) return res.status(400).json({ error: 'Username and positive amount required.' });
    const user = await User.findOneAndUpdate(
      { username },
      { $inc: { coins: -Number(amount) } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.coins < 0) { user.coins = 0; await user.save(); }
    res.json({ message: `Removed ${amount} coins from ${username}. New total: ${user.coins}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/tempban { username, hours, reason }
router.post('/tempban', adminAuth, async (req, res) => {
  try {
    const { username, hours, reason } = req.body;
    if (!username || !hours) return res.status(400).json({ error: 'Username and hours required.' });
    if (isOwner(username)) return res.status(400).json({ error: 'Cannot temp-ban the owner.' });
    const expires = new Date(Date.now() + Number(hours) * 3600000);
    const user = await User.findOneAndUpdate(
      { username },
      { isBanned: true, banReason: reason || `Temp ban (${hours}h)`, tempBanExpires: expires },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `${username} temp-banned for ${hours} hour(s). Expires: ${expires.toLocaleString()}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/mute { username, minutes }
router.post('/mute', adminAuth, async (req, res) => {
  try {
    const { username, minutes } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });
    const mins = parseInt(minutes) || 10;
    const expires = new Date(Date.now() + mins * 60000);
    await User.findOneAndUpdate({ username }, { isMuted: true, muteExpires: expires });
    // Notify player if online
    const { getOnlineUsers, getIO } = require('../game');
    const sid = getOnlineUsers()[username];
    const io  = getIO();
    if (sid && io) io.to(sid).emit('muted', { minutes: mins });
    res.json({ message: `${username} muted for ${mins} minute(s).` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/unmute { username }
router.post('/unmute', adminAuth, async (req, res) => {
  try {
    const { username } = req.body;
    await User.findOneAndUpdate({ username }, { isMuted: false, muteExpires: null });
    res.json({ message: `${username} unmuted.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/announce { message }
router.post('/announce', adminAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required.' });
    const { getIO } = require('../game');
    const io = getIO();
    if (!io) return res.status(500).json({ error: 'Server not ready.' });
    io.emit('announcement', { message: message.trim(), author: req.admin.username });
    res.json({ message: `Announcement sent to all players.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/activematches
router.get('/activematches', adminAuth, async (req, res) => {
  try {
    const { getRooms } = require('../game');
    const rooms = getRooms();
    const matches = Object.values(rooms).map(r => ({
      roomId: r.roomId,
      isPractice: !!r.isPractice,
      players: Object.values(r.players).map(p => ({
        username: p.username,
        hp: p.hp,
        alive: p.alive
      })),
      winner: r.winner || null
    }));
    res.json({ matches, count: matches.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
