// Garage suite: every bike in BIKES is a set of multipliers on the base bike, so
// each stat has to show up in the physics — a bike that CLAIMS spin has to spin.
// Also guards the things a mesh rebuild can quietly break: hands still on the
// grips, no GL/console errors after cycling every bike, selection persisting.
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

  const results = [];
  const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d]);
  const key = (k, d) => page.evaluate(([k, d]) => { window.__endo.input[k] = d; }, [k, d]);
  const pick = id => page.evaluate(id => {
    window.__endo.selectBike(window.__endo.BIKES.findIndex(b => b.id === id));
    return window.__endo.bike.name;
  }, id);
  // the south ring road: 60m of flat empty tarmac, same reference straight the
  // stance suite uses, so terrain can't skew a stat measurement
  const FLAT = [-30, -44, Math.PI / 2];
  const tp = () => page.evaluate(F => { const b = window.__endo.bk;
    b.x = F[0]; b.z = F[1]; b.h = F[2]; b.v = 0; b.pitch = 0; b.pitchVel = 0;
    b.air = false; b.vy = 0; b.fakie = false; b.roll = 0; b.yawVel = 0; b.gp = 0; b.gpArm = 0;
    b.state = 'ride'; b.crashT = 0; b.invuln = 0;
    b.y = window.__endo.groundH(F[0], F[1]); }, FLAT);
  const bk = () => page.evaluate(() => { const b = window.__endo.bk;
    return { v: b.v, y: b.y, h: b.h, air: b.air, pitch: b.pitch, state: b.state }; });

  const bikes = await page.evaluate(() => window.__endo.BIKES.map(b => b.id));
  check('six bikes in the garage', bikes.length === 6, bikes.join(','));

  // ---- 1. TOP SPEED: hold the pedal down long enough to reach terminal velocity ----
  // (a wheelie would kill the drive, so watch that we stay on two wheels)
  const topSpeed = {};
  for (const id of ['trials', 'street', 'race']) {
    await pick(id);
    await tp();
    await key('pedal', true);
    await page.waitForTimeout(3000);        // long enough to saturate against drag
    const s = await bk();
    await key('pedal', false);
    topSpeed[id] = s.v;
    await page.waitForTimeout(200);
  }
  check('CHROME BULLET is the fastest', topSpeed.race > topSpeed.street * 1.08,
        'race ' + topSpeed.race.toFixed(1) + ' vs street ' + topSpeed.street.toFixed(1));
  check('TRIALS MULE has no top end', topSpeed.trials < topSpeed.street * 0.92,
        'trials ' + topSpeed.trials.toFixed(1) + ' vs street ' + topSpeed.street.toFixed(1));

  // ---- 2. SPIN: same hop, same held steer — count the degrees turned in the air ----
  const spun = {};
  for (const id of ['dirt', 'street', 'hornet']) {
    await pick(id);
    await tp();
    for (let i = 0; i < 3; i++) {           // taps: speed without maturing a wheelie
      await key('pedal', true); await page.waitForTimeout(380);
      await key('pedal', false); await page.waitForTimeout(170);
    }
    const h0 = (await bk()).h;
    await key('left', true);
    await page.evaluate(() => { window.__endo.input.hop = true; });
    await page.waitForTimeout(500);         // mid-air, still turning
    const deg = await page.evaluate(() => window.__endo.bk.airDeg);
    await key('left', false);
    await page.waitForTimeout(800);
    spun[id] = deg;
  }
  check('THE HORNET out-spins the street bike', spun.hornet > spun.street * 1.4,
        'hornet ' + spun.hornet.toFixed(0) + '° vs street ' + spun.street.toFixed(0) + '°');
  check('DIRT JUMPER is the slowest to turn', spun.dirt < spun.street * 0.95,
        'dirt ' + spun.dirt.toFixed(0) + '° vs street ' + spun.street.toFixed(0) + '°');

  // ---- 3. POP: bunny hop from a standstill, measure peak height ----
  const pop = {};
  for (const id of ['race', 'street', 'dirt']) {
    await pick(id);
    await tp();
    await page.evaluate(() => { window.__endo.input.hop = true; });
    let peak = 0;
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(40);
      const s = await bk();
      if (s.y > peak) peak = s.y;
    }
    await page.waitForTimeout(600);
    pop[id] = peak;
  }
  check('DIRT JUMPER pops highest', pop.dirt > pop.street * 1.15,
        'dirt ' + pop.dirt.toFixed(2) + 'm vs street ' + pop.street.toFixed(2) + 'm');
  check('CHROME BULLET pops lowest', pop.race < pop.street,
        'race ' + pop.race.toFixed(2) + 'm vs street ' + pop.street.toFixed(2) + 'm');

  // ---- 4a. BALANCE: a high-BAL bike should just sit in a braked endo ----
  const endo = {};
  for (const id of ['hornet', 'trials']) {
    await pick(id);
    await tp();
    for (let i = 0; i < 5; i++) {
      await key('pedal', true); await page.waitForTimeout(380);
      await key('pedal', false); await page.waitForTimeout(170);
    }
    await key('brake', true);
    await page.waitForTimeout(2000);
    endo[id] = await bk();
    await key('brake', false);
    await page.waitForTimeout(700);
  }
  check('TRIALS MULE parks in the endo', endo.trials.pitch > 0.3 && endo.trials.state === 'ride',
        'pitch ' + endo.trials.pitch.toFixed(2) + ' ' + endo.trials.state);

  // ---- 4b. what BAL actually buys is POCKET WIDTH: how far past the balance
  // point the assist can still reach out and haul the nose back. Start both
  // bikes at the same too-deep endo — 0.4rad past P.BALE, inside the mule's
  // 0.51rad pocket but outside the hornet's 0.26 — and hold the brake.
  const caught = {};
  for (const id of ['hornet', 'trials']) {
    await pick(id);
    await tp();
    await page.evaluate(() => { const b = window.__endo.bk;
      b.v = 3; b.pitch = 1.15; b.pitchVel = 0; b.endoT = 0; });
    await key('brake', true);
    await page.waitForTimeout(450);
    caught[id] = await bk();
    await key('brake', false);
    await page.waitForTimeout(800);
  }
  check('TRIALS MULE catches a deep endo the HORNET drops',
        caught.trials.pitch < 1.15 && (caught.hornet.pitch > 1.15 || caught.hornet.state === 'crash'),
        'trials ' + caught.trials.pitch.toFixed(2) + ' (' + caught.trials.state + ') vs hornet ' +
        caught.hornet.pitch.toFixed(2) + ' (' + caught.hornet.state + ')');

  // ---- 5. selecting a bike rebuilds five meshes and re-derives GRIP (where the
  // hands land). Cycle the whole garage twice, rendering between each swap, and
  // require every frame to come out clean — a stale buffer or a bad GRIP shows
  // up here as a GL or JS error.
  await page.evaluate(async () => {
    for (let i = 0; i < window.__endo.BIKES.length * 2; i++) {
      window.__endo.selectBike(i);
      await new Promise(r => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(400);
  check('cycling every bike twice renders clean', errors.length === 0, errors.join(' | '));

  // ---- 6. the pick sticks across a reload ----
  await pick('hornet');
  await page.reload();
  await page.waitForFunction(() => window.__endo);
  const restored = await page.evaluate(() => window.__endo.bike.id);
  check('the bike you picked is remembered', restored === 'hornet', restored);

  // ---- 7. and it still rides after a reload on a non-default bike ----
  await page.evaluate(() => window.__endo.start());
  await tp();
  await key('pedal', true); await page.waitForTimeout(900); await key('pedal', false);
  const rode = await bk();
  check('rides clean on the remembered bike', rode.v > 2 && rode.state === 'ride' && isFinite(rode.v),
        'v=' + rode.v.toFixed(1) + ' ' + rode.state);

  // ---- 8. the slowest bike in the garage must still be able to ride the map.
  // TRIALS MULE tops out around 8.6 m/s, so it's the one that could quietly fall
  // below a speed gate — the boulevard kicker gap is the first one on the hero line.
  await pick('trials');
  await page.evaluate(() => window.__endo.newRun());
  await page.waitForTimeout(150);
  let gapped = false;
  for (let i = 0; i < 16 && !gapped; i++) {
    await key('pedal', true); await page.waitForTimeout(370);
    await key('pedal', false); await page.waitForTimeout(170);
    const g = await page.evaluate(() => window.__endo.goalsDone.gap);
    const s = await bk();
    if (g) gapped = true;
    if (s.state === 'crash') break;
  }
  check('TRIALS MULE still clears the kicker gap', gapped, gapped ? 'GAP IT' : 'came up short');

  check('no console errors', errors.length === 0, errors.join(' | '));
  for (const r of results) console.log(r[0].padEnd(5), r[1].padEnd(42), r[2] || '');
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall ' + results.length + ' checks passed');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
