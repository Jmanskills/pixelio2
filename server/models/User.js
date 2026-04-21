const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true,
    trim: true, minlength: 3, maxlength: 20
  },
  password: { type: String, required: true, minlength: 6 },
  wins:   { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  coins:  { type: Number, default: 100 },

  // Owned item IDs
  inventory: { type: [String], default: ['skin_default', 'spell_default', 'title_wizard', 'title_apprentice', 'emote_wave', 'emote_gg'] },

  // Equipped
  equippedSkin:  { type: String, default: 'skin_default' },
  equippedSpell: { type: String, default: 'spell_default' },
  equippedTitle: { type: String, default: 'title_wizard' },

  // Friends list & incoming requests
  friends:        { type: [String], default: [] },
  friendRequests: { type: [String], default: [] },

  avatar: { type: String, default: 'wizard1' }, // avatar id
  bio: { type: String, default: '', maxlength: 150 },
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason:      { type: String, default: '' },
  tempBanExpires:  { type: Date, default: null },
  isMuted:         { type: Boolean, default: false },
  muteExpires:     { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.safeProfile = function () {
  return {
    username: this.username,
    wins: this.wins,
    losses: this.losses,
    coins: this.coins,
    inventory: this.inventory,
    equippedSkin: this.equippedSkin,
    equippedSpell: this.equippedSpell,
    equippedTitle: this.equippedTitle,
    friends: this.friends,
    friendRequests: this.friendRequests,
    avatar: this.avatar,
    bio: this.bio,
    isAdmin: this.isAdmin,
    isBanned: this.isBanned
  };
};

module.exports = mongoose.model('User', userSchema);
