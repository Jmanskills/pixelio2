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

// GET /api/profile/:username — public profile
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({
      username: { $regex: new RegExp('^' + req.params.username + '$', 'i') }
    });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      wins: user.wins,
      losses: user.losses,
      coins: user.coins,
      equippedSkin: user.equippedSkin,
      equippedTitle: user.equippedTitle,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/profile — update own profile
router.patch('/', authMiddleware, async (req, res) => {
  try {
    const { avatar, bio } = req.body;
    const updates = {};
    if (avatar) updates.avatar = avatar;
    if (bio !== undefined) updates.bio = String(bio).slice(0, 150);
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    res.json({ profile: user.safeProfile() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
