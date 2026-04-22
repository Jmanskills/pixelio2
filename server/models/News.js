const mongoose = require('mongoose');
const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body:  { type: String, required: true },
  author: { type: String, default: 'Admin' },
  pinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('News', newsSchema);
