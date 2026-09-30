// Switch-stance suite: bk.h is always the direction of travel, bk.fakie says the
// bike is pointed backwards down it. A 180 should leave you switch AT SPEED and
// keep you there until the next 180.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8931/');
  await page.waitForFunction(() => window.__endo);
  await page.evaluate(() => window.__endo.start());

  const key = (k, d) => page.evaluate(([k, d]) => { window.__endo.input[k] = d; }, [k, d]);
  const tp = (x, z, h) => page.evaluate(([x, z, h]) => { const b = window.__endo.bk;
    b.x = x; b.z = z; b.h = h; b.v = 0; b.pitch = 0; b.pitchVel = 0; b.air = false; b.vy = 0;
    b.fakie = false; b.roll = 0; b.yawVel = 0; b.gp = 0; b.gpArm = 0;
    b.state = 'ride'; b.crashT = 0; b.invuln = 0;   // a teleport clears a crash in progress
    b.y = window.__endo.groundH(x, z); }, [x, z, h]);
  const bk = () => page.evaluate(() => { const b = window.__endo.bk;
    return { x: b.x, z: b.z, y: b.y, v: b.v, h: b.h, air: b.air, state: b.state,
             pitch: b.pitch, fakie: b.fakie, face: b.h + (b.fakie ? Math.PI : 0) }; });
  const results = [];
  const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d]);
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // the south ring road: 60m of dead-flat, dead-empty tarmac. Stance behaviour has
  // to be measured somewhere the terrain can't put its thumb on the scale.
  const FLAT = [-30, -44, Math.PI / 2], FLAT_H = Math.PI / 2;
  const flat = (dx) => tp(FLAT[0] + (dx || 0), FLAT[1], FLAT[2]);

  // pedal taps: build speed without maturing a wheelie mash, ≥150ms between taps
  async function roll(taps) {
    for (let i = 0; i < taps; i++) {
      await key('pedal', true); await page.waitForTimeout(380);
      await key('pedal', false); await page.waitForTimeout(170);
    }
  }
  // hop and hold a steer through the air
  async function spin(dir) {
    await key(dir, true);
    await page.evaluate(() => { window.__endo.input.hop = true; });
    await page.waitForTimeout(950);
    await key(dir, false);
    await page.waitForTimeout(250);
  }

  // ---- 1. a hop 180 puts you switch, and keeps your speed ----
  await flat();
  await roll(4);
  let before = await bk();
  await spin('left');
  let after = await bk();
  check('180 lands switch', after.fakie === true, JSON.stringify({ fakie: after.fakie, v: after.v.toFixed(1) }));
  check('180 keeps speed', after.v > before.v * 0.75 && after.v > 3,
        'before ' + before.v.toFixed(1) + ' after ' + after.v.toFixed(1));
  check('travel heading unchanged by the 180', Math.abs(wrap(after.h - before.h)) < 0.6,
        wrap(after.h - before.h).toFixed(2));
  check('bike faces backwards down the line', Math.abs(Math.abs(wrap(after.face - after.h)) - Math.PI) < 0.6,
        wrap(after.face - after.h).toFixed(2));

  // ---- 2. switch is sticky: it survives a long roll ----
  await roll(3);
  let held = await bk();
  check('still switch 2s later', held.fakie === true, String(held.fakie));
  check('pedalling switch builds speed', held.v > after.v, after.v.toFixed(1) + ' -> ' + held.v.toFixed(1));

  // ---- 3. a second 180 puts you back to regular ----
  await spin('left');
  let back = await bk();
  check('second 180 returns to regular', back.fakie === false, String(back.fakie));

  // ---- 4. steering reads the same on screen in both stances ----
  await flat();
  await roll(3);
  await key('left', true); await page.waitForTimeout(500); await key('left', false);
  const dReg = wrap((await bk()).h - FLAT_H);
  await flat();
  await page.evaluate(() => { window.__endo.bk.fakie = true; });
  await roll(3);
  await key('left', true); await page.waitForTimeout(500); await key('left', false);
  const dSw = wrap((await bk()).h - FLAT_H);
  check('left steers the same way switch', dReg * dSw > 0 && Math.abs(dSw) > 0.05,
        'regular ' + dReg.toFixed(2) + ' switch ' + dSw.toFixed(2));

  // ---- 5. rolling backwards flips the stance without moving the bike ----
  await flat();
  const preFace = (await bk()).face;
  await page.evaluate(() => { window.__endo.bk.v = -3; });
  await page.waitForTimeout(120);
  const rolled = await bk();
  check('rolling backwards goes switch', rolled.fakie === true && rolled.v > 0,
        JSON.stringify({ fakie: rolled.fakie, v: rolled.v.toFixed(1) }));
  check('the stance flip is invisible', Math.abs(wrap(rolled.face - preFace)) < 0.2,
        wrap(rolled.face - preFace).toFixed(3));

  // ---- 6. the front brake still endos you switch ----
  await flat(10);
  await page.evaluate(() => { window.__endo.bk.fakie = true; });
  await roll(4);
  const rollingSw = await bk();
  await key('brake', true); await page.waitForTimeout(700);
  const endo = await bk();
  await key('brake', false); await page.waitForTimeout(600);
  check('switch braking lifts into an endo', endo.pitch > 0.15 && endo.state === 'ride',
        JSON.stringify({ pitch: endo.pitch.toFixed(2), v0: rollingSw.v.toFixed(1), state: endo.state }));

  // ---- 7. an off-axis landing no longer scrubs you to a stop ----
  await flat();
  await roll(4);
  const pre90 = await bk();
  await key('left', true);
  await page.evaluate(() => { window.__endo.input.hop = true; });
  await page.waitForTimeout(430);            // ~half a hop = ~90 degrees
  await key('left', false);
  await page.waitForTimeout(700);
  const post90 = await bk();
  check('90 landing keeps most of its speed', post90.v > pre90.v * 0.4,
        'before ' + pre90.v.toFixed(1) + ' after ' + post90.v.toFixed(1));

  check('no console errors', errors.length === 0, errors.join(' | '));
  for (const r of results) console.log(r[0].padEnd(5), r[1].padEnd(42), r[2] || '');
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ' + results.length + ' checks passed');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
