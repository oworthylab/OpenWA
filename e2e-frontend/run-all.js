const { execSync } = require('child_process');
const fs = require('fs');

const tests = [
  'tests/01-login.spec.ts',
  'tests/02-navigation.spec.ts',
  'tests/03-dashboard.spec.ts',
  'tests/04-sessions.spec.ts',
  'tests/05-webhooks.spec.ts',
  'tests/06-api-keys.spec.ts',
  'tests/07-logs.spec.ts',
  'tests/08-message-tester.spec.ts',
  'tests/09-infrastructure.spec.ts',
  'tests/10-plugins.spec.ts',
  'tests/11-theme-responsive.spec.ts',
  'tests/12-auth-persistence.spec.ts',
];

const results = [];
let totalPass = 0;
let totalFail = 0;

for (const test of tests) {
  let output = '';
  let exitCode = 0;
  try {
    output = execSync(`npx playwright test ${test} --reporter=line 2>&1`, {
      cwd: __dirname,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (e) {
    output = (e.stdout || '') + '\n' + (e.stderr || '');
    exitCode = e.status || 1;
  }

  const passMatch = output.match(/(\d+) passed/);
  const failMatch = output.match(/(\d+) failed/);
  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;
  totalPass += passed;
  totalFail += failed;

  const status = exitCode === 0 ? 'PASS' : 'FAIL';
  results.push(`${status} ${test}: ${passed} passed, ${failed} failed`);

  if (exitCode !== 0) {
    // Extract error lines
    const lines = output.split('\n');
    const errorLines = lines.filter(l => l.includes('Error:') || l.includes('expect('));
    results.push(`  Errors: ${errorLines.slice(0, 3).join(' | ')}`);
  }
}

results.push('');
results.push(`TOTAL: ${totalPass} passed, ${totalFail} failed`);
results.push(totalFail === 0 ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED');

const report = results.join('\n');
fs.writeFileSync('/tmp/e2e-results.txt', report);
console.log(report);
process.exit(totalFail > 0 ? 1 : 0);
