const express = require('express');
const router = express.Router();
const BusinessProfileChecker = require('../utils/business-profile/checker');

const checker = new BusinessProfileChecker();

const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKeys = [
    'demo-key-12345678',
    process.env.API_KEY_1,
    process.env.API_KEY_2,
    process.env.API_KEY_3
  ].filter(Boolean);

  if (!apiKey || !validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }
  
  next();
};

router.post('/api/business/check', authenticateAPIKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const result = await checker.processURL(url);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Business check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/api/business/bulk-check', authenticateAPIKey, async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }
    
    if (urls.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 URLs allowed per request' });
    }
    
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        const result = await checker.processURL(url);
        results.push(result);
        
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        results.push({
          url: url,
          error: error.message,
          validity: {
            status: '⚠️ ERROR',
            valid: false,
            reason: error.message
          }
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        results: results,
        summary: {
          total: results.length,
          valid: results.filter(r => r.validity?.valid).length,
          invalid: results.filter(r => !r.validity?.valid && !r.error).length,
          errors: results.filter(r => r.error).length
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Bulk check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
