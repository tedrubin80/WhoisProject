const axios = require('axios');
const cheerio = require('cheerio');

class BusinessProfileChecker {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
      'linkedin.com': 'LinkedIn',
      'twitter.com': 'Twitter',
      'youtube.com': 'YouTube',
      'tiktok.com': 'TikTok'
    };
    
    for (const [domain, platform] of Object.entries(platforms)) {
      if (urlLower.includes(domain)) {
        return platform;
      }
    }
    
    return 'Website';
  }
  
  async validateURL(url) {
    try {
      const response = await axios.get(url, {
        ...this.axiosConfig,
        headers: {
          ...this.axiosConfig.headers,
          'User-Agent': this.getRandomUserAgent()
        }
      });
      
      if (response.status === 200) {
        return {
          status: '✅ VALID',
          valid: true,
          code: response.status
        };
      } else if ([301, 302, 307, 308].includes(response.status)) {
        return {
          status: '🔄 REDIRECTS',
          valid: true,
          code: response.status,
          reason: 'Website redirects'
        };
      } else {
        return {
          status: '❌ INVALID',
          valid: false,
          code: response.status,
          reason: `HTTP ${response.status}`
        };
      }
    } catch (error) {
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
        ...this.axiosConfig,
        headers: {
          ...this.axiosConfig.headers,
          'User-Agent': this.getRandomUserAgent()
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching HTML for ${url}:`, error.message);
      return '';
    }
  }
  
  extractBusinessName(url, html) {
    const $ = cheerio.load(html);
    let businessName = 'Unknown Business';
    
    businessName = $('meta[property="og:site_name"]').attr('content') ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('title').text() ||
                  businessName;
    
    return businessName.trim();
  }
  
  extractContactInfo(html, url) {
    const $ = cheerio.load(html);
    const contactInfo = {
      emails: [],
      phones: [],
      social_media: {},
      address: null
    };
    
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = html.match(emailRegex) || [];
    contactInfo.emails = [...new Set(emails)].filter(email => !email.includes('example.com'));
    
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phones = html.match(phoneRegex) || [];
    contactInfo.phones = [...new Set(phones)];
    
    return contactInfo;
  }
  
  async processURL(url) {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      const validity = await this.validateURL(url);
      
      let businessName = 'Unknown Business';
      let contactInfo = { emails: [], phones: [], social_media: {}, address: null };
      let platform = this.identifyPlatform(url);
      
      if (validity.valid) {
        const html = await this.fetchHTML(url);
        businessName = this.extractBusinessName(url, html);
        contactInfo = this.extractContactInfo(html, url);
      }
      
      return {
        url: url,
        business_name: businessName,
        platform: platform,
        validity: validity,
        contact_info: contactInfo,
        checked_at: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        url: url,
        business_name: 'Error',
        platform: this.identifyPlatform(url),
        validity: {
          status: '⚠️ ERROR',
          valid: false,
          reason: error.message
        },
        contact_info: {
          emails: [],
          phones: [],
          social_media: {},
          address: null
        },
        checked_at: new Date().toISOString()
      };
    }
  }
}

module.exports = BusinessProfileChecker;
