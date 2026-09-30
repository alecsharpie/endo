// Soak: 90s of pseudo-random input let loose on the whole map. Catches NaN, stuck
// geometry and console errors that a scripted run down a known line never will.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8931/');
  await p.waitForFunction(() => window.__endo);
  await p.evaluate(() => window.__endo.start());
  // 90s of semi-random riding all over the map
  const keys = ['pedal', 'brake', 'lean', 'left', 'right'];
  let seed = 12345; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) {
    const k = keys[(rnd() * keys.length) | 0];
    await p.evaluate(([k, d]) => { window.__endo.input[k] = d; }, [k, rnd() > 0.35]);
    if (rnd() > 0.85) await p.evaluate(() => { window.__endo.input.hop = true; });
    await p.waitForTimeout(120);
  }
  const s = await p.evaluate(() => { const k = window.__endo.bk;
    return { x: k.x, y: k.y, z: k.z, v: k.v, pitch: k.pitch, fakie: k.fakie, state: k.state,
             finite: [k.x, k.y, k.z, k.v, k.pitch, k.h, k.vy].every(Number.isFinite),
             score: window.__endo.score, goals: Object.keys(window.__endo.goalsDone).length };
  });
  console.log(JSON.stringify(s));
  console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
  await b.close();
  process.exit(s.finite && errs.length === 0 ? 0 : 1);
})();
