require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes    = require('./routes/auth');
const shopRoutes    = require('./routes/shop');
const friendRoutes  = require('./routes/friends');
const { setupGameSockets } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth',    authRoutes);
app.use('/api/shop',    shopRoutes);
app.use('/api/friends', friendRoutes);

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

setupGameSockets(io);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('ERROR: MONGODB_URI not set.'); process.exit(1); }

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => console.log(`Pixelio server running on port ${PORT}`));
  })
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });
