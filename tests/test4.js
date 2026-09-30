// Map suite: the four runs, the depot, and the rules that keep the layout honest
// (nothing parked in a lane, no bed swallowing a bench, every bush smashable).
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
    return { x: b.x, z: b.z, y: b.y, v: b.v, air: b.air, state: b.state, pitch: b.pitch, fakie: b.fakie }; });
  const gh = (x, z) => page.evaluate(([x, z]) => window.__endo.groundH(x, z), [x, z]);
  const results = [];
  const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d]);
  // pedal in taps so speed builds without maturing a wheelie mash
  const pump = async n => { for (let i = 0; i < n; i++) {
    await key('pedal', true); await page.waitForTimeout(370);
    await key('pedal', false); await page.waitForTimeout(170); } };
  // run until a predicate fires or we run out of patience
  const watch = async (ms, f) => { const end = Date.now() + ms;
    while (Date.now() < end) { const t = await bk(); if (f(t)) return t; await page.waitForTimeout(50); }
    return null; };
  // pedal AND poll at the same time — features you clear mid-acceleration are
  // invisible to a pump-then-watch, which is how the spine check used to lie
  const pumpWatch = async (secs, f) => {
    const end = Date.now() + secs * 1000;
    let hit = null, on = false, flip = Date.now();
    while (Date.now() < end) {
      if (Date.now() > flip) { on = !on; await key('pedal', on); flip = Date.now() + (on ? 370 : 170); }
      const t = await bk();
      if (!hit && f(t)) hit = t;
      await page.waitForTimeout(40);
    }
    await key('pedal', false);
    return hit;
  };

  // ================= height field =================
  const H = [
    ['terrace deck 0.8', 0, -34, 0.8], ['terrace stair mid 0.4', 0, -30.2, 0.4],
    ['terrace west bank mid', -17, -34, 0.4],
    ['roller crest 0.45', 0, -26, 0.45], ['roller trough', 0, -24, 0],
    ['kicker A lip 1.6', 0, -8.6, 1.56], ['gap floor is flat', 0, -6.5, 0], ['kicker B top 1.6', 0, -4.4, 1.56],
    ['hub is open', 0, 9, 0], ['walkway is open', 0, 22, 0],
    ['bank top 3.0', 0, 37.2, 2.95], ['pyramid top 1.5', 28, -23, 1.5], ['spine apex 1.3', 31, 23.5, 1.3],
    ['funbox top 1.2', -24, 8, 1.2],
    ['halfpipe deck 1.86', -24, 19, 1.86], ['halfpipe roll-in mid', -24, 16.6, 0.92],
    ['halfpipe flat', -24, 26, 0], ['halfpipe north deck', -24, 32.8, 1.86],
    ['QP lip 2.12', 38.4, 0, 2.12],
    ['depot roof 2.9', 0, 48, 2.9], ['depot alley is a gap', 8.7, 48, 0],
    ['depot end ramp mid', 20.25, 47, 1.45],
    ['plaza curb 0.28', 0, 39.1, 0.28], ['road is flat', 30, 45, 0], ['sidewalk raised', 40, 51, 0.14]
  ];
  for (const [n, x, z, want] of H) {
    const v = await gh(x, z);
    check(n, Math.abs(v - want) < 0.06, v.toFixed(2) + ' (want ' + want + ')');
  }

  // ================= L1 the boulevard, all the way to the roof =================
  // one continuous run from the spawn: stairs, rollers, kicker gap, hub, bank, depot
  await page.evaluate(() => window.__endo.newRun());
  await page.waitForTimeout(120);
  let peak = 0, landedRoof = null;
  const trail = [];
  for (let i = 0; i < 26 && !landedRoof; i++) {
    await key('pedal', true); await page.waitForTimeout(370);
    await key('pedal', false); await page.waitForTimeout(170);
    const t = await bk();
    trail.push(t.z.toFixed(0));
    peak = Math.max(peak, t.y);
    if (!t.air && t.z > 43.4 && t.z < 51.5 && t.y > 2.5) landedRoof = t;
    if (t.state === 'crash') break;
  }
  const g1 = await page.evaluate(() => window.__endo.goalsDone);
  check('boulevard reaches the depot roof', !!landedRoof,
        landedRoof ? 'z=' + landedRoof.z.toFixed(1) + ' y=' + landedRoof.y.toFixed(2) : 'stalled at z=' + trail.slice(-1));
  check('ROOF ACCESS goal', !!g1.roof, JSON.stringify({ roof: g1.roof, gap: g1.gap }));
  check('GAP IT goal on the same run', !!g1.gap, String(!!g1.gap));

  // ride the roof east: gap the alley, then take the end ramp back down to the road
  await tp(-2, 47, Math.PI / 2);
  const over = await pumpWatch(2.6, t => t.x > 11 && !t.air && t.y > 2.5);
  check('roof alley gapped', !!over, over ? 'x=' + over.x.toFixed(1) + ' y=' + over.y.toFixed(2) : 'never crossed');
  const down = await pumpWatch(2.6, t => t.x > 24 && t.y < 0.5);
  check('roof end ramp rides back down to the road', !!down && down.state === 'ride',
        down ? 'x=' + down.x.toFixed(1) + ' state=' + down.state : 'stuck up top');

  // ================= the depot front is a real speed gate =================
  await tp(0, 34, 0);                       // partway up the bank, so you come up short
  await page.evaluate(() => { window.__endo.bk.v = 5; });
  const shortT = await watch(3500, t => t.state === 'crash' || (!t.air && t.z > 43));
  check('coming up short does not put you on the roof', !shortT || shortT.z < 43.4 || shortT.y < 2.5,
        shortT ? JSON.stringify({ z: shortT.z.toFixed(1), y: shortT.y.toFixed(2), state: shortT.state }) : 'never got there');

  // ================= L3 the east wall run =================
  await tp(31, 12, 0);                      // heading north at the spine
  const spineAir = await pumpWatch(3.2, t => t.air && t.y > 1.2);
  await page.waitForTimeout(900);
  const g2 = await page.evaluate(() => window.__endo.goalsDone);
  check('spine launches you up the east lane', !!spineAir, spineAir ? 'y=' + spineAir.y.toFixed(2) : 'no air');
  check('SPINE FLY goal', !!g2.spine, String(!!g2.spine));
  // peel right off the lane into the quarter pipe wall
  await tp(31, 0, Math.PI / 2);
  const wall = await pumpWatch(2.6, t => t.y > 1.5);
  check('east lane peels into the QP wall', !!wall, wall ? 'y=' + wall.y.toFixed(2) : 'never climbed');

  // ================= L2 the west run: roll-in and halfpipe =================
  await tp(-24, 10.5, 0);                   // north off the funbox toward the roll-in
  const deck = await pumpWatch(2.6, t => t.z > 18.5 && t.y > 1.5);
  check('roll-in carries you onto the halfpipe deck', !!deck,
        deck ? 'z=' + deck.z.toFixed(1) + ' y=' + deck.y.toFixed(2) : 'bounced off');
  const flat = await pumpWatch(2.2, t => t.z > 24 && t.y < 0.3);
  check('and drops you into the flat', !!flat, flat ? 'z=' + flat.z.toFixed(1) : 'never dropped in');

  // ================= L4 the south run: bank up, across, off the far edge ========
  await tp(-24, -34, Math.PI / 2);
  const onDeck = await pumpWatch(2.6, t => t.x > -12 && t.y > 0.7);
  check('west bank rides up onto the terrace deck', !!onDeck && onDeck.state === 'ride',
        onDeck ? 'x=' + onDeck.x.toFixed(1) + ' y=' + onDeck.y.toFixed(2) : 'walled out');
  const offEdge = await pumpWatch(3.0, t => t.air && t.x > 13);
  await page.waitForTimeout(900);
  const g3 = await page.evaluate(() => window.__endo.goalsDone);
  check('and launches off the terrace edge', !!offEdge, offEdge ? 'x=' + offEdge.x.toFixed(1) : 'no air');
  check('STAIR SURFER goal', !!g3.stairs, String(!!g3.stairs));

  // ================= lanes stay clear =================
  // nothing solid, no bed and no bush may sit inside a run — this is the rule that
  // keeps the map readable, and it is very easy to break by nudging one prop
  const LANES = [
    ['boulevard', 0, 4.5, -29.5, 31, 'z'],
    ['east wall', 31, 2.8, -28, 30, 'z'],
    ['west run', -24, 3.4, -20, 15, 'z'],
    ['south run', -34, 3.0, -21, 15, 'x'],
    ['bank walkway', 0, 9.5, 17, 31, 'z']
  ];
  const clutter = await page.evaluate(lanes => {
    const E = window.__endo, bad = [];
    const inLane = (x, z, L) => {
      const [, c, half, from, to, along] = L;
      return along === 'z' ? (Math.abs(x - c) < half && z > from && z < to)
                           : (Math.abs(z - c) < half && x > from && x < to);
    };
    for (const L of lanes) {
      for (const s of E.solids) if (inLane(s[0], s[1], L)) bad.push(L[0] + ': solid at ' + s[0].toFixed(1) + ',' + s[1].toFixed(1));
      for (const b of E.BEDS) if (inLane(b.x, b.z, L)) bad.push(L[0] + ': bed at ' + b.x + ',' + b.z);
      for (const f of E.softs) if (inLane(f.x, f.z, L)) bad.push(L[0] + ': bush at ' + f.x.toFixed(1) + ',' + f.z.toFixed(1));
    }
    return bad;
  }, LANES);
  check('every run is clear of props, beds and bushes', clutter.length === 0, clutter.slice(0, 5).join(' / ') || 'clear');

  // nothing may sit inside the depot's footprint or under its end ramps — the
  // building was dropped onto a stretch of road that had cars and lamps parked on it
  const buried = await page.evaluate(() => {
    const E = window.__endo, d = E.MAP.DEPOT, bad = [];
    const inside = (x, z) => z > d.z0 - 1 && z < d.z1 + 1 && Math.abs(x) < d.x1 + d.ramp + 1;
    for (const s of E.solids) if (inside(s[0], s[1]) && !(s[1] > 45.5 && s[1] < 51 && Math.abs(s[0]) < 17))
      bad.push('solid ' + s[0].toFixed(1) + ',' + s[1].toFixed(1));
    for (const b of E.BEDS) if (inside(b.x, b.z)) bad.push('bed ' + b.x + ',' + b.z);
    return bad;
  });
  check('nothing buried in the depot', buried.length === 0, buried.slice(0, 5).join(' / ') || 'clear');

  // ================= beds: kerbs, planting, nothing swallowed =================
  const bedInfo = await page.evaluate(() => {
    const E = window.__endo, o = { bad: [], onBed: 0, bushes: 0, beds: E.BEDS.length, bases: [] };
    for (const b of E.BEDS) {
      o.bases.push(b.base);
      for (const s of E.solids) {
        const dx = Math.max(Math.abs(s[0] - b.x) - b.hx, 0), dz = Math.max(Math.abs(s[1] - b.z) - b.hz, 0);
        if (Math.hypot(dx, dz) < s[2]) o.bad.push('bed ' + b.x + ',' + b.z + ' hits solid ' + s[0] + ',' + s[1]);
      }
    }
    for (const f of E.softs) {
      if (f.type !== 'bush') continue;
      o.bushes++;
      if (E.BEDS.some(b => f.x > b.x - b.hx && f.x < b.x + b.hx && f.z > b.z - b.hz && f.z < b.z + b.hz)) o.onBed++;
      else o.bad.push('bush adrift at ' + f.x.toFixed(1) + ',' + f.z.toFixed(1));
      for (const s of E.solids) if (Math.hypot(f.x - s[0], f.z - s[1]) < s[2] + 0.4) o.bad.push('bush inside solid ' + s[0] + ',' + s[1]);
    }
    return o;
  });
  check('beds clear of every solid', bedInfo.bad.length === 0, bedInfo.bad.slice(0, 4).join(' / ') || 'clear');
  check('every bush is planted in a bed', bedInfo.onBed === bedInfo.bushes && bedInfo.bushes > 40,
    bedInfo.onBed + '/' + bedInfo.bushes + ' in ' + bedInfo.beds + ' beds');
  check('beds sit on the surface below', bedInfo.bases.every(b => b === 0 || Math.abs(b - 0.14) < 0.001), JSON.stringify(bedInfo.bases));
  check('bed kerb is 0.2 over grade', Math.abs(await gh(-14, -8.5) - 0.2) < 0.001, (await gh(-14, -8.5)).toFixed(2));
  check('sidewalk bed = walk + kerb', Math.abs(await gh(30, 51.4) - 0.34) < 0.001, (await gh(30, 51.4)).toFixed(2));

  // ride the length of a planted row: bushes burst, speed is untouched
  await tp(-19, -8.5, Math.PI / 2);
  await page.evaluate(() => { window.__endo.runStats.bushes = 0; });
  await pump(5);
  let s = await bk();
  const smashed = await page.evaluate(() => window.__endo.runStats.bushes);
  check('bushes whoosh through at speed', s.state === 'ride' && s.v > 4 && smashed >= 3,
    JSON.stringify({ v: s.v.toFixed(1), smashed: smashed, state: s.state }));

  // cross a bed side-on: the kerb is a bump, not a wall
  await tp(18, 22.5, -Math.PI / 2);         // straight across the east walkway bed
  await pump(4);
  s = await bk();
  check('kerb crossed side-on, not stuck', s.state === 'ride' && s.x < 8 && s.v > 4,
    JSON.stringify({ x: s.x.toFixed(1), v: s.v.toFixed(1) }));

  // cones and cars still behave
  await tp(0, -16, 0);
  await page.evaluate(() => { window.__endo.runStats.cones = 0; });
  await tp(LANE_CONE_X(), -14, 0);
  await pump(4);
  const cones = await page.evaluate(() => window.__endo.runStats.cones);
  check('lane-marker cones get punted', cones > 0, 'cones=' + cones);
  await tp(43, -20, Math.PI / 2);
  await pump(2);
  await page.waitForTimeout(600);
  s = await bk();
  check('car bounce, no crash', s.state === 'ride' && s.x < 46.2, JSON.stringify({ x: s.x.toFixed(1), state: s.state }));

  check('no page errors', errors.length === 0, errors.join('|') || 'clean');
  for (const [st, n, d] of results) console.log(st + '  ' + n + '  —  ' + d);
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? fails + ' FAILURES' : 'ALL PASS (' + results.length + ' checks)');
  await browser.close();
  process.exit(fails ? 1 : 0);
  function LANE_CONE_X() { return -5.9; }
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
