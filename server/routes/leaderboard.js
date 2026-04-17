const express = require('express');
const User = require('../models/User');
const router = express.Router();

// GET /api/leaderboard?type=wins|coins|kd
router.get('/', async (req, res) => {
  try {
    const type = req.query.type || 'wins';
    let sort = {};
    if (type === 'wins')  sort = { wins: -1 };
    if (type === 'coins') sort = { coins: -1 };
    if (type === 'kd')    sort = { wins: -1, losses: 1 };

    const users = await User.find({ isBanned: false })
      .sort(sort).limit(20)
      .select('username wins losses coins equippedTitle avatar isAdmin');

    const board = users.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      wins: u.wins,
      losses: u.losses,
      coins: u.coins,
      equippedTitle: u.equippedTitle,
      avatar: u.avatar,
      isAdmin: u.isAdmin,
      kd: u.losses > 0 ? (u.wins / u.losses).toFixed(2) : u.wins > 0 ? '∞' : '0.00'
    }));

    res.json({ board, type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
