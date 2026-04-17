const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SHOP_ITEMS = require('../shopItems');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pixelio-secret';

async function authMiddleware(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Unauthorized.' }); }
}

// GET /api/shop — return full catalog
router.get('/', (req, res) => {
  res.json({ items: SHOP_ITEMS });
});

// POST /api/shop/buy  { itemId }
router.post('/buy', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.body;
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.inventory.includes(itemId)) return res.status(400).json({ error: 'Already owned.' });
    if (user.coins < item.price) return res.status(400).json({ error: 'Not enough coins.' });

    user.coins -= item.price;
    user.inventory.push(itemId);
    await user.save();
    res.json({ profile: user.safeProfile() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/shop/equip  { itemId }
router.post('/equip', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.body;
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.inventory.includes(itemId)) return res.status(400).json({ error: 'Not owned.' });

    if (item.category === 'skin')  user.equippedSkin  = itemId;
    if (item.category === 'spell') user.equippedSpell = itemId;
    if (item.category === 'title') user.equippedTitle = itemId;

    await user.save();
    res.json({ profile: user.safeProfile() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
