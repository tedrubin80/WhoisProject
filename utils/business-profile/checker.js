// utils/business-profile/checker.js
const axios = require('axios');
const cheerio = require('cheerio');

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
      'x.com': 'X (Twitter)',
      'youtube.com': 'YouTube',
      'tiktok.com': 'TikTok',
      'pinterest.com': 'Pinterest',
      'etsy.com': 'Etsy',
      'wix.com': 'Wix',
      'squarespace.com': 'Squarespace',
      'wordpress.com': 'WordPress',
      'blogspot.com': 'Blogger',
      'medium.com': 'Medium',
      'github.com': 'GitHub',
      'behance.net': 'Behance',
      'dribbble.com': 'Dribbble'
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
      
      const contentType = response.headers['content-type'] || '';
      const isHTMLContent = contentType.includes('text/html') || contentType.includes('text/plain');
      
      if (!isHTMLContent && response.status === 200) {
        return {
          status: '⚠️ NON-HTML',
          valid: false,
          code: response.status,
          reason: 'Not a webpage (might be an API or file)'
        };
      }
      
      // Check for common error indicators in the response
      const content = response.data.toString();
      const contentLower = content.toLowerCase();
      
      const errorIndicators = [
        'page not found',
        '404 error',
        'this page isn\'t available',
        'this page may have been removed',
        'profile not found',
        'user not found',
        'this account doesn\'t exist',
        'content unavailable',
        'sorry, this page isn\'t available',
        'the link you followed may be broken'
      ];
      
      const loginRequiredIndicators = [
        'log in to continue',
        'sign in required',
        'please log in',
        'must be logged in',
        'login required'
      ];
      
      const notFoundIndicators = [
        'profile may have been deleted',
        'account suspended',
        'profile unavailable',
        'no longer available',
        'deactivated'
      ];
      
      if (response.status === 404) {
        return {
          status: '❌ NOT FOUND',
          valid: false,
          code: 404,
          reason: 'Page not found'
        };
      }
      
      if (errorIndicators.some(indicator => contentLower.includes(indicator))) {
        return {
          status: '❌ NOT FOUND',
          valid: false,
          code: response.status,
          reason: 'Error page detected'
        };
      }
      
      if (loginRequiredIndicators.some(indicator => contentLower.includes(indicator))) {
        return {
          status: '🔒 LOGIN REQUIRED',
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
    const platform = this.identifyPlatform(url);
    
    let businessName = 'Unknown Business';
    
    // Platform-specific extraction
    switch (platform) {
      case 'Instagram':
        businessName = $('meta[property="og:title"]').attr('content') ||
                      $('title').text() ||
                      $('h1').first().text();
        businessName = businessName.replace(/ • Instagram.*$/i, '').trim();
        break;
        
      case 'Facebook':
        businessName = $('meta[property="og:title"]').attr('content') ||
                      $('title').text() ||
                      $('h1').first().text();
        businessName = businessName.replace(/ - Home | Facebook.*$/i, '').trim();
        break;
        
      case 'LinkedIn':
        businessName = $('meta[property="og:title"]').attr('content') ||
                      $('h1').first().text() ||
                      $('title').text();
        businessName = businessName.replace(/ \| LinkedIn.*$/i, '').trim();
        break;
        
      case 'Yelp':
        businessName = $('h1').first().text() ||
                      $('meta[property="og:title"]').attr('content') ||
                      $('title').text();
        break;
        
      default:
        // Generic extraction for websites
        businessName = $('meta[property="og:site_name"]').attr('content') ||
                      $('meta[property="og:title"]').attr('content') ||
                      $('meta[name="author"]').attr('content') ||
                      $('h1').first().text() ||
                      $('title').text() ||
                      businessName;
    }
    
    // Clean up the business name
    businessName = businessName
      .replace(/[\n\r]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If still no name, try to extract from URL
    if (businessName === 'Unknown Business' || !businessName) {
      const urlParts = url.split('/');
      const username = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      if (username && username.length > 2) {
        businessName = username.replace(/[_\-\.]/g, ' ').trim();
      }
    }
    
    return businessName || 'Unknown Business';
  }
  
  extractContactInfo(html, url) {
    const $ = cheerio.load(html);
    const contactInfo = {
      emails: [],
      phones: [],
      social_media: {},
      address: null
    };
    
    // Email extraction
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = html.match(emailRegex) || [];
    contactInfo.emails = [...new Set(emails)]
      .filter(email => !email.includes('example.com') && !email.includes('@2x'));
    
    // Phone extraction
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phones = html.match(phoneRegex) || [];
    contactInfo.phones = [...new Set(phones)]
      .map(phone => phone.replace(/[^\d+]/g, '').replace(/^1/, ''))
      .filter(phone => phone.length >= 10);
    
    // Social media extraction
    const socialPatterns = {
      'Facebook': /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([^\/\s]+)/g,
      'Instagram': /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^\/\s]+)/g,
      'Twitter': /(?:https?:\/\/)?(?:www\.)?twitter\.com\/([^\/\s]+)/g,
      'LinkedIn': /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/([^\/\s]+)/g,
      'YouTube': /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c|channel|user)\/([^\/\s]+)/g
    };
    
    for (const [platform, regex] of Object.entries(socialPatterns)) {
      const matches = html.match(regex);
      if (matches && matches.length > 0) {
        // Get the first valid match
        const username = matches[0].match(/\/([^\/\s]+)$/);
        if (username && username[1]) {
          contactInfo.social_media[platform] = username[1];
        }
      }
    }
    
    // Address extraction (basic)
    const addressPatterns = [
      /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|plaza|plz)\b/gi,
      /\d+\s+[\w\s]+,\s+[\w\s]+,\s+[A-Z]{2}\s+\d{5}/gi
    ];
    
    for (const pattern of addressPatterns) {
      const addressMatch = html.match(pattern);
      if (addressMatch) {
        contactInfo.address = addressMatch[0].trim();
        break;
      }
    }
    
    return contactInfo;
  }
  
  async processURL(url) {
    try {
      // Ensure URL has protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      const validity = await this.validateURL(url);
      
      let businessName = 'Unknown Business';
      let contactInfo = {
        emails: [],
        phones: [],
        social_media: {},
        address: null
      };
      let platform = this.identifyPlatform(url);
      
      // Only extract additional info if the URL is valid
      if (validity.valid || validity.status === '🔄 REDIRECTS') {
        const html = await this.fetchHTML(validity.finalUrl || url);
        businessName = this.extractBusinessName(validity.finalUrl || url, html);
        contactInfo = this.extractContactInfo(html, validity.finalUrl || url);
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