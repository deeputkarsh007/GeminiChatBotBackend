const User = require("../models/User");
const Chat = require("../models/Chat");
const Memory = require("../models/Memory");
const { GoogleGenAI } = require("@google/genai");

class MemoryService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Get or create user memory profile
   */
  async getUserMemory(userId) {
    let user = await User.findOne({ userId });
    let memory = await Memory.findOne({ userId });

    if (!user) {
      user = new User({ userId });
      await user.save();
    }

    if (!memory) {
      memory = new Memory({ userId });
      await memory.save();
    }

    // Get recent chat history (last session)
    const recentChat = await Chat.findOne({ userId })
      .sort({ updatedAt: -1 })
      .limit(1);

    return {
      user,
      memory,
      recentMessages: recentChat?.messages || [],
    };
  }

  /**
   * Extract facts from conversation for long-term storage
   */
  async extractFacts(userId, conversationMessages) {
    try {
      if (!this.model) {
        return []; // Fallback if Gemini not available
      }

      const conversationText = conversationMessages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");

      if (!conversationText.trim()) {
        return [];
      }

      const prompt = `Extract factual information about the user from this conversation. Focus on:
- Personal facts (name, age, location, occupation, hobbies)
- Preferences (likes, dislikes, interests)
- Important events or situations mentioned
- Personality traits or characteristics

Conversation:
${conversationText}

Return ONLY a JSON array of facts, each as a string. Example:
["User's name is John", "User likes anime", "User works as a software engineer"]

Do NOT include facts that are uncertain or speculative. Only extract clear, stated facts.`;

      const response = await this.ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
      });
      const text = response.text.trim();

      // Parse JSON from response (might have markdown code blocks)
      let facts = [];
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          facts = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Fallback: simple extraction
        facts = text
          .split("\n")
          .filter(
            (line) => line.trim().startsWith("-") || line.trim().startsWith("•")
          )
          .map((line) => line.replace(/^[-•]\s*/, "").trim());
      }

      return facts.filter((f) => f && f.length > 5);
    } catch (error) {
      console.error("Error extracting facts:", error);
      return [];
    }
  }

  /**
   * Update memory with new facts
   */
  async updateMemory(userId, newFacts, conversationContext) {
    const memory = await Memory.findOne({ userId });
    if (!memory) {
      const newMemory = new Memory({ userId, facts: [] });
      await newMemory.save();
      return await this.updateMemory(userId, newFacts, conversationContext);
    }

    // Update existing facts or add new ones
    for (const factText of newFacts) {
      const existingFact = memory.facts.find(
        (f) => f.fact.toLowerCase() === factText.toLowerCase()
      );

      if (existingFact) {
        // Increase confidence
        existingFact.confidence = Math.min(existingFact.confidence + 0.1, 1.0);
        existingFact.lastMentioned = new Date();
      } else {
        // Check for contradictions
        const contradictoryFact = memory.facts.find((f) => {
          const factLower = f.fact.toLowerCase();
          const newFactLower = factText.toLowerCase();

          // Simple contradiction detection
          return (
            (factLower.includes("like") &&
              newFactLower.includes("dislike") &&
              factLower
                .split(" ")
                .some((word) => newFactLower.includes(word))) ||
            (factLower.includes("dislike") &&
              newFactLower.includes("like") &&
              factLower.split(" ").some((word) => newFactLower.includes(word)))
          );
        });

        if (contradictoryFact) {
          // Store contradiction for later resolution
          memory.contradictions.push({
            fact: factText,
            conflictingFacts: [contradictoryFact.fact],
            date: new Date(),
          });
        } else {
          // Add new fact
          memory.facts.push({
            fact: factText,
            confidence: 0.5,
            lastMentioned: new Date(),
            category: this.categorizeFact(factText),
          });
        }
      }
    }

    // Prune low-confidence facts (keep only top 50)
    memory.facts.sort((a, b) => b.confidence - a.confidence);
    if (memory.facts.length > 50) {
      memory.facts = memory.facts.slice(0, 50);
    }

    await memory.save();
    return memory;
  }

  /**
   * Categorize a fact for better organization
   */
  categorizeFact(fact) {
    const lowerFact = fact.toLowerCase();
    if (lowerFact.includes("name") || lowerFact.includes("called")) {
      return "personal";
    } else if (
      lowerFact.includes("like") ||
      lowerFact.includes("love") ||
      lowerFact.includes("enjoy")
    ) {
      return "preference";
    } else if (
      lowerFact.includes("dislike") ||
      lowerFact.includes("hate") ||
      lowerFact.includes("don't like")
    ) {
      return "preference";
    } else if (
      lowerFact.includes("work") ||
      lowerFact.includes("job") ||
      lowerFact.includes("occupation")
    ) {
      return "personal";
    } else if (
      lowerFact.includes("interest") ||
      lowerFact.includes("hobby") ||
      lowerFact.includes("favorite")
    ) {
      return "interest";
    }
    return "general";
  }

  /**
   * Compress old conversations into summaries
   */
  async compressOldConversations(userId, maxMessages = 100) {
    const chats = await Chat.find({ userId, isCompressed: false })
      .sort({ createdAt: -1 })
      .limit(20);

    if (chats.length === 0) return;

    for (const chat of chats) {
      if (chat.messages.length <= 10) continue; // Skip small chats

      try {
        if (!this.model) {
          chat.summary = "Conversation summary (compressed)";
          chat.isCompressed = true;
          await chat.save();
          continue;
        }

        const conversationText = chat.messages
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");

        const prompt = `Summarize this conversation in 2-3 sentences, focusing on:
- Key topics discussed
- Important facts about the user mentioned
- Main themes or interests

Conversation:
${conversationText}

Summary:`;

        const response = await this.ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: prompt,
        });
        const summary = response.text.trim();

        chat.summary = summary;
        chat.isCompressed = true;

        // Keep only last 5 messages for context
        chat.messages = chat.messages.slice(-5);

        await chat.save();

        // Store summary in memory
        const memory = await Memory.findOne({ userId });
        if (memory) {
          const keyTopics = this.extractTopics(conversationText);
          memory.conversationSummaries.push({
            summary,
            date: chat.createdAt,
            keyTopics,
          });

          // Keep only last 10 summaries
          if (memory.conversationSummaries.length > 10) {
            memory.conversationSummaries =
              memory.conversationSummaries.slice(-10);
          }

          await memory.save();
        }
      } catch (error) {
        console.error("Error compressing conversation:", error);
      }
    }
  }

  /**
   * Extract key topics from conversation
   */
  extractTopics(text) {
    const topics = [];
    const commonTopics = [
      "anime",
      "sports",
      "technology",
      "music",
      "movies",
      "books",
      "food",
      "travel",
      "work",
      "school",
      "family",
      "friends",
      "gaming",
      "programming",
      "art",
      "science",
      "politics",
    ];

    const lowerText = text.toLowerCase();
    for (const topic of commonTopics) {
      if (lowerText.includes(topic)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Save conversation messages
   */
  async saveConversation(userId, userMessage, assistantMessage, tone) {
    let chat = await Chat.findOne({ userId }).sort({ updatedAt: -1 });

    // If last chat is old (more than 1 hour), start a new one
    if (
      chat &&
      chat.updatedAt &&
      Date.now() - chat.updatedAt.getTime() > 3600000
    ) {
      chat = null;
    }

    if (!chat) {
      chat = new Chat({ userId, messages: [] });
    }

    chat.messages.push({
      role: "user",
      content: userMessage,
      tone,
    });

    chat.messages.push({
      role: "assistant",
      content: assistantMessage,
      timestamp: new Date(),
    });

    await chat.save();
    return chat;
  }

  /**
   * Get conversation context (short-term memory)
   */
  async getConversationContext(userId, limit = 10) {
    const chat = await Chat.findOne({ userId }).sort({ updatedAt: -1 });

    if (!chat || !chat.messages.length) {
      return [];
    }

    return chat.messages.slice(-limit);
  }

  /**
   * Update user preferences based on conversation
   */
  async updateUserPreferences(userId, detectedInterests, tone) {
    const user = await User.findOne({ userId });
    if (!user) return;

    // Update tone preference
    if (tone && tone !== "neutral") {
      user.preferences.tone = tone;
    }

    // Add interests if detected
    if (detectedInterests && detectedInterests.length > 0) {
      for (const interest of detectedInterests) {
        if (!user.preferences.interests.includes(interest)) {
          user.preferences.interests.push(interest);
        }
      }
    }

    // Keep only last 20 interests
    if (user.preferences.interests.length > 20) {
      user.preferences.interests = user.preferences.interests.slice(-20);
    }

    await user.save();
    return user;
  }
}

module.exports = new MemoryService();
