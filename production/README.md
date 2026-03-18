# Wergonic Device Manager - Production Server

Password-protected web application for managing Wergonic haptic feedback devices.

## Quick Start

### 1. Install Dependencies

```bash
cd webapp/production
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Generate a session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output to SESSION_SECRET in .env

# Generate a password hash
npm run hash-password
# Follow the prompts, then copy the hash to APP_PASSWORD_HASH in .env
```

### 3. Run the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 4. Access the Application

Open `http://localhost:3000/login` in your browser.

---

## DigitalOcean Deployment

### Using App Platform

1. Push your code to GitHub
2. Create a new App in DigitalOcean App Platform
3. Connect your GitHub repository
4. Set the following:
   - **Source Directory:** `webapp/production`
   - **Build Command:** `npm install`
   - **Run Command:** `npm start`
5. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = (your generated secret)
   - `APP_PASSWORD_HASH` = (your generated hash)

### Using Droplet

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone your repo
git clone https://github.com/yourusername/vibrator.git
cd vibrator/webapp/production

# Install dependencies
npm install --production

# Create .env file
cp .env.example .env
nano .env  # Edit and add your secrets

# Install PM2 for process management
npm install -g pm2

# Start the server
pm2 start server.js --name wergonic

# Save PM2 config and setup startup
pm2 save
pm2 startup
```

### HTTPS with Nginx (Recommended)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Security Features

| Feature | Description |
|---------|-------------|
| Password Protection | bcrypt-hashed password required to access |
| Rate Limiting | 5 login attempts per 15 minutes |
| Secure Sessions | HTTP-only, secure cookies in production |
| HTTPS Redirect | Automatic redirect to HTTPS in production |
| Helmet.js | Security headers configured |

---

## File Structure

```
production/
├── server.js           # Express server with authentication
├── package.json        # Dependencies and scripts
├── .env.example        # Environment template
├── .gitignore          # Git ignore rules
├── README.md           # This file
├── scripts/
│   └── hash-password.js # Password hash generator
├── public/
│   └── login.html      # Login page (public)
└── protected/
    ├── index.html      # Main app (protected)
    ├── app.js          # App logic (protected)
    └── styles.css      # Styles (protected)
```

---

## Troubleshooting

### "Server configuration error" on login
- Make sure `APP_PASSWORD_HASH` is set in your `.env` file
- Run `npm run hash-password` to generate a valid hash

### Rate limited
- Wait 15 minutes, or restart the server to reset limits

### Session not persisting
- Check that `SESSION_SECRET` is set
- Ensure cookies are enabled in your browser
