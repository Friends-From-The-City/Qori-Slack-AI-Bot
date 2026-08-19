// Load .env FIRST, before any other imports that might read env vars
const dotenv = require("dotenv");
dotenv.config();

// Initialize Sentry BEFORE other imports (captures initialization errors)
const { initSentry } = require("./config/sentry");
initSentry();

const Sentry = require("@sentry/node");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const createError = require("http-errors");
const logger = require("morgan");
const { Sequelize } = require("sequelize");
const configs = require("./config"); // ./config/index.js
const { sentryMiddleware } = require("./middleware"); // ./middleware/index.js
const { slackApp, slackExpressRouter } = require('./helpers/slack/events');
const { createFolderWithDummyData, readFolderContents, listOrgRepos, listAllTopLevelFolders, readFolders } = require("./helpers/github");

const { NODE_ENV, DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, PORT, DB_DIALECT } = process.env;

const { parseTrustedProxy } = require('./middleware/trustedProxy');
const { createSecurityMiddleware } = require('./middleware/security');
const { createApiRateLimiter } = require('./middleware/rateLimiter');
const { apiErrorHandler } = require('./middleware/apiErrorHandler');

const app = express();

// ─── Trusted proxy — default disabled, agency must explicitly configure ──
app.set('trust proxy', parseTrustedProxy(process.env.TRUSTED_PROXY));

// Note: Sentry error handler is set up later, after routes

app.use(logger("dev"));

// Mount GitHub webhook route BEFORE express.json() to handle raw body
const githubWebhookRouter = require('./routes/github-webhook.route');
app.use('/github-webhook', githubWebhookRouter);

// Now apply global middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors(configs.corsConfig));
app.use(compression(configs.compressionConfig));
app.use(cookieParser());

// ─── Security headers for API routes ──
app.use('/api', createSecurityMiddleware());
app.use('/api', createApiRateLimiter());

// ─── API routes (v1) ──
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

app.use('/slack', slackExpressRouter);

// ─── API error handler — after API routes, before generic handler ──
app.use('/api', apiErrorHandler);

if (NODE_ENV !== "development") {
  app.use(sentryMiddleware);
}

// Liveness probe — process is alive and accepting HTTP
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Readiness probe — database reachable, migration state acceptable
app.get("/health/ready", async (req, res) => {
  const checks = { database: 'unknown', migrations: 'unknown' };
  let ready = true;

  try {
    await sequelize.authenticate();
    checks.database = 'ok';
  } catch {
    checks.database = 'unavailable';
    ready = false;
  }

  if (checks.database === 'ok') {
    try {
      const [result] = await sequelize.query(
        'SELECT COUNT(*) as count FROM "SequelizeMeta"',
        { type: Sequelize.QueryTypes.SELECT }
      );
      checks.migrations = `${result.count} applied`;
    } catch {
      checks.migrations = 'unable to verify';
      // Non-fatal — table may not exist in fresh databases before first migration
    }
  }

  const status = ready ? 200 : 503;
  res.status(status).json({ status: ready ? 'ready' : 'not_ready', checks });
});

configs.routerConfig(app);

const sequelize = new Sequelize({
  database: DB_NAME,
  username: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  dialect: 'postgres',
  port: DB_PORT
});

sequelize
  .authenticate()
  .then(() => {
    console.log(`Database connection established successfully: ${DB_NAME}`);
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });

app.use((req, res, next) => {
  next(createError(404));
});

// Sentry v8: Error handler after routes, before custom error handler
if (NODE_ENV !== "development" && process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err, req, res, next) => {
  res.status(err.status || 500).json(err);
});

// replace your server.listen call with this:
let server;
(async () => {
  // 1. Create the dummy folder in GitHub
  try {
    const rawText = `
 `;
    // await runRAG("What's your understanding of this context?", rawText, "react");
    // await createFolderWithDummyData("startupDummyFolder");
    // await readFolderContents("startupDummy")
    // const response = await listAllTopLevelFolders("CivicMind-Slack-AI-Bot")
    // const response = await readFolders("startupDummyFolder", "civicmind-private")
    // console.log("✅ startupDummy folder + dummy files created in GitHub");
  } catch (err) {
    // console.error("❌ failed to create startupDummy folder:", err);
  }

  // 2. Start your Slack Bolt app
  await slackApp.start();
  console.log('⚡️ Bolt app started');

  // 3. Then finally spin up Express
  server = app.listen(PORT || 3000, () => {
    console.log(`Server is running on port ${PORT || 3000}`);
  });
})();


module.exports = { app, server };
