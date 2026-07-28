import { GoogleGenAI } from '@google/genai';

async function test() {
  const ai = new GoogleGenAI({ apiKey: 'VALID_OR_INVALID_KEY' });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'Create a system architecture diagram for a shopping app',
      config: {
        systemInstruction: 'You are an architect.',
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    });
    console.log('Response:', response);
  } catch (err) {
    console.error('Error stack:', err.stack);
  }
}

test();
