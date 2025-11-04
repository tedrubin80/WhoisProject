const request = require('supertest');
const express = require('express');

// Mock environment variables
process.env.API_KEY_1 = 'test-key-12345';
process.env.NODE_ENV = 'test';

// We'll need to mock the server since it starts listening
// Create a separate testable version
const app = require('../server');

describe('WHOIS Intelligence Server', () => {
  describe('Health Check', () => {
    test('GET /health should return 200 and server status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version', '2.3.0');
    });
  });

  describe('API Authentication', () => {
    test('POST /api/analyze without API key should return 401', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({ domain: 'example.com' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('POST /api/analyze with invalid API key should return 401', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .set('x-api-key', 'invalid-key')
        .send({ domain: 'example.com' });

      expect(response.status).toBe(401);
    });

    test('POST /api/analyze with valid API key should return 200 or process request', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .set('x-api-key', 'test-key-12345')
        .send({ domain: 'example.com' });

      // Should not be 401
      expect(response.status).not.toBe(401);
    }, 30000);
  });

  describe('Input Validation', () => {
    test('POST /api/analyze without domain should return 400', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .set('x-api-key', 'test-key-12345')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('POST /api/analyze with invalid domain format should return 400', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .set('x-api-key', 'test-key-12345')
        .send({ domain: 'not a valid domain!' });

      expect(response.status).toBe(400);
    });
  });

  describe('Business Checker API', () => {
    test('POST /api/business/check without API key should return 401', async () => {
      const response = await request(app)
        .post('/api/business/check')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(401);
    });

    test('POST /api/business/check with valid API key should process', async () => {
      const response = await request(app)
        .post('/api/business/check')
        .set('x-api-key', 'test-key-12345')
        .send({ url: 'https://example.com' });

      expect(response.status).not.toBe(401);
    }, 30000);
  });

  describe('Rate Limiting', () => {
    test('Should have rate limit headers', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .set('x-api-key', 'test-key-12345')
        .send({ domain: 'example.com' });

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });
});
