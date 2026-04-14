# 🧙 Wizard Duel

A 1v1 online multiplayer wizard dueling game. Players battle in a fantasy outdoor arena using four unique spells.

## Spells
| Key | Spell | Damage | Cooldown | Effect |
|-----|-------|--------|----------|--------|
| Q | Fireball | 35 HP | 2.0s | Slow, heavy projectile |
| E | Ice Shard | 15 HP | 0.8s | Fast, rapid-fire |
| R | Thunderbolt | 25 HP | 1.4s | Medium speed + brief stun |
| F | Arcane Shield | — | 8.0s | Blocks all damage for 3s |

## Controls
- **WASD** — Move
- **Mouse** — Aim direction (click canvas to lock cursor)
- **Q / E / R / F** — Cast spells

## Tech Stack
- **Frontend:** Three.js (3D rendering in browser)
- **Backend:** Node.js + Express + Socket.io
- **Database:** MongoDB Atlas
- **Hosting:** Railway

---

## Setup Instructions

### 1. MongoDB Atlas
1. Create a free account at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a new cluster (free tier is fine)
3. Create a database user with a password
4. Whitelist all IPs: `0.0.0.0/0`
5. Copy your connection string — it looks like:
   `mongodb+srv://username:password@cluster.mongodb.net/wizard-duel`

### 2. GitHub
1. Create a new repository on GitHub
2. Upload all files from this zip (maintain the folder structure)
3. Push to main branch

### 3. Railway
1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo → select your repo
3. In the project settings, add these **Environment Variables**:
   - `MONGODB_URI` = your MongoDB connection string from step 1
   - `JWT_SECRET` = any long random string (e.g. `MySecretWizardKey2024!`)
   - `PORT` = `3000` (Railway sets this automatically, but good to have)
4. Deploy — Railway will auto-build using the `package.json`

### 4. Play
- Share the Railway-generated URL with your opponent
- Both players register/login and click **Start Game**
- First to empty opponent's HP wins!

---

## Project Structure
```
wizard-duel/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── game.js           # Game logic, matchmaking, tick loop
│   ├── routes/
│   │   └── auth.js       # Register/login endpoints
│   └── models/
│       └── User.js       # MongoDB user schema
├── public/
│   ├── index.html        # All screens (menu, auth, game, gameover)
│   ├── css/
│   │   └── style.css     # Full fantasy UI styling
│   └── js/
│       └── game.js       # Three.js rendering + client game logic
├── package.json
├── railway.toml          # Railway deployment config
└── .env.example          # Environment variable template
```
