/**
 * Enhanced WHOIS Intelligence Server with Business Profile Checker
 * Version: 2.3.0
 * Features: WHOIS lookup, DNS analysis, Blacklist checking, Threat intelligence, Business profile validation
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const geoip = require('geoip-lite');

// Import utilities
const { 
  performDomainAnalysis,
  getWhoisData,
  getDNSRecords,
  analyzePrivacyProtection,
  analyzeRegistrar,
  analyzeGeolocation,
  generateIntelligenceSummary,
  analyzeSPFRecord,
  analyzeDMARCRecord,
  parseWhoisResponse,
  extractEmails
} = require('./utils/helpers');

const blacklistChecker = require('./utils/blacklist-checker');
const businessRoutes = require('./routes/business-routes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Load environment variables
require('dotenv').config();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      console.log(message.trim());
    }
  }
}));

// Cache configuration
const NodeCache = require('node-cache');
const cache = new NodeCache({ 
  stdTTL: 3600, // 1 hour default TTL
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false
});

// Rate limiting configurations
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Different rate limits for different endpoints
const strictLimiter = createRateLimiter(15 * 60 * 1000, 50, 'Too many requests from this IP');
const normalLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests from this IP');
const relaxedLimiter = createRateLimiter(15 * 60 * 1000, 200, 'Too many requests from this IP');

// API Key Authentication Middleware
const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  // For demo purposes - in production, store these in database
  const validAPIKeys = [
    'demo-key-12345678',
    process.env.API_KEY_1,
    process.env.API_KEY_2
  ].filter(Boolean);
  
  if (!apiKey || !validAPIKeys.includes(apiKey)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }
  
  next();
};

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============= ROUTES =============

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    }
  };
  
  res.json(healthCheck);
});

// API Status and documentation
app.get('/api/status', authenticateAPIKey, (req, res) => {
  res.json({
    api: "WHOIS Intelligence Enhanced v2.3.0",
    status: "operational",
    features: {
      whois: true,
      blacklist: true,
      threat_analysis: true,
      privacy_investigation: true,
      bulk_analysis: true,
      risk_scoring: true,
      business_profile_checker: true
    },
    endpoints: {
      core: {
        analyze: "POST /api/analyze",
        analyze_enhanced: "POST /api/analyze-enhanced",
        whois: "POST /api/whois",
        dns: "POST /api/dns",
        mx_analysis: "POST /api/mx-analysis"
      },
      blacklist: {
        blacklist_analysis: "POST /api/blacklist-analysis",
        privacy_email_lookup: "POST /api/privacy-email-lookup",
        bulk_blacklist_analysis: "POST /api/bulk-blacklist-analysis"
      },
      threat: {
        threat_analysis: "POST /api/threat-analysis",
        risk_score: "POST /api/risk-score",
        privacy_investigation: "POST /api/privacy-investigation"
      },
      bulk: {
        bulk_analyze: "POST /api/bulk-analyze",
        bulk_blacklist: "POST /api/bulk-blacklist-analysis"
      },
      business_profile: {
        check: "POST /api/business/check",
        bulk_check: "POST /api/business/bulk-check",
        extract: "POST /api/business/extract",
        detect_platform: "POST /api/business/detect-platform",
        screenshot: "POST /api/business/screenshot (macOS only)"
      }
    },
    rate_limits: {
      strict: "50 requests per 15 minutes",
      normal: "100 requests per 15 minutes",
      relaxed: "200 requests per 15 minutes"
    },
    documentation: "https://github.com/yourusername/whois-intelligence-enhanced",
    timestamp: new Date().toISOString()
  });
});

// Basic WHOIS lookup
app.post('/api/whois', authenticateAPIKey, normalLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  // Check cache first
  const cacheKey = `whois:${domain}`;
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    return res.json({
      ...cachedData,
      cached: true
    });
  }
  
  try {
    const whoisData = await getWhoisData(domain);
    const result = {
      domain,
      whoisData,
      timestamp: new Date().toISOString()
    };
    
    // Cache for 1 hour
    cache.set(cacheKey, result, 3600);
    
    res.json(result);
  } catch (error) {
    console.error(`WHOIS lookup error for ${domain}:`, error);
    res.status(500).json({
      error: 'WHOIS lookup failed',
      message: error.message
    });
  }
}));

// DNS lookup
app.post('/api/dns', authenticateAPIKey, normalLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  try {
    const dnsData = await getDNSRecords(domain);
    res.json({
      domain,
      dnsData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`DNS lookup error for ${domain}:`, error);
    res.status(500).json({
      error: 'DNS lookup failed',
      message: error.message
    });
  }
}));

// Standard domain analysis
app.post('/api/analyze', authenticateAPIKey, normalLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  // Check cache
  const cacheKey = `analyze:${domain}`;
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    return res.json({
      ...cachedData,
      cached: true
    });
  }
  
  try {
    const analysis = await performDomainAnalysis(domain);
    
    // Cache for 30 minutes
    cache.set(cacheKey, analysis, 1800);
    
    res.json(analysis);
  } catch (error) {
    console.error(`Analysis error for ${domain}:`, error);
    res.status(500).json({
      error: 'Domain analysis failed',
      message: error.message
    });
  }
}));

// Enhanced analysis with blacklist checking
app.post('/api/analyze-enhanced', authenticateAPIKey, strictLimiter, asyncHandler(async (req, res) => {
  const { domain, includeScreenshot = false } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  try {
    // Perform standard analysis
    const standardAnalysis = await performDomainAnalysis(domain);
    
    // Add blacklist checking
    const blacklistAnalysis = await blacklistChecker.comprehensiveBlacklistCheck(domain);
    
    // Combine results
    const enhancedAnalysis = {
      ...standardAnalysis,
      blacklistAnalysis,
      threatLevel: calculateThreatLevel(standardAnalysis, blacklistAnalysis),
      timestamp: new Date().toISOString()
    };
    
    res.json(enhancedAnalysis);
  } catch (error) {
    console.error(`Enhanced analysis error for ${domain}:`, error);
    res.status(500).json({
      error: 'Enhanced analysis failed',
      message: error.message
    });
  }
}));

// MX Record Analysis
app.post('/api/mx-analysis', authenticateAPIKey, normalLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  try {
    const dnsData = await getDNSRecords(domain);
    const mxRecords = dnsData.MX || [];
    
    const analysis = {
      domain,
      mxRecords,
      emailProvider: detectEmailProvider(mxRecords),
      spf: await analyzeSPFRecord(domain),
      dmarc: await analyzeDMARCRecord(domain),
      emailSecurity: calculateEmailSecurityScore(dnsData),
      timestamp: new Date().toISOString()
    };
    
    res.json(analysis);
  } catch (error) {
    console.error(`MX analysis error for ${domain}:`, error);
    res.status(500).json({
      error: 'MX analysis failed',
      message: error.message
    });
  }
}));

// Blacklist Analysis
app.post('/api/blacklist-analysis', authenticateAPIKey, strictLimiter, asyncHandler(async (req, res) => {
  const { domain, email, ip, checkAll = false } = req.body;
  
  if (!domain && !email && !ip) {
    return res.status(400).json({ 
      error: 'At least one of domain, email, or IP is required' 
    });
  }
  
  try {
    const results = {};
    
    if (domain) {
      results.domain = await blacklistChecker.comprehensiveBlacklistCheck(domain);
    }
    
    if (email) {
      results.email = await blacklistChecker.checkEmailBlacklists(email);
    }
    
    if (ip) {
      results.ip = await blacklistChecker.checkIPBlacklists(ip);
    }
    
    res.json({
      query: { domain, email, ip },
      results,
      summary: generateBlacklistSummary(results),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Blacklist analysis error:', error);
    res.status(500).json({
      error: 'Blacklist analysis failed',
      message: error.message
    });
  }
}));

// Privacy Email Lookup
app.post('/api/privacy-email-lookup', authenticateAPIKey, normalLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const analysis = blacklistChecker.analyzePrivacyEmail(email);
    res.json({
      email,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Privacy email analysis failed',
      message: error.message
    });
  }
}));

// Threat Analysis
app.post('/api/threat-analysis', authenticateAPIKey, strictLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  try {
    // Get comprehensive data
    const [whoisData, dnsData, blacklistData] = await Promise.all([
      getWhoisData(domain),
      getDNSRecords(domain),
      blacklistChecker.comprehensiveBlacklistCheck(domain)
    ]);
    
    const threats = [];
    const riskFactors = [];
    
    // Analyze WHOIS threats
    if (!whoisData || !whoisData.creation_date) {
      threats.push({
        type: 'WHOIS_MISSING',
        severity: 'medium',
        description: 'WHOIS data unavailable or incomplete'
      });
    }
    
    // Check domain age
    if (whoisData && whoisData.creation_date) {
      const ageInDays = (Date.now() - new Date(whoisData.creation_date)) / (1000 * 60 * 60 * 24);
      if (ageInDays < 30) {
        threats.push({
          type: 'NEW_DOMAIN',
          severity: 'high',
          description: 'Domain registered less than 30 days ago'
        });
        riskFactors.push('newly_registered');
      }
    }
    
    // Check privacy protection
    const privacyAnalysis = await analyzePrivacyProtection(whoisData);
    if (privacyAnalysis.isPrivate) {
      riskFactors.push('privacy_protected');
    }
    
    // Check blacklist status
    if (blacklistData.blacklisted) {
      threats.push({
        type: 'BLACKLISTED',
        severity: 'critical',
        description: `Domain found on ${blacklistData.detectedOn.length} blacklists`
      });
      riskFactors.push('blacklisted');
    }
    
    // Check DNS configuration
    if (!dnsData.MX || dnsData.MX.length === 0) {
      riskFactors.push('no_mx_records');
    }
    
    // Calculate threat score
    const threatScore = calculateThreatScore(threats, riskFactors);
    
    res.json({
      domain,
      threats,
      riskFactors,
      threatScore,
      threatLevel: getThreatLevel(threatScore),
      recommendations: generateSecurityRecommendations(threats, riskFactors),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Threat analysis error for ${domain}:`, error);
    res.status(500).json({
      error: 'Threat analysis failed',
      message: error.message
    });
  }
}));

// Risk Score Calculation
app.post('/api/risk-score', authenticateAPIKey, normalLimiter, asyncHandler(async (req, res) => {
  const { domain, email, ip } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  try {
    const riskFactors = {};
    let totalScore = 0;
    
    // Domain age risk
    const whoisData = await getWhoisData(domain);
    if (whoisData && whoisData.creation_date) {
      const ageInDays = (Date.now() - new Date(whoisData.creation_date)) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) {
        riskFactors.domainAge = { score: 40, reason: 'Domain less than 7 days old' };
        totalScore += 40;
      } else if (ageInDays < 30) {
        riskFactors.domainAge = { score: 20, reason: 'Domain less than 30 days old' };
        totalScore += 20;
      } else if (ageInDays < 90) {
        riskFactors.domainAge = { score: 10, reason: 'Domain less than 90 days old' };
        totalScore += 10;
      }
    }
    
    // Blacklist risk
    const blacklistCheck = await blacklistChecker.comprehensiveBlacklistCheck(domain);
    if (blacklistCheck.blacklisted) {
      const blacklistScore = Math.min(blacklistCheck.detectedOn.length * 10, 50);
      riskFactors.blacklist = { 
        score: blacklistScore, 
        reason: `Listed on ${blacklistCheck.detectedOn.length} blacklists` 
      };
      totalScore += blacklistScore;
    }
    
    // Privacy protection risk
    const privacyAnalysis = await analyzePrivacyProtection(whoisData);
    if (privacyAnalysis.isPrivate) {
      riskFactors.privacy = { score: 15, reason: 'WHOIS privacy protection enabled' };
      totalScore += 15;
    }
    
    // DNS configuration risk
    const dnsData = await getDNSRecords(domain);
    if (!dnsData.MX || dnsData.MX.length === 0) {
      riskFactors.noEmail = { score: 10, reason: 'No MX records configured' };
      totalScore += 10;
    }
    
    // Free email provider risk
    if (email && blacklistChecker.isFreeEmailProvider(email)) {
      riskFactors.freeEmail = { score: 10, reason: 'Using free email provider' };
      totalScore += 10;
    }
    
    // Normalize score to 0-100
    totalScore = Math.min(totalScore, 100);
    
    res.json({
      domain,
      riskScore: totalScore,
      riskLevel: getRiskLevel(totalScore),
      riskFactors,
      recommendations: generateRiskRecommendations(totalScore, riskFactors),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Risk score error for ${domain}:`, error);
    res.status(500).json({
      error: 'Risk score calculation failed',
      message: error.message
    });
  }
}));

// Privacy Investigation
app.post('/api/privacy-investigation', authenticateAPIKey, strictLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  try {
    const whoisData = await getWhoisData(domain);
    const dnsData = await getDNSRecords(domain);
    
    // Extract all emails
    const emails = extractEmails(JSON.stringify(whoisData));
    
    // Check each email
    const emailAnalysis = {};
    for (const email of emails) {
      emailAnalysis[email] = blacklistChecker.analyzePrivacyEmail(email);
    }
    
    // Analyze privacy protection
    const privacyAnalysis = await analyzePrivacyProtection(whoisData);
    
    // Check registrar
    const registrarAnalysis = analyzeRegistrar(whoisData);
    
    res.json({
      domain,
      privacyProtection: privacyAnalysis,
      registrar: registrarAnalysis,
      emails: emailAnalysis,
      privacyServices: detectPrivacyServices(whoisData, dnsData),
      privacyScore: calculatePrivacyScore(privacyAnalysis, emailAnalysis),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Privacy investigation error for ${domain}:`, error);
    res.status(500).json({
      error: 'Privacy investigation failed',
      message: error.message
    });
  }
}));

// Bulk Analysis
app.post('/api/bulk-analyze', authenticateAPIKey, strictLimiter, asyncHandler(async (req, res) => {
  const { domains } = req.body;
  
  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'Domains array is required' });
  }
  
  if (domains.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 domains allowed per request' });
  }
  
  try {
    const results = [];
    
    // Process domains in batches of 5
    const batchSize = 5;
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (domain) => {
          try {
            const analysis = await performDomainAnalysis(domain);
            return {
              domain,
              success: true,
              data: analysis
            };
          } catch (error) {
            return {
              domain,
              success: false,
              error: error.message
            };
          }
        })
      );
      results.push(...batchResults);
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    res.json({
      total: domains.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Bulk analysis error:', error);
    res.status(500).json({
      error: 'Bulk analysis failed',
      message: error.message
    });
  }
}));

// Bulk Blacklist Analysis
app.post('/api/bulk-blacklist-analysis', authenticateAPIKey, strictLimiter, asyncHandler(async (req, res) => {
  const { items, type = 'domain' } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  
  if (items.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 items allowed per request' });
  }
  
  try {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            let checkResult;
            
            switch (type) {
              case 'email':
                checkResult = await blacklistChecker.checkEmailBlacklists(item);
                break;
              case 'ip':
                checkResult = await blacklistChecker.checkIPBlacklists(item);
                break;
              default:
                checkResult = await blacklistChecker.comprehensiveBlacklistCheck(item);
            }
            
            return {
              item,
              type,
              success: true,
              data: checkResult
            };
          } catch (error) {
            return {
              item,
              type,
              success: false,
              error: error.message
            };
          }
        })
      );
      results.push(...batchResults);
      
      // Add delay between batches
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const summary = {
      total: items.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      blacklisted: results.filter(r => r.success && r.data.blacklisted).length
    };
    
    res.json({
      summary,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Bulk blacklist analysis error:', error);
    res.status(500).json({
      error: 'Bulk blacklist analysis failed',
      message: error.message
    });
  }
}));

// ============= BUSINESS PROFILE CHECKER ROUTES =============
// Add all business profile routes
app.use(businessRoutes);

// ============= STATIC FILE ROUTES =============
// Serve the business checker page
app.get('/business-checker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'business-checker.html'));
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============= HELPER FUNCTIONS =============

function detectEmailProvider(mxRecords) {
  const providers = {
    'google': ['google.com', 'googlemail.com', 'aspmx.l.google.com'],
    'microsoft': ['outlook.com', 'protection.outlook.com', 'mail.protection.outlook.com'],
    'protonmail': ['protonmail.ch', 'mail.protonmail.ch'],
    'zoho': ['zoho.com', 'mx.zoho.com'],
    'cloudflare': ['route.email.cloudflare.net'],
    'aws': ['awscloud.com', 'amazonaws.com']
  };
  
  for (const record of mxRecords) {
    const exchange = record.exchange?.toLowerCase() || '';
    
    for (const [provider, patterns] of Object.entries(providers)) {
      if (patterns.some(pattern => exchange.includes(pattern))) {
        return {
          provider,
          confidence: 'high'
        };
      }
    }
  }
  
  return {
    provider: 'unknown',
    confidence: 'low'
  };
}

function calculateEmailSecurityScore(dnsData) {
  let score = 0;
  
  // Check for MX records
  if (dnsData.MX && dnsData.MX.length > 0) score += 25;
  
  // Check for SPF
  if (dnsData.TXT && dnsData.TXT.some(txt => txt.includes('v=spf1'))) score += 25;
  
  // Check for DMARC
  if (dnsData.TXT && dnsData.TXT.some(txt => txt.includes('v=DMARC1'))) score += 25;
  
  // Check for DKIM (basic check)
  if (dnsData.TXT && dnsData.TXT.some(txt => txt.includes('k=rsa'))) score += 25;
  
  return score;
}

function calculateThreatLevel(standardAnalysis, blacklistAnalysis) {
  let threatScore = 0;
  
  // Check blacklist status
  if (blacklistAnalysis.blacklisted) {
    threatScore += blacklistAnalysis.detectedOn.length * 20;
  }
  
  // Check domain age
  if (standardAnalysis.domainAge && standardAnalysis.domainAge < 30) {
    threatScore += 30;
  }
  
  // Check privacy protection
  if (standardAnalysis.privacyAnalysis?.isPrivate) {
    threatScore += 15;
  }
  
  // Normalize to threat level
  if (threatScore >= 60) return 'critical';
  if (threatScore >= 40) return 'high';
  if (threatScore >= 20) return 'medium';
  return 'low';
}

function generateBlacklistSummary(results) {
  const summary = {
    totalChecks: 0,
    blacklisted: 0,
    clean: 0,
    errors: 0
  };
  
  for (const [type, result] of Object.entries(results)) {
    summary.totalChecks++;
    
    if (result.error) {
      summary.errors++;
    } else if (result.blacklisted) {
      summary.blacklisted++;
    } else {
      summary.clean++;
    }
  }
  
  return summary;
}

function calculateThreatScore(threats, riskFactors) {
  let score = 0;
  
  // Score threats
  for (const threat of threats) {
    switch (threat.severity) {
      case 'critical': score += 40; break;
      case 'high': score += 30; break;
      case 'medium': score += 20; break;
      case 'low': score += 10; break;
    }
  }
  
  // Score risk factors
  score += riskFactors.length * 5;
  
  // Normalize to 0-100
  return Math.min(score, 100);
}

function getThreatLevel(score) {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function getRiskLevel(score) {
  if (score >= 70) return 'very high';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  if (score >= 15) return 'low';
  return 'very low';
}

function generateSecurityRecommendations(threats, riskFactors) {
  const recommendations = [];
  
  if (threats.some(t => t.type === 'BLACKLISTED')) {
    recommendations.push('Investigate blacklist listings and request delisting if legitimate');
  }
  
  if (threats.some(t => t.type === 'NEW_DOMAIN')) {
    recommendations.push('Monitor domain closely as it was recently registered');
  }
  
  if (riskFactors.includes('no_mx_records')) {
    recommendations.push('Configure MX records for email functionality');
  }
  
  if (riskFactors.includes('privacy_protected')) {
    recommendations.push('Consider the implications of WHOIS privacy protection');
  }
  
  return recommendations;
}

function generateRiskRecommendations(score, factors) {
  const recommendations = [];
  
  if (score >= 70) {
    recommendations.push('Exercise extreme caution with this domain');
    recommendations.push('Consider blocking or restricting access');
  } else if (score >= 50) {
    recommendations.push('Perform additional verification before trusting');
    recommendations.push('Monitor interactions closely');
  }
  
  if (factors.domainAge?.score >= 20) {
    recommendations.push('Wait for domain to establish reputation');
  }
  
  if (factors.blacklist) {
    recommendations.push('Check reason for blacklisting');
  }
  
  return recommendations;
}

function detectPrivacyServices(whoisData, dnsData) {
  const services = [];
  const whoisText = JSON.stringify(whoisData).toLowerCase();
  
  const knownServices = [
    'whoisguard',
    'domains by proxy',
    'perfect privacy',
    'private whois',
    'privacy protect',
    'whois privacy',
    'domain privacy'
  ];
  
  for (const service of knownServices) {
    if (whoisText.includes(service)) {
      services.push(service);
    }
  }
  
  return services;
}

function calculatePrivacyScore(privacyAnalysis, emailAnalysis) {
  let score = 0;
  
  if (privacyAnalysis.isPrivate) score += 50;
  
  // Check for privacy emails
  const privacyEmails = Object.values(emailAnalysis).filter(a => a.isPrivacyService);
  score += privacyEmails.length * 10;
  
  return Math.min(score, 100);
}

// ============= ERROR HANDLING =============

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============= SERVER STARTUP =============

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   WHOIS Intelligence Server + Business Checker ║
║                  Version 2.3.0                 ║
╠═══════════════════════════════════════════════╣
║   Server running on port: ${PORT}              ║
║   Environment: ${process.env.NODE_ENV || 'development'}         ║
║                                               ║
║   Features:                                   ║
║   ✓ WHOIS Lookup & Analysis                  ║
║   ✓ DNS & MX Record Analysis                 ║
║   ✓ Blacklist Checking                       ║
║   ✓ Threat Intelligence                      ║
║   ✓ Risk Scoring                             ║
║   ✓ Privacy Investigation                    ║
║   ✓ Business Profile Checker                 ║
║                                               ║
║   UI: http://localhost:${PORT}                ║
║   Business Checker: http://localhost:${PORT}/business-checker ║
╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;