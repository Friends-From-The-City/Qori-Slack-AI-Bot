// RAG embedding queue — DISABLED (RAG system removed for alpha)
// This queue was part of the vector store pipeline. See CLAUDE.md "How to Re-enable RAG"

const Queue = require('bull');

const embedFileQueue = new Queue('embedFileQueue', {
  redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: true,
  },
});

/** Worker: no-op while RAG is disabled **/
embedFileQueue.process(5, async (job) => {
  // RAG disabled — jobs silently complete
  console.log(`[embedFileQueue] RAG disabled — skipping embed for ${job.data.path}`);
});

module.exports = { embedFileQueue };
