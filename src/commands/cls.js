import { recordShifts } from '../cls/record.js';

export default async function run(parsed) {
  const recording = await recordShifts(parsed.urls[0], parsed.options);
  if (parsed.options.json) {
    process.stdout.write(`${JSON.stringify(recording)}\n`);
    return 0;
  }
  process.stdout.write(`CLS ${recording.cls}\n`);
  for (const shift of [...recording.shifts].sort((a, b) => b.value - a.value)) {
    const causes = shift.hypotheses.length ? `correlated with: ${shift.hypotheses.map((hypothesis) => hypothesis.evidence).join('; ')}` : 'no clear evidence';
    process.stdout.write(`${shift.value.toFixed(4)} at ${Math.round(shift.t)} ms — ${causes}\n`);
  }
  return 0;
}
