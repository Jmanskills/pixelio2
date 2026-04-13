require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes   = require('./routes/auth');
const shopRoutes   = require('./routes/shop');
const friendRoutes = require('./routes/friends');
const adminRoutes   = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const { setupGameSockets } = require('./game');
const User = require('./models/User');

// ══════════════════════════════════════════════════
//  ADMIN USERNAMES — add usernames here to grant
//  admin access automatically on server start.
// ══════════════════════════════════════════════════
// ─────────────────────────────────────────────────────
// ADD ADMIN USERNAMES HERE (case-insensitive)
// ─────────────────────────────────────────────────────
const ADMIN_USERNAMES = ['jmanskills'];
// ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth',    authRoutes);
app.use('/api/shop',    shopRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/profile', profileRoutes);

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

setupGameSockets(io);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('ERROR: MONGODB_URI not set.'); process.exit(1); }

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    // Auto-promote admin usernames
    // Promote admins case-insensitively
    for (const adminName of ADMIN_USERNAMES) {
      const result = await User.findOneAndUpdate(
        { username: { $regex: new RegExp('^' + adminName + '$', 'i') } },
        { isAdmin: true },
        { new: true }
      );
      if (result) console.log(`✅ Admin promoted: ${result.username}`);
    }

    server.listen(PORT, () => console.log(`Pixelio server running on port ${PORT}`));
  })
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });
