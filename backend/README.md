# CivicMind-Bot-For-Good

**CivicMind** is an AI-powered research assistant designed to accelerate human-centered design in civic tech—without losing the human.

Qori (the Slack bot) helps research teams streamline their workflow by automating research planning, participant management, session observations, note analysis, and report generation—all within Slack.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables & API Keys](#environment-variables--api-keys)
- [Database Setup](#database-setup)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)
- [Available Commands](#available-commands)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

- **Research Study Management**: Create and manage research studies directly from Slack
- **AI-Powered Planning**: Generate research plans, briefs, and discussion guides using AI
- **Participant Management**: Track participants, send outreach emails, and manage sessions
- **Session Observations**: Request and manage observer sessions
- **Note Analysis**: Upload and analyze session notes with AI
- **Research Synthesis**: Synthesize findings from multiple research sessions
- **Automated Reports**: Generate comprehensive research readouts and GitHub issues
- **GitHub Integration**: Automatically sync research data to GitHub repositories
- **Interactive Tutorials**: Learn Qori commands with `/qori-learn`

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16.0.0 - v22.11.0)
- **npm** (v8)
- **PostgreSQL** (v15 or later)
- **Redis** (v7 or later)
- **Docker & Docker Compose** (optional, for containerized setup)
- **Git**

### Required Accounts & API Keys

You'll need accounts and API keys from:

1. **Slack** - Create a Slack app and get tokens
2. **GitHub** - Personal access token with repo permissions
3. **Anthropic** - API key for Claude AI
4. **OpenAI** - API key (optional, for some features)
5. **Sentry** - DSN for error tracking (optional, for production)

## Installation

### Option 1: Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CivicMind-Bot-For-Good
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (see below)
   ```

4. **Set up the database**
   ```bash
   # Make sure PostgreSQL is running
   # Update DB_* variables in .env
   npm run db:migrate
   ```

5. **Start Redis**
   ```bash
   # Make sure Redis is running on port 6379
   redis-server
   ```

6. **Run the application**
   ```bash
   npm run dev
   ```

### Option 2: Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CivicMind-Bot-For-Good
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start with Docker Compose**
   ```bash
   # Development
   docker-compose -f docker-compose-dev.yml up --build

   # Production
   docker-compose up --build -d
   ```

4. **Run database migrations**
   ```bash
   # Development
   docker-compose -f docker-compose-dev.yml exec qori-backend npm run db:migrate

   # Production
   docker-compose exec qori-backend npm run db:migrate
   ```

For detailed Docker instructions, see [README.Docker.md](./README.Docker.md).

## Environment Variables & API Keys

Create a `.env` file in the root directory with the following variables:

### Application Configuration

```env
NODE_ENV=development
PORT=3000
```

### Database Configuration (PostgreSQL)

```env
DB_HOST=localhost          # Use 'postgres' if running in Docker
DB_PORT=5432
DB_NAME=qori_dev
DB_USER=postgres
DB_PASSWORD=your_password
DB_DIALECT=postgres
```

### Redis Configuration

```env
REDIS_HOST=localhost       # Use 'redis' if running in Docker
REDIS_PORT=6379
REDIS_URI=redis://localhost:6379
```

### Slack Configuration

**How to get Slack API keys:**

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app and select your workspace
4. Go to **OAuth & Permissions**:
   - Add Bot Token Scopes:
     - `app_mentions:read`
     - `channels:history`
     - `channels:read`
     - `chat:write`
     - `commands`
     - `files:read`
     - `files:write`
     - `groups:history`
     - `groups:read`
     - `im:history`
     - `im:read`
     - `im:write`
     - `users:read`
     - `users:read.email`
   - Install the app to your workspace
   - Copy the **Bot User OAuth Token** (starts with `xoxb-`)

5. Go to **Basic Information**:
   - Copy the **Signing Secret**

6. Go to **App-Level Tokens**:
   - Create a new token with `connections:write` scope
   - Copy the token (starts with `xapp-`)

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
```

### GitHub Configuration

**How to get GitHub token:**

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control of private repositories)
   - `workflow` (if using GitHub Actions)
4. Generate and copy the token

```env
GITHUB_TOKEN=ghp_your-github-token-here
GITHUB_OWNER=your-github-org-or-username
GITHUB_REPO=your-repo-name
```

### AI/LLM Configuration

**Anthropic (Claude) - Required:**

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Go to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-api03-`)

**OpenAI - Optional:**

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Go to API Keys
4. Create a new secret key
5. Copy the key (starts with `sk-`)

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-anthropic-key-here
ANTHROPIC_MODEL_NAME=claude-sonnet-4-20250514  # Optional, defaults to claude-sonnet-4-20250514
ANTHROPIC_TEMPERATURE=0.4                       # Optional, defaults to 0.4
ANTHROPIC_MAX_TOKENS=8192                       # Optional, defaults to 8192
OPENAI_API_KEY=sk-your-openai-key-here
```

### Security & Authentication

```env
JWT_SECRET_KEY=your-random-secret-key-here
# Generate a secure random string:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Monitoring & Error Tracking (Optional)

**Sentry - For production error tracking:**

1. Go to [sentry.io](https://sentry.io/)
2. Create a project
3. Copy the DSN

```env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### Email/SMTP Configuration (Optional)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-email-password
```

### CORS Configuration

```env
CORS_ALLOWED_ORIGIN=http://localhost:8000
```

## Database Setup

### Local PostgreSQL Setup

1. **Install PostgreSQL** (if not already installed)
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib

   # macOS
   brew install postgresql
   ```

2. **Create database and user**
   ```bash
   sudo -u postgres psql
   ```
   ```sql
   CREATE DATABASE qori_dev;
   CREATE USER postgres WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE qori_dev TO postgres;
   \q
   ```

3. **Run migrations**
   ```bash
   npm run db:migrate
   ```

### Docker PostgreSQL Setup

If using Docker, PostgreSQL is automatically set up. Just ensure your `.env` file has:
```env
DB_HOST=postgres
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=qori_dev
```

## Running the Project

### Development Mode

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

### Production Mode

```bash
npm run prod
```

### With Docker

**Development:**
```bash
docker-compose -f docker-compose-dev.yml up
```

**Production:**
```bash
docker-compose up -d
```

### Verify Installation

1. **Check health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"message":"Server is healthy"}`

2. **Check Slack connection:**
   - The bot should appear online in your Slack workspace
   - Try `/qori` command in Slack to see available commands

## Project Structure

```
CivicMind-Bot-For-Good/
├── src/
│   ├── app.js                 # Main application entry point
│   ├── bin/                   # Server startup scripts
│   ├── config/                # Configuration files
│   ├── controllers/           # Request handlers
│   ├── database/
│   │   ├── models/           # Sequelize models
│   │   └── migrations/       # Database migrations
│   ├── helpers/
│   │   ├── slack/            # Slack bot logic
│   │   │   ├── commands/     # Slash command handlers
│   │   │   └── ui/           # Modal and UI builders
│   │   ├── github.js         # GitHub API integration
│   │   ├── langchain.js      # AI/LLM integration
│   │   └── ...               # Other helpers
│   ├── libs/                 # Third-party library wrappers
│   ├── middleware/           # Express middleware
│   ├── routes/               # API routes
│   └── services/             # Business logic services
├── docker-compose.yml        # Production Docker setup
├── docker-compose-dev.yml    # Development Docker setup
├── Dockerfile               # Production Docker image
├── Dockerfile.dev           # Development Docker image
├── package.json             # Dependencies and scripts
└── .env                     # Environment variables (create this)
```

## Available Commands

### NPM Scripts

```bash
npm run dev          # Start development server with hot reload
npm run prod         # Start production server
npm run build        # Build with Babel (if needed)
npm run db:migrate   # Run database migrations
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm test            # Run tests
```

### Slack Commands

Once the bot is running, use these commands in Slack:

- `/qori` - Show all available Qori commands
- `/qori-learn` - Interactive tutorial for learning Qori
- `/qori-delete` - Delete a research study
- `/qori-create-study` - Create a new research study
- `/qori-request-research` - Request research assistance
- `/qori-participant` - Manage participants
- `/qori-observe-session` - Request session observation
- `/qori-session-notes` - Upload session notes
- `/qori-analyze-notes` - Analyze session notes with AI
- `/qori-synthesis` - Synthesize research findings
- `/qori-readout` - Generate research readouts

## Troubleshooting

### Common Issues

**1. "Cannot connect to database"**
- Verify PostgreSQL is running: `pg_isready` or `sudo systemctl status postgresql`
- Check `.env` file has correct `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- If using Docker, ensure `DB_HOST=postgres` (not `localhost`)

**2. "Redis connection failed"**
- Verify Redis is running: `redis-cli ping` (should return `PONG`)
- Check `REDIS_HOST` and `REDIS_PORT` in `.env`
- If using Docker, ensure `REDIS_HOST=redis`

**3. "Slack API error"**
- Verify all three Slack tokens are correct in `.env`
- Check that the bot is installed in your workspace
- Ensure bot has required scopes (see Slack Configuration above)

**4. "Anthropic API authentication error"**
- Verify `ANTHROPIC_API_KEY` is set correctly
- Check the key starts with `sk-ant-api03-`
- Ensure you have credits in your Anthropic account

**5. "GitHub API error"**
- Verify `GITHUB_TOKEN` has `repo` scope
- Check `GITHUB_OWNER` and `GITHUB_REPO` are correct
- Ensure the token has access to the repository

**6. Port already in use**
- Change `PORT` in `.env` to a different port (e.g., 3001)
- Or stop the process using the port:
  ```bash
  # Find process
  lsof -i :3000
  # Kill process
  kill -9 <PID>
  ```

**7. Module not found errors**
- Run `npm install` to ensure all dependencies are installed
- Clear `node_modules` and reinstall:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

### Debug Mode

Enable debug logging:
```bash
DEBUG=* npm run dev
```

### View Logs (Docker)

```bash
# Development
docker-compose -f docker-compose-dev.yml logs -f qori-backend

# Production
docker-compose logs -f qori-backend
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Note**: Make sure to never commit your `.env` file to version control. It contains sensitive API keys and secrets.
