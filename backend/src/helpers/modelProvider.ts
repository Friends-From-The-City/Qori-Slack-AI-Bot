/**
 * Model Provider Boundary (PH-2 / ADR 0034)
 *
 * Single entry point for model instantiation. All Qori workflows request
 * models by logical tier (haiku, sonnet, opus). The provider-specific
 * mapping lives here and nowhere else.
 *
 * TRANSITIONAL: Currently Anthropic-only via @langchain/anthropic.
 * If the provider changes, only this file needs modification.
 *
 * Do NOT import ChatAnthropic or any provider SDK outside this module.
 * A pattern enforcement test guards this invariant.
 */

import { ChatAnthropic } from '@langchain/anthropic';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** Logical model tiers available to Qori workflows */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface CreateModelOptions {
  /** Logical capability tier */
  tier: ModelTier;
  /** Sampling temperature (default: 0.4 for sonnet, 0 for haiku/opus) */
  temperature?: number;
  /** Maximum output tokens (default: 8192) */
  maxTokens?: number;
  /** Human-readable purpose for logging (e.g., 'codebook-generation') */
  purpose?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Tier → Provider Model Mapping
// ─────────────────────────────────────────────────────────────────────

const TIER_DEFAULTS: Record<ModelTier, { modelName: string; envOverride: string; defaultTemp: number }> = {
  haiku: {
    modelName: 'claude-haiku-4-5-20251001',
    envOverride: 'EXTRACTION_MODEL_NAME',
    defaultTemp: 0,
  },
  sonnet: {
    modelName: 'claude-sonnet-4-6',
    envOverride: 'ANTHROPIC_MODEL_NAME',
    defaultTemp: 0.4,
  },
  opus: {
    modelName: 'claude-opus-4-6',
    envOverride: 'ANTHROPIC_MODEL_OPUS',
    defaultTemp: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────

/**
 * Create a model instance for the given logical tier.
 *
 * Resolves the provider-specific model name from environment variables
 * or defaults. All provider configuration lives in this function.
 *
 * @throws if ANTHROPIC_API_KEY is not set
 */
export function createModel(options: CreateModelOptions): ChatAnthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
  }

  const tierConfig = TIER_DEFAULTS[options.tier];
  const modelName = process.env[tierConfig.envOverride] || tierConfig.modelName;
  const temperature = options.temperature ?? tierConfig.defaultTemp;
  const maxTokens = options.maxTokens ?? parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192', 10);

  return new ChatAnthropic({
    anthropicApiKey: apiKey,
    modelName,
    temperature,
    maxTokens,
  });
}

/**
 * Resolve a model name string (from YAML task.model or extraction config)
 * to a logical tier. Used when callers already have a specific model name
 * but need to go through the factory.
 *
 * Falls back to 'sonnet' for unrecognized names.
 */
export function resolveModelTier(modelName: string): ModelTier {
  const lower = modelName.toLowerCase();
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('opus')) return 'opus';
  return 'sonnet';
}

/**
 * Get the current model name for a tier (for metadata/provenance, not instantiation).
 */
export function getModelName(tier: ModelTier): string {
  const tierConfig = TIER_DEFAULTS[tier];
  return process.env[tierConfig.envOverride] || tierConfig.modelName;
}

/**
 * Get the default sonnet model name (convenience for provenance metadata).
 */
export function getDefaultModelName(): string {
  return getModelName('sonnet');
}
