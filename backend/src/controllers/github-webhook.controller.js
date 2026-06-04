// src/controllers/github-webhook.controller.js
const GithubWebhookService = require('../services/github-webhook.service');

// Lazy initialization — allows app to start even if webhooks aren't configured.
// The check happens when the endpoint is called, not at module load time.
// This is graceful degradation: webhooks are optional, but if used, the secret is required.
let githubWebhookService = null;

function getWebhookService() {
  if (githubWebhookService) return githubWebhookService;

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'GITHUB_WEBHOOK_SECRET environment variable is required. ' +
      'Webhook signature verification cannot proceed without a secret.'
    );
  }

  githubWebhookService = new GithubWebhookService(secret);
  return githubWebhookService;
}

exports.handleWebhook = (req, res) => {
  // Fail at request time if secret is missing (not at startup)
  let service;
  try {
    service = getWebhookService();
  } catch (err) {
    console.error('[Webhook] Configuration error:', err.message);
    return res.status(500).send('Webhook not configured');
  }

  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const rawBody = req.rawBody;

  if (!signature || !event) {
    return res.status(400).send('Missing required headers');
  }

  if (!rawBody) {
    return res.status(400).send('Missing request body');
  }

  // Verify signature using the raw body string
  if (!service.verifySignature(signature, rawBody)) {
    return res.status(401).send('Invalid signature');
  }

  // req.body is already parsed by our custom middleware
  service.handleEvent(event, req.body);
  res.status(200).send('Webhook received');
};
