# WHOIS Intelligence Server

Enhanced WHOIS Intelligence Server with Business Profile Checker

## Features

- Domain WHOIS lookup and analysis
- DNS record checking
- Business profile validation
- Contact information extraction
- Bulk URL checking

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
API_KEY_1=demo-key-12345678
API_KEY_2=your-key-2
API_KEY_3=your-key-3
```

3. Run the server:
```bash
npm start
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/analyze` - WHOIS domain analysis
- `POST /api/business/check` - Single business URL check
- `POST /api/business/bulk-check` - Bulk business URL check

## Deployment

This project is ready for deployment on Railway.app
