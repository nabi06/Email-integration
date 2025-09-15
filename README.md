# NIH RePORTER Scoop

A web application that searches NIH-funded research projects and sends results via email with subscription-based access tiers.

## Features

- Search NIH research projects using keywords, fiscal years, and institute codes
- Email delivery of search results (not displayed in browser)
- User registration and login system
- Two subscription tiers: Free (5 searches/month, 3 abstracts) and Pro (15 searches/month, 10 abstracts)
- Stripe payment integration for $5/month Pro subscriptions
- Brevo email API for professional email delivery

## Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Cloudflare Pages Functions
- Database: Cloudflare KV
- Email: Brevo API
- Payments: Stripe API
- External API: NIH RePORTER API

## Quick Start

1. Install dependencies:
```bash
npm install -g wrangler
```

2. Create `.dev.vars` file with your API keys:
```
BREVO_API_KEY=your_brevo_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PRICE_ID=your_stripe_price_id
SENDER_EMAIL=your_verified_email@domain.com
```

3. Run locally:
```bash
npm run dev
```

4. Open http://localhost:8788

## Usage

1. Register an account with email and password
2. Login to access the search interface
3. Enter search criteria (keywords required, others optional)
4. Click "Search & Email Results"
5. Check your email for formatted results
6. Upgrade to Pro for increased limits

## API Endpoints

- `POST /api/search` - Handles registration, login, search, upgrade, and reset actions
- `POST /api/payment/webhook` - Stripe webhook for subscription updates

## Deployment

Deploy to Cloudflare Pages:
```bash
npm run deploy
```

Set environment variables in Cloudflare dashboard and configure KV namespace.

## Project Structure

```
├── index.html                    # Frontend interface
├── functions/api/search.js       # Main API handler
├── functions/api/payment/webhook.js # Stripe webhook
├── .dev.vars                     # Local environment variables
├── wrangler.toml                 # Cloudflare configuration
└── package.json                  # Project configuration
```

## License

MIT