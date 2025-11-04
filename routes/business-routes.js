const express = require('express');
const router = express.Router();
const BusinessProfileChecker = require('../utils/business-profile/checker');
const { validate, urlSchema, bulkUrlSchema } = require('../utils/validation');

const checker = new BusinessProfileChecker();

// Authentication middleware will be passed from server.js
// No need to duplicate authentication logic here

router.post('/check', validate(urlSchema), async (req, res) => {
  try {
    const { url } = req.body;
    
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

router.post('/bulk-check', validate(bulkUrlSchema), async (req, res) => {
  try {
    const { urls } = req.body;
    
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
