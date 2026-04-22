const mongoose = require('mongoose');
const reportSchema = new mongoose.Schema({
  reporterUsername: { type: String, required: true },
  reportedUsername: { type: String, required: true },
  reason: { type: String, required: true },
  details: { type: String, default: '' },
  status: { type: String, default: 'open', enum: ['open', 'reviewed', 'dismissed'] },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Report', reportSchema);
