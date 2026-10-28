// Usage: node tests/stack/wait-for.mjs <url> [seconds]
const [url, seconds = '60'] = process.argv.slice(2);
const deadline = Date.now() + Number(seconds) * 1000;
async function tick() {
  try {
    const r = await fetch(url);
    if (r.status < 500) process.exit(0);
  } catch {}
  if (Date.now() > deadline) {
    console.error(`timeout waiting for ${url}`);
    process.exit(1);
  }
  setTimeout(tick, 300);
}
tick();
