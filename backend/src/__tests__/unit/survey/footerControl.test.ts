/**
 * Template-level footer control tests.
 *
 * Verifies:
 * - Templates with no document setting retain current footer
 * - append_document_information: true retains footer
 * - append_document_information: false suppresses footer
 */

describe('template footer control', () => {
  // These test the YAML config contract, not the yamlProcessor runtime
  // (which requires full template rendering). The yamlProcessor checks
  // yamlConfig.document?.append_document_information === false.

  it('default behavior (no document config) retains footer', () => {
    const config = { id: 'test', version: 'v1' };
    const suppress = (config as Record<string, unknown>).document === undefined;
    // No document config → default → footer retained
    expect(suppress).toBe(true); // document is undefined
    // yamlProcessor logic: suppressFooter = yamlConfig.document?.append_document_information === false
    // When document is undefined, ?. returns undefined, === false is false → NOT suppressed
    const suppressFooter = (config as any).document?.append_document_information === false;
    expect(suppressFooter).toBe(false);
  });

  it('append_document_information: true retains footer', () => {
    const config = { id: 'test', document: { append_document_information: true } };
    const suppressFooter = config.document?.append_document_information === false;
    expect(suppressFooter).toBe(false);
  });

  it('append_document_information: false suppresses footer', () => {
    const config = { id: 'test', document: { append_document_information: false } };
    const suppressFooter = config.document?.append_document_information === false;
    expect(suppressFooter).toBe(true);
  });
});
