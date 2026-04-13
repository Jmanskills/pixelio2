const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pixelio-secret';

function signToken(user) {
  return jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await User.findOne({ username: username.trim() })) return res.status(409).json({ error: 'Username already taken.' });
    const user = new User({ username: username.trim(), password });
    await user.save();
    res.json({ token: signToken(user), profile: user.safeProfile() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.trim() });
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Invalid username or password.' });
    if (user.isBanned) return res.status(403).json({ error: `You are banned. Reason: ${user.banReason || 'Violation of rules.'}` });
    res.json({ token: signToken(user), profile: user.safeProfile() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Get profile (auto-login via token)
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token.' });
    const decoded = jwt.verify(auth.replace('Bearer ', ''), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ profile: user.safeProfile() });
  } catch { res.status(401).json({ error: 'Invalid token.' }); }
});

module.exports = router;
