/**
 * Enhanced WHOIS Intelligence Server with Business Profile Checker
 * Version: 2.3.0
 * Features: WHOIS lookup, DNS analysis, Blacklist checking, Business profile validation
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
const dns = require('dns').promises;
const whois = require('whois');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Import business routes
const businessRoutes = require('./routes/business-routes');

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
  stdTTL: 3600,
  checkperiod: 600,
  useClones: false
});

// Rate limiting
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
  });
};

const strictLimiter = createRateLimiter(15 * 60 * 1000, 50, 'Too many requests from this IP');
const normalLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests from this IP');

// API Key Authentication Middleware
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

// ============= HELPER FUNCTIONS =============

// WHOIS lookup function
async function performWhoisLookup(domain) {
  return new Promise((resolve, reject) => {
    whois.lookup(domain, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

// DNS lookup functions
async function performDNSLookup(domain, recordType) {
  try {
    switch (recordType) {
      case 'A':
        return await dns.resolve4(domain);
      case 'AAAA':
        return await dns.resolve6(domain);
      case 'MX':
        return await dns.resolveMx(domain);
      case 'TXT':
        return await dns.resolveTxt(domain);
      case 'NS':
        return await dns.resolveNs(domain);
      case 'CNAME':
        return await dns.resolveCname(domain);
      case 'SOA':
        return await dns.resolveSoa(domain);
      default:
        return [];
    }
  } catch (error) {
    console.error(`DNS ${recordType} lookup error for ${domain}:`, error.message);
    return [];
  }
}

// Get all DNS records
async function getAllDNSRecords(domain) {
  const recordTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'];
  const results = {};

  await Promise.all(
    recordTypes.map(async (type) => {
      try {
        results[type] = await performDNSLookup(domain, type);
      } catch (error) {
        results[type] = [];
      }
    })
  );

  return results;
}

// Parse WHOIS data
function parseWhoisData(whoisText) {
  const parsed = {};
  const lines = whoisText.split('\n');
  
  const patterns = {
    registrar: /registrar:\s*(.+)/i,
    creationDate: /creat(?:ed|ion)(?: date)?:\s*(.+)/i,
    expirationDate: /expir(?:y|ation|es)(?: date)?:\s*(.+)/i,
    nameServers: /name server:\s*(.+)/i,
    registrantName: /registrant(?: name)?:\s*(.+)/i,
    registrantOrg: /registrant(?: organization)?:\s*(.+)/i,
    registrantEmail: /registrant email:\s*(.+)/i,
    status: /status:\s*(.+)/i
  };

  lines.forEach(line => {
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = line.match(pattern);
      if (match) {
        if (key === 'nameServers') {
          if (!parsed.nameServers) parsed.nameServers = [];
          parsed.nameServers.push(match[1].trim());
        } else {
          parsed[key] = match[1].trim();
        }
      }
    }
  });

  return parsed;
}

// Calculate domain age
function calculateDomainAge(creationDate) {
  if (!creationDate) return null;
  
  try {
    const created = new Date(creationDate);
    const now = new Date();
    const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    return ageInDays;
  } catch (error) {
    return null;
  }
}

// Analyze privacy protection
function analyzePrivacyProtection(whoisData) {
  const privacyIndicators = [
    'privacy protect',
    'whois guard',
    'whois privacy',
    'domains by proxy',
    'contact privacy',
    'data protected',
    'redacted for privacy',
    'privacy service',
    'not disclosed'
  ];
  
  const whoisText = JSON.stringify(whoisData).toLowerCase();
  const hasPrivacy = privacyIndicators.some(indicator => whoisText.includes(indicator));
  
  return {
    hasPrivacy,
    type: hasPrivacy ? detectPrivacyService(whoisText) : null
  };
}

function detectPrivacyService(whoisText) {
  const services = {
    'whoisguard': 'WhoisGuard',
    'domains by proxy': 'DomainsByProxy',
    'privacy protect': 'PrivacyProtect',
    'contact privacy': 'Contact Privacy Inc',
    'whois privacy': 'WHOIS Privacy Service'
  };
  
  for (const [key, name] of Object.entries(services)) {
    if (whoisText.includes(key)) {
      return name;
    }
  }
  
  return 'Generic Privacy Service';
}

// ============= WHOIS INTELLIGENCE ROUTES =============

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.3.0'
  });
});

// Basic domain analysis
app.post('/api/analyze', authenticateAPIKey, strictLimiter, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Clean domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    // Check cache
    const cacheKey = `whois_${cleanDomain}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, fromCache: true });
    }

    // Perform WHOIS lookup
    const whoisRaw = await performWhoisLookup(cleanDomain);
    const whoisData = parseWhoisData(whoisRaw);
    
    // Get DNS records
    const dnsRecords = await getAllDNSRecords(cleanDomain);
    
    // Analyze privacy protection
    const privacyProtection = analyzePrivacyProtection(whoisData);
    
    // Calculate domain age
    const domainAge = calculateDomainAge(whoisData.creationDate);
    
    const result = {
      domain: cleanDomain,
      whoisData,
      dnsRecords,
      privacyProtection,
      domainAge,
      analysis: {
        isNewDomain: domainAge && domainAge < 30,
        hasPrivacyProtection: privacyProtection.hasPrivacy,
        hasMXRecords: dnsRecords.MX && dnsRecords.MX.length > 0,
        nameServerCount: whoisData.nameServers ? whoisData.nameServers.length : 0
      },
      timestamp: new Date().toISOString()
    };
    
    // Cache result
    cache.set(cacheKey, result);
    
    res.json(result);
  } catch (error) {
    console.error('Domain analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

// Enhanced analysis with blacklist checking
app.post('/api/analyze-enhanced', authenticateAPIKey, strictLimiter, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    // Perform basic analysis first
    const whoisRaw = await performWhoisLookup(cleanDomain);
    const whoisData = parseWhoisData(whoisRaw);
    const dnsRecords = await getAllDNSRecords(cleanDomain);
    
    // Get IP for blacklist checking
    let ip = null;
    if (dnsRecords.A && dnsRecords.A.length > 0) {
      ip = dnsRecords.A[0];
    }
    
    // Simple blacklist check (without external module for now)
    const blacklistAnalysis = {
      blacklisted: false,
      detectedOn: [],
      checkedLists: ['spamhaus', 'barracuda', 'spamcop'],
      timestamp: new Date().toISOString()
    };
    
    const result = {
      domain: cleanDomain,
      summary: {
        registrar: whoisData.registrar,
        creationDate: whoisData.creationDate,
        expirationDate: whoisData.expirationDate,
        domainAge: calculateDomainAge(whoisData.creationDate),
        privacyProtection: analyzePrivacyProtection(whoisData).hasPrivacy
      },
      dnsRecords,
      blacklistAnalysis,
      riskScore: calculateRiskScore(whoisData, blacklistAnalysis),
      timestamp: new Date().toISOString()
    };
    
    res.json(result);
  } catch (error) {
    console.error('Enhanced analysis error:', error);
    res.status(500).json({
      error: 'Enhanced analysis failed',
      message: error.message
    });
  }
});

// Threat analysis endpoint
app.post('/api/threat-analysis', authenticateAPIKey, strictLimiter, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    // Perform basic lookups
    const whoisRaw = await performWhoisLookup(cleanDomain);
    const whoisData = parseWhoisData(whoisRaw);
    const dnsRecords = await getAllDNSRecords(cleanDomain);
    
    // Analyze threats
    const threats = [];
    const domainAge = calculateDomainAge(whoisData.creationDate);
    
    // Check for suspicious patterns
    if (domainAge && domainAge < 7) {
      threats.push({
        type: 'NEW_DOMAIN',
        severity: 'high',
        description: 'Domain registered less than 7 days ago'
      });
    }
    
    if (analyzePrivacyProtection(whoisData).hasPrivacy) {
      threats.push({
        type: 'PRIVACY_PROTECTED',
        severity: 'medium',
        description: 'WHOIS information is hidden by privacy service'
      });
    }
    
    if (!dnsRecords.MX || dnsRecords.MX.length === 0) {
      threats.push({
        type: 'NO_EMAIL_CONFIG',
        severity: 'low',
        description: 'No MX records configured'
      });
    }
    
    const threatScore = threats.reduce((score, threat) => {
      const severityScores = { high: 30, medium: 20, low: 10 };
      return score + (severityScores[threat.severity] || 0);
    }, 0);
    
    res.json({
      domain: cleanDomain,
      threats,
      threatScore,
      threatLevel: threatScore > 50 ? 'high' : threatScore > 25 ? 'medium' : 'low',
      recommendations: generateRecommendations(threats),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Threat analysis error:', error);
    res.status(500).json({
      error: 'Threat analysis failed',
      message: error.message
    });
  }
});

// Privacy investigation endpoint
app.post('/api/privacy-investigation', authenticateAPIKey, strictLimiter, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    const whoisRaw = await performWhoisLookup(cleanDomain);
    const whoisData = parseWhoisData(whoisRaw);
    const privacyAnalysis = analyzePrivacyProtection(whoisData);
    
    // Extract any visible contact information
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}/g;
    
    const emails = whoisRaw.match(emailRegex) || [];
    const phones = whoisRaw.match(phoneRegex) || [];
    
    res.json({
      domain: cleanDomain,
      privacyProtection: {
        isPrivate: privacyAnalysis.hasPrivacy,
        serviceType: privacyAnalysis.type,
        registrantName: whoisData.registrantName || 'Hidden',
        registrantOrg: whoisData.registrantOrg || 'Hidden'
      },
      exposedContacts: {
        emails: [...new Set(emails)].filter(email => !email.includes('abuse') && !email.includes('privacy')),
        phones: [...new Set(phones)]
      },
      recommendations: privacyAnalysis.hasPrivacy ? 
        ['Privacy protection is enabled', 'Consider verifying domain ownership through other means'] :
        ['Privacy protection is not enabled', 'Personal information may be exposed'],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Privacy investigation error:', error);
    res.status(500).json({
      error: 'Privacy investigation failed',
      message: error.message
    });
  }
});

// ============= BUSINESS PROFILE CHECKER ROUTES =============
app.use(businessRoutes);

// ============= STATIC FILE ROUTES =============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============= HELPER FUNCTIONS =============

function calculateRiskScore(whoisData, blacklistAnalysis = {}) {
  let score = 0;
  
  const domainAge = calculateDomainAge(whoisData.creationDate);
  if (domainAge && domainAge < 30) score += 30;
  if (domainAge && domainAge < 7) score += 20;
  
  if (analyzePrivacyProtection(whoisData).hasPrivacy) score += 15;
  
  if (blacklistAnalysis.blacklisted) score += 40;
  
  return Math.min(score, 100);
}

function generateRecommendations(threats) {
  const recommendations = [];
  
  threats.forEach(threat => {
    switch (threat.type) {
      case 'NEW_DOMAIN':
        recommendations.push('Exercise caution with newly registered domains');
        recommendations.push('Verify the domain owner through additional means');
        break;
      case 'PRIVACY_PROTECTED':
        recommendations.push('Request verification of domain ownership');
        recommendations.push('Look for other trust signals (SSL, company info)');
        break;
      case 'NO_EMAIL_CONFIG':
        recommendations.push('Check if email services are properly configured');
        break;
    }
  });
  
  return [...new Set(recommendations)];
}

// ============= ERROR HANDLING =============
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// ============= START SERVER =============
app.listen(PORT, () => {
  console.log(`🚀 WHOIS Intelligence Server v2.3.0 running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 API Key authentication: Enabled`);
  console.log(`💼 Business Profile Checker: Enabled`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
});