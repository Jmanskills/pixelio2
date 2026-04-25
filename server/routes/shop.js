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
    if (item.category === 'weapon') user.equippedWeapon = itemId;
    if (item.category === 'title') user.equippedTitle = itemId;

    await user.save();
    res.json({ profile: user.safeProfile() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/shop/gift  { toUsername, itemId }
router.post('/gift', authMiddleware, async (req, res) => {
  try {
    const { toUsername, itemId } = req.body;
    if (!toUsername || !itemId) return res.status(400).json({ error: 'Username and item required.' });

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (item.price === 0) return res.status(400).json({ error: 'Cannot gift free items.' });

    const sender   = await User.findById(req.user.id);
    const receiver = await User.findOne({ username: toUsername.trim() });

    if (!sender)   return res.status(404).json({ error: 'Your account not found.' });
    if (!receiver) return res.status(404).json({ error: `Player "${toUsername}" not found.` });
    if (sender.username === receiver.username) return res.status(400).json({ error: 'Cannot gift yourself.' });
    if (receiver.inventory.includes(itemId)) return res.status(400).json({ error: `${receiver.username} already owns this item.` });
    if (sender.coins < item.price) return res.status(400).json({ error: `Not enough coins. Need 🪙${item.price}.` });

    sender.coins -= item.price;
    receiver.inventory.push(itemId);
    await sender.save();
    await receiver.save();

    res.json({
      message: `🎁 Gifted "${item.name}" to ${receiver.username}!`,
      profile: sender.safeProfile()
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
