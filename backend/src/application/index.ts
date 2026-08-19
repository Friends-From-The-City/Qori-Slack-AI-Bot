/**
 * Application Services — PLAT-3 barrel export.
 *
 * Channel-independent application layer between adapters and domain services.
 */

// Read-only services
export * as meService from './me.app-service';
export * as projectService from './project.app-service';
export * as studyService from './study.app-service';
export * as artifactService from './artifact.app-service';
export * as traceabilityService from './traceability.app-service';

// Orchestration services (extracted from Slack handlers)
export * as briefService from './brief.app-service';
export * as planService from './plan.app-service';
export * as transcriptService from './transcript.app-service';
export * as synthesisService from './synthesis.app-service';
export * as discoveryService from './discovery.app-service';
export * as readoutService from './readout.app-service';
export * as approvalService from './approval.app-service';
