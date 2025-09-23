// controllers/uploadController.js
export async function handleUpload(req, res) {
  try {
    // Multer populates req.files (for fields) and/or req.file (for single)
    const files = [];

    if (req.file) {
      const f = req.file;
      files.push({
        fieldname: f.fieldname,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      });
    }

    if (req.files && typeof req.files === 'object') {
      for (const [field, list] of Object.entries(req.files)) {
        (list || []).forEach((f) => {
          files.push({
            fieldname: field,
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
          });
        });
      }
    }

    return res.json({
      ok: true,
      count: files.length,
      files,
      message: 'Upload successful (files are stored in memory for downstream processing)'
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
}
