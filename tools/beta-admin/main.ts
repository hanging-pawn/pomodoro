import { run } from './cli';

try {
  run(process.argv.slice(2), {
    log: (line) => console.log(line),
    now: () => new Date(),
  });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
