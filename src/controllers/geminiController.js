import { generateContent } from "../helpers/gemini.js";

export async function handleGenerate(req, res) {
  try {
    console.log('Received request with body:', JSON.stringify(req.body, null, 2));
    
    if (!req.body) {
      return res.status(400).json({ error: "Request body is required" });
    }
    
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required in the request body" });
    }

    console.log('Calling Gemini API with prompt:', prompt);
    const result = await generateContent(prompt);
    console.log('Received response from Gemini API');
    
    res.json(result);
  } catch (error) {
    console.error('Error in handleGenerate:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
