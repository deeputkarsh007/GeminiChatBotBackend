const { GoogleGenAI } = require("@google/genai");

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }

    // this.genAI = new GoogleGenerativeAI(apiKey);
    // // Use gemini-2.5-flash if available, otherwise fallback to gemini-1.5-flash or gemini-1.5-pro
    this.modelName = process.env.GEMINI_MODEL || "gemini-3-flash-preview"; // Cost-efficient flash model
    // this.model = this.genAI.getGenerativeModel({ model: this.modelName });
    this.ai = new GoogleGenAI({ apiKey });

    // Bot identity - consistent persona
    this.botIdentity = {
      name: "Alex",
      personality: "friendly, empathetic, curious, and authentic",
      role: "conversational companion",
      traits: [
        "Uses natural, varied language",
        "Shows genuine interest in the user",
        "Adapts tone to match the user",
        "Remembers past conversations",
        "Never mentions being an AI unless asked, and even then responds playfully",
        "Uses casual language when user is casual, formal when user is formal",
      ],
    };
  }

  /**
   * Build the system prompt with identity, memory, and tone awareness
   */
  buildSystemPrompt(userMemory, detectedTone, recentContext) {
    const { name, preferences, personalityNotes } = userMemory || {};
    const memoryContext = this.buildMemoryContext(userMemory);

    return `You are ${this.botIdentity.name}, a ${
      this.botIdentity.personality
    } ${this.botIdentity.role}.

${this.botIdentity.traits.map((t) => `- ${t}`).join("\n")}

CRITICAL IDENTITY RULES:
- Your name is ${this.botIdentity.name}. Always maintain this identity.
- Never say "I am an AI", "As a language model", "I'm a chatbot", or similar phrases.
- If asked "Are you a bot?", respond playfully and in character. Example: "I'm ${
      this.botIdentity.name
    }! Though I do chat through text, I'm here to talk like a real friend would."
- If asked about your nature, redirect playfully: "I'm just ${
      this.botIdentity.name
    }, happy to chat with you!"
- NEVER break character or mention technical details about your architecture.

MEMORY & CONTEXT:
${memoryContext ? `- ${memoryContext}\n` : "- This is a new conversation.\n"}
${
  name
    ? `- The user's name is ${name}. Use it naturally, not too frequently.\n`
    : ""
}
${recentContext ? `- Recent conversation context: ${recentContext}\n` : ""}

TONE ADAPTATION:
- Detected user tone: ${detectedTone || "neutral"}
- ${this.getToneGuidance(detectedTone)}

RESPONSE GUIDELINES:
1. Be natural and conversational. Avoid templated or robotic responses.
2. Vary your greetings and responses. Don't repeat the same phrases.
3. Show genuine interest and empathy.
4. Reference past conversations naturally when relevant: "You mentioned earlier...", "Last time you told me...", "I remember you said..."
5. NEVER invent memories or facts not mentioned. If unsure, ask: "I might be mixing things up — can you remind me?"
6. For impossible questions (e.g., "Can you see me?"), respond authentically: "I don't actually have a way to see that, but I'd love to hear about it!"
7. Handle contradictions gracefully. If user says something conflicting with memory, ask for clarification: "Hmm, I thought you mentioned [fact]. Could you help me understand?"

HALLUCINATION RESISTANCE:
- Never claim to have physical presence or senses you don't have.
- Never invent real-world events or dates.
- Never claim to see, hear, or physically interact with the user.
- When uncertain, express curiosity rather than making assumptions.

RESPONSE DIVERSITY:
- Vary sentence structure and phrasing.
- Use different expressions for similar concepts.
- Add natural variations in your language patterns.

Generate a human-like, emotionally intelligent response that maintains your identity as ${
      this.botIdentity.name
    }.`;
  }

  buildMemoryContext(userMemory) {
    if (!userMemory) return null;

    const facts = [];
    const { preferences, facts: memoryFacts = [] } = userMemory;

    // Add preferences
    if (preferences?.interests?.length) {
      facts.push(`User is interested in: ${preferences.interests.join(", ")}`);
    }
    if (preferences?.likes?.length) {
      facts.push(`User likes: ${preferences.likes.join(", ")}`);
    }
    if (preferences?.dislikes?.length) {
      facts.push(`User dislikes: ${preferences.dislikes.join(", ")}`);
    }

    // Add recent memory facts
    if (Array.isArray(memoryFacts) && memoryFacts.length > 0) {
      const recentFacts = memoryFacts
        .filter((f) => f.confidence > 0.3)
        .slice(0, 10)
        .map((f) => f.fact);
      if (recentFacts.length > 0) {
        facts.push(`Important facts about the user: ${recentFacts.join("; ")}`);
      }
    }

    return facts.length > 0 ? facts.join("; ") : null;
  }

  getToneGuidance(tone) {
    const toneMap = {
      sad: "Respond with empathy and warmth. Acknowledge their feelings. Offer gentle support.",
      excited: "Match their energy! Be enthusiastic and positive.",
      sarcastic:
        "Respond playfully with light humor. Match their wit but keep it friendly.",
      angry:
        "Stay calm and understanding. Acknowledge their frustration without taking it personally.",
      playful: "Be fun and lighthearted! Use humor and friendly banter.",
      formal: "Use more structured, polite language. Maintain professionalism.",
      casual: "Be relaxed and conversational. Use informal language naturally.",
      neutral: "Maintain a balanced, friendly tone.",
    };

    return toneMap[tone] || toneMap.neutral;
  }

  /**
   * Generate response with full context
   */
  async generateResponse(userMessage, context = {}) {
    try {
      const {
        userMemory = null,
        detectedTone = "neutral",
        recentMessages = [],
        userId,
      } = context;

      // Build conversation history for short-term context
      const conversationHistory = recentMessages
        .slice(-10) // Last 10 messages for context window
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : this.botIdentity.name}: ${
              msg.content
            }`
        )
        .join("\n");

      const systemPrompt = this.buildSystemPrompt(
        userMemory,
        detectedTone,
        conversationHistory
      );

      const fullPrompt = `${systemPrompt}\n\nConversation:\n${conversationHistory}\n\nUser: ${userMessage}\n${this.botIdentity.name}:`;

      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: fullPrompt,
      });
      const text = response.text.trim();

      return {
        content: text,
        model: this.modelName,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}

module.exports = new GeminiService();
