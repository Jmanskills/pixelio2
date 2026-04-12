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
  inventory: { type: [String], default: ['robe_default', 'spell_default', 'title_wizard'] },

  // Equipped
  equippedRobe:  { type: String, default: 'robe_default' },
  equippedSpell: { type: String, default: 'spell_default' },
  equippedTitle: { type: String, default: 'title_wizard' },

  // Friends list & incoming requests
  friends:        { type: [String], default: [] },
  friendRequests: { type: [String], default: [] },

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
    equippedRobe: this.equippedRobe,
    equippedSpell: this.equippedSpell,
    equippedTitle: this.equippedTitle,
    friends: this.friends,
    friendRequests: this.friendRequests
  };
};

module.exports = mongoose.model('User', userSchema);
