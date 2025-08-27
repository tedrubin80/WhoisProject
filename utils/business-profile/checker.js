// utils/business-profile/checker.js
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class BusinessProfileChecker {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async processURL(url) {
    try {
      // Normalize URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const platform = this.identifyPlatform(url);
      const validity = await this.checkValidity(url);
      
      let businessName = 'N/A';
      let contactInfo = {};
      let screenshot = null;

      if (validity.valid) {
        const html = await this.fetchHTML(url);
        businessName = this.extractBusinessName(url, html);
        contactInfo = this.extractContactInfo(html, url);
      }

      return {
        url: url,
        platform: platform,
        validity: validity,
        business_name: businessName,
        contact_info: contactInfo,
        screenshot: screenshot,
        checked_at: new Date().toISOString()
      };

    } catch (error) {
      return {
        url: url,
        error: error.message,
        status: '⚠️ ERROR',
        checked_at: new Date().toISOString()
      };
    }
  }

  identifyPlatform(url) {
    const platforms = {
      'instagram.com': 'Instagram',
      'facebook.com': 'Facebook',
      'fb.com': 'Facebook',
      'yelp.com': 'Yelp',
      'linkedin.com': 'LinkedIn',
      'twitter.com': 'Twitter',
      'x.com': 'Twitter/X',
      'tiktok.com': 'TikTok',
      'youtube.com': 'YouTube',
      'shopify.com': 'Shopify',
      'myshopify.com': 'Shopify',
      'squarespace.com': 'Squarespace',
      'wix.com': 'Wix',
      'wordpress.com': 'WordPress'
    };

    const domain = url.toLowerCase();
    for (const [key, value] of Object.entries(platforms)) {
      if (domain.includes(key)) {
        return value;
      }
    }
    return 'Website';
  }

  async checkValidity(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      // Check for specific error patterns in content
      const content = response.data || '';
      const contentLower = content.toLowerCase();
      
      // Check for "not found" indicators
      const notFoundIndicators = [
        'page not found',
        'not found',
        '404 error',
        'doesn\'t exist',
        'no longer available',
        'profile not found',
        'user not found',
        'this account doesn\'t exist'
      ];
      
      // Check HTTP status codes
      if (response.status === 404) {
        return {
          status: '❌ INVALID',
          valid: false,
          code: 404,
          reason: 'Page not found'
        };
      }
      
      if (response.status === 403 || response.status === 401) {
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
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      return response.data;
    } catch (error) {
      return '';
    }
  }
  
  extractBusinessName(url, html) {
    try {
      const $ = cheerio.load(html);
      
      // Try multiple selectors in order of preference
      const selectors = [
        'meta[property="og:site_name"]',
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'title',
        'h1',
        '.business-name',
        '.company-name',
        '#business-name'
      ];
      
      for (const selector of selectors) {
        let name;
        
        if (selector.startsWith('meta')) {
          name = $(selector).attr('content');
        } else {
          name = $(selector).first().text();
        }
        
        if (name) {
          // Clean up the name
          name = name.trim()
            .replace(/\s+/g, ' ')
            .replace(/\|.*$/, '')
            .replace(/[-–—].*$/, '')
            .replace(/[•·].*$/, '')
            .replace(/^\W+|\W+$/g, '');
          
          // Filter out generic titles
          const genericTerms = ['home', 'welcome', 'official', 'website', 'online'];
          if (name.length > 2 && !genericTerms.includes(name.toLowerCase())) {
            return name;
          }
        }
      }
      
      // Platform-specific extraction
      const platform = this.identifyPlatform(url);
      
      if (platform === 'Instagram') {
        const profileName = $('meta[property="og:title"]').attr('content');
        if (profileName && profileName.includes('@')) {
          return profileName.split('•')[0].trim();
        }
      }
      
      return 'Unknown Business';
      
    } catch (error) {
      return 'Unknown Business';
    }
  }
  
  extractContactInfo(html, url) {
    try {
      const $ = cheerio.load(html);
      const info = {
        emails: [],
        phones: [],
        social_media: {},
        addresses: []
      };
      
      // Extract text content
      const textContent = $('body').text();
      
      // Email extraction
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const foundEmails = textContent.match(emailRegex) || [];
      
      // Filter out common non-business emails
      const excludedDomains = ['example.com', 'email.com', 'domain.com', 'sentry.io', 'google.com', 'facebook.com'];
      const excludedPrefixes = ['noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'postmaster', 'abuse', 'admin@'];
      
      info.emails = [...new Set(foundEmails)]
        .filter(email => {
          const emailLower = email.toLowerCase();
          return !excludedDomains.some(domain => emailLower.includes(domain)) &&
                 !excludedPrefixes.some(prefix => emailLower.startsWith(prefix));
        })
        .slice(0, 5); // Limit to 5 emails
      
      // Phone extraction
      const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const foundPhones = textContent.match(phoneRegex) || [];
      
      info.phones = [...new Set(foundPhones)]
        .map(phone => phone.replace(/\D/g, ''))
        .filter(phone => phone.length >= 10 && phone.length <= 11)
        .map(phone => {
          if (phone.length === 10) {
            return `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`;
          }
          return `+${phone[0]} (${phone.slice(1,4)}) ${phone.slice(4,7)}-${phone.slice(7)}`;
        })
        .slice(0, 3); // Limit to 3 phones
      
      // Social media extraction
      const socialPatterns = {
        facebook: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([A-Za-z0-9.]+)/,
        instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/,
        twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]+)/,
        linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/([A-Za-z0-9-]+)/,
        youtube: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c|channel|user)\/([A-Za-z0-9_-]+)/
      };
      
      // Search in links
      $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        if (!href) return;
        
        for (const [platform, pattern] of Object.entries(socialPatterns)) {
          const match = href.match(pattern);
          if (match && match[1]) {
            info.social_media[platform] = match[0];
            break;
          }
        }
      });
      
      // Address extraction (basic)
      const addressPatterns = [
        /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|plaza|pl)\b/gi,
        /\d+\s+[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}\s+\d{5}/gi
      ];
      
      for (const pattern of addressPatterns) {
        const matches = textContent.match(pattern) || [];
        info.addresses.push(...matches);
      }
      
      info.addresses = [...new Set(info.addresses)].slice(0, 2); // Limit to 2 addresses
      
      // Clean up empty arrays
      if (info.emails.length === 0) delete info.emails;
      if (info.phones.length === 0) delete info.phones;
      if (Object.keys(info.social_media).length === 0) delete info.social_media;
      if (info.addresses.length === 0) delete info.addresses;
      
      return info;
      
    } catch (error) {
      console.error('Error extracting contact info:', error);
      return {};
    }
  }
}

module.exports = BusinessProfileChecker;