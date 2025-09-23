import { generateContent } from "../helpers/gemini.js";

export async function handleGenerate(req, res) {
  try {
    // For multipart/form-data, req.body contains text fields; files are in req.files (from Multer)
    const isMultipart = !!req.files;
    if (!isMultipart) {
      console.log('Received JSON request with body:', JSON.stringify(req.body, null, 2));
    } else {
      console.log('Received multipart request with fields:', req.body);
      const count = Array.isArray(req.files) ? req.files.length : 0;
      console.log('Received files count:', count);
      if (count > 0) {
        const meta = req.files.map(f => ({
          fieldname: f.fieldname,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size
        }));
        console.log('Files meta:', JSON.stringify(meta, null, 2));
      }
    }
    
    if (!req.body) {
      return res.status(400).json({ error: "Request body is required" });
    }
    
    // Extract core params; when multipart, fields arrive as strings
    const { prompt } = req.body || {};
    let { options } = req.body || {};
    // If options is a JSON string (multipart), parse it safely
    if (options && typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = {}; }
    }
    options = options || {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required in the request body" });
    }

    const userId = req.user?.id || 'anonymous';
    const { expert, systemPrompt, includeSearch } = options;
    // Attach uploads from Multer (field name: 'files')
    const uploads = Array.isArray(req.files) ? req.files : [];
    
    console.log('Calling Gemini API with:', { 
      prompt, 
      userId,
      options: {
        expert,
        systemPrompt: systemPrompt ? '***provided***' : 'not provided',
        includeSearch: includeSearch !== false, // default to true if not specified
        uploadsCount: uploads.length
      }
    });
    
    const result = await generateContent(
      prompt, 
      userId,
      {
        expert,
        systemPrompt,
        includeSearch: includeSearch !== false,
        uploads
      }
    );
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
//cry