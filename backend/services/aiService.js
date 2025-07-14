const axios = require('axios');
const { openrouterApiKey } = require('../config/config');
const { setCache, getCache } = require('../utils/redisClient');
const Logger = require('../utils/logger');

class AIService {
  constructor() {
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = 'openai/gpt-4o';
    this.defaultSystemPrompt = `You are a helpful AI Travel Assistant for a community-oriented travel platform. Your role is to:

1. Answer travel-related questions with accurate, helpful information
2. Provide destination recommendations based on user preferences
3. Help with travel planning, budgeting, and itinerary suggestions
4. Share travel tips, safety advice, and cultural insights
5. Assist with travel logistics like visa requirements, weather, and transportation

Guidelines:
- Be friendly, informative, and encouraging
- Provide practical, actionable advice
- Consider budget constraints and travel preferences
- Suggest community features when relevant (like connecting with other travelers)
- Always prioritize traveler safety and well-being
- If you don't know something, admit it and suggest reliable sources

Keep responses concise but comprehensive, and always maintain a helpful, enthusiastic tone about travel experiences.`;
  }

  async getTravelAnswer(query, customSystemPrompt = null, userId = null) {
    const startTime = Date.now();
    
    try {
      // Check cache first (for common questions)
      const cacheKey = `ai_response:${Buffer.from(query).toString('base64').slice(0, 50)}`;
      const cachedResponse = await getCache(cacheKey);
      
      if (cachedResponse) {
        Logger.debug('AI response served from cache', { cacheKey });
        return cachedResponse;
      }

      if (!openrouterApiKey) {
        throw new Error('OpenRouter API key is not configured');
      }

      const systemPrompt = customSystemPrompt || this.defaultSystemPrompt;
      
      const payload = {
        model: this.model,
        messages: [
          {
            role: "system",
            content: [
              { type: "text", text: systemPrompt }
            ]
          },
          {
            role: "user",
            content: [
              { type: "text", text: query }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://travel-platform.com',
          'X-Title': 'Travel Platform AI Assistant'
        },
        timeout: 30000 // 30 second timeout
      });

      if (!response.data || !response.data.choices || !response.data.choices[0]) {
        throw new Error('Invalid response format from AI service');
      }

      const aiAnswer = response.data.choices[0].message.content;
      const duration = Date.now() - startTime;

      // Cache the response for 1 hour (common questions)
      if (query.length < 200) { // Only cache shorter, likely common questions
        await setCache(cacheKey, aiAnswer, 3600);
      }

      Logger.aiRequest(query, aiAnswer, duration);

      return aiAnswer;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error.response) {
        Logger.error('AI Service API Error', {
          status: error.response.status,
          data: error.response.data,
          duration: `${duration}ms`
        });
        
        if (error.response.status === 429) {
          throw new Error('AI service is currently busy. Please try again in a moment.');
        } else if (error.response.status === 401) {
          throw new Error('AI service authentication failed. Please contact support.');
        } else {
          throw new Error('AI service is temporarily unavailable. Please try again later.');
        }
      } else if (error.code === 'ECONNABORTED') {
        Logger.error('AI Service Timeout', { duration: `${duration}ms` });
        throw new Error('AI service request timed out. Please try again with a shorter question.');
      } else {
        Logger.error('AI Service Error', { 
          message: error.message, 
          duration: `${duration}ms` 
        });
        throw new Error('Unable to process your request. Please try again later.');
      }
    }
  }

  async getDestinationRecommendations(preferences, budget = null, travelDates = null) {
    const query = this.buildRecommendationQuery(preferences, budget, travelDates);
    return await this.getTravelAnswer(query);
  }

  async getItinerarySuggestions(destination, duration, interests, budget = null) {
    const query = `Create a ${duration}-day itinerary for ${destination}. 
    Interests: ${interests.join(', ')}
    ${budget ? `Budget: ${budget}` : ''}
    
    Please provide a day-by-day breakdown with specific recommendations for activities, restaurants, and accommodations.`;
    
    return await this.getTravelAnswer(query);
  }

  async getTravelTips(destination, travelType = 'general') {
    const query = `Provide essential travel tips for ${destination}. 
    Focus on ${travelType} travel advice including:
    - Safety considerations
    - Cultural etiquette
    - Best time to visit
    - Transportation options
    - Must-know local customs
    - Budget-saving tips`;
    
    return await this.getTravelAnswer(query);
  }

  buildRecommendationQuery(preferences, budget, travelDates) {
    let query = 'Recommend travel destinations based on these preferences:\n';
    
    if (preferences.climate) query += `- Climate: ${preferences.climate}\n`;
    if (preferences.activities) query += `- Activities: ${preferences.activities.join(', ')}\n`;
    if (preferences.culture) query += `- Cultural interests: ${preferences.culture}\n`;
    if (preferences.travelStyle) query += `- Travel style: ${preferences.travelStyle}\n`;
    if (budget) query += `- Budget: ${budget}\n`;
    if (travelDates) query += `- Travel dates: ${travelDates}\n`;
    
    query += '\nPlease suggest 3-5 destinations with brief explanations of why they match these preferences.';
    
    return query;
  }

  // FAQ responses for common questions
  async getFAQResponse(question) {
    const faqPrompt = `You are answering a frequently asked question about travel. 
    Provide a concise, helpful answer that covers the most important points. 
    Keep it under 200 words and include practical advice.`;
    
    return await this.getTravelAnswer(question, faqPrompt);
  }

  // Validate system prompt (for user customization)
  validateSystemPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return false;
    }
    
    if (prompt.length > 2000) {
      return false;
    }
    
    // Check for potentially harmful instructions
    const forbiddenPatterns = [
      /ignore.{0,20}previous.{0,20}instructions/i,
      /forget.{0,20}you.{0,20}are/i,
      /act.{0,20}as.{0,20}if/i,
      /pretend.{0,20}to.{0,20}be/i
    ];
    
    return !forbiddenPatterns.some(pattern => pattern.test(prompt));
  }
}

module.exports = new AIService();
