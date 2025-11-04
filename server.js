/**
 * Enhanced WHOIS Intelligence Server with Business Profile Checker
 * Version: 2.3.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const dns = require('dns').promises;
const whois = require('whois');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Import business routes and validation
const businessRoutes = require('./routes/business-routes');
const { validate, domainSchema } = require('./utils/validation');

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
app.use(morgan('combined'));

// Cache
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Validate API Keys on Startup
const validApiKeys = [
  process.env.API_KEY_1,
  process.env.API_KEY_2,
  process.env.API_KEY_3,
  process.env.API_KEY_4,
  process.env.API_KEY_5
].filter(key => key && key.length >= 16); // Minimum 16 characters for security

if (validApiKeys.length === 0) {
  console.error('⚠️  WARNING: No valid API keys configured!');
  console.error('⚠️  Set at least one API_KEY_* environment variable (minimum 16 characters)');
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️  Cannot start in production without API keys!');
    process.exit(1);
  } else {
    console.warn('⚠️  Running in development mode without API keys - authentication disabled');
  }
}

// API Key Authentication Middleware
const authenticateAPIKey = (req, res, next) => {
  // Skip authentication in test mode
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // If no API keys configured in dev mode, allow through with warning
  if (validApiKeys.length === 0 && process.env.NODE_ENV !== 'production') {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing API key',
      message: 'Please provide an API key in the x-api-key header or apiKey query parameter'
    });
  }

  if (!validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  next();
};

// Helper Functions
async function performWhoisLookup(domain) {
  return new Promise((resolve, reject) => {
    whois.lookup(domain, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

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
    type: hasPrivacy ? 'Privacy Protection Enabled' : null
  };
}

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.3.0'
  });
});

app.post('/api/analyze', authenticateAPIKey, validate(domainSchema), async (req, res) => {
  try {
    const { domain } = req.body;

    // Clean domain (validation ensures it's present and valid format)
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    const cacheKey = `whois_${cleanDomain}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, fromCache: true });
    }

    const whoisRaw = await performWhoisLookup(cleanDomain);
    const whoisData = parseWhoisData(whoisRaw);
    const dnsRecords = await getAllDNSRecords(cleanDomain);
    const privacyProtection = analyzePrivacyProtection(whoisData);
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

// Business Profile Checker Routes (with authentication)
app.use('/api/business', authenticateAPIKey, businessRoutes);

// Static Files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Start Server (only if not being imported for testing)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 WHOIS Intelligence Server v2.3.0 running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 API Key authentication: Enabled`);
    console.log(`💼 Business Profile Checker: Enabled`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
  });
}

// Export for testing
module.exports = app;
