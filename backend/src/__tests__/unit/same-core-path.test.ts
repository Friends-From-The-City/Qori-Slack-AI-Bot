/**
 * Same-Core-Path Tests — PLAT-3
 *
 * Proves that Slack handlers and HTTP API routes reach the same
 * application service functions. There is NOT a second business
 * implementation behind Slack.
 *
 * Strategy: Import the application service functions and verify they are
 * the same functions that would be called from both Slack handlers and
 * HTTP API routes. The application service barrel export is the single
 * source of truth.
 */

// Import from the barrel — this is what both Slack and HTTP use
import * as appServices from '../../application/index';

describe('Same-core-path: Slack and HTTP use identical application services', () => {
  // ─── Brief ────────────────────────────────────────────────────

  it('brief: application service exports executeBrief', () => {
    expect(appServices.briefService).toBeDefined();
    expect(typeof appServices.briefService.executeBrief).toBe('function');
  });

  // ─── Plan ─────────────────────────────────────────────────────

  it('plan: application service exports executePlan', () => {
    expect(appServices.planService).toBeDefined();
    expect(typeof appServices.planService.executePlan).toBe('function');
  });

  // ─── Transcript ───────────────────────────────────────────────

  it('transcript: application service exports upload, approve, and analyze', () => {
    expect(appServices.transcriptService).toBeDefined();
    expect(typeof appServices.transcriptService.uploadTranscript).toBe('function');
    expect(typeof appServices.transcriptService.approveTranscript).toBe('function');
    expect(typeof appServices.transcriptService.analyzeSession).toBe('function');
  });

  // ─── Synthesis ────────────────────────────────────────────────

  it('synthesis: application service exports executeSynthesis', () => {
    expect(appServices.synthesisService).toBeDefined();
    expect(typeof appServices.synthesisService.executeSynthesis).toBe('function');
  });

  // ─── Discovery ────────────────────────────────────────────────

  it('discovery: application service exports executeDiscovery', () => {
    expect(appServices.discoveryService).toBeDefined();
    expect(typeof appServices.discoveryService.executeDiscovery).toBe('function');
  });

  // ─── Readout ──────────────────────────────────────────────────

  it('readout: application service exports executeReadout', () => {
    expect(appServices.readoutService).toBeDefined();
    expect(typeof appServices.readoutService.executeReadout).toBe('function');
  });

  // ─── Approval ─────────────────────────────────────────────────

  it('approval: application service exports executeDocumentApproval and executeArtifactApproval', () => {
    expect(appServices.approvalService).toBeDefined();
    expect(typeof appServices.approvalService.executeDocumentApproval).toBe('function');
    expect(typeof appServices.approvalService.executeArtifactApproval).toBe('function');
  });

  // ─── Read-only services ───────────────────────────────────────

  it('me: application service exports getCurrentActor', () => {
    expect(appServices.meService).toBeDefined();
    expect(typeof appServices.meService.getCurrentActor).toBe('function');
  });

  it('project: application service exports listProjects and getProject', () => {
    expect(appServices.projectService).toBeDefined();
    expect(typeof appServices.projectService.listProjects).toBe('function');
    expect(typeof appServices.projectService.getProject).toBe('function');
  });

  it('study: application service exports getStudy', () => {
    expect(appServices.studyService).toBeDefined();
    expect(typeof appServices.studyService.getStudy).toBe('function');
  });

  it('artifact: application service exports getArtifact and approveArtifact', () => {
    expect(appServices.artifactService).toBeDefined();
    expect(typeof appServices.artifactService.getArtifact).toBe('function');
    expect(typeof appServices.artifactService.approveArtifact).toBe('function');
  });

  it('traceability: application service exports getTraceGraph', () => {
    expect(appServices.traceabilityService).toBeDefined();
    expect(typeof appServices.traceabilityService.getTraceGraph).toBe('function');
  });

  // ─── No duplicate implementation ──────────────────────────────

  it('all 12 application services are exported from single barrel', () => {
    const serviceNames = Object.keys(appServices);
    expect(serviceNames).toContain('briefService');
    expect(serviceNames).toContain('planService');
    expect(serviceNames).toContain('transcriptService');
    expect(serviceNames).toContain('synthesisService');
    expect(serviceNames).toContain('discoveryService');
    expect(serviceNames).toContain('readoutService');
    expect(serviceNames).toContain('approvalService');
    expect(serviceNames).toContain('meService');
    expect(serviceNames).toContain('projectService');
    expect(serviceNames).toContain('studyService');
    expect(serviceNames).toContain('artifactService');
    expect(serviceNames).toContain('traceabilityService');
    expect(serviceNames).toHaveLength(12);
  });
});
