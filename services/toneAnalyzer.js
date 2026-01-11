class ToneAnalyzer {
  /**
   * Detect emotional tone from user message
   */
  detectTone(message) {
    const lowerMessage = message.toLowerCase();

    // Emotional indicators
    const indicators = {
      sad: [
        'sad', 'depressed', 'down', 'upset', 'crying', 'tears', 'feeling low',
        'unhappy', 'melancholy', 'gloomy', 'hurt', 'disappointed', 'worried',
        'anxious', 'stressed', 'frustrated', 'can\'t', 'cannot', 'won\'t'
      ],
      excited: [
        'excited', 'amazing', 'awesome', 'wow', 'yes!', 'finally', 'yay',
        'can\'t wait', 'so happy', 'thrilled', 'incredible', 'fantastic',
        'love it', 'best', 'greatest', 'amazing news'
      ],
      sarcastic: [
        'sure', 'obviously', 'totally', 'great', 'wonderful', 'perfect',
        'exactly what i wanted', 'thanks a lot', 'yeah right', 'oh really'
      ],
      angry: [
        'angry', 'mad', 'furious', 'hate', 'annoyed', 'irritated', 'pissed',
        'stupid', 'idiot', 'sucks', 'terrible', 'worst', 'disgusting'
      ],
      playful: [
        'haha', 'lol', 'lmao', 'funny', 'joke', 'roast', 'tease', 'prank',
        'play', 'game', 'challenge', 'bet', 'wanna', 'gonna'
      ],
      formal: [
        'sir', 'madam', 'please', 'would you', 'could you', 'kindly',
        'appreciate', 'grateful', 'thank you very much', 'regarding'
      ],
      casual: [
        'hey', 'yo', 'sup', 'wassup', 'dude', 'bro', 'lol', 'omg',
        'idk', 'tbh', 'imo', 'fr', 'ngl'
      ]
    };

    // Count matches for each tone
    const toneScores = {};
    
    for (const [tone, keywords] of Object.entries(indicators)) {
      const matches = keywords.filter(keyword => 
        lowerMessage.includes(keyword) || 
        message.match(new RegExp(`\\b${keyword}\\b`, 'i'))
      ).length;
      
      if (matches > 0) {
        toneScores[tone] = matches;
      }
    }

    // Punctuation analysis
    if (lowerMessage.includes('!!!') || lowerMessage.includes('???')) {
      toneScores.excited = (toneScores.excited || 0) + 2;
    }
    if (lowerMessage.includes('...') || lowerMessage.endsWith('...')) {
      toneScores.sad = (toneScores.sad || 0) + 1;
    }
    if (lowerMessage.includes('?')) {
      toneScores.casual = (toneScores.casual || 0) + 1;
    }

    // Length and structure analysis
    if (message.split(' ').length > 30 && !toneScores.angry) {
      toneScores.formal = (toneScores.formal || 0) + 1;
    }
    if (message.split(' ').length < 5 && !toneScores.excited) {
      toneScores.casual = (toneScores.casual || 0) + 1;
    }

    // Determine dominant tone
    if (Object.keys(toneScores).length === 0) {
      return 'neutral';
    }

    const dominantTone = Object.entries(toneScores)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Confidence threshold
    const maxScore = toneScores[dominantTone];
    if (maxScore >= 2) {
      return dominantTone;
    } else if (maxScore === 1 && (toneScores.sad || toneScores.angry)) {
      return dominantTone; // Prioritize negative emotions
    }

    return 'neutral';
  }

  /**
   * Detect tone shift in conversation
   */
  detectToneShift(currentTone, previousTone) {
    return currentTone !== previousTone && previousTone !== null;
  }
}

module.exports = new ToneAnalyzer();
