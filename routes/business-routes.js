// routes/business-routes.js
const express = require('express');
const router = express.Router();
const BusinessProfileChecker = require('../utils/business-profile/checker');
const { authenticateAPIKey } = require('../middleware/auth');

// Initialize the checker
const checker = new BusinessProfileChecker();

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
    
    // Process URLs with progress updates
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Send progress via SSE if client supports it
      if (req.headers.accept === 'text/event-stream') {
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          current: i + 1,
          total: urls.length,
          url: url
        })}\n\n`);
      }
      
      try {
        const result = await checker.processURL(url);
        results.push(result);
        
        // Add delay between requests
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 5000));
        }
      } catch (error) {
        results.push({
          url: url,
          error: error.message,
          status: '⚠️ ERROR'
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
          invalid: results.filter(r => !r.validity?.valid).length,
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

// Extract business information from URL
router.post('/api/business/extract', authenticateAPIKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Quick extraction without full validation
    const html = await checker.fetchHTML(url);
    const businessName = checker.extractBusinessName(url, html);
    const contactInfo = checker.extractContactInfo(html, url);
    
    res.json({
      success: true,
      data: {
        url: url,
        businessName: businessName,
        contactInfo: contactInfo,
        platform: checker.identifyPlatform(url)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Platform detection
router.post('/api/business/detect-platform', authenticateAPIKey, async (req, res) => {
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
        platform: platform,
        isSocialMedia: ['Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'TikTok'].includes(platform),
        isEcommerce: ['Shopify'].includes(platform),
        isBusinessDirectory: ['Yelp'].includes(platform)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Screenshot capture (macOS only)
router.post('/api/business/screenshot', authenticateAPIKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Check if running on macOS
    if (process.platform !== 'darwin') {
      return res.status(400).json({ 
        error: 'Screenshot feature is only available on macOS' 
      });
    }
    
    const screenshotPath = await checker.takeScreenshot(url);
    
    res.json({
      success: true,
      data: {
        url: url,
        screenshotPath: screenshotPath
      }
    });
    
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;