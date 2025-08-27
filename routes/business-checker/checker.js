// utils/business-profile/checker.js
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs').promises;

class BusinessProfileChecker {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    this.axiosConfig = {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };
  }
  
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
  
  identifyPlatform(url) {
    const urlLower = url.toLowerCase();
    
    const platforms = {
      'instagram.com': 'Instagram',
      'facebook.com': 'Facebook',
      'fb.com': 'Facebook',
      'shopify.com': 'Shopify',
      'myshopify.com': 'Shopify',
      'yelp.com': 'Yelp',
      'linkedin.com': 'LinkedIn',
      'twitter.com': 'Twitter',
      'x.com': 'Twitter',
      'tiktok.com': 'TikTok',
      'youtube.com': 'YouTube'
    };
    
    for (const [domain, platform] of Object.entries(platforms)) {
      if (urlLower.includes(domain)) {
        return platform;
      }
    }
    
    return 'Regular Website';
  }
  
  async checkValidity(url) {
    try {
      const response = await axios({
        ...this.axiosConfig,
        method: 'GET',
        url: url,
        headers: {
          ...this.axiosConfig.headers,
          'User-Agent': this.getRandomUserAgent()
        }
      });
      
      const gatedIndicators = [
        'login required',
        'sign in to continue',
        'members only',
        'access denied',
        'please log in',
        'must be logged in'
      ];
      
      const notFoundIndicators = [
        'page not found',
        'user not found',
        'profile unavailable',
        'account suspended',
        'this account is private'
      ];
      
      const contentLower = (response.data || '').toString().toLowerCase();
      
      if (response.status === 401 || response.status === 403) {
        return {
          status: '🔐 GATED',
          valid: false,
          code: response.status,
          reason: 'Login required or access forbidden'
        };
      }
      
      if (response.status === 404) {
        return {
          status: '❌ INVALID',
          valid: false,
          code: response.status,
          reason: 'Page not found'
        };
      }
      
      if (gatedIndicators.some(indicator => contentLower.includes(indicator))) {
        return {
          status: '🔐 GATED',
          valid: false,
          code: response.status,
          reason: 'Login required'
        };
      }
      
      if (notFoundIndicators.some(indicator => contentLower.includes(indicator))) {
        return {
          status: '❌ INVALID',
          valid: false,
          code: response.status,
          reason: 'Profile appears inactive or not found'
        };
      }
      
      if ([301, 302, 307, 308].includes(response.status)) {
        return {
          status: '🔄 REDIRECTS',
          valid: true,
          code: response.status,
          reason: 'Website redirects',
          finalUrl: response.request?.res?.responseUrl || url
        };
      }
      
      if (response.status === 200) {
        return {
          status: '✅ VALID',
          valid: true,
          code: response.status,
          finalUrl: response.request?.res?.responseUrl || url
        };
      }
      
      return {
        status: '⚠️ ERROR',
        valid: false,
        code: response.status,
        reason: `HTTP ${response.status}`
      };
      
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          status: '⚠️ ERROR',
          valid: false,
          reason: 'Connection timeout'
        };
      }
      
      if (error.code === 'ENOTFOUND') {
        return {
          status: '❌ INVALID',
          valid: false,
          reason: 'Domain not found'
        };
      }
      
      return {
        status: '⚠️ ERROR',
        valid: false,
        reason: error.message
      };
    }
  }
  
  async fetchHTML(url) {
    try {
      const response = await axios({
        ...this.axiosConfig,
        method: 'GET',
        url: url,
        headers: {
          ...this.axiosConfig.headers,
          'User-Agent': this.getRandomUserAgent()
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch HTML: ${error.message}`);
    }
  }
  
  extractBusinessName(url, html) {
    const $ = cheerio.load(html);
    const platform = this.identifyPlatform(url);
    
    let businessName = '';
    
    const selectors = {
      'Instagram': [
        'meta[property="og:title"]',
        'title',
        'h2._aacl._aacs._aact._aacx._aada',
        'h1'
      ],
      'Facebook': [
        'meta[property="og:title"]',
        'title',
        '#seo_h1_tag',
        'h1'
      ],
      'Shopify': [
        'meta[property="og:site_name"]',
        'title',
        '.site-header__logo',
        'h1'
      ],
      'Regular Website': [
        'meta[property="og:site_name"]',
        'meta[property="og:title"]',
        'title',
        'h1'
      ]
    };
    
    const platformSelectors = selectors[platform] || selectors['Regular Website'];
    
    for (const selector of platformSelectors) {
      try {
        if (selector.startsWith('meta')) {
          businessName = $(selector).attr('content') || '';
        } else {
          businessName = $(selector).first().text().trim();
        }
        
        if (businessName) {
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Clean up business name
    businessName = businessName
      .replace(/\s*[\|–-]\s*Instagram.*$/i, '')
      .replace(/\s*[\|–-]\s*Facebook.*$/i, '')
      .replace(/\s*[\|–-]\s*LinkedIn.*$/i, '')
      .replace(/\s*[\|–-]\s*Yelp.*$/i, '')
      .replace(/\(@[^)]+\)/, '')
      .trim();
    
    return businessName || 'Unknown Business';
  }
  
  extractContactInfo(html, url) {
    const $ = cheerio.load(html);
    const contactInfo = {
      emails: [],
      phones: [],
      addresses: [],
      socialMedia: {},
      contactPages: []
    };
    
    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = html.match(emailRegex) || [];
    
    const excludePatterns = [
      'example.com',
      'email.com',
      'yoursite.com',
      'noreply',
      'no-reply',
      'donotreply',
      'mailer-daemon',
      'googletagmanager',
      'google-analytics',
      'facebook.com',
      'instagram.com'
    ];
    
    contactInfo.emails = [...new Set(emailMatches)]
      .filter(email => {
        const emailLower = email.toLowerCase();
        return !excludePatterns.some(pattern => emailLower.includes(pattern));
      })
      .slice(0, 5);
    
    // Extract phone numbers
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phoneMatches = html.match(phoneRegex) || [];
    contactInfo.phones = [...new Set(phoneMatches)]
      .map(phone => phone.replace(/[^\d+]/g, '').replace(/^1/, ''))
      .filter(phone => phone.length >= 10)
      .slice(0, 5);
    
    // Extract social media links
    const socialPatterns = {
      'Instagram': /https?:\/\/(www\.)?instagram\.com\/[^\/\s"']+/g,
      'Facebook': /https?:\/\/(www\.)?facebook\.com\/[^\/\s"']+/g,
      'Twitter': /https?:\/\/(www\.)?(twitter|x)\.com\/[^\/\s"']+/g,
      'LinkedIn': /https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[^\/\s"']+/g
    };
    
    for (const [platform, regex] of Object.entries(socialPatterns)) {
      const matches = html.match(regex);
      if (matches && matches.length > 0) {
        contactInfo.socialMedia[platform] = [...new Set(matches)].slice(0, 2);
      }
    }
    
    return contactInfo;
  }
  
  async takeScreenshot(url) {
    if (process.platform !== 'darwin') {
      throw new Error('Screenshot feature is only available on macOS');
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Screenshot_${timestamp}.png`;
    const filepath = path.join(process.env.HOME, 'Desktop', filename);
    
    try {
      await execAsync(`screencapture -x -T 5 "${filepath}"`);
      return filepath;
    } catch (error) {
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }
  
  async processURL(url) {
    const result = {
      url: url,
      timestamp: new Date().toISOString(),
      platform: this.identifyPlatform(url)
    };
    
    try {
      result.validity = await this.checkValidity(url);
      
      if (!result.validity.valid) {
        return result;
      }
      
      const html = await this.fetchHTML(result.validity.finalUrl || url);
      result.businessName = this.extractBusinessName(url, html);
      result.contactInfo = this.extractContactInfo(html, url);
      
      return result;
      
    } catch (error) {
      result.error = error.message;
      result.status = '⚠️ ERROR';
      return result;
    }
  }
}

module.exports = BusinessProfileChecker;