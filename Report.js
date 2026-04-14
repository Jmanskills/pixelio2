const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pixelio-secret';

async function authMiddleware(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Unauthorized.' }); }
}

// GET /api/friends — list friends + pending requests with online status
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({
      friends: user.friends,
      friendRequests: user.friendRequests
    });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/request  { username }
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });

    const me = await User.findById(req.user.id);
    if (username.toLowerCase() === me.username.toLowerCase())
      return res.status(400).json({ error: "You can't add yourself." });

    const target = await User.findOne({ username: username.trim() });
    if (!target) return res.status(404).json({ error: 'Player not found.' });
    if (me.friends.includes(target.username))
      return res.status(400).json({ error: 'Already friends.' });
    if (target.friendRequests.includes(me.username))
      return res.status(400).json({ error: 'Request already sent.' });

    target.friendRequests.push(me.username);
    await target.save();
    res.json({ message: `Friend request sent to ${target.username}.` });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/accept  { username }
router.post('/accept', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    const me = await User.findById(req.user.id);
    const them = await User.findOne({ username: username.trim() });
    if (!them) return res.status(404).json({ error: 'Player not found.' });
    if (!me.friendRequests.includes(them.username))
      return res.status(400).json({ error: 'No request from this player.' });

    me.friendRequests = me.friendRequests.filter(u => u !== them.username);
    if (!me.friends.includes(them.username)) me.friends.push(them.username);
    if (!them.friends.includes(me.username)) them.friends.push(me.username);
    await me.save();
    await them.save();
    res.json({ profile: me.safeProfile() });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/decline  { username }
router.post('/decline', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    const me = await User.findById(req.user.id);
    me.friendRequests = me.friendRequests.filter(u => u !== username);
    await me.save();
    res.json({ profile: me.safeProfile() });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/friends/remove  { username }
router.post('/remove', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    const me = await User.findById(req.user.id);
    const them = await User.findOne({ username: username.trim() });
    me.friends = me.friends.filter(u => u !== username);
    if (them) { them.friends = them.friends.filter(u => u !== me.username); await them.save(); }
    await me.save();
    res.json({ profile: me.safeProfile() });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
