import { recordShifts } from '../cls/record.js';
import { uniqueDir } from '../output.js';

function rectangle({ y, h } = {}) {
  return `y ${Math.round(y ?? 0)}, h ${Math.round(h ?? 0)}`;
}

function printShift(shift) {
  const causes = shift.hypotheses.length ? `correlated with: ${shift.hypotheses.map((hypothesis) => hypothesis.evidence).join('; ')}` : 'no clear evidence';
  process.stdout.write(`${shift.value.toFixed(4)} at ${Math.round(shift.t)} ms\n`);
  for (const source of shift.sources.slice(0, 3)) {
    process.stdout.write(`  ${source.selector}: ${rectangle(source.before)} -> ${rectangle(source.after)}\n`);
  }
  process.stdout.write(`  ${causes}\n`);
}

export default async function run(parsed) {
  try {
    const outDir = parsed.options.shots ? await uniqueDir(parsed.options.out) : undefined;
    const recording = await recordShifts(parsed.urls[0], { ...parsed.options, outDir });
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(recording)}\n`);
      return 0;
    }
    process.stdout.write(`CLS ${recording.cls}\n`);
    if (!recording.shifts.length) process.stdout.write('No layout shifts recorded\n');
    for (const shift of [...recording.shifts].sort((a, b) => b.value - a.value)) printShift(shift);
    if (recording.inputShifts.length) {
      process.stdout.write('Input shifts (excluded from CLS)\n');
      for (const shift of [...recording.inputShifts].sort((a, b) => b.value - a.value)) printShift(shift);
    }
    for (const path of recording.screenshots) process.stdout.write(`${path}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}
