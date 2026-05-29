const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testFile = process.argv[2] || '';
const cmd = testFile
  ? `npx playwright test ${testFile} --reporter=line 2>&1`
  : 'npx playwright test --reporter=line 2>&1';

let output = '';
let exitCode = 0;

try {
  output = execSync(cmd, {
    cwd: __dirname,
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf8',
  });
} catch (e) {
  output = (e.stdout || '') + '\n' + (e.stderr || '');
  exitCode = e.status || 1;
}

fs.writeFileSync('/tmp/pw-output.txt', output);

// Print summary
const lines = output.split('\n');
const passCount = lines.filter(l => l.includes('✓')).length;
const failCount = lines.filter(l => l.includes('✘')).length;
const failLines = lines.filter(l => l.includes('✘'));
const summaryLine = lines.find(l => l.includes('passed') || l.includes('failed'));

console.log(`Passed: ${passCount}, Failed: ${failCount}`);
if (summaryLine) console.log(summaryLine.trim());
failLines.forEach(l => console.log(l.trim()));

// Print error details for failures
const errorSections = [];
let inError = false;
let currentError = [];
for (const line of lines) {
  if (line.includes('Error:') || line.includes('expect(')) {
    inError = true;
  }
  if (inError) {
    currentError.push(line);
    if (currentError.length > 5) {
      errorSections.push(currentError.join('\n'));
      currentError = [];
      inError = false;
    }
  }
}
if (errorSections.length > 0) {
  console.log('\n--- Error Details ---');
  errorSections.slice(0, 10).forEach(e => console.log(e));
}

process.exit(exitCode);
