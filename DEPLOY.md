## Deploy LOCKEDIN

### Backend (Render)
Create a service "lockedin-backend" on Render:
- Root directory: /backend
- Dockerfile:
```
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```
Optional env vars (from your .env.local):
DATABASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_CHAT_ID, JWT_SECRET, APP_PASSWORD, AI_PROVIDER, AI_BASE_URL, AI_API_KEY, AI_MODEL

### Frontend (Netlify)
- Publish directory: frontend/dist
- Build command: npm install && npm run build (in frontend/)
- Environment: VITE_API_URL=https://<your-render-url> (or use _redirects proxy)
- _redirects already contains /api/* proxy to backend.

### After deploy
- Login: password = APP_PASSWORD (default lockedin-dev)
- Telegram: /start with @lockedinvarmaBot, verify code
- Allen: optional — fill token/portalUrl in Allen page

### Local dev
- Backend: cd backend && npm install && npx tsx src/index.ts   (http://localhost:8787)
- Frontend: cd frontend && npm install && npm run dev        (http://localhost:5199)
