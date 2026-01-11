const express = require('express');
const router = express.Router();
const memoryService = require('../services/memoryService');
const User = require('../models/User');
const Memory = require('../models/Memory');

/**
 * Get user memory
 * GET /api/memory/:userId
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { user, memory } = await memoryService.getUserMemory(userId);

    res.json({
      user: {
        userId: user.userId,
        name: user.name,
        preferences: user.preferences,
        personalityNotes: user.personalityNotes
      },
      memory: {
        facts: memory.facts.map(f => ({
          fact: f.fact,
          confidence: f.confidence,
          category: f.category,
          lastMentioned: f.lastMentioned
        })),
        conversationSummaries: memory.conversationSummaries,
        contradictions: memory.contradictions
      }
    });
  } catch (error) {
    console.error('Get memory error:', error);
    res.status(500).json({
      error: 'Failed to retrieve memory',
      message: error.message
    });
  }
});

/**
 * Update user name
 * PUT /api/memory/:userId/name
 */
router.put('/:userId/name', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, name });
    } else {
      user.name = name;
    }

    await user.save();

    // Also add to memory facts
    const memory = await Memory.findOne({ userId });
    if (memory) {
      const nameFact = memory.facts.find(
        f => f.fact.toLowerCase().includes('name')
      );
      if (nameFact) {
        nameFact.fact = `User's name is ${name}`;
        nameFact.confidence = 1.0;
      } else {
        memory.facts.push({
          fact: `User's name is ${name}`,
          confidence: 1.0,
          lastMentioned: new Date(),
          category: 'personal'
        });
      }
      await memory.save();
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Update name error:', error);
    res.status(500).json({
      error: 'Failed to update name',
      message: error.message
    });
  }
});

module.exports = router;
