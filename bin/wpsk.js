#!/usr/bin/env node
import { parseCli, UsageError } from '../src/args.js';

const HELP = `Usage:
  wpsk audit <url...> [--runs 5] [--device mobile|desktop|both] [--warm 2]
                         [--out ./wpsk-report] [--cta "text|url"] [--json]
                         [--fail-on "lcp>2500,cls>0.1,perf<90"] [--timeout 120]
  wpsk cls <url> [--device mobile|desktop] [--shots] [--json]
  wpsk compare <before.json> <after.json> [--out ./compare] [--png]
`;

async function main() {
  try {
    const parsed = parseCli(process.argv.slice(2));
    if (parsed.command === 'help') {
      process.stdout.write(HELP);
      return 0;
    }
    const { default: run } = await import(`../src/commands/${parsed.command}.js`);
    return await run(parsed);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

process.exitCode = await main();
