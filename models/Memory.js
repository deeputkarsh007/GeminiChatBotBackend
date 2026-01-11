const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  facts: [{
    fact: String,
    confidence: Number, // 0-1, based on how many times mentioned
    lastMentioned: Date,
    category: String // 'preference', 'personal', 'interest', etc.
  }],
  conversationSummaries: [{
    summary: String,
    date: Date,
    keyTopics: [String]
  }],
  contradictions: [{
    fact: String,
    conflictingFacts: [String],
    resolution: String,
    date: Date
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

memorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Memory', memorySchema);
