// routes/business-routes.js
const express = require('express');
const router = express.Router();
const BusinessProfileChecker = require('../utils/business-profile/checker');

// Initialize the checker
const checker = new BusinessProfileChecker();

// Middleware to authenticate API key (reuse from main server)
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

// Check single business profile
router.post('/api/business/check', authenticateAPIKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Process the URL
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

// Bulk business profile check
router.post('/api/business/bulk-check', authenticateAPIKey, async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }
    
    if (urls.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 URLs allowed per request' });
    }
    
    // Set response headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Process URLs with progress updates
    const results = [];
    
    // Send initial response
    res.write(JSON.stringify({
      success: true,
      data: {
        results: [],
        summary: {
          total: urls.length,
          valid: 0,
          invalid: 0,
          errors: 0
        }
      },
      timestamp: new Date().toISOString()
    }));
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        const result = await checker.processURL(url);
        results.push(result);
        
        // Add delay between requests to avoid rate limiting
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
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
    
    // Send final results
    res.end(JSON.stringify({
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
    }));
    
  } catch (error) {
    console.error('Bulk check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Extract business information from URL (quick check without full validation)
router.post('/api/business/extract', authenticateAPIKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    let processedUrl = url;
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      processedUrl = 'https://' + processedUrl;
    }
    
    // Quick extraction without full validation
    const html = await checker.fetchHTML(processedUrl);
    const businessName = checker.extractBusinessName(processedUrl, html);
    const contactInfo = checker.extractContactInfo(html, processedUrl);
    
    res.json({
      success: true,
      data: {
        url: url,
        business_name: businessName,
        contact_info: contactInfo,
        platform: checker.identifyPlatform(processedUrl)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Business extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get platform detection for a URL
router.post('/api/business/platform', authenticateAPIKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const platform = checker.identifyPlatform(url);
    
    res.json({
      success: true,
      data: {
        url: url,
        platform: platform
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Platform detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;