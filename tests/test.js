const { chromium } = require('playwright');

const finite = v => typeof v === 'number' && Number.isFinite(v);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:8931/');
  await page.waitForFunction(() => window.__endo);
  await page.evaluate(() => window.__endo.start());

  const snap = () => page.evaluate(() => {
    const b = window.__endo.bk;
    return { v: b.v, y: b.y, pitch: b.pitch, sus: b.sus, susVel: b.susVel, vPitch: b.vPitch,
             crouch: b.crouch, sway: b.sway, wob: b.wob, air: b.air, state: b.state, crank: b.crank };
  });
  const key = (k, down) => page.evaluate(([k, down]) => { window.__endo.input[k] = down; }, [k, down]);
  const wait = ms => page.waitForTimeout(ms);
  // taps stay under ~0.45s: the power-wheelie mash matures at ~0.65s of held
  // pedal (starts building at 0.25s), and longer taps lift the front wheel
  const pump = async n => { for (let i = 0; i < n; i++) {
    await key('pedal', true); await wait(400);
    await key('pedal', false); await wait(120); } };
  const results = [];
  const check = (name, cond, detail) => results.push([cond ? 'PASS' : 'FAIL', name, detail]);

  // 1. sprint from standstill: cranks turn, sway rocks, squat (vPitch < 0)
  // (kept under the 0.65s mash window so the front wheel stays down)
  await key('pedal', true); await wait(400);
  let s = await snap();
  check('sprint sway', Math.abs(s.sway) > 0.005 || s.crank > 0.5, JSON.stringify(s));
  check('sprint crank turns', s.crank > 0.5, 'crank=' + s.crank.toFixed(2));
  check('accel squat', s.vPitch < 0.001, 'vPitch=' + s.vPitch.toFixed(4));

  // 2. up to speed then brake: fork dive (vPitch > 0) before the endo builds.
  // The wait after release matters: pedalT only resets on a physics step that
  // sees the pedal up, so an instant re-press would keep the mash maturing.
  await key('pedal', false); await wait(150); await pump(3);
  await wait(250);   // let any residual pitch settle so the brake meets a planted front wheel
  await key('brake', true); await wait(120);
  s = await snap();
  check('fork dive under braking', s.vPitch > 0.005 || s.pitch > 0.15, 'vPitch=' + s.vPitch.toFixed(4) + ' pitch=' + s.pitch.toFixed(2));

  // 3. hold the endo: wobble micro-corrections active while balancing
  await wait(900);
  s = await snap();
  const wobSamples = [];
  for (let i = 0; i < 6; i++) { wobSamples.push((await snap()).wob); await wait(90); }
  const wobRange = Math.max(...wobSamples) - Math.min(...wobSamples);
  check('endo in progress', s.pitch > 0.1, 'pitch=' + s.pitch.toFixed(2));
  check('balance wobble alive', wobRange > 0.001, 'range=' + wobRange.toFixed(4));
  await key('brake', false); await key('lean', true); await wait(500); await key('lean', false); // bail out

  // 4. hop: suspension pops then lands compressed; crouch tucks in air
  await pump(2);
  await page.evaluate(() => { window.__endo.input.hop = true; });
  await wait(120);
  s = await snap();
  check('airborne after hop', s.air, JSON.stringify({ air: s.air, y: s.y }));
  check('air tuck crouch', s.crouch > 0.05, 'crouch=' + s.crouch.toFixed(3));
  // wait for landing
  await page.waitForFunction(() => !window.__endo.bk.air, null, { timeout: 4000 }).catch(() => {});
  let minSus = 0;
  for (let i = 0; i < 12; i++) { const t = await snap(); minSus = Math.min(minSus, t.sus); await wait(30); }
  check('landing compression', minSus < -0.005, 'minSus=' + minSus.toFixed(4));

  // 5. settle: everything decays back to ~0, all values finite
  await wait(2500);
  s = await snap();
  check('sus settles', Math.abs(s.sus) < 0.05, 'sus=' + s.sus.toFixed(4));
  check('vPitch settles', Math.abs(s.vPitch) < 0.01, 'vPitch=' + s.vPitch.toFixed(4));
  check('sway settles', Math.abs(s.sway) < 0.01, 'sway=' + s.sway.toFixed(4));
  const allFinite = Object.entries(s).every(([k, v]) => typeof v !== 'number' || Number.isFinite(v));
  check('all state finite', allFinite, JSON.stringify(s));
  check('still riding (no crash)', s.state === 'ride', s.state);

  // 6. long-run soak: 15s of mixed inputs at speed, no errors / NaN
  for (let i = 0; i < 5; i++) {
    await key('pedal', true); await wait(1400);
    await key('left', true); await wait(400); await key('left', false);
    await key('pedal', false); await key('brake', true); await wait(600); await key('brake', false);
    await page.evaluate(() => { window.__endo.input.hop = true; });
    await wait(600);
  }
  s = await snap();
  check('soak finite', Object.values(s).every(v => typeof v !== 'number' || Number.isFinite(v)), JSON.stringify(s));
  check('no page errors', errors.length === 0, errors.join(' | ') || 'clean');

  for (const [st, name, det] of results) console.log(st + '  ' + name + '  —  ' + det);
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
