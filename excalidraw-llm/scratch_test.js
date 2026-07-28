import { GoogleGenAI } from '@google/genai';

async function testModel(modelName) {
  console.log('Testing modelName:', modelName);
  const ai = new GoogleGenAI({ apiKey: 'AIzaSy_FAKE_TEST_KEY_12345' });
  try {
    const res = await ai.models.generateContent({
      model: modelName,
      contents: 'Generate architecture for shop app',
      config: {
        systemInstruction: 'You are a principal software architect.',
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    });
    console.log('Res:', res);
  } catch (err) {
    console.log('Error for', modelName, ':', err.message);
    if (err.stack) console.log(err.stack.split('\n').slice(0, 5).join('\n'));
  }
}

async function run() {
  await testModel('gemini-3.1-flash-lite');
  await testModel('models/gemini-3.1-flash-lite');
  await testModel('gemini-2.5-flash');
  await testModel('gemini-1.5-flash');
}

run();
