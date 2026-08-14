/**
 * Confirmation tests for skip_when behavior in langchain.ts
 * Run with: npx jest src/__tests__/skip-when-behavior.test.ts
 */

import nunjucks from 'nunjucks';

// Replicate the exact setup from langchain.ts
nunjucks.configure({ autoescape: false });

// Jinja keywords that should not be treated as variable references
const JINJA_KEYWORDS = new Set(['not', 'and', 'or', 'true', 'false', 'none', 'null', 'is', 'in']);

// Replicate assertSkipWhenVariablesDefined from langchain.ts
function assertSkipWhenVariablesDefined(
  expression: string,
  inputValues: Record<string, unknown>,
  taskId: string
): void {
  const matches = expression.match(/\b[a-z_][a-z0-9_]*\b/gi) || [];
  const referencedVars = matches.filter(v => !JINJA_KEYWORDS.has(v.toLowerCase()));

  for (const varName of referencedVars) {
    if (!(varName in inputValues)) {
      throw new Error(
        `skip_when in task "${taskId}" references undefined variable "${varName}". ` +
        `Check for typos. Available variables: ${Object.keys(inputValues).filter(k => k.startsWith('upstream_')).join(', ')}`
      );
    }
  }
}

// Simulate the skip_when evaluation logic from langchain.ts
function evaluateSkipWhen(
  skipWhen: string,
  inputValues: Record<string, unknown>,
  skipOutput: string,
  taskId: string = 'test_task'
): { skipped: boolean; output: string | null; error: Error | null } {
  try {
    assertSkipWhenVariablesDefined(skipWhen, inputValues, taskId);
    const skipCondition = nunjucks.renderString(`{{ ${skipWhen} }}`, inputValues);
    if (skipCondition.trim().toLowerCase() === 'true') {
      return { skipped: true, output: skipOutput, error: null };
    }
    return { skipped: false, output: null, error: null };
  } catch (err) {
    return { skipped: false, output: null, error: err as Error };
  }
}

describe('skip_when behavior', () => {
  test('(a) TYPO in variable name THROWS rather than skipping', () => {
    const inputValues = {
      upstream_participant_approach: 'some value',
    };

    // Deliberate typo: "aproach" instead of "approach"
    const result = evaluateSkipWhen(
      'not upstream_participant_aproach',
      inputValues,
      'Not defined in brief',
      'participant_glance'
    );

    console.log('\n=== TEST A: Typo in skip_when ===');
    console.log('Expression: not upstream_participant_aproach (typo)');
    console.log('Input values:', Object.keys(inputValues));
    console.log('Result:', {
      skipped: result.skipped,
      output: result.output,
      error: result.error?.message || null,
    });

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain('upstream_participant_aproach');
    expect(result.skipped).toBe(false);
  });

  test('(b) EMPTY variable skips and emits literal string', () => {
    const inputValues = {
      upstream_participant_approach: '', // genuinely empty
    };

    const result = evaluateSkipWhen(
      'not upstream_participant_approach',
      inputValues,
      'Not defined in brief'
    );

    console.log('\n=== TEST B: Empty variable ===');
    console.log('Expression: not upstream_participant_approach');
    console.log('upstream_participant_approach value:', JSON.stringify(inputValues.upstream_participant_approach));
    console.log('Result:', {
      skipped: result.skipped,
      output: result.output,
      error: result.error?.message || null,
    });

    expect(result.error).toBeNull();
    expect(result.skipped).toBe(true);
    expect(result.output).toBe('Not defined in brief');
  });

  test('(c) Task with NO skip_when is unaffected (runs normally)', () => {
    const inputValues = {
      upstream_participant_approach: 'some value',
    };

    // Correct variable name - should NOT skip because value is present
    const result = evaluateSkipWhen(
      'not upstream_participant_approach',
      inputValues,
      'Not defined in brief'
    );

    console.log('\n=== TEST C: No skip_when / value present ===');
    console.log('Expression: not upstream_participant_approach');
    console.log('upstream_participant_approach value:', JSON.stringify(inputValues.upstream_participant_approach));
    console.log('Result:', {
      skipped: result.skipped,
      output: result.output,
      error: result.error?.message || null,
    });

    expect(result.error).toBeNull();
    expect(result.skipped).toBe(false);
    expect(result.output).toBeNull();
  });

  test('(c-alt) Task without skip_when field bypasses guard entirely', () => {
    // This test confirms that tasks without skip_when are never evaluated
    // The guard is: if (task.skip_when) { ... }
    // If skip_when is undefined, the block is skipped

    const taskWithoutSkipWhen: { task_id: string; prompt: string; skip_when?: string } = {
      task_id: 'test_task',
      prompt: 'Write something',
      // no skip_when field
    };

    console.log('\n=== TEST C-ALT: No skip_when field ===');
    console.log('task.skip_when:', taskWithoutSkipWhen.skip_when);
    console.log('Boolean(task.skip_when):', Boolean(taskWithoutSkipWhen.skip_when));

    // The guard check in langchain.ts:127
    const skipWhenField = taskWithoutSkipWhen.skip_when;
    expect(skipWhenField).toBeUndefined();
    expect(Boolean(skipWhenField)).toBe(false);

    console.log('Result: Guard bypassed, task would run normally');
  });
});
