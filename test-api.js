const fetch = require('node-fetch');

async function testGeminiAPI() {
  try {
    const response = await fetch('http://localhost:5000/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Write a short story about a dragon'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      return;
    }

    const data = await response.json();
    console.log('API Response:', data);
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testGeminiAPI();
