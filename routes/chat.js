const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const memoryService = require('../services/memoryService');
const toneAnalyzer = require('../services/toneAnalyzer');

/**
 * Main chat endpoint
 * POST /api/chat
 * Body: { userId: string, message: string }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        error: 'userId and message are required'
      });
    }

    // Get user memory and context
    const { user, memory, recentMessages } = await memoryService.getUserMemory(userId);
    
    // Detect tone from user message
    const detectedTone = toneAnalyzer.detectTone(message);

    // Get short-term conversation context
    const conversationContext = await memoryService.getConversationContext(userId, 10);

    // Prepare memory data for prompt
    const userMemoryData = {
      name: user.name,
      preferences: user.preferences,
      facts: memory.facts,
      summaries: memory.conversationSummaries.slice(-3) // Last 3 summaries
    };

    // Generate response using Gemini
    const responseData = await geminiService.generateResponse(message, {
      userMemory: userMemoryData,
      detectedTone,
      recentMessages: conversationContext,
      userId
    });

    const assistantMessage = responseData.content;

    // Save conversation
    await memoryService.saveConversation(
      userId,
      message,
      assistantMessage,
      detectedTone
    );

    // Extract facts asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const newConversation = [
          { role: 'user', content: message },
          { role: 'assistant', content: assistantMessage }
        ];
        
        const extractedFacts = await memoryService.extractFacts(userId, newConversation);
        
        if (extractedFacts.length > 0) {
          await memoryService.updateMemory(userId, extractedFacts, newConversation);
        }

        // Detect interests from conversation
        const interests = memoryService.extractTopics(message + ' ' + assistantMessage);
        if (interests.length > 0) {
          await memoryService.updateUserPreferences(userId, interests, detectedTone);
        }

        // Periodically compress old conversations
        if (Math.random() < 0.1) { // 10% chance per request
          await memoryService.compressOldConversations(userId);
        }
      } catch (error) {
        console.error('Error in background memory processing:', error);
      }
    });

    // Return response
    res.json({
      response: assistantMessage,
      tone: detectedTone,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error.message
    });
  }
});

/**
 * Get conversation history
 * GET /api/chat/:userId
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const chat = await require('../models/Chat').findOne({ userId })
      .sort({ updatedAt: -1 });

    if (!chat) {
      return res.json({ messages: [] });
    }

    const messages = chat.messages.slice(-limit);
    res.json({ messages });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat history',
      message: error.message
    });
  }
});

module.exports = router;
