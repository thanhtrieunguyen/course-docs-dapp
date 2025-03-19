const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Get user's documents
router.get('/my-documents', auth, async (req, res) => {
  try {
    // Get documents from database
    // Replace this with your actual database query
    const documents = await Document.find({ owner: req.user.id });
    res.json(documents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
