const {
  parseWhoisResponse,
  analyzePrivacyProtection,
  extractEmails,
  analyzeSPFRecord,
  analyzeDMARCRecord
} = require('../utils/helpers');

describe('Helpers Utility Functions', () => {
  describe('parseWhoisResponse', () => {
    test('should extract domain name from WHOIS data', () => {
      const whoisData = {
        raw: 'Domain Name: EXAMPLE.COM\nRegistrar: Example Registrar'
      };

      const result = parseWhoisResponse(whoisData);
      expect(result).toHaveProperty('domainName');
    });

    test('should handle empty WHOIS data', () => {
      const result = parseWhoisResponse({});
      expect(result).toBeDefined();
    });
  });

  describe('analyzePrivacyProtection', () => {
    test('should detect privacy protection in WHOIS data', async () => {
      const whoisData = {
        raw: 'Registrant Organization: Privacy Protection Service'
      };

      const result = await analyzePrivacyProtection(whoisData);
      expect(result).toHaveProperty('isPrivate');
      expect(result).toHaveProperty('indicators');
    });

    test('should handle null WHOIS data', async () => {
      const result = await analyzePrivacyProtection(null);
      expect(result).toBeDefined();
    });
  });

  describe('extractEmails', () => {
    test('should extract valid email addresses from text', () => {
      const text = 'Contact: admin@example.com or support@test.org';
      const emails = extractEmails(text);

      expect(Array.isArray(emails)).toBe(true);
      expect(emails.length).toBeGreaterThan(0);
    });

    test('should return empty array for text without emails', () => {
      const emails = extractEmails('No emails here');
      expect(Array.isArray(emails)).toBe(true);
    });

    test('should handle null input', () => {
      const emails = extractEmails(null);
      expect(Array.isArray(emails)).toBe(true);
      expect(emails.length).toBe(0);
    });
  });

  describe('analyzeSPFRecord', () => {
    test('should analyze valid SPF record', () => {
      const spfRecord = 'v=spf1 include:_spf.google.com ~all';
      const result = analyzeSPFRecord(spfRecord);

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('mechanisms');
    });

    test('should detect invalid SPF record', () => {
      const result = analyzeSPFRecord('invalid spf');
      expect(result.valid).toBe(false);
    });

    test('should handle null input', () => {
      const result = analyzeSPFRecord(null);
      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
    });
  });

  describe('analyzeDMARCRecord', () => {
    test('should analyze valid DMARC record', () => {
      const dmarcRecord = 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com';
      const result = analyzeDMARCRecord(dmarcRecord);

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('policy');
    });

    test('should detect invalid DMARC record', () => {
      const result = analyzeDMARCRecord('invalid dmarc');
      expect(result.valid).toBe(false);
    });

    test('should handle null input', () => {
      const result = analyzeDMARCRecord(null);
      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
    });
  });
});
