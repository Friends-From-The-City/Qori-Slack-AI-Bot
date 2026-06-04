// src/controllers/github-webhook.controller.js
const GithubWebhookService = require('../services/github-webhook.service');

// Fail loudly at startup if webhook secret is missing (H2 federal-readiness fix)
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
if (!GITHUB_WEBHOOK_SECRET) {
  throw new Error(
    'GITHUB_WEBHOOK_SECRET environment variable is required. ' +
    'Webhook signature verification cannot proceed without a secret.'
  );
}
const githubWebhookService = new GithubWebhookService(GITHUB_WEBHOOK_SECRET);

exports.handleWebhook = (req, res) => {
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
  if (!githubWebhookService.verifySignature(signature, rawBody)) {
    return res.status(401).send('Invalid signature');
  }

  // req.body is already parsed by our custom middleware
  githubWebhookService.handleEvent(event, req.body);
  res.status(200).send('Webhook received');
};
