# WHOIS Intelligence Server

Enhanced WHOIS Intelligence Server with Business Profile Checker, comprehensive testing, input validation, and secure authentication.

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🚀 Features

- **Domain WHOIS Lookup** - Comprehensive WHOIS data retrieval and parsing
- **DNS Record Analysis** - A, AAAA, MX, NS, TXT, SOA, CNAME record checking
- **Business Profile Validation** - URL validation and business information extraction
- **Bulk URL Checking** - Process up to 50 URLs in a single request
- **Privacy Protection Detection** - Identify domains using privacy services
- **Rate Limiting** - Built-in rate limiting (100 requests per 15 minutes)
- **Response Caching** - 1-hour cache for improved performance
- **Input Validation** - Comprehensive validation using Joi
- **Secure API Authentication** - Environment-based API key validation
- **Comprehensive Testing** - Jest test suite with >60% coverage target

## 📋 Requirements

- Node.js >= 16.0.0
- npm or yarn

## 🔧 Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd WhoisProject
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your API keys (minimum 16 characters):
   ```env
   NODE_ENV=development
   PORT=3001
   API_KEY_1=your-secure-api-key-min-16-chars
   ```

   Generate secure API keys using:
   ```bash
   openssl rand -hex 32
   ```

4. **Run the server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm start
   ```

5. **Run tests**
   ```bash
   # Run all tests with coverage
   npm test

   # Run tests in watch mode
   npm run test:watch
   ```

## 🚂 Railway Deployment

This project is optimized for Railway.app deployment.

### Quick Deploy

1. **Push to your repository**
   ```bash
   git push origin main
   ```

2. **In Railway Dashboard:**
   - Create new project from GitHub repo
   - Railway will auto-detect the configuration from `railway.json`

3. **Set Environment Variables in Railway:**
   ```
   NODE_ENV=production
   API_KEY_1=<your-secure-key-min-16-chars>
   ```

   ⚠️ **Important:** API keys must be at least 16 characters. The server will not start in production without valid API keys.

4. **Deploy**
   - Railway will automatically build and deploy
   - Start command: `node server.js`
   - Build command: `npm install`

### Railway Configuration

The project includes `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## 📡 API Endpoints

All API endpoints (except `/health`) require authentication via `x-api-key` header.

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 1234.56,
  "version": "2.3.0"
}
```

### Domain Analysis
```http
POST /api/analyze
Content-Type: application/json
x-api-key: your-api-key

{
  "domain": "example.com"
}
```

**Response:**
```json
{
  "success": true,
  "domain": "example.com",
  "whoisData": { ... },
  "dnsRecords": { ... },
  "privacyProtection": { ... },
  "cached": false
}
```

### Business URL Check
```http
POST /api/business/check
Content-Type: application/json
x-api-key: your-api-key

{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "url": "https://example.com",
    "businessName": "Example Corp",
    "isValid": true,
    "contactInfo": { ... }
  }
}
```

### Bulk Business URL Check
```http
POST /api/business/bulk-check
Content-Type: application/json
x-api-key: your-api-key

{
  "urls": [
    "https://example1.com",
    "https://example2.com"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [ ... ]
}
```

## 🔒 Security Features

- **No Hardcoded Credentials** - All API keys from environment variables
- **Minimum Key Length** - 16 characters enforced
- **Production Safety** - Server won't start in production without valid keys
- **Input Validation** - All inputs validated with Joi schemas
- **Rate Limiting** - Prevents abuse (100 req/15min)
- **Helmet.js** - Security headers enabled
- **CORS** - Configured for cross-origin requests

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Watch mode for development
npm run test:watch
```

Test files are located in `__tests__/`:
- `server.test.js` - API endpoint tests
- `helpers.test.js` - Utility function tests

## 📁 Project Structure

```
WhoisProject/
├── __tests__/           # Test files
├── public/              # Static files
├── routes/              # API route handlers
│   └── business-routes.js
├── utils/               # Utility functions
│   ├── business-profile/
│   ├── helpers.js
│   ├── blacklist_checker.js
│   └── validation.js    # Input validation schemas
├── .env.example         # Environment template
├── .gitignore
├── jest.config.js       # Jest configuration
├── package.json
├── railway.json         # Railway deployment config
├── server.js            # Main application file
└── README.md
```

## 🔑 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `3001` | Server port (Railway sets automatically) |
| `API_KEY_1` | Yes* | - | Primary API key (min 16 chars) |
| `API_KEY_2` | No | - | Secondary API key |
| `API_KEY_3` | No | - | Tertiary API key |
| `API_KEY_4` | No | - | Quaternary API key |
| `API_KEY_5` | No | - | Quinary API key |

*Required in production environment

## 🐛 Development Notes

### In Development Mode:
- Server runs without API keys (with warning)
- More verbose logging
- Auto-reload with nodemon

### In Production Mode:
- At least one valid API key required
- Server exits if no keys configured
- Optimized caching and compression

## 📝 API Key Generation

Generate secure API keys using one of these methods:

```bash
# OpenSSL (recommended)
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Python
python -c "import secrets; print(secrets.token_hex(32))"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Commit and push
6. Create a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
- Create an issue in the GitHub repository
- Check existing issues for solutions

## 🔄 Version History

### v2.3.0 (Current)
- ✅ Removed hardcoded API keys
- ✅ Added comprehensive input validation with Joi
- ✅ Added Jest test suite with 60%+ coverage target
- ✅ Cleaned up unused code and files
- ✅ Improved Railway deployment configuration
- ✅ Added security enhancements
- ✅ Centralized authentication middleware

### v2.2.0
- Added business profile checker
- Bulk URL checking support

### v2.1.0
- Enhanced WHOIS analysis
- Added DNS record checking

## ⚠️ Important Notes

1. **Never commit `.env` files** - They contain sensitive API keys
2. **Use strong API keys** - Minimum 16 characters, use random generation
3. **Railway automatically sets PORT** - Don't hardcode port in production
4. **Cache is in-memory** - Resets on server restart (consider Redis for production)
5. **Rate limits are global** - Consider per-user rate limiting for production

---

Built with ❤️ for secure and efficient WHOIS intelligence gathering
