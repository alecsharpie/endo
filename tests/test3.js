const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8931/');
  await page.waitForFunction(() => window.__endo);
  await page.evaluate(() => window.__endo.start());
  const key = (k, d) => page.evaluate(([k, d]) => { window.__endo.input[k] = d; }, [k, d]);
  const s = () => page.evaluate(() => { const b = window.__endo.bk; return { v: b.v, pitch: b.pitch, state: b.state, ct: b.crashType }; });
  const reset = () => page.evaluate(() => { const b = window.__endo.bk;
    b.x = 6; b.z = -20; b.h = 0; b.v = 0; b.pitch = 0; b.pitchVel = 0; b.endoT = 0;
    b.fakie = false; b.air = false; b.vy = 0; b.y = window.__endo.groundH(b.x, b.z); });
  const pump = async n => { for (let i = 0; i < n; i++) {
    await key('pedal', true); await page.waitForTimeout(500);
    await key('pedal', false); await page.waitForTimeout(120); } };
  const results = [];
  const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d]);

  await reset();
  // wheelie: standing mash → front lifts into the assist pocket and holds
  await key('pedal', true);
  let minP = 0;
  for (let i = 0; i < 20; i++) { const t = await s(); minP = Math.min(minP, t.pitch); await page.waitForTimeout(100); }
  let w = await s();
  check('wheelie launches from standing mash', minP < -0.25, 'minPitch=' + minP.toFixed(2));
  check('no loop-out during mash', w.state === 'ride', w.state);
  // exit: brake drops it promptly
  await key('brake', true); await page.waitForTimeout(500); await key('brake', false);
  w = await s();
  check('brake exits wheelie', w.pitch > -0.06 && w.state === 'ride', 'pitch=' + w.pitch.toFixed(2));

  await key('pedal', false); await reset();
  // stoppie from speed (pedal taps stay under the wheelie mash threshold)
  await pump(3);
  await key('brake', true); await page.waitForTimeout(850);
  let e1 = await s();
  await key('lean', true); await page.waitForTimeout(900);
  let e2 = await s();
  check('endo built under brake', e1.pitch > 0.15, 'pitch=' + e1.pitch.toFixed(2));
  check('lean-back catches the endo', e2.pitch < 0.1 && e2.state === 'ride', 'pitch=' + e2.pitch.toFixed(2) + ' ' + e2.state);
  await key('lean', false); await key('brake', false);

  await reset();
  // held endo with brake+assist still balances (no lean → assist active)
  await pump(3);
  await key('brake', true);
  await page.waitForTimeout(1000);
  let e3 = await s();
  check('assisted endo holds ~1s', e3.pitch > 0.2 && e3.state === 'ride', 'pitch=' + e3.pitch.toFixed(2) + ' ' + e3.state + ' ' + (e3.ct||''));
  await key('lean', true); await page.waitForTimeout(600); await key('lean', false); await key('brake', false);

  check('no page errors', errors.length === 0, errors.join('|') || 'clean');
  for (const [st, n, d] of results) console.log(st + '  ' + n + '  —  ' + d);
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
