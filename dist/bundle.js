(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/bot/math.ts
  var TAU = Math.PI * 2;
  var clamp = (v, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v;
  var lerp = (a, b, t) => a + (b - a) * t;
  var easings = {
    easeOutCubic: (t) => 1 - (1 - t) ** 3,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
    easeOutQuint: (t) => 1 - (1 - t) ** 5
  };
  function loopNoise(t, period, seed = 0) {
    const p = t / period * TAU;
    return 0.55 * Math.sin(p + seed) + 0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) + 0.15 * Math.sin(3 * p + seed * 2.3 + 2.4);
  }
  function createRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var r2 = (v) => Math.round(v * 100) / 100;

  // src/bot/decor.ts
  function wheel(hue, s = 0.55, l = 0.62) {
    const h = (hue % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  function arcRender(seed, t, scale, id, opacity = 1) {
    const spin2 = seed.phase + t * seed.speed * TAU;
    const cu = Math.cos(seed.tilt);
    const su = Math.sin(seed.tilt);
    const kz = Math.sqrt(Math.max(0, 1 - seed.k * seed.k));
    const N = 64;
    const span = seed.sweep * TAU;
    let front = "";
    let back = "";
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const th = spin2 + i / N * span;
      const ct = Math.cos(th);
      const st2 = Math.sin(th);
      const x = seed.a * (ct * cu + st2 * -su * seed.k) + seed.cx;
      const y = seed.a * (ct * su + st2 * cu * seed.k) + seed.cy;
      const z = seed.a * st2 * kz;
      const behind = z < 0;
      const sx2 = r2(x * scale);
      const sy2 = r2(y * scale);
      const cmd = behind !== prev ? "M" : "L";
      if (behind) back += `${cmd}${sx2} ${sy2}`;
      else front += `${cmd}${sx2} ${sy2}`;
      prev = behind;
    }
    const gx = Math.cos(seed.tilt) * seed.a * scale;
    const gy = Math.sin(seed.tilt) * seed.a * scale;
    return {
      id,
      front,
      back,
      width: seed.width * scale,
      opacity,
      grad: {
        x1: r2(seed.cx * scale - gx),
        y1: r2(seed.cy * scale - gy),
        x2: r2(seed.cx * scale + gx),
        y2: r2(seed.cy * scale + gy),
        stops: [wheel(seed.hue), wheel(seed.hue + seed.hueSpan * 0.5), wheel(seed.hue + seed.hueSpan)]
      }
    };
  }
  var RING_RNG = createRng(659918);
  var RINGS = Array.from({ length: 6 }, (_, i) => ({
    a: 1.3 + RING_RNG() * 0.1,
    k: 0.05 + RING_RNG() * 0.4,
    tilt: i / 6 * Math.PI + RING_RNG() * 0.5,
    speed: 3 + RING_RNG() * 0.7,
    phase: RING_RNG() * TAU,
    sweep: 0.6 + RING_RNG() * 0.25,
    hue: i * 360 / 6 + RING_RNG() * 30,
    hueSpan: 60 + RING_RNG() * 60,
    width: 0.05 + RING_RNG() * 0.012,
    cx: 0,
    cy: 0.1
  }));
  var SWOOSH = Array.from({ length: 4 }, (_, i) => ({
    a: 0.78 + i * 0.2,
    k: 0.05 + i * 0.02,
    tilt: -0.62 + i * 0.05,
    speed: 0.3,
    phase: 0.06 * i,
    sweep: 0.4,
    hue: 95 + i * 62,
    hueSpan: 100,
    width: 0.05,
    cx: 0,
    cy: -0.12
  }));
  var DOT_X = [-0.557, -0.013, 0.532];
  var DOT_R = 0.165;
  var DOT_PEAK = 1.25;
  var P_RNG = createRng(48879);
  var PARTICLES = Array.from({ length: 5 }, (_, i) => ({
    birth: i * 0.2,
    angle: P_RNG() * TAU,
    rho: 0.58 + P_RNG() * 0.18
  }));
  function particles(t, scale) {
    const out = [];
    for (const p of PARTICLES) {
      const u = t - p.birth;
      if (u < 0 || u > 0.62) continue;
      const rho = p.rho * Math.pow(0.75, u * 10);
      const a = p.angle + u * 100 * Math.PI / 180;
      out.push({
        x: Math.cos(a) * rho * scale,
        y: Math.sin(a) * rho * scale,
        r: (0.04 + 0.028 * clamp(u / 0.55)) * scale,
        depth: clamp(1 - rho / 0.8),
        opacity: clamp(u / 0.06) * clamp((0.62 - u) / 0.08)
      });
    }
    return out;
  }
  var COMET_RNG = createRng(49383);
  var COMET_RIBBONS = Array.from({ length: 4 }, (_, i) => {
    const d = i - 1.5;
    return {
      a: 0.85 * (1 + d * 0.03),
      // meme aplatissement a +-5 % pres : les rubans forment un faisceau serre
      k: 0.15 / 0.85 * (1 + d * 0.16),
      tilt: 34 * Math.PI / 180 + d * 0.035,
      speed: 210 / 360,
      // dephasage mesure : 10 a 20 degres entre rubans, pas davantage
      phase: -i * 0.045 + COMET_RNG() * 0.012,
      sweep: 0.34,
      hue: i * 85 + COMET_RNG() * 20,
      hueSpan: 80,
      width: 0.095,
      cx: 0,
      cy: 0
    };
  });
  var COMET_DOT = 0.129;
  var NOTIF_ANGLE = -42;
  var NOTIF_DIST = 1.003;
  var NOTIF_R = 0.15;
  var NOTIF_POP = 1.14;
  var NOTIF_MARGIN = 0.054;

  // src/bot/face.ts
  var EYE_SPLIT = 15.46;
  var EYE_W = 0.186;
  var EYE_H = 0.412;
  var REST_GAZE = { yaw: 28.49, pitch: 28.62, roll: -13 };
  var deg = (d) => d * Math.PI / 180;
  function spin(u, v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
      [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
      [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s]
    ];
  }
  function eyePoses(gaze, scale, split = EYE_SPLIT) {
    let f = [0, 0, 1];
    let right = [1, 0, 0];
    let down = [0, 1, 0];
    [f, right] = spin(f, right, deg(gaze.yaw));
    [down, f] = spin(down, f, deg(gaze.pitch));
    [right, down] = spin(right, down, deg(gaze.roll));
    const build = (side) => {
      const [ef, er] = spin(f, right, deg(split * side));
      return {
        x: ef[0] * scale,
        y: ef[1] * scale,
        a: er[0],
        b: er[1],
        c: down[0],
        d: down[1],
        depth: ef[2]
      };
    };
    return [build(-1), build(1)];
  }
  var BLINK_RNG = createRng(24301);
  var BLINKS = (() => {
    const out = [];
    let t = 1.4;
    while (t < 900) {
      out.push(t);
      t += 1.9 + BLINK_RNG() * 2.7;
      if (BLINK_RNG() < 0.18) {
        out.push(t);
        t += 0.24;
      }
    }
    return out;
  })();
  var BLINK_DUR = 0.18;
  function blinkLid(t) {
    for (let i = 0; i < BLINKS.length; i++) {
      const start = BLINKS[i];
      if (t < start) break;
      const k = (t - start) / BLINK_DUR;
      if (k >= 0 && k <= 1) {
        return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55;
      }
    }
    return 1;
  }
  function liveliness(t, opt = {}) {
    const { wander = 1, blink = true, float = true } = opt;
    return {
      dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
      dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
      dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
      lid: blink ? blinkLid(t) : 1,
      // Au repos la video est quasiment immobile (centre stable a +-0.003, rayon
      // constant) : toute la vie passe par le regard et les clignements. On garde
      // juste de quoi ne pas figer completement l'image.
      driftX: float ? loopNoise(t, 7.9, 1.9) * 6e-3 : 0,
      driftY: float ? loopNoise(t, 5.3, 0.3) * 7e-3 : 0,
      // La largeur est constante, seule la hauteur respire tres legerement.
      breath: float ? 1 + Math.sin(t / 3.4 * Math.PI * 2) * 5e-3 : 1
    };
  }
  function blinkScale(lid) {
    return 0.06 + 0.94 * clamp(lid);
  }

  // src/bot/expressions.ts
  var eye = (w, h, tilt = 0, open2 = 1) => ({ w, h, tilt, open: open2 });
  var pair = (w, h, tilt = 0, open2 = 1) => [
    eye(w, h, tilt, open2),
    eye(w, h, -tilt, open2)
  ];
  var EXPRESSIONS = [
    {
      // la pose relevée image par image sur la vidéo de référence
      id: "neutre",
      gaze: { ...REST_GAZE },
      split: EYE_SPLIT,
      eyes: [eye(EYE_W, EYE_H), eye(EYE_W, EYE_H)]
    },
    {
      id: "attentif",
      gaze: { yaw: 4, pitch: 5, roll: -4 },
      split: 16,
      eyes: pair(0.21, 0.44)
    },
    {
      id: "surpris",
      gaze: { yaw: 3, pitch: -3, roll: 0 },
      split: 19,
      eyes: pair(0.45, 0.47)
    },
    {
      id: "excite",
      gaze: { yaw: 6, pitch: -14, roll: 0 },
      split: 19.5,
      eyes: pair(0.4, 0.56, -10)
    },
    {
      // yeux plissés en arc : les hauts convergent légèrement
      id: "heureux",
      gaze: { yaw: 5, pitch: 9, roll: 0 },
      split: 17,
      eyes: pair(0.27, 0.17, 14)
    },
    {
      id: "hilare",
      gaze: { yaw: 4, pitch: 14, roll: 0 },
      split: 18,
      eyes: pair(0.34, 0.13, 20)
    },
    {
      // hauts des yeux qui convergent fort vers le centre + yeux étrécis
      id: "colere",
      gaze: { yaw: 3, pitch: 7, roll: 0 },
      split: 17,
      eyes: pair(0.34, 0.15, 30)
    },
    {
      // l'inverse : les hauts divergent, et le regard tombe
      id: "triste",
      gaze: { yaw: 3, pitch: -13, roll: 0 },
      split: 16,
      eyes: pair(0.22, 0.4, -28)
    },
    {
      id: "effraye",
      gaze: { yaw: 2, pitch: -20, roll: 0 },
      split: 20.5,
      eyes: pair(0.4, 0.6)
    },
    {
      // un œil franchement plus fermé que l'autre
      id: "mefiant",
      gaze: { yaw: 12, pitch: 6, roll: -6 },
      split: 16,
      eyes: [eye(0.21, 0.4), eye(0.22, 0.15)]
    },
    {
      // asymétrique sur les deux axes : tailles ET inclinaisons dépareillées.
      // L'œil plissé est volontairement plat (rapport 1,6) : à un rapport proche
      // de 1 il serait rond, et son inclinaison ne se verrait pas.
      id: "confus",
      gaze: { yaw: -14, pitch: 3, roll: 8 },
      split: 16.5,
      eyes: [eye(0.2, 0.44, -18), eye(0.28, 0.17, 14)]
    },
    {
      // la tête penche : c'est le roulis qui porte la curiosité
      id: "curieux",
      gaze: { yaw: 16, pitch: -9, roll: -15 },
      split: 16.5,
      eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)]
    },
    {
      id: "fier",
      gaze: { yaw: 5, pitch: 17, roll: 0 },
      split: 17,
      eyes: pair(0.3, 0.15, 18)
    },
    {
      id: "timide",
      gaze: { yaw: -19, pitch: -14, roll: -7 },
      split: 14,
      eyes: pair(0.17, 0.3)
    },
    {
      // fentes horizontales et regard qui part sur le côté
      id: "blase",
      gaze: { yaw: -22, pitch: 2, roll: 0 },
      split: 16,
      eyes: pair(0.3, 0.12)
    },
    {
      // paupières à moitié tombées : on passe par `open`, donc l'écrasement
      // vertical à l'écran, le même mécanisme que le clignement
      id: "somnolent",
      gaze: { yaw: 6, pitch: -9, roll: -3 },
      split: 16,
      eyes: pair(0.2, 0.42, 0, 0.42)
    }
  ];
  var EXPRESSION_BY_ID = new Map(EXPRESSIONS.map((e) => [e.id, e]));
  var lerpEyeCfg = (a, b, t) => ({
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
    open: lerp(a.open, b.open, t)
  });
  function blendExpression(a, b, t) {
    return {
      id: b.id,
      gaze: {
        yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
        pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
        roll: lerp(a.gaze.roll, b.gaze.roll, t)
      },
      split: lerp(a.split, b.split, t),
      eyes: [lerpEyeCfg(a.eyes[0], b.eyes[0], t), lerpEyeCfg(a.eyes[1], b.eyes[1], t)]
    };
  }

  // src/bot/profiles.ts
  var PROFILE_SAMPLES = 64;
  var PROFILES = {
    // oeuf : meme hauteur que la boule, retreci en largeur
    // image 164, empreinte mesuree 1.647 x 2.000
    egg: [0.8369, 0.8424, 0.8497, 0.8585, 0.8674, 0.8775, 0.8878, 0.8983, 0.9089, 0.9185, 0.9288, 0.9374, 0.9445, 0.9504, 0.9543, 0.9559, 0.9555, 0.9519, 0.9466, 0.9389, 0.9302, 0.9193, 0.9085, 0.8969, 0.8852, 0.8734, 0.8625, 0.8513, 0.8411, 0.8325, 0.8243, 0.8179, 0.8137, 0.8112, 0.8102, 0.8128, 0.8178, 0.8262, 0.8374, 0.8518, 0.8702, 0.8922, 0.9169, 0.9446, 0.9741, 1.0023, 1.0267, 1.0433, 1.0481, 1.0393, 1.0216, 0.997, 0.9697, 0.9418, 0.9169, 0.8949, 0.876, 0.8604, 0.849, 0.8394, 0.8337, 0.8314, 0.8305, 0.8326],
    // hexagone pointe en haut, coins tres arrondis
    // image 174, empreinte mesuree 1.826 x 2.011
    hexagon: [0.921, 0.9282, 0.9441, 0.9706, 0.9984, 1.0059, 0.9896, 0.9562, 0.929, 0.9124, 0.9047, 0.9058, 0.9157, 0.9349, 0.9642, 0.9873, 0.9882, 0.9665, 0.9336, 0.9105, 0.8968, 0.8918, 0.8955, 0.908, 0.9293, 0.9611, 0.982, 0.9812, 0.959, 0.9282, 0.9089, 0.8978, 0.8964, 0.9026, 0.9189, 0.9439, 0.9778, 0.999, 0.9964, 0.9713, 0.9439, 0.9274, 0.9196, 0.9206, 0.9308, 0.9502, 0.9799, 1.0121, 1.0226, 1.0071, 0.9752, 0.951, 0.9366, 0.9316, 0.9351, 0.9485, 0.9711, 1.0026, 1.0213, 1.0155, 0.9863, 0.9547, 0.9347, 0.9232],
    // triangle pointe en haut, coins tres arrondis
    // image 190, empreinte mesuree 1.995 x 1.884
    triangle: [0.7819, 0.8211, 0.8747, 0.944, 1.0223, 1.096, 1.1401, 1.134, 1.0808, 1.0047, 0.9265, 0.8603, 0.8104, 0.773, 0.745, 0.7273, 0.7151, 0.7118, 0.7148, 0.7245, 0.7427, 0.768, 0.8037, 0.8518, 0.9148, 0.9876, 1.0583, 1.1073, 1.1109, 1.0667, 0.994, 0.9164, 0.8482, 0.7948, 0.7555, 0.7261, 0.7056, 0.6925, 0.6859, 0.6869, 0.6938, 0.7084, 0.7305, 0.7615, 0.804, 0.8595, 0.9311, 1.0092, 1.0791, 1.1171, 1.1054, 1.0501, 0.9779, 0.905, 0.845, 0.799, 0.7656, 0.7413, 0.7258, 0.716, 0.7146, 0.7204, 0.733, 0.7528]
  };

  // src/bot/shape.ts
  var ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => i / PROFILE_SAMPLES * TAU);
  var COS = ANGLES.map(Math.cos);
  var SIN = ANGLES.map(Math.sin);
  function silhouette(name, pose = {}) {
    return {
      radii: [...PROFILES[name]],
      rot: 0,
      cx: 0,
      cy: 0,
      sx: 1,
      sy: 1,
      ...pose
    };
  }
  function circle(radius, pose = {}) {
    return {
      radii: new Array(PROFILE_SAMPLES).fill(radius),
      rot: 0,
      cx: 0,
      cy: 0,
      sx: 1,
      sy: 1,
      ...pose
    };
  }
  function blend(a, b, t, out) {
    const dst = out ?? { radii: new Array(PROFILE_SAMPLES), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 };
    for (let i = 0; i < PROFILE_SAMPLES; i++) {
      dst.radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t);
    }
    let dRot = b.rot - a.rot;
    while (dRot > Math.PI) dRot -= TAU;
    while (dRot < -Math.PI) dRot += TAU;
    dst.rot = a.rot + dRot * t;
    dst.cx = lerp(a.cx, b.cx, t);
    dst.cy = lerp(a.cy, b.cy, t);
    dst.sx = lerp(a.sx, b.sx, t);
    dst.sy = lerp(a.sy, b.sy, t);
    return dst;
  }
  function toPoints(s, scale, out = []) {
    const cr = Math.cos(s.rot);
    const sr = Math.sin(s.rot);
    for (let i = 0; i < PROFILE_SAMPLES; i++) {
      const r = s.radii[i] ?? 1;
      const x = r * (COS[i] ?? 0);
      const y = r * (SIN[i] ?? 0);
      const rx = x * cr - y * sr;
      const ry = x * sr + y * cr;
      const p = out[i] ?? { x: 0, y: 0 };
      p.x = (rx * s.sx + s.cx) * scale;
      p.y = (ry * s.sy + s.cy) * scale;
      out[i] = p;
    }
    out.length = PROFILE_SAMPLES;
    return out;
  }
  function closedPath(pts, tension = 1 / 6) {
    const n = pts.length;
    if (n < 3) return "";
    const first = pts[0];
    let d = `M${r2(first.x)} ${r2(first.y)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const c1x = p1.x + (p2.x - p0.x) * tension;
      const c1y = p1.y + (p2.y - p0.y) * tension;
      const c2x = p2.x - (p3.x - p1.x) * tension;
      const c2y = p2.y - (p3.y - p1.y) * tension;
      d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
    }
    return `${d}Z`;
  }
  function profileFromPolygon(poly, cx, cy) {
    const radii = new Array(PROFILE_SAMPLES).fill(0);
    const n = poly.length;
    for (let k = 0; k < PROFILE_SAMPLES; k++) {
      const dx = COS[k] ?? 0;
      const dy = SIN[k] ?? 0;
      let best = 0;
      for (let i = 0; i < n; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const px = a.x - cx;
        const py = a.y - cy;
        const t = (px * ey - py * ex) / den;
        const u = (px * dy - py * dx) / den;
        if (t > best && u >= 0 && u <= 1) best = t;
      }
      radii[k] = best;
    }
    return radii;
  }
  function hullOfCircles(x1, y1, r1, x2, y2, r2v, steps = 96) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const base2 = Math.atan2(dy, dx);
    const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2v) / dist)));
    const pts = [];
    for (let i = 0; i <= steps / 2; i++) {
      const a = base2 + spread + (TAU - 2 * spread) * i / (steps / 2);
      pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 });
    }
    for (let i = 0; i <= steps / 2; i++) {
      const a = base2 - spread + 2 * spread * i / (steps / 2);
      pts.push({ x: x2 + Math.cos(a) * r2v, y: y2 + Math.sin(a) * r2v });
    }
    return pts;
  }
  function radiusAtAngle(radii, angle) {
    const n = radii.length;
    const t = (angle / TAU % 1 + 1) % 1 * n;
    const i = Math.floor(t);
    return lerp(radii[i % n] ?? 1, radii[(i + 1) % n] ?? 1, t - i);
  }
  function superellipseProfile(n, sx2 = 1, sy2 = 1) {
    return ANGLES.map((_, i) => {
      const c = Math.abs((COS[i] ?? 0) / sx2) ** n;
      const s = Math.abs((SIN[i] ?? 0) / sy2) ** n;
      return (c + s) ** (-1 / n);
    });
  }
  function unionOfCirclesProfile(circles) {
    const out = new Array(PROFILE_SAMPLES).fill(0);
    for (let i = 0; i < PROFILE_SAMPLES; i++) {
      const dx = COS[i] ?? 0;
      const dy = SIN[i] ?? 0;
      let best = 0;
      for (const c of circles) {
        const b = dx * c.x + dy * c.y;
        const disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r);
        if (disc < 0) continue;
        const t = b + Math.sqrt(disc);
        if (t > best) best = t;
      }
      out[i] = best;
    }
    return out;
  }
  function roundedPolygon(verts, rc, arcSteps = 10) {
    const n = verts.length;
    const out = [];
    const normal = (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return Math.atan2(-dx / len, dy / len);
    };
    for (let i = 0; i < n; i++) {
      const prev = verts[(i - 1 + n) % n];
      const cur = verts[i];
      const next = verts[(i + 1) % n];
      const a0 = normal(prev, cur);
      const a1 = normal(cur, next);
      let d = a1 - a0;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      for (let k = 0; k <= arcSteps; k++) {
        const a = a0 + d * k / arcSteps;
        out.push({ x: cur.x + Math.cos(a) * rc, y: cur.y + Math.sin(a) * rc });
      }
    }
    return out;
  }
  function regularPolygonProfile(sides, radius, rc, rotationDeg = 0) {
    const rot = rotationDeg * Math.PI / 180;
    const verts = Array.from({ length: sides }, (_, i) => {
      const a = rot + i / sides * TAU;
      return { x: Math.cos(a) * (radius - rc), y: Math.sin(a) * (radius - rc) };
    });
    return profileFromPolygon(roundedPolygon(verts, rc), 0, 0);
  }
  function polyPath(pts, scale = 1) {
    if (pts.length < 3) return "";
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      d += `${i === 0 ? "M" : "L"}${r2(p.x * scale)} ${r2(p.y * scale)}`;
    }
    return `${d}Z`;
  }
  function capsulePath(w, h) {
    const hw = Math.max(w, 0.01) / 2;
    const hh = Math.max(h, 0.01) / 2;
    const r = Math.min(hw, hh);
    return `M${r2(-hw)} ${r2(-hh + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}L${r2(hw - r)} ${r2(-hh)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}L${r2(hw)} ${r2(hh - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}L${r2(-hw + r)} ${r2(hh)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`;
  }

  // src/bot/skins.ts
  function normalize(radii, max = 1) {
    const peak = Math.max(...radii);
    if (peak <= 0) return radii;
    const k = max / peak;
    return radii.map((r) => r * k);
  }
  var ANGLES2 = Array.from({ length: PROFILE_SAMPLES }, (_, i) => i / PROFILE_SAMPLES * Math.PI * 2);
  var pebble = normalize(
    ANGLES2.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
    1.02
  );
  var cloud = normalize(
    unionOfCirclesProfile([
      { x: -0.44, y: 0.2, r: 0.54 },
      { x: 0.46, y: 0.2, r: 0.5 },
      { x: 0.02, y: 0.3, r: 0.6 },
      { x: -0.24, y: -0.3, r: 0.48 },
      { x: 0.3, y: -0.24, r: 0.44 }
    ]),
    1.02
  );
  var droplet = normalize(
    profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0),
    1.04
  );
  var capsule = profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0);
  var SHAPES = [
    { id: "cercle", radii: new Array(PROFILE_SAMPLES).fill(1) },
    { id: "galet", radii: pebble },
    // 1.15 et pas 1.02 : sur une superellipse le rayon maximal est la diagonale,
    // donc normaliser dessus donne une forme qui parait plus petite que le cercle.
    { id: "squircle", radii: normalize(superellipseProfile(4.2), 1.15) },
    { id: "capsule", radii: capsule },
    // -90deg : un sommet vers le haut de l'ecran (y est oriente vers le bas)
    { id: "triangle", radii: regularPolygonProfile(3, 1.12, 0.34, -90) },
    // 0deg : sommets a gauche et a droite, donc aretes du haut et du bas plates
    { id: "hexagone", radii: regularPolygonProfile(6, 1.04, 0.26, 0) },
    { id: "nuage", radii: cloud },
    { id: "goutte", radii: droplet }
  ];
  var SHAPE_BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
  var DEFAULT_SHAPE = "cercle";
  var COLORS = [
    { id: "encre", hex: "#0a0a0c" },
    { id: "brun", hex: "#8b5e3c" },
    { id: "rouge", hex: "#e8483f" },
    { id: "orange", hex: "#f08a24" },
    { id: "ambre", hex: "#f0b429" },
    { id: "vert", hex: "#3ecf8e" },
    { id: "turquoise", hex: "#2fbfa0" },
    { id: "bleu", hex: "#3b93f0" },
    { id: "violet", hex: "#8b5cf6" },
    { id: "rose", hex: "#e152b0" },
    { id: "gris", hex: "#a3a3a3" },
    { id: "creme", hex: "#f1efe9" }
  ];
  var COLOR_BY_ID = new Map(COLORS.map((c) => [c.id, c]));
  function mixHex(from, to, t) {
    const parse = (h) => {
      const v = parseInt(h.slice(1), 16);
      return [v >> 16 & 255, v >> 8 & 255, v & 255];
    };
    const a = parse(from);
    const b = parse(to);
    const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
    return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  // src/bot/states.ts
  var pair2 = (w, h) => [
    { w, h, open: 1 },
    { w, h, open: 1 }
  ];
  function base(over = {}) {
    return {
      sil: circle(1),
      offX: 0,
      offY: 0,
      gaze: { ...REST_GAZE },
      split: EYE_SPLIT,
      eyes: pair2(EYE_W, EYE_H),
      eyeAlpha: 1,
      bodyAlpha: 1,
      dots: [],
      arcs: [],
      notif: null,
      dotsBehind: false,
      ...over
    };
  }
  var BAR_UPRIGHT_CY = -0.1875;
  var BAR_UPRIGHT = profileFromPolygon(
    hullOfCircles(0, -0.505, 0.132, 0, 0.13, 0.075),
    0,
    BAR_UPRIGHT_CY
  );
  var BAR_ITALIC = profileFromPolygon(hullOfCircles(0, -0.2535, 0.1345, 0, 0.2535, 0.1345), 0, 0);
  var barUpright = (pose = {}) => ({
    radii: [...BAR_UPRIGHT],
    rot: 0,
    cx: 0,
    cy: BAR_UPRIGHT_CY,
    sx: 1,
    sy: 1,
    ...pose
  });
  var barItalic = (pose = {}) => ({
    radii: [...BAR_ITALIC],
    rot: 0,
    cx: 0,
    cy: 0,
    sx: 1,
    sy: 1,
    ...pose
  });
  var TEAR = polyPath(hullOfCircles(0, 0, 0.118, 0, 0.172, 0.012));
  var TRI_ORBIT = 0.213;
  function spinningTriangle(rot) {
    return silhouette("triangle", {
      rot,
      cx: -TRI_ORBIT * Math.sin(rot),
      cy: TRI_ORBIT * Math.cos(rot)
    });
  }
  function dotPulse(t, index) {
    const p = ((t - index * 0.5) / 1.5 % 1 + 1) % 1;
    const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
    return clamp(k * 2);
  }
  var STATES = [
    {
      id: "idle",
      duration: 2.4,
      morph: 0.45,
      blinkIn: false,
      baseFace: true,
      baseBody: true,
      pose: () => base()
    },
    {
      id: "thinking",
      duration: 2.6,
      morph: 0.4,
      baseFace: false,
      baseBody: false,
      blinkIn: true,
      pose: (t) => {
        const mid = dotPulse(t, 1);
        const emerge = 0.3 + 0.7 * easings.easeOutCubic(clamp(t / 0.3));
        return base({
          // la boule DEVIENT le point du milieu : le morph reste continu
          sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1] }),
          eyeAlpha: 0,
          dots: [0, 2].map((i) => {
            const k = dotPulse(t, i);
            return {
              x: DOT_X[i] * emerge,
              y: 0,
              r: DOT_R * (1 + (DOT_PEAK - 1) * k),
              opacity: 0.55 + 0.45 * k
            };
          })
        });
      }
    },
    {
      id: "wink",
      duration: 1.6,
      morph: 0.3,
      blinkIn: true,
      baseFace: false,
      baseBody: true,
      pose: () => base({
        gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
        split: 16.25,
        // L'oeil ferme n'est pas l'oeil ouvert ecrase : c'est un tiret
        // horizontal PLUS LARGE que l'oeil ouvert (0.447 contre 0.236).
        eyes: [
          { w: 0.236, h: 0.464, open: 1 },
          { w: 0.447, h: 0.089, open: 1 }
        ]
      })
    },
    {
      id: "wide",
      duration: 1.8,
      morph: 0.55,
      blinkIn: true,
      baseFace: false,
      baseBody: true,
      pose: () => base({
        gaze: { yaw: 6.92, pitch: -21.96, roll: 11.6 },
        split: 18.43,
        eyes: pair2(0.356, 0.875)
      })
    },
    {
      id: "alert",
      duration: 2.4,
      // le "!" revient en place a 1.6 + 0.4
      minDuration: 2,
      morph: 0.45,
      baseFace: false,
      baseBody: false,
      blinkIn: false,
      pose: (t) => {
        const p = clamp(t / 1.5);
        const travel = easings.easeInOutCubic(p) * 0.82 - 0.087;
        const back = t > 1.6 ? clamp((t - 1.6) / 0.4) : 0;
        const x = travel * (1 - back) + 0.1 * back;
        const buzz = Math.sin(t * 2.5 * TAU) * 5e-3;
        const tilt = 17.7 * Math.PI / 180;
        return base({
          sil: barItalic({ rot: tilt, cx: x, cy: -0.325 - buzz }),
          eyeAlpha: 0,
          dots: [
            {
              // le point suit l'axe du glyphe, a 0.580 du centre de la barre
              x: x - Math.sin(tilt) * 0.58,
              y: -0.325 + Math.cos(tilt) * 0.58 + buzz * 2.8,
              r: 0.118,
              d: TEAR,
              rot: tilt * 180 / Math.PI,
              opacity: 1
            }
          ]
        });
      }
    },
    {
      id: "notify",
      duration: 2.2,
      morph: 0.5,
      blinkIn: true,
      baseFace: false,
      baseBody: true,
      pose: (t) => {
        const p = clamp(t / 0.45);
        const pop = 1 + (NOTIF_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35);
        const r = NOTIF_R * (p < 1 ? pop : 1);
        const a = NOTIF_ANGLE * Math.PI / 180;
        return base({
          // le regard part a l'oppose de la pastille
          gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 },
          split: 18.89,
          eyes: pair2(0.505, 0.498),
          notif: {
            x: Math.cos(a) * NOTIF_DIST,
            y: Math.sin(a) * NOTIF_DIST,
            r,
            notch: r + NOTIF_MARGIN
          }
        });
      }
    },
    {
      id: "exclaim",
      duration: 2,
      morph: 0.45,
      baseFace: false,
      baseBody: false,
      blinkIn: false,
      pose: () => base({
        sil: barUpright(),
        eyeAlpha: 0,
        dots: [{ x: -0.012, y: 0.526, r: 0.113, opacity: 1 }]
      })
    },
    {
      id: "sleep",
      duration: 2.4,
      morph: 0.5,
      baseFace: false,
      baseBody: false,
      blinkIn: false,
      pose: (t) => base({
        // Rebond vertical mesure : +-0.19 autour de +0.11, periode 0.6 s.
        sil: circle(0.1585, { cy: 0.11 + Math.sin(t * (TAU / 0.6)) * 0.19 }),
        eyeAlpha: 0
      })
    },
    {
      id: "egg",
      duration: 1.8,
      morph: 0.4,
      baseFace: false,
      baseBody: false,
      blinkIn: true,
      pose: () => base({
        sil: silhouette("egg"),
        gaze: { yaw: 19.97, pitch: 26.01, roll: -17.1 },
        // les yeux se resserrent comme le corps
        split: 11.07,
        eyes: pair2(0.164, 0.385)
      })
    },
    {
      id: "hexagon",
      duration: 1.6,
      morph: 0.4,
      baseFace: false,
      baseBody: false,
      blinkIn: true,
      pose: () => base({
        sil: silhouette("hexagon"),
        gaze: { yaw: 23.11, pitch: 24.42, roll: -13.3 },
        split: 13.37,
        eyes: pair2(0.177, 0.411)
      })
    },
    {
      id: "play",
      duration: 2,
      morph: 0.5,
      baseFace: false,
      baseBody: false,
      blinkIn: true,
      pose: (t) => {
        const fade = clamp(t / 0.35) * clamp((2.2 - t) / 0.5);
        return base({
          sil: spinningTriangle(0),
          gaze: { yaw: 12, pitch: -8, roll: -6 },
          split: 15,
          eyes: pair2(0.18, 0.34),
          // le bouquet balaie de la droite vers la gauche par-dessus le triangle
          arcs: SWOOSH.map((s, i) => ({
            id: `sw${i}`,
            seed: { ...s, cx: 0.45 - t * 0.42 },
            t,
            opacity: fade
          }))
        });
      }
    },
    {
      id: "orbit",
      duration: 3.4,
      // le corps a fini de se relacher du triangle vers la boule a 1.6 + 0.9
      minDuration: 2.5,
      morph: 0.6,
      baseFace: false,
      baseBody: false,
      blinkIn: false,
      pose: (t) => {
        const ramp = easings.easeInOutCubic(clamp(t / 0.35));
        const rot = -TAU * 1.25 * t * ramp;
        const back = easings.easeInOutCubic(clamp((t - 1.6) / 0.9));
        const tri = spinningTriangle(rot);
        const ball = circle(1, { rot });
        const sil = {
          radii: tri.radii.map((r, i) => r + (ball.radii[i] - r) * back),
          rot,
          cx: tri.cx * (1 - back),
          cy: tri.cy * (1 - back),
          sx: 1,
          sy: 1
        };
        const fade = clamp(t / 0.8) * clamp((3.6 - t) / 0.9);
        return base({
          sil,
          // les yeux filent autour de la sphere ~3x plus vite que la silhouette
          gaze: {
            yaw: REST_GAZE.yaw + Math.sin(t * 6.5) * 65 * (1 - back),
            pitch: -4 + back * 32,
            roll: -13
          },
          eyes: pair2(0.18, 0.34 + back * 0.07),
          // les anneaux entrent un par un sur 0.8 s
          arcs: RINGS.map((s, i) => ({
            id: `rg${i}`,
            seed: s,
            t,
            opacity: fade * clamp((t - i * 0.13) / 0.3)
          }))
        });
      }
    },
    {
      /**
       * Entree dans la vue des reglages.
       *
       * SEUL etat qui n'est pas releve sur la video : il est CHOISI, comme la
       * couleur `--ink`. Il emprunte le vocabulaire d'`orbit` — les memes anneaux,
       * avec leurs parametres mesures — mais coupe court : 1 s au lieu de 3,4, la
       * moitie des anneaux, et aucun triangle.
       *
       * Les deux drapeaux a `true` sont tout l'interet de cet etat :
       *
       * - `baseBody` laisse la forme choisie remplacer le corps, donc la vue peut
       *   imposer le cercle et le galet ou la goutte y MORPHENT au lieu de sauter ;
       * - `baseFace` fait porter le visage de repos, donc le suivi du curseur
       *   s'applique des cette entree. Un etat qui aurait sa propre pose de regard
       *   (comme `orbit`) rendrait la main a l'etat suivant en pleine course, et
       *   les yeux sauteraient d'un coup a la reprise.
       *
       * Il n'est volontairement PAS dans `SEQUENCE` : ce n'est pas une animation du
       * catalogue, c'est une transition d'interface.
       */
      id: "swirl",
      // un peu plus que le tour du regard (`TURN_TIME`, 1,1 s) : les yeux doivent
      // etre poses a gauche avant que les anneaux ne s'effacent
      duration: 1.3,
      minDuration: 1.3,
      morph: 0.3,
      baseFace: true,
      baseBody: true,
      // le morph de forme est masque par un clignement, comme partout ailleurs
      blinkIn: true,
      pose: (t) => base({
        // trois anneaux sur les six d'`orbit` : la moitie du bouquet suffit a le
        // reconnaitre, et c'est autant d'arcs en moins a rasteriser par image
        arcs: RINGS.slice(0, 3).map((s, i) => ({
          id: `sw${i}`,
          seed: s,
          t,
          // ils entrent l'un apres l'autre puis s'effacent avant la fin du bloc,
          // pour que la reprise au repos se fasse sur une image deja propre
          opacity: clamp((t - i * 0.06) / 0.14) * clamp((1.22 - t) / 0.34)
        }))
      })
    },
    {
      id: "burst",
      duration: 2.6,
      // le corps est recompose a 1.7 + 0.7
      minDuration: 2.4,
      morph: 0.4,
      baseFace: false,
      baseBody: false,
      blinkIn: false,
      pose: (t) => {
        const collapse = 1 - 0.834 * easings.easeOutQuint(clamp(t / 0.7));
        const regrow = easings.easeOutQuint(clamp((t - 1.7) / 0.7));
        return base({
          sil: circle(collapse + (1 - collapse) * regrow),
          eyeAlpha: clamp((t - 1.85) / 0.4),
          dots: particles(t, 1),
          dotsBehind: true
        });
      }
    },
    {
      id: "comet",
      duration: 2.4,
      // le point se recompose a 1.85 + 0.6 = 2.45, soit 0.05 s apres la coupe de
      // la video : ce reliquat se termine pendant le fondu suivant, comme dans la
      // reference. On ne descend donc pas sous la duree mesuree.
      minDuration: 2.4,
      morph: 0.45,
      baseFace: false,
      baseBody: false,
      blinkIn: false,
      pose: (t) => {
        const collapse = 1 - (1 - COMET_DOT) * easings.easeOutQuint(clamp(t / 0.55));
        const regrow = easings.easeOutQuint(clamp((t - 1.85) / 0.6));
        const fade = clamp((t - 0.15) / 0.25) * clamp((1.95 - t) / 0.3);
        return base({
          // Le point derive de 0.035 vers le bas puis remonte (wobble mesure).
          sil: circle(collapse + (1 - collapse) * regrow, {
            cy: Math.sin(clamp(t / 1.7) * Math.PI) * 0.035
          }),
          eyeAlpha: clamp((t - 2) / 0.35),
          arcs: COMET_RIBBONS.map((s, i) => ({ id: `cm${i}`, seed: s, t, opacity: fade }))
        });
      }
    }
  ];
  var STATE_BY_ID = new Map(STATES.map((s) => [s.id, s]));

  // src/bot/eyefit.ts
  var R = 100;
  var DERIVE_YAW = 5.5 + 1.6;
  var DERIVE_PITCH = 4.2 + 1.3;
  var DERIVE_X = 6e-3;
  var DERIVE_Y = 7e-3;
  function empreintes(visage, sil, radii) {
    const out = [];
    const poses = eyePoses(visage.gaze, R, visage.split);
    for (let i = 0; i < 2; i++) {
      const e = poses[i];
      if (e.depth <= 0.02) continue;
      const cfg = visage.eyes[i];
      const phi = (cfg.tilt ?? 0) * Math.PI / 180;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ax = e.a * cp + e.c * sp;
      const ay = e.b * cp + e.d * sp;
      const cx = -e.a * sp + e.c * cp;
      const cy = -e.b * sp + e.d * cp;
      const hw = Math.max(cfg.w * R, 0.01) / 2;
      const hh = Math.max(cfg.h * R, 0.01) / 2;
      const r = Math.min(hw, hh);
      const long = hh > hw;
      const demi = long ? hh - r : hw - r;
      const fit = radiusAtAngle(radii, Math.atan2(e.y, e.x) - sil.rot);
      out.push({
        x: e.x * fit,
        y: e.y * fit,
        ax: (long ? cx : ax) * demi,
        ay: (long ? cy : ay) * demi,
        r,
        m: [ax, ay, cx, cy]
      });
    }
    return out;
  }
  function approche(pts, x0, y0, x1, y1) {
    const sx2 = x1 - x0;
    const sy2 = y1 - y0;
    const len2 = sx2 * sx2 + sy2 * sy2;
    let best = Infinity;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let t = len2 > 0 ? ((p.x - x0) * sx2 + (p.y - y0) * sy2) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x0 + t * sx2 - p.x;
      const ey = y0 + t * sy2 - p.y;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        vx = ex;
        vy = ey;
      }
    }
    const d = Math.sqrt(best);
    return { d, ux: d > 1e-9 ? vx / d : 0, uy: d > 1e-9 ? vy / d : 0 };
  }
  var FLOTTEMENT = Math.hypot(DERIVE_X, DERIVE_Y) * R;
  function pire(pts, emps, tx, ty) {
    let marge = Infinity;
    let ux = 0;
    let uy = 0;
    for (const e of emps) {
      const x = e.x + tx;
      const y = e.y + ty;
      const a = approche(pts, x - e.ax, y - e.ay, x + e.ax, y + e.ay);
      const [m0, m1, m2, m3] = e.m;
      const rayon = e.r * Math.hypot(m0 * a.ux + m1 * a.uy, m2 * a.ux + m3 * a.uy) + FLOTTEMENT;
      if (a.d - rayon < marge) {
        marge = a.d - rayon;
        ux = a.ux;
        uy = a.uy;
      }
    }
    return { marge, ux, uy };
  }
  var DIRECTIONS = 12;
  var DICHOTOMIE = 8;
  function resous(epreuves) {
    if (!epreuves.length) return { x: 0, y: 0 };
    const marge = (tx, ty) => {
      let m = Infinity;
      for (const ep of epreuves) m = Math.min(m, pire(ep.contour, ep.empreintes, tx, ty).marge);
      return m;
    };
    let requis = Infinity;
    for (const ep of epreuves) {
      requis = Math.min(requis, pire(ep.calContour, ep.reference, 0, 0).marge);
    }
    let mx = 0;
    let my = 0;
    const emps = epreuves[0].empreintes;
    for (const e of emps) {
      mx -= e.x / emps.length;
      my -= e.y / emps.length;
    }
    const course = Math.max(0.35 * R, Math.hypot(mx, my) * 1.25);
    requis = Math.min(requis, marge(mx, my));
    const depart = marge(0, 0);
    if (depart >= requis && depart >= 0) return { x: 0, y: 0 };
    const cible = Math.max(requis, 0);
    let meilleurX = 0;
    let meilleurY = 0;
    let meilleureNorme = Infinity;
    let secoursX = 0;
    let secoursY = 0;
    let secours = depart;
    for (let d = 0; d < DIRECTIONS; d++) {
      const a = d / DIRECTIONS * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      if (marge(ux * course, uy * course) < cible) {
        for (const k of [0.3, 0.6, 1]) {
          const m = marge(ux * course * k, uy * course * k);
          if (m > secours) {
            secours = m;
            secoursX = ux * course * k;
            secoursY = uy * course * k;
          }
        }
        continue;
      }
      let bas = 0;
      let haut = course;
      for (let i = 0; i < DICHOTOMIE; i++) {
        const mid = (bas + haut) / 2;
        if (marge(ux * mid, uy * mid) >= cible) haut = mid;
        else bas = mid;
      }
      if (haut < meilleureNorme) {
        meilleureNorme = haut;
        meilleurX = ux * haut;
        meilleurY = uy * haut;
      }
    }
    const x = meilleureNorme === Infinity ? secoursX : meilleurX;
    const y = meilleureNorme === Infinity ? secoursY : meilleurY;
    return { x: +(x / R).toFixed(6), y: +(y / R).toFixed(6) };
  }
  function visageDe(def, pose, expr) {
    if (def.baseFace && expr) return { gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
    return { gaze: pose.gaze, split: pose.split, eyes: pose.eyes };
  }
  function dates(def) {
    const signature = (p) => JSON.stringify([p.gaze, p.split, p.eyes, p.sil.rot, p.sil.cx, p.sil.cy, p.sil.sx, p.sil.sy]);
    if (signature(def.pose(0)) === signature(def.pose(def.duration))) return [0];
    const n = 3;
    return Array.from({ length: n }, (_, i) => i / (n - 1) * def.duration);
  }
  function decalagePour(def, radii, expr) {
    const epreuves = [];
    for (const t of dates(def)) {
      const pose = def.pose(t);
      const contour = toPoints({ ...pose.sil, radii }, R);
      const calContour = toPoints(pose.sil, R);
      const v = visageDe(def, pose, expr);
      const coins = [];
      for (const dy of [-DERIVE_YAW, DERIVE_YAW]) {
        for (const dp of [-DERIVE_PITCH, DERIVE_PITCH]) {
          coins.push({
            ...v,
            gaze: { yaw: v.gaze.yaw + dy, pitch: v.gaze.pitch + dp, roll: v.gaze.roll }
          });
        }
      }
      for (const c of coins) {
        epreuves.push({
          empreintes: empreintes(c, pose.sil, radii),
          reference: empreintes(c, pose.sil, pose.sil.radii),
          contour,
          calContour
        });
      }
    }
    return resous(epreuves);
  }
  var NUL = { x: 0, y: 0 };
  var clef = (state, expr) => `${state}|${expr ?? ""}`;
  function batir() {
    return new Map(
      SHAPES.map((forme) => {
        const par = /* @__PURE__ */ new Map();
        for (const def of STATES) {
          if (!def.baseBody) continue;
          const expressions = def.baseFace ? [null, ...EXPRESSIONS] : [null];
          for (const expr of expressions) {
            par.set(clef(def.id, expr?.id ?? null), decalagePour(def, forme.radii, expr));
          }
        }
        return [forme.radii, par];
      })
    );
  }
  var DECALAGES = batir();
  function decalageDesYeux(radii, state, expr) {
    if (!radii) return NUL;
    const par = DECALAGES.get(radii);
    if (!par) return NUL;
    return par.get(clef(state, expr)) ?? par.get(clef(state, null)) ?? NUL;
  }

  // src/bot/engine.ts
  var NO_LOOK = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 };
  var lerpLook = (a, b, t) => ({
    yaw: lerp(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    mix: lerp(a.mix, b.mix, t),
    spin: lerp(a.spin, b.spin, t),
    wander: lerp(a.wander, b.wander, t)
  });
  var lerpEye = (a, b, t) => ({
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    open: lerp(a.open, b.open, t),
    tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t)
  });
  function blendPose(a, b, t) {
    const out = 1 - t;
    return {
      sil: blend(a.sil, b.sil, t),
      offX: lerp(a.offX, b.offX, t),
      offY: lerp(a.offY, b.offY, t),
      gaze: {
        yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
        pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
        roll: lerp(a.gaze.roll, b.gaze.roll, t)
      },
      split: lerp(a.split, b.split, t),
      eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
      eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
      bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
      dots: [
        ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
        ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t }))
      ],
      arcs: [
        ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
        ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t }))
      ],
      // la pastille appartient a un seul des deux etats, elle ne se melange pas
      notif: t < 0.5 ? a.notif : b.notif,
      dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind
    };
  }
  var _BotEngine = class _BotEngine {
    constructor(scale = 100, initial = "idle", shape = null, expression = null) {
      /** rayon de la boule au repos, en unites de viewBox */
      __publicField(this, "scale");
      __publicField(this, "cur");
      __publicField(this, "prev", null);
      /**
       * Pose de depart FIGEE, posee seulement quand un changement d'etat arrive alors qu'un
       * fondu est deja en cours. Cf. `setState`.
       */
      __publicField(this, "departFige", null);
      __publicField(this, "tCur", 0);
      __publicField(this, "tPrev", 0);
      __publicField(this, "blinkAt", -10);
      __publicField(this, "pts", []);
      __publicField(this, "shape", null);
      __publicField(this, "shapePrev", null);
      __publicField(this, "shapeAt", -10);
      __publicField(this, "expr", null);
      __publicField(this, "exprPrev", null);
      __publicField(this, "exprAt", -10);
      __publicField(this, "look", NO_LOOK);
      __publicField(this, "lookPrev", NO_LOOK);
      __publicField(this, "lookAt", -10);
      /** duree de rattrapage en cours ; voir `LOOK_MORPH`, sa valeur par defaut */
      __publicField(this, "lookMorph", 0.24);
      this.scale = scale;
      this.cur = initial;
      this.shape = shape;
      this.expr = expression;
    }
    /**
     * Expression de repos choisie dans le personnalisateur. Comme la forme, elle
     * glisse vers la nouvelle valeur au lieu de sauter.
     */
    setExpression(expression, now = 0) {
      if (expression === this.expr) return;
      this.exprPrev = this.expr;
      this.expr = expression;
      this.exprAt = now;
    }
    /** Expression effective a l'instant `now`, morph en cours compris. */
    exprAtTime(now) {
      const to = this.expr;
      const from = this.exprPrev;
      if (!to || !from) return to;
      const k = (now - this.exprAt) / _BotEngine.SHAPE_MORPH;
      if (k >= 1) return to;
      return blendExpression(from, to, easings.easeOutQuint(clamp(k)));
    }
    /**
     * Forme choisie dans le personnalisateur. Elle ne remplace le corps que sur
     * les etats au repos (`baseBody`) : sur les autres, la silhouette EST
     * l'animation et ne doit pas etre ecrasee.
     *
     * Le changement se fait en morph, pas d'un coup : comme toutes les formes sont
     * echantillonnees aux memes angles, il suffit d'interpoler les rayons.
     */
    setShape(radii, now = 0) {
      if (radii === this.shape) return;
      this.shapePrev = this.shape;
      this.shape = radii;
      this.shapeAt = now;
    }
    /**
     * Forme effective a l'instant `now`, morph en cours compris.
     *
     * Ne remet PAS `shapePrev` a null en fin de morph : `sample` doit rester une
     * fonction pure du temps, donc relire une date passee doit redonner l'image
     * intermediaire. On garde juste une reference de plus.
     */
    shapeAtTime(now) {
      const to = this.shape;
      const from = this.shapePrev;
      if (!to || !from) return to;
      const k = (now - this.shapeAt) / _BotEngine.SHAPE_MORPH;
      if (k >= 1) return to;
      const t = easings.easeOutQuint(clamp(k));
      return to.map((r, i) => lerp(from[i] ?? r, r, t));
    }
    /**
     * Nouvelle cible de regard, `null` pour revenir a celui de l'etat.
     *
     * Elle repart de la valeur COURANTE, et non de la cible precedente comme
     * `setShape` : cette methode est appelee a chaque mouvement de pointeur, et
     * repartir de l'ancienne cible ferait reculer le regard d'un cran avant
     * chaque rattrapage — le suivi tremblerait au lieu de glisser.
     *
     * Meme contrat que `setShape` par ailleurs : l'etat externe entre par un
     * setter horodate, jamais par une variable lue pendant `sample`, sinon le
     * moteur cesse d'etre une fonction pure du temps.
     */
    setLook(look, now, morph = _BotEngine.LOOK_MORPH) {
      if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.spin + look.wander)) {
        return;
      }
      this.lookPrev = this.lookAtTime(now);
      this.look = look ?? NO_LOOK;
      this.lookAt = now;
      this.lookMorph = morph;
    }
    /** Regard effectif a l'instant `now`, rattrapage en cours compris. */
    lookAtTime(now) {
      const k = (now - this.lookAt) / this.lookMorph;
      if (k >= 1) return this.look;
      return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k)));
    }
    posed(def, t, shape, expr) {
      let pose = def.pose(t);
      if (def.baseBody && shape) {
        pose = { ...pose, sil: { ...pose.sil, radii: shape } };
      }
      if (def.baseFace && expr) {
        pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
      }
      return pose;
    }
    /**
     * Decalage des yeux a l'instant `now` pour un etat donne, en unites de rayon de boule.
     *
     * Il est LU dans une table et interpole, jamais recalcule : `eyefit.ts` explique
     * pourquoi cette distinction est tout le correctif. Ici il ne reste qu'a l'interpoler
     * sur l'axe de la forme, avec exactement la courbe et la duree du morph de silhouette
     * — c'est la meme cause, donc ce doit etre le meme mouvement.
     *
     * On interroge la table sur les BORNES du morph (`shapePrev` et `shape`) et non sur le
     * profil que rend `shapeAtTime` : celui-la est un tableau neuf alloue a chaque image,
     * donc sans identite, et il n'existe dans aucune table.
     */
    decalageAtTime(now, state) {
      const surAxe = (debut, duree, a, b) => {
        if (a === b) return b;
        const k = (now - debut) / duree;
        if (k >= 1) return b;
        const t = easings.easeOutQuint(clamp(k));
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      };
      const parForme = (radii) => surAxe(
        this.exprAt,
        _BotEngine.SHAPE_MORPH,
        decalageDesYeux(radii, state, this.exprPrev?.id ?? null),
        decalageDesYeux(radii, state, this.expr?.id ?? null)
      );
      return surAxe(
        this.shapeAt,
        _BotEngine.SHAPE_MORPH,
        parForme(this.shapePrev),
        parForme(this.shape)
      );
    }
    get state() {
      return this.cur;
    }
    /**
     * Repart sur `id` SANS etat precedent, comme un moteur neuf pose sur cet etat.
     *
     * C'est ce que veut dire « rembobiner » pour ce moteur. `setState` seul ne peut pas le
     * faire : il garde l'etat quitte pour le fondre, ce qui est exactement son role en
     * lecture, et exactement ce qu'il ne faut pas quand on revient au debut d'une sequence.
     * Rejouer l'image 0 apres une passe complete melangeait le premier etat avec le DERNIER,
     * et l'export GIF s'ouvrait sur une boule sans yeux — la comete a un `eyeAlpha` nul.
     *
     * `sample` reste une fonction pure du temps : comme `setState`, ceci est un setter DATE,
     * appele par le pilote de la sequence, jamais pendant un echantillonnage.
     */
    reset(id, now) {
      this.cur = id;
      this.prev = null;
      this.departFige = null;
      this.tCur = now;
      this.tPrev = now;
      this.blinkAt = -10;
    }
    /**
     * Origine du fondu en cours : la pose figee s'il y en a une, sinon l'etat quitte evalue
     * a son propre temps ecoule — donc encore en train de s'animer, ce qui est voulu.
     */
    origine(now, shape, expr) {
      if (this.departFige) return this.departFige;
      if (!this.prev) return null;
      const prevDef = STATE_BY_ID.get(this.prev);
      return this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr);
    }
    /**
     * Pose composite a l'instant `now`, fondu en cours compris : exactement ce que `sample`
     * melange, avant la couche de vie au repos et de regard. Extraite pour que `setState`
     * puisse la figer.
     */
    poseComposee(now) {
      const def = STATE_BY_ID.get(this.cur);
      const shape = this.shapeAtTime(now);
      const expr = this.exprAtTime(now);
      const pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
      const since = now - this.tCur;
      if (since >= def.morph) return pose;
      const origine = this.origine(now, shape, expr);
      if (!origine) return pose;
      return blendPose(origine, pose, easings.easeOutQuint(clamp(since / def.morph)));
    }
    /**
     * Changement d'etat, date.
     *
     * Le moteur ne garde qu'UNE case d'historique, donc un changement qui arrive pendant un
     * fondu remplacait l'origine du melange par la pose PLEINE de l'etat qu'on quittait, au
     * lieu de l'image partiellement melangee qui etait a l'ecran. Mesure sur
     * `idle -> wide -> idle` a 100 ms : 35,9 px de saut contre 8,0 px de mouvement normal.
     *
     * On fige donc la pose composite courante et on melange depuis elle. Continu par
     * construction, quel que soit le nombre de changements enchaines.
     *
     * Et SEULEMENT dans ce cas. Figer a chaque changement arreterait net l'animation de
     * l'etat qu'on quitte pendant tout le fondu — le « ! » d'`alert` se figerait en pleine
     * course — alors qu'il n'y a rien a corriger hors morph : l'etat quitte y est deja
     * exactement l'image affichee. La lecture d'un montage, dont les blocs durent au moins
     * le plus long fondu (`MIN_BLOCK`), ne fige donc jamais rien et rend au bit ce qu'elle
     * rendait.
     */
    setState(id, now) {
      if (id === this.cur) return;
      const morph = STATE_BY_ID.get(this.cur).morph;
      const enPleinFondu = this.prev !== null && now - this.tCur < morph;
      this.departFige = enPleinFondu ? this.poseComposee(now) : null;
      this.prev = this.cur;
      this.tPrev = this.tCur;
      this.cur = id;
      this.tCur = now;
      if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now;
    }
    sample(now) {
      const R3 = this.scale;
      const def = STATE_BY_ID.get(this.cur);
      const shape = this.shapeAtTime(now);
      const expr = this.exprAtTime(now);
      let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
      let decalage = this.decalageAtTime(now, this.cur);
      const since = now - this.tCur;
      const origine = since < def.morph ? this.origine(now, shape, expr) : null;
      if (origine) {
        const ratio = easings.easeOutQuint(clamp(since / def.morph));
        pose = blendPose(origine, pose, ratio);
        const quitte = this.prev;
        if (quitte) {
          const avant = this.decalageAtTime(now, quitte);
          decalage = {
            x: lerp(avant.x, decalage.x, ratio),
            y: lerp(avant.y, decalage.y, ratio)
          };
        }
      }
      const alive = pose.eyeAlpha > 0.01;
      const look = this.lookAtTime(now);
      const life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive });
      const gaze = {
        // Les deux visees REMPLACENT celles de la pose au lieu de s'y ajouter (voir
        // `Look`), et le tour se retranche en chemin. La derive s'ajoute APRES le
        // melange, sinon la cible l'annulerait en meme temps que la pose — or elle
        // doit survivre a une tete tournee sans pointeur.
        yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin,
        pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
        // le roulis, lui, ne suit rien : la tete du bot est penchee de -13deg dans
        // la video, et la faire rouler avec le curseur casse cette signature
        roll: pose.gaze.roll + life.dRoll
      };
      const forced = clamp((now - this.blinkAt) / 0.2);
      const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;
      const lid = Math.min(life.lid, forcedLid);
      const offX = pose.offX + life.driftX;
      const offY = pose.offY + life.driftY;
      const sil = {
        ...pose.sil,
        cx: pose.sil.cx + offX,
        cy: pose.sil.cy + offY,
        sy: pose.sil.sy * life.breath
      };
      const bodyPath = closedPath(toPoints(sil, R3, this.pts));
      const bodyRadius = (x, y) => radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);
      const eyes = [];
      if (pose.eyeAlpha > 0.01) {
        const poses = eyePoses(gaze, R3, pose.split);
        for (let i = 0; i < 2; i++) {
          const e = poses[i];
          if (e.depth <= 0.02) continue;
          const cfg = pose.eyes[i];
          const fit = bodyRadius(e.x, e.y);
          const phi = (cfg.tilt ?? 0) * Math.PI / 180;
          const cp = Math.cos(phi);
          const sp = Math.sin(phi);
          const ax = e.a * cp + e.c * sp;
          const ay = e.b * cp + e.d * sp;
          const cx2 = -e.a * sp + e.c * cp;
          const cy2 = -e.b * sp + e.d * cp;
          const k = blinkScale(Math.min(lid, cfg.open));
          eyes.push({
            d: capsulePath(cfg.w * R3, cfg.h * R3),
            matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx2)},${r2(cy2 * k)},${r2(e.x * fit + (offX + decalage.x) * R3)},${r2(e.y * fit + (offY + decalage.y) * R3)})`,
            alpha: pose.eyeAlpha * clamp(e.depth / 0.12)
          });
        }
      }
      const dots = pose.dots.filter((p) => p.opacity > 0.01 && p.r > 5e-4).map((p) => ({ ...p, x: (p.x + offX) * R3, y: (p.y + offY) * R3, r: p.r * R3 }));
      const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1;
      const nx = pose.notif ? (pose.notif.x * nFit + offX) * R3 : 0;
      const ny = pose.notif ? (pose.notif.y * nFit + offY) * R3 : 0;
      const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R3 } : null;
      const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R3 } : null;
      return {
        bodyPath,
        bodyAlpha: pose.bodyAlpha,
        eyes,
        dots,
        dotsBehind: pose.dotsBehind,
        // Les etats declarent des arcs en unites de rayon de boule ; le moteur
        // est le seul a connaitre l'echelle du viewBox, donc c'est lui qui trace.
        arcs: pose.arcs.filter((a) => a.opacity > 0.01).map((a) => arcRender(a.seed, a.t, R3, a.id, a.opacity)),
        notif,
        notch
      };
    }
  };
  /** duree du morph quand on change la forme du corps */
  __publicField(_BotEngine, "SHAPE_MORPH", 0.45);
  /**
   * Duree de rattrapage du regard vers la cible. Plus court que `SHAPE_MORPH` :
   * un regard qui suit doit paraitre attentif, pas visqueux. Comme la cible est
   * reposee a chaque mouvement de souris, c'est cette duree qui donne au suivi
   * son inertie — le regard n'atteint jamais tout a fait un curseur qui bouge.
   */
  __publicField(_BotEngine, "LOOK_MORPH", 0.24);
  var BotEngine = _BotEngine;

  // src/bot/repere.ts
  var RAYON = 100;
  var DEMI_VIEWBOX = 158;

  // node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
  function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }
  function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  }

  // node_modules/@tauri-apps/api/core.js
  var _Channel_onmessage;
  var _Channel_nextMessageIndex;
  var _Channel_pendingMessages;
  var _Channel_messageEndIndex;
  var _Resource_rid;
  var SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
  function transformCallback(callback, once2 = false) {
    return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
  }
  var Channel = class {
    constructor(onmessage) {
      _Channel_onmessage.set(this, void 0);
      _Channel_nextMessageIndex.set(this, 0);
      _Channel_pendingMessages.set(this, []);
      _Channel_messageEndIndex.set(this, void 0);
      __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
      }), "f");
      this.id = transformCallback((rawMessage) => {
        const index = rawMessage.index;
        if ("end" in rawMessage) {
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            this.cleanupCallback();
          } else {
            __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
          }
          return;
        }
        const message = rawMessage.message;
        if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
          __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
          while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
            const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
            __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
            delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
          }
          if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
            this.cleanupCallback();
          }
        } else {
          __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
        }
      });
    }
    cleanupCallback() {
      window.__TAURI_INTERNALS__.unregisterCallback(this.id);
    }
    set onmessage(handler) {
      __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
    }
    get onmessage() {
      return __classPrivateFieldGet(this, _Channel_onmessage, "f");
    }
    [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
      return `__CHANNEL__:${this.id}`;
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };
  async function invoke(cmd, args = {}, options) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
  }
  var Resource = class {
    get rid() {
      return __classPrivateFieldGet(this, _Resource_rid, "f");
    }
    constructor(rid) {
      _Resource_rid.set(this, void 0);
      __classPrivateFieldSet(this, _Resource_rid, rid, "f");
    }
    /**
     * Destroys and cleans up this resource from memory.
     * **You should not call any method on this object anymore and should drop any reference to it.**
     */
    async close() {
      return invoke("plugin:resources|close", {
        rid: this.rid
      });
    }
  };
  _Resource_rid = /* @__PURE__ */ new WeakMap();

  // node_modules/@tauri-apps/api/event.js
  var TauriEvent;
  (function(TauriEvent2) {
    TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
    TauriEvent2["WINDOW_MOVED"] = "tauri://move";
    TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
    TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
    TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
    TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
    TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
    TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
    TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
    TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
    TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
    TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
    TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
    TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
    TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
    TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
  })(TauriEvent || (TauriEvent = {}));
  async function _unlisten(event, eventId) {
    window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
    await invoke("plugin:event|unlisten", {
      event,
      eventId
    });
  }
  async function listen(event, handler, options) {
    var _a;
    const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
    return invoke("plugin:event|listen", {
      event,
      target,
      handler: transformCallback(handler)
    }).then((eventId) => {
      return async () => _unlisten(event, eventId);
    });
  }
  async function once(event, handler, options) {
    return listen(event, (eventData) => {
      void _unlisten(event, eventData.id);
      handler(eventData);
    }, options);
  }
  async function emit(event, payload) {
    await invoke("plugin:event|emit", {
      event,
      payload
    });
  }
  async function emitTo(target, event, payload) {
    const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
    await invoke("plugin:event|emit_to", {
      target: eventTarget,
      event,
      payload
    });
  }

  // node_modules/@tauri-apps/api/dpi.js
  var LogicalSize = class {
    constructor(...args) {
      this.type = "Logical";
      if (args.length === 1) {
        if ("Logical" in args[0]) {
          this.width = args[0].Logical.width;
          this.height = args[0].Logical.height;
        } else {
          this.width = args[0].width;
          this.height = args[0].height;
        }
      } else {
        this.width = args[0];
        this.height = args[1];
      }
    }
    /**
     * Converts the logical size to a physical one.
     * @example
     * ```typescript
     * import { LogicalSize } from '@tauri-apps/api/dpi';
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     *
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const size = new LogicalSize(400, 500);
     * const physical = size.toPhysical(factor);
     * ```
     *
     * @since 2.0.0
     */
    toPhysical(scaleFactor) {
      return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        width: this.width,
        height: this.height
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };
  var PhysicalSize = class {
    constructor(...args) {
      this.type = "Physical";
      if (args.length === 1) {
        if ("Physical" in args[0]) {
          this.width = args[0].Physical.width;
          this.height = args[0].Physical.height;
        } else {
          this.width = args[0].width;
          this.height = args[0].height;
        }
      } else {
        this.width = args[0];
        this.height = args[1];
      }
    }
    /**
     * Converts the physical size to a logical one.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const size = await appWindow.innerSize(); // PhysicalSize
     * const logical = size.toLogical(factor);
     * ```
     */
    toLogical(scaleFactor) {
      return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        width: this.width,
        height: this.height
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };
  var Size = class {
    constructor(size) {
      this.size = size;
    }
    toLogical(scaleFactor) {
      return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
    }
    toPhysical(scaleFactor) {
      return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        [`${this.size.type}`]: {
          width: this.size.width,
          height: this.size.height
        }
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };
  var LogicalPosition = class {
    constructor(...args) {
      this.type = "Logical";
      if (args.length === 1) {
        if ("Logical" in args[0]) {
          this.x = args[0].Logical.x;
          this.y = args[0].Logical.y;
        } else {
          this.x = args[0].x;
          this.y = args[0].y;
        }
      } else {
        this.x = args[0];
        this.y = args[1];
      }
    }
    /**
     * Converts the logical position to a physical one.
     * @example
     * ```typescript
     * import { LogicalPosition } from '@tauri-apps/api/dpi';
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     *
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const position = new LogicalPosition(400, 500);
     * const physical = position.toPhysical(factor);
     * ```
     *
     * @since 2.0.0
     */
    toPhysical(scaleFactor) {
      return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        x: this.x,
        y: this.y
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };
  var PhysicalPosition = class {
    constructor(...args) {
      this.type = "Physical";
      if (args.length === 1) {
        if ("Physical" in args[0]) {
          this.x = args[0].Physical.x;
          this.y = args[0].Physical.y;
        } else {
          this.x = args[0].x;
          this.y = args[0].y;
        }
      } else {
        this.x = args[0];
        this.y = args[1];
      }
    }
    /**
     * Converts the physical position to a logical one.
     * @example
     * ```typescript
     * import { PhysicalPosition } from '@tauri-apps/api/dpi';
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     *
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const position = new PhysicalPosition(400, 500);
     * const physical = position.toLogical(factor);
     * ```
     *
     * @since 2.0.0
     */
    toLogical(scaleFactor) {
      return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        x: this.x,
        y: this.y
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };
  var Position = class {
    constructor(position) {
      this.position = position;
    }
    toLogical(scaleFactor) {
      return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
    }
    toPhysical(scaleFactor) {
      return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        [`${this.position.type}`]: {
          x: this.position.x,
          y: this.position.y
        }
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  };

  // node_modules/@tauri-apps/api/image.js
  var Image = class _Image extends Resource {
    /**
     * Creates an Image from a resource ID. For internal use only.
     *
     * @ignore
     */
    constructor(rid) {
      super(rid);
    }
    /** Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height. */
    static async new(rgba, width, height) {
      return invoke("plugin:image|new", {
        rgba: transformImage(rgba),
        width,
        height
      }).then((rid) => new _Image(rid));
    }
    /**
     * Creates a new image using the provided bytes by inferring the file format.
     * If the format is known, prefer [@link Image.fromPngBytes] or [@link Image.fromIcoBytes].
     *
     * Only `ico` and `png` are supported (based on activated feature flag).
     *
     * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     */
    static async fromBytes(bytes) {
      return invoke("plugin:image|from_bytes", {
        bytes: transformImage(bytes)
      }).then((rid) => new _Image(rid));
    }
    /**
     * Creates a new image using the provided path.
     *
     * Only `ico` and `png` are supported (based on activated feature flag).
     *
     * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     */
    static async fromPath(path) {
      return invoke("plugin:image|from_path", { path }).then((rid) => new _Image(rid));
    }
    /** Returns the RGBA data for this image, in row-major order from top to bottom.  */
    async rgba() {
      return invoke("plugin:image|rgba", {
        rid: this.rid
      }).then((buffer) => new Uint8Array(buffer));
    }
    /** Returns the size of this image.  */
    async size() {
      return invoke("plugin:image|size", { rid: this.rid });
    }
  };
  function transformImage(image) {
    const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image ? image.rid : image;
    return ret;
  }

  // node_modules/@tauri-apps/api/window.js
  var UserAttentionType;
  (function(UserAttentionType2) {
    UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
    UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
  })(UserAttentionType || (UserAttentionType = {}));
  var CloseRequestedEvent = class {
    constructor(event) {
      this._preventDefault = false;
      this.event = event.event;
      this.id = event.id;
    }
    preventDefault() {
      this._preventDefault = true;
    }
    isPreventDefault() {
      return this._preventDefault;
    }
  };
  var ProgressBarStatus;
  (function(ProgressBarStatus2) {
    ProgressBarStatus2["None"] = "none";
    ProgressBarStatus2["Normal"] = "normal";
    ProgressBarStatus2["Indeterminate"] = "indeterminate";
    ProgressBarStatus2["Paused"] = "paused";
    ProgressBarStatus2["Error"] = "error";
  })(ProgressBarStatus || (ProgressBarStatus = {}));
  function getCurrentWindow() {
    return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    });
  }
  async function getAllWindows() {
    return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    })));
  }
  var localTauriEvents = ["tauri://created", "tauri://error"];
  var Window = class {
    /**
     * Creates a new Window.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window';
     * const appWindow = new Window('my-label');
     * appWindow.once('tauri://created', function () {
     *  // window successfully created
     * });
     * appWindow.once('tauri://error', function (e) {
     *  // an error happened creating the window
     * });
     * ```
     *
     * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
     * @returns The {@link Window} instance to communicate with the window.
     */
    constructor(label, options = {}) {
      var _a;
      this.label = label;
      this.listeners = /* @__PURE__ */ Object.create(null);
      if (!(options === null || options === void 0 ? void 0 : options.skip)) {
        invoke("plugin:window|create", {
          options: {
            ...options,
            parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
            label
          }
        }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
      }
    }
    /**
     * Gets the Window associated with the given label.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window';
     * const mainWindow = Window.getByLabel('main');
     * ```
     *
     * @param label The window label.
     * @returns The Window instance to communicate with the window or null if the window doesn't exist.
     */
    static async getByLabel(label) {
      var _a;
      return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Get an instance of `Window` for the current window.
     */
    static getCurrent() {
      return getCurrentWindow();
    }
    /**
     * Gets a list of instances of `Window` for all available windows.
     */
    static async getAll() {
      return getAllWindows();
    }
    /**
     *  Gets the focused window.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window';
     * const focusedWindow = Window.getFocusedWindow();
     * ```
     *
     * @returns The Window instance or `undefined` if there is not any focused window.
     */
    static async getFocusedWindow() {
      for (const w of await getAllWindows()) {
        if (await w.isFocused()) {
          return w;
        }
      }
      return null;
    }
    /**
     * Listen to an emitted event on this window.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
     *   console.log(`Got error: ${payload}`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async listen(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return listen(event, handler, {
        target: { kind: "Window", label: this.label }
      });
    }
    /**
     * Listen to an emitted event on this window only once.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
     *   console.log(`Window initialized!`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async once(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return once(event, handler, {
        target: { kind: "Window", label: this.label }
      });
    }
    /**
     * Emits an event to all {@link EventTarget|targets}.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emit(event, payload) {
      if (localTauriEvents.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({
            event,
            id: -1,
            payload
          });
        }
        return;
      }
      return emit(event, payload);
    }
    /**
     * Emits an event to all {@link EventTarget|targets} matching the given target.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().emit('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emitTo(target, event, payload) {
      if (localTauriEvents.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({
            event,
            id: -1,
            payload
          });
        }
        return;
      }
      return emitTo(target, event, payload);
    }
    /** @ignore */
    _handleTauriEvent(event, handler) {
      if (localTauriEvents.includes(event)) {
        if (!(event in this.listeners)) {
          this.listeners[event] = [handler];
        } else {
          this.listeners[event].push(handler);
        }
        return true;
      }
      return false;
    }
    // Getters
    /**
     * The scale factor that can be used to map physical pixels to logical pixels.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const factor = await getCurrentWindow().scaleFactor();
     * ```
     *
     * @returns The window's monitor scale factor.
     */
    async scaleFactor() {
      return invoke("plugin:window|scale_factor", {
        label: this.label
      });
    }
    /**
     * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const position = await getCurrentWindow().innerPosition();
     * ```
     *
     * @returns The window's inner position.
     */
    async innerPosition() {
      return invoke("plugin:window|inner_position", {
        label: this.label
      }).then((p) => new PhysicalPosition(p));
    }
    /**
     * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const position = await getCurrentWindow().outerPosition();
     * ```
     *
     * @returns The window's outer position.
     */
    async outerPosition() {
      return invoke("plugin:window|outer_position", {
        label: this.label
      }).then((p) => new PhysicalPosition(p));
    }
    /**
     * The physical size of the window's client area.
     * The client area is the content of the window, excluding the title bar and borders.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const size = await getCurrentWindow().innerSize();
     * ```
     *
     * @returns The window's inner size.
     */
    async innerSize() {
      return invoke("plugin:window|inner_size", {
        label: this.label
      }).then((s) => new PhysicalSize(s));
    }
    /**
     * The physical size of the entire window.
     * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const size = await getCurrentWindow().outerSize();
     * ```
     *
     * @returns The window's outer size.
     */
    async outerSize() {
      return invoke("plugin:window|outer_size", {
        label: this.label
      }).then((s) => new PhysicalSize(s));
    }
    /**
     * Gets the window's current fullscreen state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const fullscreen = await getCurrentWindow().isFullscreen();
     * ```
     *
     * @returns Whether the window is in fullscreen mode or not.
     */
    async isFullscreen() {
      return invoke("plugin:window|is_fullscreen", {
        label: this.label
      });
    }
    /**
     * Gets the window's current minimized state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const minimized = await getCurrentWindow().isMinimized();
     * ```
     */
    async isMinimized() {
      return invoke("plugin:window|is_minimized", {
        label: this.label
      });
    }
    /**
     * Gets the window's current maximized state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const maximized = await getCurrentWindow().isMaximized();
     * ```
     *
     * @returns Whether the window is maximized or not.
     */
    async isMaximized() {
      return invoke("plugin:window|is_maximized", {
        label: this.label
      });
    }
    /**
     * Gets the window's current focus state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const focused = await getCurrentWindow().isFocused();
     * ```
     *
     * @returns Whether the window is focused or not.
     */
    async isFocused() {
      return invoke("plugin:window|is_focused", {
        label: this.label
      });
    }
    /**
     * Gets the window's current decorated state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const decorated = await getCurrentWindow().isDecorated();
     * ```
     *
     * @returns Whether the window is decorated or not.
     */
    async isDecorated() {
      return invoke("plugin:window|is_decorated", {
        label: this.label
      });
    }
    /**
     * Gets the window's current resizable state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const resizable = await getCurrentWindow().isResizable();
     * ```
     *
     * @returns Whether the window is resizable or not.
     */
    async isResizable() {
      return invoke("plugin:window|is_resizable", {
        label: this.label
      });
    }
    /**
     * Gets the window's native maximize button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const maximizable = await getCurrentWindow().isMaximizable();
     * ```
     *
     * @returns Whether the window's native maximize button is enabled or not.
     */
    async isMaximizable() {
      return invoke("plugin:window|is_maximizable", {
        label: this.label
      });
    }
    /**
     * Gets the window's native minimize button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const minimizable = await getCurrentWindow().isMinimizable();
     * ```
     *
     * @returns Whether the window's native minimize button is enabled or not.
     */
    async isMinimizable() {
      return invoke("plugin:window|is_minimizable", {
        label: this.label
      });
    }
    /**
     * Gets the window's native close button state.
     *
     * #### Platform-specific
     *
     * - **iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const closable = await getCurrentWindow().isClosable();
     * ```
     *
     * @returns Whether the window's native close button is enabled or not.
     */
    async isClosable() {
      return invoke("plugin:window|is_closable", {
        label: this.label
      });
    }
    /**
     * Gets the window's current visible state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const visible = await getCurrentWindow().isVisible();
     * ```
     *
     * @returns Whether the window is visible or not.
     */
    async isVisible() {
      return invoke("plugin:window|is_visible", {
        label: this.label
      });
    }
    /**
     * Gets the window's current title.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const title = await getCurrentWindow().title();
     * ```
     */
    async title() {
      return invoke("plugin:window|title", {
        label: this.label
      });
    }
    /**
     * Gets the window's current theme.
     *
     * #### Platform-specific
     *
     * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const theme = await getCurrentWindow().theme();
     * ```
     *
     * @returns The window theme.
     */
    async theme() {
      return invoke("plugin:window|theme", {
        label: this.label
      });
    }
    /**
     * Whether the window is configured to be always on top of other windows or not.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
     * ```
     *
     * @returns Whether the window is visible or not.
     */
    async isAlwaysOnTop() {
      return invoke("plugin:window|is_always_on_top", {
        label: this.label
      });
    }
    async activityName() {
      return invoke("plugin:window|activity_name", {
        label: this.label
      });
    }
    async sceneIdentifier() {
      return invoke("plugin:window|scene_identifier", {
        label: this.label
      });
    }
    // Setters
    /**
     * Centers the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().center();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async center() {
      return invoke("plugin:window|center", {
        label: this.label
      });
    }
    /**
     *  Requests user attention to the window, this has no effect if the application
     * is already focused. How requesting for user attention manifests is platform dependent,
     * see `UserAttentionType` for details.
     *
     * Providing `null` will unset the request for user attention. Unsetting the request for
     * user attention might not be done automatically by the WM when the window receives input.
     *
     * #### Platform-specific
     *
     * - **macOS:** `null` has no effect.
     * - **Linux:** Urgency levels have the same effect.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().requestUserAttention();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async requestUserAttention(requestType) {
      let requestType_ = null;
      if (requestType) {
        if (requestType === UserAttentionType.Critical) {
          requestType_ = { type: "Critical" };
        } else {
          requestType_ = { type: "Informational" };
        }
      }
      return invoke("plugin:window|request_user_attention", {
        label: this.label,
        value: requestType_
      });
    }
    /**
     * Updates the window resizable flag.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setResizable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setResizable(resizable) {
      return invoke("plugin:window|set_resizable", {
        label: this.label,
        value: resizable
      });
    }
    /**
     * Enable or disable the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setEnabled(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.0.0
     */
    async setEnabled(enabled) {
      return invoke("plugin:window|set_enabled", {
        label: this.label,
        value: enabled
      });
    }
    /**
     * Whether the window is enabled or disabled.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setEnabled(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.0.0
     */
    async isEnabled() {
      return invoke("plugin:window|is_enabled", {
        label: this.label
      });
    }
    /**
     * Sets whether the window's native maximize button is enabled or not.
     * If resizable is set to false, this setting is ignored.
     *
     * #### Platform-specific
     *
     * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMaximizable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMaximizable(maximizable) {
      return invoke("plugin:window|set_maximizable", {
        label: this.label,
        value: maximizable
      });
    }
    /**
     * Sets whether the window's native minimize button is enabled or not.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMinimizable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMinimizable(minimizable) {
      return invoke("plugin:window|set_minimizable", {
        label: this.label,
        value: minimizable
      });
    }
    /**
     * Sets whether the window's native close button is enabled or not.
     *
     * #### Platform-specific
     *
     * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
     * - **iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setClosable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setClosable(closable) {
      return invoke("plugin:window|set_closable", {
        label: this.label,
        value: closable
      });
    }
    /**
     * Sets the window title.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setTitle('Tauri');
     * ```
     *
     * @param title The new title
     * @returns A promise indicating the success or failure of the operation.
     */
    async setTitle(title) {
      return invoke("plugin:window|set_title", {
        label: this.label,
        value: title
      });
    }
    /**
     * Maximizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().maximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async maximize() {
      return invoke("plugin:window|maximize", {
        label: this.label
      });
    }
    /**
     * Unmaximizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().unmaximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async unmaximize() {
      return invoke("plugin:window|unmaximize", {
        label: this.label
      });
    }
    /**
     * Toggles the window maximized state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().toggleMaximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async toggleMaximize() {
      return invoke("plugin:window|toggle_maximize", {
        label: this.label
      });
    }
    /**
     * Minimizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().minimize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async minimize() {
      return invoke("plugin:window|minimize", {
        label: this.label
      });
    }
    /**
     * Unminimizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().unminimize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async unminimize() {
      return invoke("plugin:window|unminimize", {
        label: this.label
      });
    }
    /**
     * Sets the window visibility to true.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().show();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async show() {
      return invoke("plugin:window|show", {
        label: this.label
      });
    }
    /**
     * Sets the window visibility to false.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().hide();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async hide() {
      return invoke("plugin:window|hide", {
        label: this.label
      });
    }
    /**
     * Closes the window.
     *
     * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().close();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async close() {
      return invoke("plugin:window|close", {
        label: this.label
      });
    }
    /**
     * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().destroy();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async destroy() {
      return invoke("plugin:window|destroy", {
        label: this.label
      });
    }
    /**
     * Whether the window should have borders and bars.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setDecorations(false);
     * ```
     *
     * @param decorations Whether the window should have borders and bars.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setDecorations(decorations) {
      return invoke("plugin:window|set_decorations", {
        label: this.label,
        value: decorations
      });
    }
    /**
     * Whether or not the window should have shadow.
     *
     * #### Platform-specific
     *
     * - **Windows:**
     *   - `false` has no effect on decorated window, shadows are always ON.
     *   - `true` will make undecorated window have a 1px white border,
     * and on Windows 11, it will have a rounded corners.
     * - **Linux:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setShadow(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setShadow(enable) {
      return invoke("plugin:window|set_shadow", {
        label: this.label,
        value: enable
      });
    }
    /**
     * Set window effects.
     */
    async setEffects(effects) {
      return invoke("plugin:window|set_effects", {
        label: this.label,
        value: effects
      });
    }
    /**
     * Clear any applied effects if possible.
     */
    async clearEffects() {
      return invoke("plugin:window|set_effects", {
        label: this.label,
        value: null
      });
    }
    /**
     * Whether the window should always be on top of other windows.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setAlwaysOnTop(true);
     * ```
     *
     * @param alwaysOnTop Whether the window should always be on top of other windows or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setAlwaysOnTop(alwaysOnTop) {
      return invoke("plugin:window|set_always_on_top", {
        label: this.label,
        value: alwaysOnTop
      });
    }
    /**
     * Whether the window should always be below other windows.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setAlwaysOnBottom(true);
     * ```
     *
     * @param alwaysOnBottom Whether the window should always be below other windows or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setAlwaysOnBottom(alwaysOnBottom) {
      return invoke("plugin:window|set_always_on_bottom", {
        label: this.label,
        value: alwaysOnBottom
      });
    }
    /**
     * Prevents the window contents from being captured by other apps.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setContentProtected(true);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setContentProtected(protected_) {
      return invoke("plugin:window|set_content_protected", {
        label: this.label,
        value: protected_
      });
    }
    /**
     * Resizes the window with a new inner size.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
     * await getCurrentWindow().setSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSize(size) {
      return invoke("plugin:window|set_size", {
        label: this.label,
        value: size instanceof Size ? size : new Size(size)
      });
    }
    /**
     * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
     * @example
     * ```typescript
     * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMinSize(size) {
      return invoke("plugin:window|set_min_size", {
        label: this.label,
        value: size instanceof Size ? size : size ? new Size(size) : null
      });
    }
    /**
     * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMaxSize(size) {
      return invoke("plugin:window|set_max_size", {
        label: this.label,
        value: size instanceof Size ? size : size ? new Size(size) : null
      });
    }
    /**
     * Sets the window inner size constraints.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
     * ```
     *
     * @param constraints The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSizeConstraints(constraints) {
      function logical(pixel) {
        return pixel ? { Logical: pixel } : null;
      }
      return invoke("plugin:window|set_size_constraints", {
        label: this.label,
        value: {
          minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
          minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
          maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
          maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
        }
      });
    }
    /**
     * Sets the window outer position.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
     * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
     * ```
     *
     * @param position The new position, in logical or physical pixels.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setPosition(position) {
      return invoke("plugin:window|set_position", {
        label: this.label,
        value: position instanceof Position ? position : new Position(position)
      });
    }
    /**
     * Sets the window fullscreen state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setFullscreen(true);
     * ```
     *
     * @param fullscreen Whether the window should go to fullscreen or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFullscreen(fullscreen) {
      return invoke("plugin:window|set_fullscreen", {
        label: this.label,
        value: fullscreen
      });
    }
    /**
     * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won’t work if the window was already in the native fullscreen).
     * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
     *
     * On other platforms, this is the same as {@link Window.setFullscreen}.
     *
     * @param fullscreen Whether the window should go to simple fullscreen or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSimpleFullscreen(fullscreen) {
      return invoke("plugin:window|set_simple_fullscreen", {
        label: this.label,
        value: fullscreen
      });
    }
    /**
     * Bring the window to front and focus.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setFocus();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFocus() {
      return invoke("plugin:window|set_focus", {
        label: this.label
      });
    }
    /**
     * Sets whether the window can be focused.
     *
     * #### Platform-specific
     *
     * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
     *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setFocusable(true);
     * ```
     *
     * @param focusable Whether the window can be focused.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFocusable(focusable) {
      return invoke("plugin:window|set_focusable", {
        label: this.label,
        value: focusable
      });
    }
    /**
     * Sets the window icon.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setIcon('/tauri/awesome.png');
     * ```
     *
     * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     *
     * @param icon Icon bytes or path to the icon file.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setIcon(icon) {
      return invoke("plugin:window|set_icon", {
        label: this.label,
        value: transformImage(icon)
      });
    }
    /**
     * Whether the window icon should be hidden from the taskbar or not.
     *
     * #### Platform-specific
     *
     * - **macOS:** Unsupported.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setSkipTaskbar(true);
     * ```
     *
     * @param skip true to hide window icon, false to show it.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSkipTaskbar(skip) {
      return invoke("plugin:window|set_skip_taskbar", {
        label: this.label,
        value: skip
      });
    }
    /**
     * Grabs the cursor, preventing it from leaving the window.
     *
     * There's no guarantee that the cursor will be hidden. You should
     * hide it by yourself if you want so.
     *
     * #### Platform-specific
     *
     * - **Linux:** Unsupported.
     * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorGrab(true);
     * ```
     *
     * @param grab `true` to grab the cursor icon, `false` to release it.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorGrab(grab) {
      return invoke("plugin:window|set_cursor_grab", {
        label: this.label,
        value: grab
      });
    }
    /**
     * Modifies the cursor's visibility.
     *
     * #### Platform-specific
     *
     * - **Windows:** The cursor is only hidden within the confines of the window.
     * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
     *   outside of the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorVisible(false);
     * ```
     *
     * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorVisible(visible) {
      return invoke("plugin:window|set_cursor_visible", {
        label: this.label,
        value: visible
      });
    }
    /**
     * Modifies the cursor icon of the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorIcon('help');
     * ```
     *
     * @param icon The new cursor icon.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorIcon(icon) {
      return invoke("plugin:window|set_cursor_icon", {
        label: this.label,
        value: icon
      });
    }
    /**
     * Sets the window background color.
     *
     * #### Platform-specific:
     *
     * - **Windows:** alpha channel is ignored.
     * - **iOS / Android:** Unsupported.
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.1.0
     */
    async setBackgroundColor(color) {
      return invoke("plugin:window|set_background_color", { color });
    }
    /**
     * Changes the position of the cursor in window coordinates.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
     * ```
     *
     * @param position The new cursor position.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorPosition(position) {
      return invoke("plugin:window|set_cursor_position", {
        label: this.label,
        value: position instanceof Position ? position : new Position(position)
      });
    }
    /**
     * Changes the cursor events behavior.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setIgnoreCursorEvents(true);
     * ```
     *
     * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setIgnoreCursorEvents(ignore) {
      return invoke("plugin:window|set_ignore_cursor_events", {
        label: this.label,
        value: ignore
      });
    }
    /**
     * Starts dragging the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().startDragging();
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async startDragging() {
      return invoke("plugin:window|start_dragging", {
        label: this.label
      });
    }
    /**
     * Starts resize-dragging the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().startResizeDragging();
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async startResizeDragging(direction) {
      return invoke("plugin:window|start_resize_dragging", {
        label: this.label,
        value: direction
      });
    }
    /**
     * Sets the badge count. It is app wide and not specific to this window.
     *
     * #### Platform-specific
     *
     * - **Windows**: Unsupported. Use @{linkcode Window.setOverlayIcon} instead.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setBadgeCount(5);
     * ```
     *
     * @param count The badge count. Use `undefined` to remove the badge.
     * @return A promise indicating the success or failure of the operation.
     */
    async setBadgeCount(count) {
      return invoke("plugin:window|set_badge_count", {
        label: this.label,
        value: count
      });
    }
    /**
     * Sets the badge cont **macOS only**.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setBadgeLabel("Hello");
     * ```
     *
     * @param label The badge label. Use `undefined` to remove the badge.
     * @return A promise indicating the success or failure of the operation.
     */
    async setBadgeLabel(label) {
      return invoke("plugin:window|set_badge_label", {
        label: this.label,
        value: label
      });
    }
    /**
     * Sets the overlay icon. **Windows only**
     * The overlay icon can be set for every window.
     *
     *
     * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     *
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
     * ```
     *
     * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
     * @return A promise indicating the success or failure of the operation.
     */
    async setOverlayIcon(icon) {
      return invoke("plugin:window|set_overlay_icon", {
        label: this.label,
        value: icon ? transformImage(icon) : void 0
      });
    }
    /**
     * Sets the taskbar progress state.
     *
     * #### Platform-specific
     *
     * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
     * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
     *
     * @example
     * ```typescript
     * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
     * await getCurrentWindow().setProgressBar({
     *   status: ProgressBarStatus.Normal,
     *   progress: 50,
     * });
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async setProgressBar(state) {
      return invoke("plugin:window|set_progress_bar", {
        label: this.label,
        value: state
      });
    }
    /**
     * Sets whether the window should be visible on all workspaces or virtual desktops.
     *
     * #### Platform-specific
     *
     * - **Windows / iOS / Android:** Unsupported.
     *
     * @since 2.0.0
     */
    async setVisibleOnAllWorkspaces(visible) {
      return invoke("plugin:window|set_visible_on_all_workspaces", {
        label: this.label,
        value: visible
      });
    }
    /**
     * Sets the title bar style. **macOS only**.
     *
     * @since 2.0.0
     */
    async setTitleBarStyle(style) {
      return invoke("plugin:window|set_title_bar_style", {
        label: this.label,
        value: style
      });
    }
    /**
     * Set window theme, pass in `null` or `undefined` to follow system theme
     *
     * #### Platform-specific
     *
     * - **Linux / macOS**: Theme is app-wide and not specific to this window.
     * - **iOS / Android:** Unsupported.
     *
     * @since 2.0.0
     */
    async setTheme(theme) {
      return invoke("plugin:window|set_theme", {
        label: this.label,
        value: theme
      });
    }
    // Listeners
    /**
     * Listen to window resize.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
     *  console.log('Window resized', size);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onResized(handler) {
      return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
        e.payload = new PhysicalSize(e.payload);
        handler(e);
      });
    }
    /**
     * Listen to window move.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
     *  console.log('Window moved', position);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onMoved(handler) {
      return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
        e.payload = new PhysicalPosition(e.payload);
        handler(e);
      });
    }
    /**
     * Listen to window close requested. Emitted when the user requests to closes the window.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * import { confirm } from '@tauri-apps/api/dialog';
     * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
     *   const confirmed = await confirm('Are you sure?');
     *   if (!confirmed) {
     *     // user did not confirm closing the window; let's prevent it
     *     event.preventDefault();
     *   }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onCloseRequested(handler) {
      return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
        const evt = new CloseRequestedEvent(event);
        await handler(evt);
        if (!evt.isPreventDefault()) {
          await this.destroy();
        }
      });
    }
    /**
     * Listen to a file drop event.
     * The listener is triggered when the user hovers the selected files on the webview,
     * drops the files or cancels the operation.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/webview";
     * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
     *  if (event.payload.type === 'over') {
     *    console.log('User hovering', event.payload.position);
     *  } else if (event.payload.type === 'drop') {
     *    console.log('User dropped', event.payload.paths);
     *  } else {
     *    console.log('File drop cancelled');
     *  }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onDragDropEvent(handler) {
      const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
        handler({
          ...event,
          payload: {
            type: "enter",
            paths: event.payload.paths,
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
        handler({
          ...event,
          payload: {
            type: "over",
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
        handler({
          ...event,
          payload: {
            type: "drop",
            paths: event.payload.paths,
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
        handler({ ...event, payload: { type: "leave" } });
      });
      return () => {
        unlistenDrag();
        unlistenDrop();
        unlistenDragOver();
        unlistenCancel();
      };
    }
    /**
     * Listen to window focus change.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
     *  console.log('Focus changed, window is focused? ' + focused);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onFocusChanged(handler) {
      const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
        handler({ ...event, payload: true });
      });
      const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
        handler({ ...event, payload: false });
      });
      return () => {
        unlistenFocus();
        unlistenBlur();
      };
    }
    /**
     * Listen to window scale change. Emitted when the window's scale factor has changed.
     * The following user actions can cause DPI changes:
     * - Changing the display's resolution.
     * - Changing the display's scale factor (e.g. in Control Panel on Windows).
     * - Moving the window to a display with a different scale factor.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
     *  console.log('Scale changed', payload.scaleFactor, payload.size);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onScaleChanged(handler) {
      return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
    }
    /**
     * Listen to the system theme change.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
     *  console.log('New theme: ' + theme);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onThemeChanged(handler) {
      return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
    }
  };
  var BackgroundThrottlingPolicy;
  (function(BackgroundThrottlingPolicy2) {
    BackgroundThrottlingPolicy2["Disabled"] = "disabled";
    BackgroundThrottlingPolicy2["Throttle"] = "throttle";
    BackgroundThrottlingPolicy2["Suspend"] = "suspend";
  })(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
  var ScrollBarStyle;
  (function(ScrollBarStyle2) {
    ScrollBarStyle2["Default"] = "default";
    ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
  })(ScrollBarStyle || (ScrollBarStyle = {}));
  var Effect;
  (function(Effect2) {
    Effect2["AppearanceBased"] = "appearanceBased";
    Effect2["Light"] = "light";
    Effect2["Dark"] = "dark";
    Effect2["MediumLight"] = "mediumLight";
    Effect2["UltraDark"] = "ultraDark";
    Effect2["Titlebar"] = "titlebar";
    Effect2["Selection"] = "selection";
    Effect2["Menu"] = "menu";
    Effect2["Popover"] = "popover";
    Effect2["Sidebar"] = "sidebar";
    Effect2["HeaderView"] = "headerView";
    Effect2["Sheet"] = "sheet";
    Effect2["WindowBackground"] = "windowBackground";
    Effect2["HudWindow"] = "hudWindow";
    Effect2["FullScreenUI"] = "fullScreenUI";
    Effect2["Tooltip"] = "tooltip";
    Effect2["ContentBackground"] = "contentBackground";
    Effect2["UnderWindowBackground"] = "underWindowBackground";
    Effect2["UnderPageBackground"] = "underPageBackground";
    Effect2["Mica"] = "mica";
    Effect2["Blur"] = "blur";
    Effect2["Acrylic"] = "acrylic";
    Effect2["Tabbed"] = "tabbed";
    Effect2["TabbedDark"] = "tabbedDark";
    Effect2["TabbedLight"] = "tabbedLight";
  })(Effect || (Effect = {}));
  var EffectState;
  (function(EffectState2) {
    EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
    EffectState2["Active"] = "active";
    EffectState2["Inactive"] = "inactive";
  })(EffectState || (EffectState = {}));
  async function cursorPosition() {
    return invoke("plugin:window|cursor_position").then((v) => new PhysicalPosition(v));
  }

  // src/tauri.ts
  var isTauri = !!window.__TAURI_INTERNALS__ || !!window.__TAURI__;
  var MARGIN = 8;
  var WIN_W = 560;
  var inited = false;
  var ignoring = null;
  function win_() {
    return { win: getCurrentWindow(), Pos: LogicalPosition, cursor: cursorPosition };
  }
  async function inv(cmd, args) {
    return invoke(cmd, args);
  }
  async function initTauri() {
    if (!isTauri || inited) return;
    inited = true;
    document.documentElement.classList.add("tauri");
    document.body.classList.add("tauri");
    try {
      const { win, Pos } = win_();
      const availW = window.screen.availWidth || 1536;
      const availH = window.screen.availHeight || 864;
      const x = Math.max(0, availW - WIN_W - MARGIN);
      const y = MARGIN;
      await win.setPosition(new Pos(x, y));
      const real = await win.outerPosition();
      const sc = await win.scaleFactor();
      startHitTest();
    } catch (e) {
      await inv("debug_log", { msg: "init ERR: " + String(e).slice(0, 90) }).catch(() => {
      });
    }
  }
  function startHitTest() {
    const ballEl2 = document.getElementById("ball");
    const panelEl = document.getElementById("panel");
    setInterval(async () => {
      try {
        const { win, cursor } = win_();
        const cur = await cursor();
        const pos = await win.outerPosition();
        const s = await win.scaleFactor();
        const x = (cur.x - pos.x) / s;
        const y = (cur.y - pos.y) / s;
        const inside = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        };
        const open2 = panelEl?.classList.contains("open");
        const hit = inside(ballEl2) || (open2 ? inside(panelEl) : false);
        const shouldIgnore = !hit;
        if (shouldIgnore !== ignoring) {
          ignoring = shouldIgnore;
          await inv("set_click_through", { ignore: shouldIgnore });
        }
      } catch {
      }
    }, 90);
  }
  var expandWindow = async () => {
  };
  var collapseWindow = async () => {
  };
  var winPos = null;
  var pendingPos = null;
  var rafBusy = false;
  async function beginDrag() {
    if (!isTauri) return;
    try {
      const { win } = await win_();
      const p = await win.outerPosition();
      winPos = { x: p.x, y: p.y };
    } catch {
      winPos = null;
    }
  }
  function dragBy(dxCss, dyCss) {
    if (!isTauri || !winPos) return;
    const sc = window.devicePixelRatio || 1;
    winPos.x += dxCss * sc;
    winPos.y += dyCss * sc;
    pendingPos = { ...winPos };
    if (rafBusy) return;
    rafBusy = true;
    requestAnimationFrame(async () => {
      rafBusy = false;
      const q = pendingPos;
      pendingPos = null;
      if (!q) return;
      try {
        const { win, Pos } = win_();
        const sc2 = await win.scaleFactor();
        await win.setPosition(new Pos(Math.round(q.x / sc2), Math.round(q.y / sc2)));
      } catch {
      }
    });
  }

  // src/main.ts
  var VB = DEMI_VIEWBOX;
  var R2 = RAYON;
  var PAPER = "#eceff4";
  var savedInk = (() => {
    try {
      return localStorage.getItem("bloub-ink");
    } catch {
      return null;
    }
  })();
  var initialInk = savedInk && COLORS.some((c) => c.hex === savedInk) ? savedInk : COLORS[0].hex;
  var inkAuto = !savedInk;
  var inkLastChangedAt = 0;
  var inkFrom = initialInk;
  var inkTo = initialInk;
  var inkT = 1;
  var INK_DUR = 0.42;
  var easeOut = (t) => 1 - Math.pow(1 - t, 3);
  var curInk = () => inkT >= 1 ? inkTo : mixHex(inkFrom, inkTo, easeOut(inkT));
  function setColor(hex) {
    if (hex === inkTo) return;
    inkFrom = curInk();
    inkTo = hex;
    inkT = 0;
  }
  var uid = "b" + Math.random().toString(36).slice(2, 8);
  var engine = new BotEngine(R2, "idle", null, null);
  var clock = 0;
  function dotMarkup(list, ink) {
    return list.map((d) => {
      const fill = d.color ?? (d.depth === void 0 ? ink : mixHex(PAPER, ink, d.depth));
      return d.d ? `<path d="${d.d}" transform="translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${R2})" fill="${fill}" opacity="${d.opacity}"/>` : `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${fill}" opacity="${d.opacity}"/>`;
    }).join("");
  }
  function frameMarkup(f, ink) {
    const defs = [];
    for (const a of f.arcs) {
      const n = Math.max(1, a.grad.stops.length - 1);
      defs.push(
        `<linearGradient id="${uid}-${a.id}" gradientUnits="userSpaceOnUse" x1="${a.grad.x1}" y1="${a.grad.y1}" x2="${a.grad.x2}" y2="${a.grad.y2}">` + a.grad.stops.map((c, i) => `<stop offset="${(i / n).toFixed(4)}" stop-color="${c}"/>`).join("") + `</linearGradient>`
      );
    }
    defs.push(
      `<mask id="${uid}-mask" maskUnits="userSpaceOnUse" x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}"><path d="${f.bodyPath}" fill="#fff"/>` + f.eyes.map((e) => `<path d="${e.d}" transform="${e.matrix}" opacity="${e.alpha}" fill="#000"/>`).join("") + (f.notch ? `<circle cx="${f.notch.x}" cy="${f.notch.y}" r="${f.notch.r}" fill="#000"/>` : "") + `</mask>`
    );
    const arc = (side) => f.arcs.map((a) => `<path d="${a[side]}" stroke="url(#${uid}-${a.id})" stroke-width="${a.width}" opacity="${a.opacity}"/>`).join("");
    return `<defs>${defs.join("")}</defs><g fill="none" stroke-linecap="round">${arc("back")}</g>` + (f.dotsBehind ? `<g>${dotMarkup(f.dots, ink)}</g>` : "") + `<g opacity="${f.bodyAlpha}"><path d="${f.bodyPath}" fill="${PAPER}"/><g mask="url(#${uid}-mask)"><rect x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}" fill="${ink}"/></g></g>` + (!f.dotsBehind ? `<g>${dotMarkup(f.dots, ink)}</g>` : "") + (f.notif ? `<circle cx="${f.notif.x}" cy="${f.notif.y}" r="${f.notif.r}" fill="#4b8dff"/>` : "") + `<g fill="none" stroke-linecap="round">${arc("front")}</g>`;
  }
  var ballEl = document.getElementById("ball");
  window.addEventListener("DOMContentLoaded", () => {
    setBotState("orbit", 0);
    const settle = () => {
      if (ballEl.classList.contains("settled")) return;
      ballEl.classList.add("settled");
      setBotState("idle", clock);
    };
    setTimeout(() => setBotState("wink", clock), 1950);
    ballEl.addEventListener("animationend", settle, { once: true });
    setTimeout(settle, 1200);
    setTimeout(settle, 2700);
  });
  var svg = document.getElementById("bot");
  var last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1e3, 0.05);
    last = now;
    clock += dt;
    if (inkT < 1) inkT = Math.min(1, inkT + dt / INK_DUR);
    tickAutoplay(clock);
    tickAutoSkin(clock);
    svg.innerHTML = frameMarkup(engine.sample(clock), curInk());
    requestAnimationFrame(tick);
  }
  initTauri().then(async () => {
    if (isTauri) {
      await loadProjects();
      await startSSE();
    }
  });
  requestAnimationFrame(tick);
  var AUTOPLAY_ACTIONS = [
    /* —— 小幅表情：常来，最自然 —— */
    { id: "wink", w: 5 },
    // 眨眼
    { id: "thinking", w: 4 },
    // 歪头想事
    { id: "wide", w: 3 },
    // 睁大眼
    /* —— 中等：偶尔 —— */
    { id: "alert", w: 2 },
    // 感叹号冲出来
    { id: "exclaim", w: 2 },
    // 变成一个感叹号
    { id: "egg", w: 2 },
    // 缩成一颗蛋
    { id: "hexagon", w: 2 },
    // 变六边形
    { id: "notify", w: 2 },
    // 蓝点提示
    /* —— 少见：大幅演出 —— */
    { id: "sleep", w: 1 },
    // 缩成小球上下浮（像睡着）
    { id: "comet", w: 1 },
    // 缩成一点 + 拖尾
    { id: "burst", w: 1 },
    // 炸开成粒子再重组
    { id: "play", w: 1 },
    // 三角 + 光带扫过
    { id: "orbit", w: 1 }
    // 三角绕圈 + 六道光环
  ];
  var AUTOPLAY_TOTAL_W = AUTOPLAY_ACTIONS.reduce((n, a) => n + a.w, 0);
  var ACTION_HOLD = {
    wink: 1.6,
    wide: 1.8,
    thinking: 2.6,
    alert: 2.4,
    exclaim: 2,
    notify: 2.2,
    egg: 1.8,
    hexagon: 1.6,
    sleep: 2.4,
    comet: 2.4,
    burst: 2.6,
    play: 2,
    orbit: 3.4
  };
  var ACTION_SCALE = {
    notify: 0.87,
    // 1.15R → 1.00R
    burst: 0.95,
    // 1.05R → 1.00R
    play: 0.72,
    // 1.38R → 0.99R
    orbit: 0.71
    // 1.40R → 0.99R
  };
  var AUTO_SHAPE_IDS = SHAPES.map((s) => s.id).filter((id) => id !== DEFAULT_SHAPE);
  function scheduleAutoShape(from) {
    shapeNextAt = from + 3 + Math.random() * 6;
  }
  function scheduleAutoColor(from) {
    colorNextAt = from + 4 + Math.random() * 6;
  }
  function tickAutoSkin(now) {
    if (autoPlistState) return;
    const busy = lookOverride !== null && lookOverride.mix > NEAR_MIX || now - lastMouseMoveAt < 1.5;
    if (busy) return;
    if (now >= shapeNextAt) {
      const pool = [DEFAULT_SHAPE, ...AUTO_SHAPE_IDS].filter((id) => id !== inkShapeId);
      const next = pool[Math.floor(Math.random() * pool.length)];
      const sp = SHAPE_BY_ID.get(next);
      if (sp) {
        inkShapeId = next;
        engine.setShape([...sp.radii], now);
        scheduleAutoShape(now);
        visualHoldUntil = now + 1.2;
      }
    }
    if (inkAuto && now >= colorNextAt) {
      const pool = COLORS.filter((c) => c.hex !== inkTo);
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (next) {
        setColor(next.hex);
        inkLastChangedAt = now;
        scheduleAutoColor(now);
        visualHoldUntil = now + 1.2;
      }
    }
    if (!inkAuto) colorNextAt = now + 999;
  }
  var NEAR_MIX = 0.25;
  var nextAutoAt = 0;
  var autoPlistState = null;
  var lastAutoStart = 0;
  var lookOverride = null;
  var lastMouseMoveAt = -999;
  var lastMouseXY = { x: -9999, y: -9999 };
  var shapeNextAt = 0;
  var colorNextAt = 0;
  var inkShapeId = DEFAULT_SHAPE;
  var visualHoldUntil = 0;
  function scheduleNextAuto(from) {
    nextAutoAt = from + 4 + Math.random() * 7;
  }
  function pickAutoAction() {
    let r = Math.random() * AUTOPLAY_TOTAL_W;
    for (const a of AUTOPLAY_ACTIONS) {
      r -= a.w;
      if (r <= 0) return a.id;
    }
    return "wink";
  }
  function setBotState(id, now) {
    const k = ACTION_SCALE[id] ?? 1;
    svg.style.setProperty("--bot-scale", String(k));
    engine.setState(id, now);
  }
  function tickAutoplay(now) {
    if (autoPlistState) {
      const st2 = autoPlistState;
      const hold = ACTION_HOLD[st2] ?? 2.4;
      if (now - lastAutoStart >= hold) {
        setBotState("idle", now);
        autoPlistState = null;
        scheduleNextAuto(now);
      }
      return;
    }
    const busy = lookOverride !== null && lookOverride.mix > NEAR_MIX || now - lastMouseMoveAt < 1.5;
    if (busy) {
      nextAutoAt = Math.max(nextAutoAt, now + 2);
      return;
    }
    if (now < visualHoldUntil) {
      nextAutoAt = Math.max(nextAutoAt, visualHoldUntil + 0.3);
      return;
    }
    if (now >= nextAutoAt) {
      const id = pickAutoAction();
      autoPlistState = id;
      lastAutoStart = now;
      setBotState(id, now);
      engine.setLook({ yaw: (Math.random() - 0.5) * 26, pitch: (Math.random() - 0.5) * 12, mix: 0.6, spin: 0, wander: 1 }, now);
    }
  }
  document.addEventListener("mousemove", (e) => {
    const r = ballEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const near = Math.max(0, Math.min(1, 1 - (dist - 70) / 520));
    lookOverride = { yaw: dx / dist * 24 * near, pitch: dy / dist * 15 * near, mix: near, spin: 0, wander: 1 - near };
    if (Math.hypot(e.clientX - lastMouseXY.x, e.clientY - lastMouseXY.y) > 2) {
      lastMouseXY = { x: e.clientX, y: e.clientY };
      lastMouseMoveAt = clock;
    }
    engine.setLook(lookOverride, clock);
  });
  window.addEventListener("blur", () => {
    lookOverride = null;
  });
  setInterval(() => {
    if (lookOverride && clock - lastMouseMoveAt > 3) {
      lookOverride = null;
      engine.setLook(null, clock);
    }
  }, 1e3);
  var panel = document.getElementById("panel");
  var listEl = document.getElementById("list");
  var swatchesEl = document.getElementById("swatches");
  var statsEl = document.getElementById("stats");
  var open = false;
  (() => {
    const meta = document.querySelector('meta[name="panel-build"]');
    const stamp = document.getElementById("buildStamp");
    if (stamp) stamp.textContent = meta ? meta.getAttribute("content") || "dev" : "dev";
  })();
  function positionPanel() {
    const r = ballEl.getBoundingClientRect();
    const gap = 16;
    const pw = panel.offsetWidth || 384;
    const ph = panel.offsetHeight || 520;
    const onLeft = r.left > pw + 24;
    if (onLeft) {
      panel.style.left = "auto";
      panel.style.right = window.innerWidth - r.left + gap + "px";
    } else {
      panel.style.right = "auto";
      panel.style.left = Math.min(r.right + gap, window.innerWidth - pw - 12) + "px";
    }
    const above = window.innerHeight - r.top >= ph + 14;
    if (above) {
      panel.style.bottom = "auto";
      panel.style.top = Math.max(12, r.top) + "px";
    } else {
      panel.style.top = "auto";
      panel.style.bottom = Math.max(12, window.innerHeight - r.bottom) + "px";
    }
    panel.style.transformOrigin = `${onLeft ? "calc(100% + 62px)" : "-62px"} ${above ? "52px" : "calc(100% - 52px)"}`;
  }
  function openPanel() {
    if (open) return;
    open = true;
    positionPanel();
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    setBotState("orbit", clock);
    expandWindow();
    startRefresh();
    setTimeout(animateCounts, 190);
    if (isTauri) loadProjects();
  }
  function closePanel() {
    if (!open) return;
    open = false;
    view = { kind: "projects" };
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    setBotState("idle", clock);
    collapseWindow();
    stopRefresh();
  }
  var closeBtn = document.getElementById("closeBtn");
  var pinBtn = document.getElementById("pinBtn");
  closeBtn.addEventListener("click", closePanel);
  pinBtn.addEventListener("click", () => {
    panel.classList.toggle("pinned");
  });
  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "sw" + (c.hex === initialInk ? " is-on" : "");
    b.style.setProperty("--c", c.hex);
    b.dataset.hex = c.hex;
    swatchesEl.appendChild(b);
  });
  var autoBtn = document.createElement("button");
  autoBtn.className = "sw sw-auto";
  autoBtn.title = "\u81EA\u52A8\u6362\u8272 / \u6362\u5F62\u72B6";
  autoBtn.textContent = "\u81EA";
  swatchesEl.appendChild(autoBtn);
  function renderAutoSwatch() {
    swatchesEl.classList.toggle("is-auto", inkAuto);
  }
  swatchesEl.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest(".sw-auto")) {
      inkAuto = true;
      swatchesEl.querySelectorAll(".sw").forEach((s) => s.classList.remove("is-on"));
      try {
        localStorage.removeItem("bloub-ink");
      } catch {
      }
      renderAutoSwatch();
      setBotState("wink", clock);
      return;
    }
    const b = t.closest(".sw");
    if (!b) return;
    inkAuto = false;
    swatchesEl.querySelectorAll(".sw").forEach((s) => s.classList.toggle("is-on", s === b));
    renderAutoSwatch();
    setColor(b.dataset.hex);
    try {
      localStorage.setItem("bloub-ink", b.dataset.hex);
    } catch {
    }
    setBotState("wink", clock);
  });
  renderAutoSwatch();
  var MOCK_GROUPS = [
    { title: "\u771F\u9879\u76EE", items: [
      { key: "kstage", name: "\u5E02\u4E95K\u53F0", sub: "\u826F\u6E1A\u82AF\u4E91\u5168\u6C11\u6B4C\u5531\u5927\u8D5B", tags: ["\u5C0F\u7A0B\u5E8F", "node", "postgres"], ago: "1 \u5C0F\u65F6\u524D", tasks: [
        { key: "flow-read-query-merge", title: "read() \u5269\u4F59\u4E24\u6761\u6309\u4EBA\u67E5\u8BE2\u5408\u5E76", status: "ready", pri: 1 },
        { key: "ui-finalize-pages", title: "\u754C\u9762\u5B9A\u7A3F\u540E\u8865\u9F50\u529F\u80FD\u9875\u9762", status: "blocked", pri: 2, depends: ["\u5BA2\u6237\u786E\u8BA4\u754C\u9762"] },
        { key: "consent-policy", title: "\u8096\u50CF\u6388\u6743\u4E0E\u7FFB\u5531\u7248\u6743\u53E3\u5F84\u5B9A\u6848", status: "blocked", pri: 3, depends: ["\u5BA2\u6237\u5B9A\u6848"] },
        { key: "https-domain-compliance", title: "HTTPS / \u5907\u6848 / \u7C7B\u76EE\u8D44\u8D28", status: "blocked", pri: 3, depends: ["\u516C\u53F8\u4E3B\u4F53\u529E\u8BC1"] },
        { key: "audience-realtime-tier", title: "\u89C2\u4F17\u7AEF\u6539\u8F6E\u8BE2 + \u8F7B\u91CF\u8F7D\u8377", status: "ready", pri: 4 },
        { key: "shared-library-migration", title: "\u628A K\u53F0 \u5B8C\u6574\u8FC1\u5165\u5171\u4EAB\u9879\u76EE\u5E93", status: "done", pri: 0, owner: "session-1874" }
      ] },
      { key: "rural-1-39", name: "\u519C\u4E1A\u5C40\u519C\u6751\u8D44\u4EA7\u62DB\u5546\u5E73\u53F0", sub: "1-39 \u9879\u529F\u80FD \xB7 \u4EA4\u4ED8\u4E2D", tags: ["oss", "ecs"], ago: "\u6628\u5929", tasks: [
        { key: "resource-showcase", title: "\u8D44\u6E90\u5C55\u793A\u6A21\u5757\u6536\u5C3E", status: "ready", pri: 1 },
        { key: "contract-module", title: "\u9879\u76EE\u4E0E\u5408\u540C\u6A21\u5757", status: "ready", pri: 2 },
        { key: "deploy-handover", title: "\u90E8\u7F72\u8FD0\u7EF4\u4EA4\u63A5", status: "done", pri: 3 }
      ] },
      { key: "ledger-miniapp", name: "\u8BB0\u8D26\u5C0F\u7A0B\u5E8F", sub: "\u5FAE\u4FE1\u539F\u751F\u5C0F\u7A0B\u5E8F MVP", tags: ["miniapp"], ago: "\u6628\u5929", tasks: [
        { key: "ledger-mvp", title: "\u8BB0\u8D26 MVP\uFF08\u6536\u652F / \u5206\u7C7B / \u7EDF\u8BA1 / \u5BFC\u51FA\uFF09", status: "done", pri: 0 }
      ] },
      { key: "tea-coop", name: "\u8336\u53F6\u5408\u4F5C\u793E", sub: "\u5E02\u573A / \u5DE5\u827A / \u4ED3\u50A8\u7814\u7A76", tags: [], ago: "2 \u5929\u524D", tasks: [
        { key: "market-price", title: "\u5E02\u573A\u884C\u60C5\u4E0E\u6536\u8D2D\u4EF7\u7814\u7A76", status: "done", pri: 1 },
        { key: "processing", title: "\u52A0\u5DE5\u5DE5\u827A\u4E0E\u4EA7\u80FD\u65B9\u6848", status: "done", pri: 2 },
        { key: "logistics", title: "\u4ED3\u50A8\u7269\u6D41\u4E0E\u635F\u8017\u65B9\u6848", status: "ready", pri: 3 }
      ] },
      { key: "longan-farm", name: "\u9F99\u773C\u519C\u573A", sub: "\u519C\u4E1A\u6A21\u5757", tags: [], ago: "2 \u5929\u524D", tasks: [
        { key: "risk-assessment", title: "\u98CE\u9669\u8BC4\u4F30\u62A5\u544A\u6536\u5C3E", status: "ready", pri: 1 }
      ] }
    ] },
    { title: "\u5E73\u53F0\u4E0E\u5DE5\u5177", items: [
      { key: "codex-memory", name: "codex-memory \u5E73\u53F0", sub: "\u5171\u4EAB\u5E93\u81EA\u8EAB", tags: [], ago: "3 \u5929\u524D", tasks: [
        { key: "index-scope-isolation", title: "\u7D22\u5F15\u4F5C\u7528\u57DF\u7269\u7406\u9694\u79BB", status: "done", pri: 1 },
        { key: "auto-sync", title: "\u4E2D\u6587\u9879\u76EE\u540D\u4E0E\u7EC8\u6001\u81EA\u52A8\u540C\u6B65", status: "done", pri: 1 },
        { key: "realtime-events", title: "\u4E8B\u4EF6\u6D41 + SSE \u5B9E\u65F6\u8054\u52A8", status: "ready", pri: 2 },
        { key: "panel", title: "\u60AC\u6D6E\u7403\u9762\u677F\uFF08\u672C\u9879\u76EE\uFF09", status: "doing", pri: 1, owner: "\u672C\u4F1A\u8BDD" }
      ] }
    ] },
    { title: "\u65B9\u6CD5\u8BBA\u4E0E\u8D44\u6599", items: [
      { key: "ai-delivery-methodology", name: "AI \u4EA4\u4ED8\u65B9\u6CD5\u8BBA", sub: "\u4EA4\u4ED8\u95ED\u73AF / \u5BF9\u9F50 / \u9A8C\u8BC1", tags: ["methodology"], ago: "3 \u5929\u524D", tasks: [] },
      { key: "ui-ux-evaluation", name: "UI/UX \u8BC4\u4F30\u9879\u76EE", sub: "\u8BBE\u8BA1\u7CFB\u7EDF\u4E0E\u754C\u9762\u9A8C\u8BC1", tags: ["ui", "ux"], ago: "3 \u5929\u524D", tasks: [] }
    ] },
    { title: "\u6F14\u793A\u6B8B\u7559", folded: true, items: [
      { key: "codex-deepseek-demo", name: "Codex + DeepSeek \u6F14\u793A", sub: "demo", tags: [], ago: "\u524D\u5929", tasks: [] },
      { key: "http-f587861c", name: "HTTP smoke", sub: "\u70DF\u6D4B", tags: [], ago: "\u524D\u5929", tasks: [] }
    ] }
  ];
  MOCK_GROUPS.forEach((g) => g.items.forEach((p) => {
    p.total = p.tasks.length;
    p.done = p.tasks.filter((t) => t.status === "done").length;
    p.ready = p.tasks.filter((t) => t.status === "ready").length;
    p.doing = p.tasks.filter((t) => t.status === "doing").length;
    p.failed = 0;
    p.kind = p.kind || "code";
    p.isTest = p.isTest || false;
    p.ctrl = "active";
    p.root = "";
    p.mapNodes = 0;
    p.mapEdges = 0;
    p.artifacts = 0;
    p.sessions = 0;
  }));
  async function loadProjects() {
    if (!isTauri) return;
    try {
      const raw = await invoke("qdata", {});
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) throw new Error("\u8FD4\u56DE\u4E0D\u662F\u6570\u7EC4");
      applyProjects(list);
    } catch (e) {
      void logDbg("loadProjects \u5931\u8D25: " + String(e).slice(0, 200));
      if (open) toast("\u8BFB\u5171\u4EAB\u5E93\u5931\u8D25\uFF1A" + String(e).slice(0, 60));
    }
  }
  function applyProjects(list) {
    const prev = new Map(ALL.map((x) => [x.key, x]));
    const items = list.filter((r) => r.control_state !== "archived").map((r) => ({
      key: r.project_key,
      name: r.name || r.project_key,
      sub: String(r.root_path || "").replace(/^[A-Z]:\\/i, ""),
      scope: String(r.scope || "").trim(),
      tags: parseTags(r.tags),
      /* 卡面上的"多久前"用活动信号（含任务更新）—— 它比"真干活"宽松一点，
         但对用户更有信息量（能看到"刚才有人动过这个项目"）。 */
      ago: activityText(
        typeof r.last_activity_min === "number" && r.last_activity_min >= 0 ? r.last_activity_min : typeof r.last_work_min === "number" && r.last_work_min >= 0 ? r.last_work_min : Math.round((Date.now() - Date.parse(String(r.updated_at || "").trim().replace(" ", "T"))) / 6e4)
      ) || relTime(r.updated_at),
      /* ⚠ 这三个字段的"缓存标志"历史（2026-09-15 审计发现的第 3 个高危 bug）：
         原来写的是 `tasks: prev.fromDb ? prev.tasks : []` + `fromDb: false` ——
         于是**第 1 次轮询**能把明细带过去（那时 prev.fromDb 还是 true），
         **第 2 次轮询** prev.fromDb 已是 false → 明细被清成 []。
         而"深度核对"的门槛正是 `if (!p.fromDb || !p.tasks.length) continue`，
         结果它在项目列表视图下**跳过每一个项目**，还打印绿灯「一致（0 个项目）」——
         **一直在假装核对过**。
         修法：明细是有效缓存就带过来，并**保留** fromDb=true（它表示"这份明细来自数据库"，
         不是"这次是新拉的"）。 */
      tasks: prev.get(r.project_key)?.fromDb ? prev.get(r.project_key).tasks : [],
      fromDb: prev.get(r.project_key)?.fromDb === true,
      total: r.total,
      done: r.done,
      ready: r.ready,
      doing: r.doing,
      failed: r.failed,
      review: num(r.review),
      kind: r.kind,
      isTest: isTestish(r.project_key, r.name || ""),
      ctrl: r.control_state,
      root: r.root_path,
      mapNodes: r.map_nodes,
      mapEdges: r.map_edges,
      artifacts: r.artifacts,
      sessions: r.sessions,
      checkpoints: num(r.checkpoints),
      liveClaims: num(r.live_claims),
      staleClaims: num(r.stale_claims),
      liveSessions: num(r.live_sessions),
      workingSessions: num(r.working_sessions),
      lastBeatMin: typeof r.last_beat_min === "number" ? r.last_beat_min : -1,
      lastActivityMin: typeof r.last_activity_min === "number" ? r.last_activity_min : -1,
      lastWorkMin: typeof r.last_work_min === "number" ? r.last_work_min : -1,
      liveTasks: num(r.live_tasks),
      stalledTasks: num(r.stalled_tasks),
      overdueEta: num(r.overdue_eta),
      held: num(r.held),
      taskUpdatedAt: String(r.task_updated_at || "")
    }));
    archivedProjects = list.filter((r) => r.control_state === "archived").map((r) => ({ key: r.project_key, name: r.name || r.project_key, total: num(r.total) }));
    if (collecting) {
      const now = Date.now();
      for (const r of items) {
        const before = prev.get(r.key);
        if (!before) {
          addedProjects.push(r.key);
          continue;
        }
        const was = [before.total, before.done, before.ready, before.doing, before.review, before.failed].join("/");
        const is = [r.total, r.done, r.ready, r.doing, r.review, r.failed].join("/");
        if (was !== is) {
          changedProjectCount++;
          const bits = [];
          if (r.done !== before.done) bits.push(`\u5B8C\u6210 ${before.done}\u2192${r.done}`);
          if (r.doing !== before.doing) bits.push(`\u5728\u505A ${before.doing}\u2192${r.doing}`);
          if (r.ready !== before.ready) bits.push(`\u5F85\u5F00\u59CB ${before.ready}\u2192${r.ready}`);
          if (r.review !== before.review) bits.push(`\u5F85\u9A8C\u6536 ${before.review}\u2192${r.review}`);
          if (r.total !== before.total) bits.push(`\u4EFB\u52A1\u6570 ${before.total}\u2192${r.total}`);
          if (bits.length) changedProjectDetail.push(`${r.name}\uFF1A${bits.join("\u3001")}`);
        } else if (r.taskUpdatedAt && before.taskUpdatedAt && r.taskUpdatedAt !== before.taskUpdatedAt) {
          changedProjectCount++;
          changedProjectDetail.push(`${r.name}\uFF1A\u4EFB\u52A1\u5185\u5BB9\u6709\u66F4\u65B0\uFF08${before.taskUpdatedAt.slice(11, 16)} \u2192 ${r.taskUpdatedAt.slice(11, 16)}\uFF09`);
        }
      }
      for (const k of prev.keys()) {
        if (!items.some((x) => x.key === k)) changedProjectCount++;
      }
      lastLoadAt = now;
    }
    const live = items.filter((r) => !r.isTest);
    const test = items.filter((r) => r.isTest);
    GROUPS = [
      { title: "\u4EE3\u7801\u9879\u76EE", items: live.filter((r) => r.kind !== "doc") },
      { title: "\u8D44\u6599\u4E0E\u65B9\u6CD5", items: live.filter((r) => r.kind === "doc") },
      { title: "\u6D4B\u8BD5\u4E0E\u63A2\u9488", folded: true, items: test }
    ].filter((g) => g.items.length > 0);
    rebuildAll();
    everLoaded = true;
    const fp = JSON.stringify(items.map((r) => [
      r.key,
      r.total,
      r.done,
      r.ready,
      r.doing,
      r.failed,
      r.ago,
      r.taskUpdatedAt
    ]));
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    if (!open) {
      renderStats();
      return;
    }
    if (view.kind === "tasks") renderTasks(view.proj);
    else renderProjects();
  }
  async function loadTasks(key) {
    const p = byKey(key);
    if (!p || p.fromDb || !isTauri) return;
    try {
      const raw = await invoke("qtasks", { projectKey: key });
      const rows = JSON.parse(raw);
      p.tasks = rows.map((t) => ({
        key: t.key,
        title: t.title || t.key,
        status: t.status === "done" ? "done" : t.status === "failed" || t.status === "cancelled" ? "blocked" : t.status === "blocked" ? "blocked" : t.status === "running" ? "doing" : t.status === "review" ? "review" : t.status === "blocked" ? "blocked" : t.ownerAlive && t.owner ? "doing" : t.unmet_deps > 0 ? "blocked" : "ready",
        raw: t.status,
        pri: typeof t.priority === "number" ? t.priority : 9,
        owner: t.owner ? String(t.owner).replace(/^session-/, "").slice(0, 12) : void 0,
        ownerAlive: t.owner_alive === true,
        ownerBeatMin: typeof t.owner_beat_min === "number" ? t.owner_beat_min : -1,
        depends: t.dep_keys ? String(t.dep_keys).split(", ").filter(Boolean) : [],
        desc: String(t.description || "").trim(),
        nextAct: String(t.next_action || "").trim(),
        /* 合同（目标 / 验收标准）。为什么要它：
           任务的标题和说明是**创建时写死的 —— 平台没有任何工具能改**
           （project_task_update 只 SET status / next_action / lease / updated_at）。
           所以范围延伸之后"名字对不上"是常态，**合同才是这件事现在的定义**。
           面板以前完全没查 agent_task_contracts，等于把最该看的东西藏起来了。 */
        contract: String(t.contract || "").trim()
      }));
      p.fromDb = true;
    } catch (e) {
      void logDbg("loadTasks \u5931\u8D25: " + String(e).slice(0, 150));
    }
  }
  var GROUPS = MOCK_GROUPS;
  var ALL = [];
  var rebuildAll = () => {
    ALL = GROUPS.flatMap((g) => g.items);
  };
  rebuildAll();
  var byKey = (k) => ALL.find((p) => p.key === k);
  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (!t) return "";
    const min = Math.floor((Date.now() - t) / 6e4);
    if (min < 1) return "\u521A\u521A";
    if (min < 60) return `${min} \u5206\u949F\u524D`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} \u5C0F\u65F6\u524D`;
    const d = Math.floor(h / 24);
    if (d === 1) return "\u6628\u5929";
    if (d < 7) return `${d} \u5929\u524D`;
    return `${Math.floor(d / 7)} \u5468\u524D`;
  }
  var TESTY = /demo|probe|smoke|test|scratch|sample/i;
  var TESTY_CN = /测试|探针|演示|冒烟|示例/;
  var isTestish = (key, name) => TESTY.test(key) || TESTY.test(name) || TESTY_CN.test(name);
  var everLoaded = false;
  function parseTags(raw) {
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.slice(0, 4) : [];
    } catch {
      return [];
    }
  }
  var lastFingerprint = "";
  var dirtyProjects = /* @__PURE__ */ new Set();
  var archivedProjects = [];
  var collecting = false;
  var addedProjects = [];
  var changedProjectCount = 0;
  var changedProjectDetail = [];
  var lastLoadAt = 0;
  var num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  var totalOf = (p) => num(p.total);
  var doneOf = (p) => num(p.done);
  var readyOf = (p) => num(p.ready);
  var doingOf = (p) => num(p.doing);
  var failedOf = (p) => num(p.failed);
  var reviewOf = (p) => num(p.review);
  var heldOf = (p) => num(p.held);
  var blockedOf = (p) => heldOf(p) + failedOf(p);
  var liveDoingOf = (p) => {
    if (typeof p.liveClaims === "number") return p.liveClaims;
    return p.tasks.filter((t) => t.status === "doing" && t.ownerAlive).length;
  };
  var inFlightOf = (p) => liveDoingOf(p) + failedOf(p);
  var prog = (p) => ({ done: doneOf(p), total: totalOf(p) });
  function taskLabel(t) {
    if (t.status === "done") return { cls: "b-done", label: "\u5DF2\u5B8C\u6210", icon: "i-done" };
    if (t.status === "doing") return { cls: "b-doing", label: "\u8FDB\u884C\u4E2D", icon: "i-doing" };
    if (t.status === "review") return { cls: "b-ready", label: "\u5F85\u9A8C\u6536", icon: "i-ready" };
    if (t.status === "blocked") return { cls: "b-idle", label: "\u7B49\u5F85\u4E2D", icon: "i-wait" };
    return { cls: "b-ready", label: "\u5F85\u5F00\u59CB", icon: "i-ready" };
  }
  function projState(p) {
    if (p.total === 0) return { cls: "b-idle", label: "\u672A\u62C6\u89E3", icon: "i-tasks" };
    if (p.done === p.total) return { cls: "b-done", label: "\u5DF2\u5B8C\u6210", icon: "i-done" };
    const BEAT_LIVE_MIN = 15;
    const someoneHereNow = num(p.workingSessions) > 0 || num(p.liveTasks) > 0 || liveDoingOf(p) > 0 || num(p.liveClaims) > 0 || typeof p.lastBeatMin === "number" && p.lastBeatMin >= 0 && p.lastBeatMin <= BEAT_LIVE_MIN;
    const progressedRecently = isLive(p);
    const legacyFallback = p.workingSessions === void 0 && p.lastBeatMin === void 0 && num(p.liveSessions) > 0 && progressedRecently;
    const working = (someoneHereNow || legacyFallback) && progressedRecently;
    if (working || reviewOf(p) > 0) {
      return { cls: "b-doing", label: "\u8FDB\u884C\u4E2D", icon: "i-doing" };
    }
    if (readyOf(p) > 0) return { cls: "b-ready", label: "\u5F85\u5F00\u59CB", icon: "i-ready" };
    return { cls: "b-idle", label: "\u7B49\u5F85\u4E2D", icon: "i-wait" };
  }
  var ACTIVITY_LIVE_MIN = 90;
  var isLive = (p) => {
    if (typeof p.lastWorkMin === "number" && p.lastWorkMin >= 0) {
      return p.lastWorkMin <= ACTIVITY_LIVE_MIN;
    }
    return p.tasks.some((t) => t.ownerAlive === true);
  };
  function stallNote(p) {
    const stalled = num(p.stalledTasks);
    const overdue = num(p.overdueEta);
    if (!stalled && !overdue) return "";
    const bits = [];
    if (overdue) bits.push(`${overdue} \u4E2A\u903E\u671F\u6CA1\u4EA4`);
    if (stalled) bits.push(`${stalled} \u4E2A\u5360\u7740\u6CA1\u63A8\u8FDB`);
    return `<span class="meta-warn" title="\u6709\u4EBA\u5360\u7740\u8FD9\u4E9B\u4EFB\u52A1\uFF0C\u4F46\u4E00\u5C0F\u65F6\u4EE5\u4E0A\u6CA1\u6709\u68C0\u67E5\u70B9\u6216\u4EA7\u51FA\u3002${overdue ? " \u5176\u4E2D\u4E00\u4E9B\u662F\u4F1A\u8BDD\u81EA\u5DF1\u58F0\u660E\u8FC7 ETA\u3001\u73B0\u5728\u8FC7\u4E86\u3002" : ""}\u8FD9\u4E0D\u662F\u5931\u8D25\uFF0C\u662F"\u8BE5\u95EE\u4E00\u53E5\u4E86"\u3002">\u26A0 ${bits.join(" \xB7 ")}</span>`;
  }
  function activityText(min) {
    if (min === void 0 || min < 0) return "";
    if (min < 3) return "\u521A\u521A\u52A8\u8FC7";
    if (min < 60) return `${min} \u5206\u949F\u524D\u52A8\u8FC7`;
    const h = Math.floor(min / 60);
    if (h < 48) return `${h} \u5C0F\u65F6\u524D\u52A8\u8FC7`;
    return `${Math.floor(h / 24)} \u5929\u524D\u52A8\u8FC7`;
  }
  function unmetDeps(p, t) {
    if (!t.depends?.length) return [];
    const byKey2 = new Map(p.tasks.map((x) => [x.key, x]));
    return t.depends.filter((k) => {
      const dep = byKey2.get(k);
      return dep ? dep.status !== "done" : true;
    });
  }
  function statusLine(p, t) {
    const base2 = taskLabel(t).label;
    const unmet = unmetDeps(p, t);
    const stale = t.owner && t.ownerAlive === false;
    const staleNote = stale ? ` \xB7 \u88AB ${t.owner} \u5360\u7740\uFF0C${beatText(t.ownerBeatMin)}\u6CA1\u52A8` : "";
    if (t.status === "done") return `${base2}${t.owner ? ` \xB7 ${t.owner}` : ""}`;
    if (t.status === "doing") return `${base2}${t.owner ? ` \xB7 \u5DF2\u88AB ${t.owner} \u9886\u8D70` : ""}`;
    if (t.status === "blocked") {
      if (unmet.length) return `${base2} \xB7 \u5361\u5728 ${unmet.join("\u3001")}${staleNote}`;
      return `${base2} \xB7 \u5E93\u91CC\u539F\u59CB\u72B6\u6001\uFF1Ablocked${t.depends?.length ? `\uFF08\u524D\u7F6E ${t.depends.join("\u3001")} \u90FD\u5DF2\u5B8C\u6210\uFF09` : ""}${staleNote}`;
    }
    if (t.depends?.length) return `${base2} \xB7 \u524D\u7F6E\u5DF2\u5C31\u7EEA${t.owner ? `\uFF0C${stale ? `\u88AB ${t.owner} \u5360\u7740` : `\u5DF2\u88AB ${t.owner} \u9886\u8D70`}` : "\uFF0C\u8FD8\u6CA1\u4EBA\u9886"}`;
    if (stale) return `${base2} \xB7 \u8FD8\u6CA1\u4EBA\u9886\uFF08${t.owner} \u5360\u8FC7\u4F46\u5DF2 ${beatText(t.ownerBeatMin)}\u6CA1\u52A8\uFF09`;
    return `${base2} \xB7 \u8FD8\u6CA1\u4EBA\u9886`;
  }
  function beatText(min) {
    if (min === void 0 || min < 0) return "\u5F88\u4E45";
    if (min < 60) return `${min} \u5206\u949F`;
    const h = Math.floor(min / 60);
    if (h < 48) return `${h} \u5C0F\u65F6`;
    return `${Math.floor(h / 24)} \u5929`;
  }
  function projBlock(p, t) {
    const info = projInfo(p);
    if (t) {
      const body2 = [];
      const isDone = t.status === "done";
      const isReview = t.status === "review";
      body2.push(isDone ? `\u3010\u5DF2\u5B8C\u6210 \xB7 ${p.name} / ${t.key}\u3011` : isReview ? `\u3010\u5F85\u9A8C\u6536 \xB7 ${p.name} / ${t.key}\u3011` : `\u3010\u7EE7\u7EED\u505A \xB7 ${p.name} / ${t.key}\u3011`);
      body2.push(...info);
      body2.push("");
      body2.push(`\u4EFB\u52A1\uFF1A${t.title}`);
      body2.push(`\u72B6\u6001\uFF1A${statusLine(p, t)}`);
      body2.push(`\u4F9D\u8D56\uFF1A${t.depends?.length ? t.depends.join("\u3001") : "\u65E0"}`);
      if (t.contract) {
        const c = parseContract(t.contract);
        if (c.goal || c.acceptance.length) {
          body2.push("");
          body2.push("\u5408\u540C\uFF08\u8FD9\u4EF6\u4E8B\u73B0\u5728\u7684\u8981\u6C42 \u2014\u2014 \u4EFB\u52A1\u540D\u5B57\u53EA\u662F\u6807\u7B7E\uFF0C\u8303\u56F4\u4EE5\u8FD9\u91CC\u4E3A\u51C6\uFF09\uFF1A");
          if (c.goal) body2.push(`  \u76EE\u6807\uFF1A${c.goal}`);
          if (c.acceptance.length) {
            body2.push("  \u9A8C\u6536\u6807\u51C6\uFF1A");
            for (const a of c.acceptance) body2.push(`    \xB7 ${a}`);
          }
          if (c.constraints.length) {
            body2.push("  \u7EA6\u675F\uFF1A");
            for (const x of c.constraints) body2.push(`    \xB7 ${x}`);
          }
        }
      }
      body2.push("");
      if (t.desc) {
        body2.push("\u63A5\u7EED\u8BF4\u660E\uFF08\u5E93\u91CC\u539F\u59CB\u8BB0\u5F55\uFF0C\u542B\u522B\u4EBA\u8E29\u8FC7\u7684\u5751\uFF09\uFF1A");
        const DESC_MAX = 1200;
        if (t.desc.length > DESC_MAX) {
          body2.push(t.desc.slice(0, DESC_MAX));
          body2.push(`\u2026\u2026\uFF08\u8BF4\u660E\u8FC7\u957F\u5DF2\u622A\u65AD\uFF0C\u5B8C\u6574 ${t.desc.length} \u5B57\u8BF7\u7528 project_context_pack \u6216\u76F4\u63A5\u770B task.description\uFF09`);
        } else {
          body2.push(t.desc);
        }
      } else {
        body2.push("\u63A5\u7EED\u8BF4\u660E\uFF1A\u5E93\u91CC\u8FD9\u4E2A\u4EFB\u52A1\u6CA1\u5199\u8BF4\u660E\uFF0C\u80FD\u7EE7\u627F\u7684\u53EA\u6709\u4E0A\u9762\u8FD9\u4E9B\u3002");
        body2.push("  \u8BFB\u4E86\u4E0A\u4E0B\u6587\u540E\uFF0C\u628A\u4F60\u67E5\u5230\u7684\u80CC\u666F\u548C\u8E29\u5230\u7684\u5751\u5199\u8FDB\u68C0\u67E5\u70B9\u7684 pitfalls / completed\uFF1B");
        body2.push('  \u987A\u5E26\u56DE\u62A5\u4E00\u53E5"\u8FD9\u4E2A\u4EFB\u52A1\u7684\u8BF4\u660E\u662F\u7A7A\u7684"\uFF08description \u521B\u5EFA\u65F6\u5199\u6B7B\uFF0C\u6539\u4E0D\u4E86\uFF09\u3002');
      }
      if (t.nextAct) {
        body2.push("");
        body2.push(`\u4E0A\u4E00\u6B65\u7559\u4E0B\u7684\u4EA4\u4EE3\uFF1A${t.nextAct}`);
      }
      if (t.status === "blocked") {
        const waiting = unmetDeps(p, t);
        body2.push("");
        if (waiting.length) {
          body2.push(`\u6CE8\u610F\uFF1A\u5E93\u91CC\u6807\u4E86 blocked\uFF0C\u800C\u4E14\u524D\u7F6E\u300C${waiting.join("\u3001")}\u300D\u8FD8\u6CA1\u5B8C\u6210 \u2014\u2014 \u73B0\u5728\u522B\u5F00\u5DE5\u3002`);
        } else {
          body2.push("\u6CE8\u610F\uFF1A\u5E93\u91CC\u6807\u4E86 blocked\uFF0C\u4F46**\u6CA1\u6709\u672A\u5B8C\u6210\u7684\u524D\u7F6E** \u2014\u2014 \u8BF4\u660E\u5361\u7684\u662F\u5916\u90E8\u539F\u56E0\uFF08\u7B49\u4EBA/\u7B49\u8D44\u8D28/\u7B49\u51B3\u5B9A\uFF09\u3002");
          body2.push('  \u522B\u81EA\u5DF1\u60F3\u529E\u6CD5\u7ED5\u8FC7\u53BB\uFF0C\u5148\u628A"\u5230\u5E95\u5728\u7B49\u8C01"\u95EE\u6E05\u695A\u518D\u52A8\u624B\u3002');
        }
        body2.push("");
        body2.push("\u26A0 \u4E0A\u9762\u7684\u300C\u63A5\u7EED\u8BF4\u660E\u300D\u662F**\u5F53\u65F6\u90A3\u4E2A\u4F1A\u8BDD\u5199\u4E0B\u7684\u73B0\u573A\u8BB0\u5F55**\uFF0C\u53EF\u80FD\u5939\u7740\u5B83\u5F53\u65F6\u7684\u53D8\u901A\u529E\u6CD5\u3002");
        body2.push("  \u90A3\u4E9B\u529E\u6CD5\u53CD\u6620\u7684\u662F**\u5F53\u65F6\u7684\u5E93**\uFF0C\u5DE5\u5177\u548C\u884C\u4E3A\u540E\u6765\u53D8\u8FC7 \u2014\u2014 \u7167\u6284\u524D\u5148\u7528 project_overview \u6838\u4E00\u904D\uFF0C");
        body2.push("  \u6216\u8005\u76F4\u63A5\u95EE\u7528\u6237\uFF1B\u4E0D\u8981\u56E0\u4E3A\u4E00\u53E5\u8BDD\u5C31\u7ED5\u8FC7\u73B0\u5728\u7684\u524D\u7F6E/\u6743\u9650\u89C4\u5219\u3002");
        const dangling = danglingDeps(p, t);
        if (dangling.length) {
          body2.push(`\u53E6\u5916\uFF1A\u524D\u7F6E\u300C${dangling.join("\u3001")}\u300D\u5728\u5F53\u524D\u5E93\u91CC\u67E5\u4E0D\u5230\uFF08\u53EF\u80FD\u5DF2\u5220/\u6539\u540D/\u5C5E\u4E8E\u522B\u7684\u9879\u76EE\uFF09\u2014\u2014 \u5148\u95EE\u6E05\u695A\uFF0C\u522B\u731C\u3002`);
        }
      }
      if (isDone) {
        body2.push("");
        body2.push("\u8FD9\u4E2A\u4EFB\u52A1\u5DF2\u7ECF\u6807\u8BB0\u5B8C\u6210\u4E86\u3002\u5982\u679C\u4F60\u662F\u60F3**\u4E86\u89E3\u5B83\u505A\u4E86\u4EC0\u4E48**\uFF0C\u8BFB\u4E0A\u9762\u8FD9\u4E9B\u5C31\u591F\u4E86\uFF1B");
        body2.push("\u5982\u679C\u4F60\u89C9\u5F97\u8FD8\u5F97\u7EE7\u7EED\u505A\uFF0C**\u5148\u7528\u8FD9\u6761\u8DEF\u628A\u5B83\u9000\u56DE\u961F\u5217**\uFF08\u522B\u76F4\u63A5\u6539\u72B6\u6001 \u2014\u2014 \u7EC8\u6001\u4E0D\u80FD\u76F4\u63A5\u6539\uFF09\uFF1A");
        body2.push(`  project_task_reopen(task_id=<\u4E0B\u9762\u90A3\u4E2A id>, session_id=<\u4F60\u7684 id>, reason="<\u4E3A\u4EC0\u4E48\u8981\u91CD\u5F00>")`);
        body2.push("  \u5B83\u628A\u4EFB\u52A1\u9000\u56DE pending \u5E76\u7559 task_reopened \u4E8B\u4EF6\uFF08reason \u5FC5\u586B\uFF0C\u5E73\u53F0\u4E0D\u7559\u6084\u6084\u6539\u7EC8\u6001\u7684\u53E3\u5B50\uFF09\uFF1B");
        body2.push("  \u4E4B\u540E\u5C31\u80FD\u6B63\u5E38\u8D70\uFF1A\u9886 \u2192 \u8865\u68C0\u67E5\u70B9 \u2192 \u518D\u6807 done\u3002");
        body2.push(`\u60F3\u62FF\u5B8C\u6574\u4E0A\u4E0B\u6587\uFF1Aproject_overview(project="${p.key}") \u770B\u5B83\u8FD9\u4E00\u9879`);
        body2.push("  \uFF08\u5DF2 done \u7684\u4EFB\u52A1\u4E0D\u80FD\u518D dispatch \u2014\u2014 \u4F1A\u56DE already done\uFF09\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u8BFB\u5B83\u5386\u53F2\u4E0A\u7684\u68C0\u67E5\u70B9\u3002");
        body2.push('\u53E6\u5916\uFF1A**\u4EE3\u7801\u5730\u56FE\u6807\u4E86 done \u4E5F\u80FD\u8865\u5199** \u2014\u2014 \u95E8\u7981\u770B\u7684\u662F"\u4F60\u5728\u672C\u9879\u76EE\u91CC\u5E72\u8FC7"');
        body2.push("  \uFF08\u62E5\u6709\u4EFB\u52A1 / \u8FD1 7 \u5929\u6709\u68C0\u67E5\u70B9\uFF09\uFF0C\u4E0D\u770B\u4EFB\u52A1\u662F\u5426\u5DF2\u5B8C\u6210\u3002\u53D1\u73B0\u4E0A\u9762\u90A3\u5F20\u56FE\u7F3A\u4E86\u5C31\u8865\u3002");
        return body2.join("\n");
      }
      if (isReview) {
        body2.push("");
        body2.push("\u8FD9\u4E2A\u4EFB\u52A1\u5DF2\u7ECF\u505A\u5B8C\u4E86\uFF0C**\u6B63\u5728\u7B49\u9A8C\u6536** \u2014\u2014 \u522B\u7EE7\u7EED\u505A\u3001\u4E5F\u522B\u91CD\u505A\u3002");
        body2.push("\u8981\u505A\u7684\u662F**\u627E\u53E6\u4E00\u4E2A\u4F1A\u8BDD\u6765\u5BF9\u8D26**\uFF08\u5BF9\u8D26\u4EBA\u4E0D\u80FD\u662F\u4EFB\u52A1\u6240\u6709\u8005\uFF09\uFF1A");
        body2.push('  project_reconcile(project=\u2026, task_id=<\u4E0B\u9762\u90A3\u4E2A id>, status="verified",');
        body2.push('                    reviewer_session_id=<\u53E6\u4E00\u4E2A\u4F1A\u8BDD\u7684 id>, summary="\u5BF9\u8D26\u7ED3\u8BBA")');
        body2.push("  \xB7 \u5BF9\u8D26\u65F6\u5E73\u53F0\u4F1A**\u81EA\u52A8\u8DD1\u5408\u540C\u91CC\u7684\u53EF\u5224\u5B9A\u5224\u636E**\uFF0C\u7ED3\u679C\u4F5C\u4E3A\u8BC1\u636E\u7559\u6863 \u2014\u2014");
        body2.push('    \u6240\u4EE5\u5224\u636E\u5199\u5F97\u597D\u4E0D\u597D\uFF0C\u76F4\u63A5\u51B3\u5B9A\u5BF9\u8D26\u662F\u4E0D\u662F"\u8BFB\u4E00\u904D\u8BF4\u901A\u8FC7"\u3002');
        body2.push('  \xB7 \u8981\u662F\u53D1\u73B0\u6CA1\u505A\u5B8C \u2192 status="rejected"\uFF0C\u800C\u4E14**\u5FC5\u987B\u5199\u6E05 location / defect / fix**');
        body2.push('    \uFF08\u53EA\u5199 rejected \u4E0D\u5199\u7EC6\u8282\uFF0C\u4E0B\u4E00\u4E2A\u4F1A\u8BDD\u9664\u4E86"\u6CA1\u8FC7"\u4EC0\u4E48\u90FD\u5F97\u4E0D\u5230\uFF09\u3002');
        body2.push("  \xB7 \u5BF9\u8D26\u5B8C\u628A\u4EFB\u52A1\u72B6\u6001\u6309\u7ED3\u679C\u6539\uFF1A\u8FC7\u4E86 \u2192 \u7559 review \u7B49\u4EBA\u786E\u8BA4\u6536\u53E3\uFF1B\u6CA1\u8FC7 \u2192 \u9000\u56DE pending \u8FD4\u5DE5\u3002");
        body2.push('\u26A0 \u4F60\u81EA\u5DF1\u4E0D\u80FD\u9A8C\u81EA\u5DF1\uFF08\u4F1A\u62A5 "The task owner cannot verify its own task"\uFF09\u2014\u2014');
        body2.push("  \u5982\u679C\u73B0\u5728\u53EA\u6709\u4F60\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u5C31\u628A\u8FD9\u6761**\u62A5\u544A\u7ED9\u7528\u6237**\uFF0C\u8BF7\u53E6\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u3002");
        return body2.join("\n");
      }
      body2.push("");
      body2.push("\u6267\u884C\u8981\u6C42\uFF08\u987A\u5E8F\u522B\u6362 \u2014\u2014 \u6362\u9519\u4E00\u6B65\u4F1A\u628A\u81EA\u5DF1\u9501\u6B7B\uFF0C\u89C1\u7B2C 4 \u6761\uFF09\uFF1A");
      body2.push(`  1) \u5148\u767B\u8BB0\u5E76\u9886\u4EFB\u52A1\uFF0C\u62FF\u5230\u5B83\u7684 id\uFF08\u6CE8\u610F\uFF1A**id \u4E0D\u662F\u4E0B\u9762\u8FD9\u4E2A key**\uFF0C\u662F\u5E93\u91CC 32 \u4F4D uuid\uFF09\uFF1A`);
      body2.push(`     project_task_dispatch(project="${p.key}", task_key="${t.key}")   \u2190 \u8FD4\u56DE\u91CC\u627E id`);
      body2.push(`     \u4E0D\u9886\u5C31\u76F4\u63A5\u5E72\u7684\u8BDD\uFF0C\u4F60\u53D1\u4E0D\u4E86\u4EA7\u51FA\u3001\u6700\u540E\u4E5F\u6807\u4E0D\u4E86\u5B8C\u6210\uFF08\u90A3\u4E24\u4EF6\u4E8B\u90FD\u8981\u6C42"\u4EFB\u52A1\u5728\u4F60\u540D\u4E0B"\uFF09\u3002`);
      body2.push(`  2) \u7528\u90A3\u4E2A id \u8BFB\u4E0A\u4E0B\u6587\uFF1Aproject_context_pack(project="${p.key}", task_id="<\u4E0A\u4E00\u6B65\u7684 id>")`);
      body2.push("     \u9A8C\u6536\u6807\u51C6\u4EE5\u91CC\u9762\u7684 Objective / Acceptance \u4E3A\u51C6\uFF1B\u8FD9\u4E24\u4E2A\u662F\u7A7A\u7684\u5C31\u81EA\u5DF1\u5199\u51FA\u9A8C\u6536\u6807\u51C6\u5E76\u56DE\u5199\u3002");
      body2.push(...mapRequirement(p, "3"));
      body2.push("  4) \u5E72\u6D3B\u3002**\u6536\u5C3E\u987A\u5E8F\u4E5F\u4E0D\u80FD\u6362**\uFF1A");
      body2.push("     \u26A0 \u5199\u5408\u540C\u65F6\uFF0C\u9A8C\u6536\u6807\u51C6\u5C3D\u91CF\u5199\u6210**\u53EF\u5224\u5B9A\u7684\u5224\u636E** \u2014\u2014 \u5BF9\u8D26\u65F6\u4F1A\u88AB\u81EA\u52A8\u6267\u884C\u5E76\u53D6\u8BC1\uFF1A");
      body2.push("       file_exists:<\u8DEF\u5F84>              \u5B58\u5728\u3001\u662F\u6587\u4EF6\u3001\u975E\u7A7A");
      body2.push("       no_placeholders:<\u8DEF\u5F84>          \u6CA1\u6709 TODO/TBD/FIXME/[INSERT]/\u5F85\u5B9E\u73B0");
      body2.push("       grep_absent:<\u8DEF\u5F84>::<\u6587\u672C>      \u641C\u4E0D\u5230\u90A3\u6BB5\u6587\u672C");
      body2.push("       sha256:<\u8DEF\u5F84>::<\u6458\u8981>           \u5185\u5BB9\u6307\u7EB9\u4E00\u81F4");
      body2.push("       tests_pass:<\u6D4B\u8BD5\u547D\u4EE4>           \u6D4B\u8BD5\u901A\u8FC7\uFF08\u9700\u4F60\u5B9E\u9645\u8DD1\uFF0C\u7ED3\u679C\u4F5C\u4E3A evidence \u4F20\uFF09");
      body2.push("       \u81EA\u7136\u8BED\u8A00\u7167\u65E7\u53EF\u4EE5\u5199 \u2014\u2014 \u4E0D\u4F1A\u88AB\u62D2\uFF0C\u53EA\u662F\u4E0D\u4F1A\u88AB\u81EA\u52A8\u9A8C\uFF08\u7531\u590D\u6838\u4F1A\u8BDD\u8BFB\uFF09");
      body2.push("     a. project_checkpoint(project=\u2026, task_id=<id>, state={completed/not_done/pitfalls/blockers/next_action})");
      body2.push('     b. project_artifact_publish(project=\u2026, task_id=<id>, kind="doc", path="<\u771F\u5B9E\u5B58\u5728\u7684\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84>", revision="<7\u4F4D\u4EE5\u4E0Agit\u77EDSHA>")');
      body2.push("        \u26A0 \u5FC5\u987B\u662F\u4F60\u81EA\u5DF1\u540D\u4E0B\u7684\u4EFB\u52A1\u624D\u80FD\u53D1\uFF1B\u8DEF\u5F84\u5FC5\u987B\u843D\u5728\u9879\u76EE\u76EE\u5F55\u5185\u4E14\u6587\u4EF6\u771F\u7684\u5B58\u5728\u3002");
      body2.push("     c. **\u6807 done \u4E4B\u524D\u5148\u8DD1\u4E00\u904D\u9A8C\u6536\u5224\u636E**\uFF1Aproject_preflight(project=\u2026, task_id=<id>)");
      body2.push("        \u5B83\u6267\u884C\u4F60\u5408\u540C\u91CC\u7684\u53EF\u5224\u5B9A\u5224\u636E\uFF08file_exists: / tests_pass: / grep_absent: / sha256: \u2026\uFF09\uFF0C");
      body2.push("        \u544A\u8BC9\u4F60\u54EA\u6761\u8FD8\u6CA1\u8FC7 \u2014\u2014 \u5728**\u8FD8\u80FD\u6539**\u7684\u65F6\u5019\u770B\u5230\uFF0C\u800C\u4E0D\u662F\u6807\u5B8C\u88AB\u5224\u4E0D\u901A\u8FC7\u518D\u8FD4\u5DE5\u3002");
      body2.push("        \u5199\u5408\u540C\u65F6\u5C3D\u91CF\u628A\u9A8C\u6536\u6807\u51C6\u5199\u6210\u5224\u636E\uFF08\u81EA\u7136\u8BED\u8A00\u7167\u65E7\u53EF\u4EE5\u5199\uFF0C\u53EA\u662F\u4E0D\u4F1A\u88AB\u81EA\u52A8\u9A8C\uFF09\uFF1A");
      body2.push("          file_exists:<\u8DEF\u5F84> / no_placeholders:<\u8DEF\u5F84> / grep_absent:<\u8DEF\u5F84>::<\u6587\u672C> /");
      body2.push("          sha256:<\u8DEF\u5F84>::<\u6458\u8981> / tests_pass:<\u547D\u4EE4> / endpoint_ok:<URL>");
      body2.push('     d. project_task_update(project=\u2026, task_id=<id>, status="done", next_action="\u4E0B\u4E00\u6B65")');
      body2.push("     e. \u4EE3\u7801\u5730\u56FE\u5EFA\u8BAE\u5728**\u6807 done \u4E4B\u524D**\u66F4\u65B0\uFF08\u90A3\u65F6\u8BED\u4E49\u6700\u6E05\u695A\uFF09\uFF1B");
      body2.push("        \u4E07\u4E00\u5FD8\u4E86\u3001\u5DF2\u7ECF\u6807\u4E86 done \u4E5F\u6CA1\u5173\u7CFB \u2014\u2014 \u53EA\u8981\u4F60\u5728\u8FD9\u4E2A\u9879\u76EE\u91CC\u5E72\u8FC7\uFF08\u62E5\u6709\u4EFB\u52A1 / \u8FD1 7 \u5929\u6709\u68C0\u67E5\u70B9\uFF09\u5C31\u4ECD\u80FD\u5199\u3002");
      body2.push(...discipline());
      body2.push("  \u54EA\u4E9B\u8BE5\u4F60\u81EA\u5DF1\u5B9A\u3001\u54EA\u4E9B\u8BE5\u6765\u95EE\u6211\uFF0C\u4F60\u81EA\u5DF1\u5224\u65AD \u2014\u2014 \u4F46\u522B\u8BA9\u4E0B\u4E2A\u4F1A\u8BDD\u628A\u540C\u6837\u7684\u4E8B\u518D\u95EE\u4E00\u904D\u3002");
      return body2.join("\n");
    }
    const body = [];
    body.push(`\u3010\u7EE7\u7EED\u505A \xB7 ${p.name}\u3011`);
    body.push(...info);
    body.push("");
    const pbits = [`${p.done}/${p.total} \u5DF2\u5B8C\u6210`];
    if (p.doing) pbits.push(`${p.doing} \u4E2A\u5728\u505A`);
    if (p.review) pbits.push(`${p.review} \u4E2A\u5F85\u9A8C\u6536`);
    if (p.ready) pbits.push(`${p.ready} \u4E2A\u5F85\u5F00\u59CB`);
    if (p.failed) pbits.push(`${p.failed} \u4E2A\u5361\u4F4F/\u5931\u8D25`);
    body.push(`\u8FDB\u5EA6\uFF1A${pbits.join(" \xB7 ")}`);
    body.push("");
    const group = (title, list) => {
      if (!list.length) return;
      body.push(`${title}\uFF1A`);
      for (const x of list) {
        const dep = x.depends?.length ? `\uFF08\u7B49 ${x.depends.join("\u3001")}\uFF09` : "";
        const who = x.owner ? `\uFF08${x.owner}\uFF09` : "";
        body.push(`  \xB7 ${x.key} \u2014\u2014 ${x.title}${dep}${who}`);
      }
    };
    group("\u8FD8\u6CA1\u4EBA\u9886", p.tasks.filter((x) => x.status === "ready"));
    group("\u6B63\u5728\u505A", p.tasks.filter((x) => x.status === "doing"));
    group("\u5F85\u9A8C\u6536", p.tasks.filter((x) => x.status === "review"));
    group("\u88AB\u5361\u4F4F", p.tasks.filter((x) => x.status === "blocked"));
    const doneAll = p.tasks.filter((x) => x.status === "done");
    const DONE_SHOW = 5;
    if (doneAll.length) {
      body.push("\u5DF2\u5B8C\u6210\uFF1A");
      for (const x of doneAll.slice(0, DONE_SHOW)) {
        body.push(`  \xB7 ${x.key} \u2014\u2014 ${x.title}`);
      }
      if (doneAll.length > DONE_SHOW) {
        body.push(`  \uFF08\u53E6\u6709 ${doneAll.length - DONE_SHOW} \u4E2A\u5DF2\u5B8C\u6210\u6CA1\u5217\u51FA\u6765\uFF0C\u9700\u8981\u65F6\u7528 project_overview \u67E5\uFF09`);
      }
    }
    const known = /* @__PURE__ */ new Set(["ready", "doing", "review", "blocked", "done"]);
    const rest = p.tasks.filter((x) => !known.has(x.status));
    if (rest.length) {
      body.push(`\u5176\u4ED6\u72B6\u6001 ${rest.length} \u4E2A\uFF1A${rest.map((x) => `${x.key}\uFF08${x.status}\uFF09`).join("\u3001")}`);
    }
    body.push("");
    body.push("\u6267\u884C\u8981\u6C42\uFF1A");
    body.push(`  1) \u5148\u770B\u9879\u76EE\u73B0\u72B6\uFF1Aproject_overview(project="${p.key}") \u62FF\u4EFB\u52A1\u6E05\u5355\u548C\u6700\u8FD1\u4E8B\u4EF6\u3002`);
    body.push(...mapRequirement(p, "2"));
    body.push(`  3) \u672C\u4F1A\u8BDD\u6CA1\u6307\u5B9A\u505A\u54EA\u4E2A\u4EFB\u52A1\u7684\u8BDD\uFF0C\u522B\u56DE\u6765\u95EE \u2014\u2014 \u76F4\u63A5\u67E5\u53EF\u9886\u7684\uFF1A`);
    body.push(`     project_ready_tasks(project="${p.key}")\uFF0C\u6311\u4E00\u4E2A"\u8FD8\u6CA1\u4EBA\u9886"\u7684\uFF0C`);
    body.push(`     \u7136\u540E project_task_dispatch(project="${p.key}", task_key="<\u6311\u4E2D\u7684\u90A3\u4E2A>") \u9886\u8D70\u5E76\u62FF\u5230 id\u3002`);
    body.push("     \u4E0A\u9762\u6BCF\u4E2A\u4EFB\u52A1\u5361\u4E5F\u80FD\u5355\u72EC\u590D\u5236\u63A5\u7EED\u5757\uFF0C\u91CC\u9762\u5E26\u7740\u90A3\u4E2A\u4EFB\u52A1\u7684\u5B8C\u6574\u4EA4\u63A5\u8BF4\u660E\u3002");
    body.push("  4) \u5408\u540C\u91CC\u7684\u9A8C\u6536\u6807\u51C6\u82E5\u8FD8\u662F\u6563\u6587\uFF0C\u53EF\u4EE5\u987A\u624B\u8865\u6210**\u53EF\u5224\u5B9A\u7684\u5224\u636E**\uFF08\u5E73\u53F0\u4F1A\u6309\u5224\u636E\u62E6 done\uFF09\uFF1A");
    body.push("     file_exists:<\u8DEF\u5F84> / tests_pass:<\u547D\u4EE4> / grep_absent:<\u8DEF\u5F84>::<\u6587\u672C> \u7B49\uFF0C");
    body.push("     \u8981\u70B9\u662F\u628A**\u5177\u4F53\u8DEF\u5F84 / \u5177\u4F53\u547D\u4EE4 / \u5177\u4F53 URL** \u5199\u51FA\u6765\uFF08\u8BE6\u89C1\u300C\u52A0\u65B0\u4EFB\u52A1\u300D\u5757\uFF09\u3002");
    body.push(...discipline());
    return body.join("\n");
  }
  function repoLine(p) {
    const root = (p.root || "").trim();
    return root ? [`\u4ED3\u5E93\uFF1A${root}`] : ["\u4ED3\u5E93\uFF1A\u5E93\u91CC\u6CA1\u767B\u8BB0\u8FD9\u4E2A\u9879\u76EE\u7684\u4EE3\u7801\u76EE\u5F55\uFF08\u5148\u7528 project_for_path \u786E\u8BA4\u5DE5\u4F5C\u76EE\u5F55\uFF09"];
  }
  function parseContract(raw) {
    const empty = { goal: "", acceptance: [], constraints: [] };
    try {
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return empty;
      const asList = (v) => {
        if (v === null || v === void 0) return [];
        if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
        const s = String(v).trim();
        return s ? [s] : [];
      };
      return {
        goal: String(o.goal || o.objective || "").trim(),
        acceptance: asList(o.acceptance),
        constraints: asList(o.constraints)
      };
    } catch {
      return empty;
    }
  }
  function projInfo(p) {
    const scope = (p.scope || "").trim();
    return scope ? [`\u9879\u76EE\uFF1A${scope}`, ...repoLine(p)] : [`\u9879\u76EE\uFF1A\u5E93\u91CC\u6CA1\u5199\u8FD9\u4E2A\u9879\u76EE\u7684 scope \u2014\u2014 \u5148\u7528 project_overview(project="${p.key}") \u641E\u6E05\u695A\u5B83\u662F\u4EC0\u4E48\u518D\u52A8\u624B\u3002`, ...repoLine(p)];
  }
  function danglingDeps(p, t) {
    if (!t.depends?.length) return [];
    const known = new Set(p.tasks.map((x) => x.key));
    return t.depends.filter((d) => !known.has(d));
  }
  function predicateGuide(indent = "      ") {
    return [
      "file_exists:<\u8DEF\u5F84> / no_placeholders:<\u8DEF\u5F84> / grep_absent:<\u8DEF\u5F84>::<\u6587\u672C> /",
      "sha256:<\u8DEF\u5F84>::<\u6458\u8981> / tests_pass:<\u547D\u4EE4> / endpoint_ok:<URL>",
      "\u8981\u70B9\uFF1A\u628A**\u5177\u4F53\u8DEF\u5F84 / \u5177\u4F53\u547D\u4EE4 / \u5177\u4F53 URL** \u5199\u51FA\u6765 \u2014\u2014",
      '  "\u6D4B\u8BD5\u5168\u90E8\u901A\u8FC7"\u6CA1\u7528\uFF08\u4E0D\u77E5\u9053\u8DD1\u4EC0\u4E48\uFF09\u2192 "\u6D4B\u8BD5 npm test \u5168\u90E8\u901A\u8FC7"\u624D\u884C\uFF1B',
      '  "\u7ED3\u8BBA\u56DE\u5199\u6587\u6863"\u6CA1\u7528 \u2192 "\u7ED3\u8BBA\u56DE\u5199 docs/xxx.md"\u624D\u884C\u3002',
      "\u26A0 **\u522B\u6307\u671B\u4E8B\u540E\u81EA\u52A8\u8F6C\u6362**\uFF1A\u5B9E\u6D4B\u5168\u5E93 176 \u6761\u9A8C\u6536\u6807\u51C6\u81EA\u52A8\u63D0\u5224\u636E\u53EA\u63D0\u51FA 9 \u6761\uFF085%\uFF09\uFF0C",
      '  \u4E14\u5168\u662F"\u63D0\u5230\u4E86\u67D0\u4E2A\u5177\u4F53\u6587\u4EF6"\u90A3\u7C7B \u2014\u2014 "\u529F\u80FD\u53EF\u7528"\u8FD9\u79CD\u8BDD\u91CC\u672C\u6765\u5C31\u6CA1\u6709\u53EF\u5224\u5B9A\u7684\u4E1C\u897F\u3002',
      "  \u5224\u636E\u53EA\u80FD**\u5199\u5408\u540C\u7684\u65F6\u5019\u987A\u624B\u5199**\uFF1B\u62FF\u4E0D\u51C6\u80FD\u4E0D\u80FD\u5224\u5C31\u8DD1\u4E00\u4E0B preflight\uFF0C\u5B83\u4F1A\u544A\u8BC9\u4F60\u3002"
    ].map((l) => indent + l);
  }
  function discipline() {
    return [
      "",
      "  \u51E0\u6761\u7EAA\u5F8B\uFF1A",
      "    \xB7 \u2605\u2605 **\u6CA1\u505A\u5B8C\u7684\u4EFB\u52A1\uFF0C\u7EDD\u5BF9\u4E0D\u8981\u6807 done\u3002** \u540E\u679C\u6700\u91CD\u7684\u4E00\u6761\uFF1A",
      "      \u6807\u4E86 done\uFF0C\u9762\u677F\u4F1A\u8BF4\u8FD9\u4EF6\u4E8B\u5B8C\u4E86\u3001\u4E0B\u4E2A\u4F1A\u8BDD\u4EE5\u4E3A\u4E0D\u7528\u518D\u7BA1\u3001\u5BF9\u8D26\u65F6\u62FF\u4E0D\u5230\u4E1C\u897F\u3002",
      "      \u800C\u4E14\u5E73\u53F0**\u7981\u6B62 done \u76F4\u63A5\u6539\u56DE running**\uFF08\u7406\u7531 Self-approval\uFF09\uFF0C\u8981\u6539\u56DE\u6765\u53EA\u80FD\u8D70",
      '        project_task_reopen(task_id=<id>, session_id=<\u4F60>, reason="\u6807\u65E9\u4E86\uFF0C\u5B9E\u9645\u6CA1\u505A\u5B8C")',
      "      \u2605 \u5E73\u53F0\u8FD8\u4F1A**\u66FF\u4F60\u62E6\u4E00\u9053**\uFF1A\u5408\u540C\u91CC\u5199\u4E86\u53EF\u5224\u5B9A\u5224\u636E\u3001\u800C\u5224\u636E\u6CA1\u8FC7\u65F6\uFF0C",
      "        \u6807 done \u4F1A\u88AB**\u76F4\u63A5\u62D2\u7EDD**\uFF0C\u62A5\u9519\u5217\u51FA\u6CA1\u8FC7\u7684\u90A3\u51E0\u6761\u548C\u8BC1\u636E\u3002",
      "        \uFF08**\u7EAF\u6563\u6587**\u9A8C\u6536\u6807\u51C6\u7684\u5408\u540C\u4E0D\u53D7\u6B64\u9650 \u2014\u2014 \u90A3\u79CD\u7531\u72EC\u7ACB\u5BF9\u8D26\u88C1\u5B9A\u3002\uFF09",
      "      \u52A8\u624B\u524D\u5148\u95EE\u81EA\u5DF1\uFF1A**\u8FD9\u6D3B\u771F\u505A\u5B8C\u4E86\u5417\uFF1F** \u6CA1\u505A\u5B8C\u5C31\u6309\u5B9E\u9645\u7559\u72B6\u6001\uFF08pending / blocked / review\uFF09\uFF0C",
      "      \u522B\u4E3A\u4E86\u6536\u5C3E\u786C\u6807 done\u3002",
      "    \xB7 \u4EFB\u4F55\u5DE5\u5177\u62A5\u9519\uFF0C\u628A**\u62A5\u9519\u539F\u6587**\u7167\u8D34\u56DE\u6765\uFF08\u542B\u5DE5\u5177\u540D\u548C\u5B8C\u6574 message\uFF09\uFF0C\u4E0D\u8981\u6539\u8FF0\u3001\u4E0D\u8981\u5047\u88C5\u6210\u529F\u3002",
      "    \xB7 \u987A\u5E8F\u6700\u5173\u952E\uFF1A**\u5148\u9886\u4EFB\u52A1 \u2192 \u52A8\u624B \u2192 \u66F4\u65B0\u4EE3\u7801\u5730\u56FE \u2192 \u68C0\u67E5\u70B9/\u4EA7\u51FA \u2192 \u6700\u540E\u624D\u6807 done**\u3002",
      "      \u5148\u6807 done \u4F1A**\u53D1\u4E0D\u51FA\u4EA7\u51FA**\uFF08artifact_publish \u8981\u6C42\u4EFB\u52A1\u5728\u4F60\u540D\u4E0B\u4E14\u662F\u6D3B\u8DC3\u4EFB\u52A1\uFF09\u3002",
      '      \u4F46\u4EE3\u7801\u5730\u56FE\u4E0D\u4E00\u6837 \u2014\u2014 \u6807\u4E86 done \u4E5F\u80FD\u8865\u5199\uFF08\u95E8\u7981\u770B\u7684\u662F"\u4F60\u5728\u672C\u9879\u76EE\u91CC\u5E72\u8FC7"\uFF09\u3002',
      "    \xB7 \u6807 done \u53EA\u662F\u6807\u72B6\u6001\u3002\u7B97\u4E0D\u7B97\u771F\u5B8C\u6210\u7531**\u72EC\u7ACB\u5BF9\u8D26**\u8BF4\u4E86\u7B97\uFF0C\u5BF9\u8D26\u4EBA\u4E0D\u80FD\u662F\u4EFB\u52A1\u6240\u6709\u8005\uFF1A",
      '      project_reconcile(project=\u2026, task_id=<id>, status="verified", reviewer_session_id=<\u53E6\u4E00\u4E2A\u4F1A\u8BDD>)\u3002',
      '      \u770B\u5230 review \u72B6\u6001\u7684\u4EFB\u52A1**\u522B\u91CD\u505A** \u2014\u2014 \u90A3\u662F"\u7B49\u9A8C\u6536"\uFF0C\u53BB\u5BF9\u8D26\uFF08\u540C\u4E0A\uFF09\u3002',
      "    \xB7 **\u6807 done \u4E4B\u524D\u5148\u8DD1\u4E00\u904D\u9A8C\u6536\u5224\u636E**\uFF1Aproject_preflight(project=\u2026, task_id=<id>)",
      "      \u5B83\u6267\u884C\u5408\u540C\u91CC\u7684\u53EF\u5224\u5B9A\u5224\u636E\uFF0C\u544A\u8BC9\u4F60\u54EA\u6761\u8FD8\u6CA1\u8FC7 \u2014\u2014 \u5728**\u8FD8\u80FD\u6539**\u7684\u65F6\u5019\u770B\u5230\u3002",
      "      \uFF08\u5224\u636E**\u600E\u4E48\u5199**\u5728\u5EFA\u5361\u90A3\u4E00\u6B65\u8BB2\uFF1B\u81EA\u7136\u8BED\u8A00\u9A8C\u6536\u6807\u51C6\u7167\u65E7\u53EF\u4EE5\u5199\uFF0C\u53EA\u662F\u4E0D\u4F1A\u88AB\u81EA\u52A8\u9A8C\u3002\uFF09",
      "    \xB7 **\u5B9A\u4E0B\u6765\u7684\u8BBE\u8BA1/\u6280\u672F\u53D6\u820D\uFF0C\u987A\u624B\u8BB0\u8FDB\u5E93** \u2014\u2014 \u5426\u5219\u4E0B\u4E2A\u4F1A\u8BDD\u4F1A\u628A\u540C\u6837\u7684\u4E8B\u91CD\u65B0\u8BA8\u8BBA\u4E00\u904D\uFF1A",
      '      project_decision(project=\u2026, task_id=<id>, title="<\u4E00\u53E5\u7ED3\u8BBA>", decision="<\u5B9A\u4E86\u4EC0\u4E48>",',
      '                       rationale="<\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u5B9A>", evidence=[<\u6587\u4EF6\u8DEF\u5F84/\u547D\u4EE4/\u94FE\u63A5>])',
      '      \u91CD\u70B9\u662F **rationale\uFF08\u4E3A\u4EC0\u4E48\uFF09** \u2014\u2014 \u53EA\u5199"\u5B9A\u4E86\u4EC0\u4E48"\u7B49\u4E8E\u6CA1\u8BB0\u3002',
      '      \u5B83\u4E0D\u662F\u5F3A\u5236\u95E8\u7981\uFF1B\u4F46"\u6539\u4E86\u54EA\u4E2A\u8BBE\u8BA1\u3001\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u6539"\u8FD9\u7C7B**\u4EE3\u7801\u91CC\u8BFB\u4E0D\u51FA\u6765\u7684\u4E1C\u897F**\u5C31\u9760\u5B83\u4F20\u4E0B\u53BB\u3002',
      "    \xB7 **\u611F\u89C9\u5FEB\u6CA1\u4E0A\u4E0B\u6587\u3001\u6216\u8981\u88AB\u4E2D\u65AD\u65F6 \u2014\u2014 \u5148\u628A\u73B0\u573A\u51BB\u4F4F\u518D\u8D70**\uFF0C\u522B\u786C\u6491\u5230\u88AB\u622A\u65AD\uFF1A",
      '      project_handoff(project=\u2026, task_id=<id>, from_session_id=<\u4F60>, kind="mid-cycle",',
      '        summary="\u4E3A\u4EC0\u4E48\u4E2D\u65AD", state={current_edit:[\u2026], in_flight_reasoning:[\u2026],',
      "        decisions_made:[\u2026], decisions_deferred:[\u2026]})",
      "      \u5176\u4E2D in_flight_reasoning\uFF08\u8111\u5B50\u91CC\u8FD8\u6CA1\u5199\u4E0B\u6765\u7684\u63A8\u7406\uFF09**\u6700\u5BB9\u6613\u4E22** \u2014\u2014",
      "      \u4EE3\u7801\u91CC\u6839\u672C\u6CA1\u6709\u5B83\uFF0C\u4F1A\u8BDD\u4E00\u65AD\u5C31\u6C38\u4E45\u6CA1\u4E86\u3002\u56DB\u5C0F\u8282\u81F3\u5C11\u5199\u4E00\u4E2A\u3002",
      "    \xB7 context_pack \u62A5\u9519\u6216\u5185\u5BB9\u88AB\u622A\u65AD\uFF08\u51FA\u73B0 [context truncated \u2026]\uFF09\u65F6\uFF1A\u6539\u7528",
      "      project_overview + project_code_map \u5206\u6279\u8BFB\uFF0C\u522B\u51ED\u5370\u8C61\u5F00\u5DE5\u3002"
    ];
  }
  function mapRequirement(p, num2 = "2") {
    const nodes = p.mapNodes || 0;
    const edges = p.mapEdges || 0;
    if (p.kind === "doc") {
      return [
        num2 + ") \u8FD9\u662F\u8D44\u6599/\u65B9\u6CD5\u7C7B\u9879\u76EE\uFF0C\u4E0D\u7528\u8BFB\u4EE3\u7801\u5730\u56FE\uFF1B\u8981\u68B3\u7406\u7684\u8BDD\u628A\u8D44\u6599\u7ED3\u6784\u548C\u6765\u6E90\u5199\u8FDB\u77E5\u8BC6\u56FE\u8C31\u3002"
      ];
    }
    const head = "  " + num2 + ") \u8BFB\u77E5\u8BC6\u56FE\u8C31\uFF08\u4EE3\u7801\u5730\u56FE\uFF09\u2014\u2014 \u5F04\u6E05\u6A21\u5757\u5212\u5206\u3001\u5404\u81EA\u804C\u8D23\u3001\u4EE3\u7801\u5728\u54EA\u4E2A\u6587\u4EF6\u3001\u6A21\u5757\u4E4B\u95F4\u600E\u4E48\u8C03\u3002";
    const fields = [
      "     \u26A0 \u8282\u70B9\u5B57\u6BB5\uFF08\u5B9E\u6D4B\u8FC7\uFF0C\u7167\u8FD9\u4E2A\u5199\u4E0D\u4F1A\u5361\uFF09\uFF1A",
      "       \xB7 **kind \u662F\u56FA\u5B9A\u679A\u4E3E\uFF0C\u5199\u9519\u76F4\u63A5\u62A5\u9519**\uFF1Afrontend | backend | database | cloud | security | messagebus | external",
      '         \uFF08\u5199 kind="module" \u4F1A\u88AB\u62D2\uFF1Amust be one of: backend, cloud, database, \u2026\uFF09',
      "       \xB7 status \u4E5F\u662F\u679A\u4E3E\uFF08\u9ED8\u8BA4 planned\uFF09\uFF1Aplanned | wip | done | broken | retired",
      "       \xB7 \u6700\u5C0F\u5F62\u6001\uFF08node_key + kind + label \u662F\u5FC5\u586B\uFF0C\u5176\u4F59\u53EF\u7701\uFF09\uFF1A",
      '         nodes=[{node_key:"core", kind:"backend", label:"\u6838\u5FC3", responsibility:"\u5E72\u4EC0\u4E48", paths:["src/xxx.py"]}]',
      '         edges=[{from_key:"core", to_key:"store", label:"\u8C03\u7528"}]',
      "       \xB7 paths \u4F20\u5B57\u7B26\u4E32\u6570\u7EC4\u5373\u53EF\uFF1Bnode_key \u53EA\u80FD\u5B57\u6BCD\u5F00\u5934 + \u5B57\u6BCD\u6570\u5B57-_"
    ];
    if (nodes > 0) {
      return [
        head,
        `     \u5DF2\u8BB0\u5F55 ${nodes} \u4E2A\u6A21\u5757 / ${edges} \u6761\u8C03\u7528\u5173\u7CFB\uFF1Bcontext_pack \u91CC\u5C31\u5E26\u7740\uFF0C`,
        `     \u4E5F\u53EF\u4EE5\u5355\u72EC project_code_map(project="${p.key}") \u53D6\u5B8C\u6574\u7248\u3002\u52A8\u624B\u524D\u5148\u770B\u5B83\uFF0C\u522B\u91CD\u8BFB\u5168\u4ED3\u5E93\u3002`,
        `     \u6539\u4E86\u4EE3\u7801\u7684\u5F62\u72B6\u5C31\u7528 project_code_map_write \u66F4\u65B0\u56DE\u53BB\uFF0C**\u8BB0\u5F97\u5E26 revision**\uFF087 \u4F4D\u4EE5\u4E0A git \u77ED SHA\uFF09\uFF0C`,
        `     \u4E0D\u4F20\u7684\u8BDD\u4E0B\u4E2A\u4F1A\u8BDD\u770B\u5230\u7684\u4F1A\u662F unversioned\uFF08\u4F1A\u6253 WARNING\uFF09\uFF1Breplace=True \u4F1A\u88AB\u62D2\uFF0C\u53EA\u80FD\u5408\u5E76\u3002`,
        ...fields
      ];
    }
    return [
      head,
      "     \u4F46\u8FD9\u4E2A\u9879\u76EE\u73B0\u5728**\u8FD8\u6CA1\u6709**\u4EE3\u7801\u5730\u56FE\uFF080 \u4E2A\u6A21\u5757\uFF09\u2014\u2014 \u8BFB\u4E0D\u5230\u4E1C\u897F\u3002",
      "     \u6240\u4EE5\u987A\u624B\u505A\u4E00\u4EF6\u4E8B\uFF1A\u8BFB\u4E00\u904D\u4EE3\u7801\u540E\u7528 project_code_map_write \u628A\u5730\u56FE\u5EFA\u8D77\u6765\uFF0C",
      "     \u4E0B\u4E2A\u4F1A\u8BDD\u624D\u4E0D\u7528\u91CD\u8BFB\u5168\u4ED3\u5E93\uFF08**\u8BB0\u5F97\u5E26 revision** = 7 \u4F4D\u4EE5\u4E0A git \u77ED SHA\uFF09\u3002",
      ...fields
    ];
  }
  function splitBlock(p) {
    const body = [];
    const hasTasks = p.total > 0;
    body.push(`\u3010\u7ED9 ${p.name} \u52A0\u65B0\u4EFB\u52A1\u3011`);
    body.push(...projInfo(p));
    body.push("");
    body.push(hasTasks ? `\u8FD9\u4E2A\u9879\u76EE\u73B0\u5728\u6709 ${p.total} \u4E2A\u4EFB\u52A1\uFF08\u5DF2\u5B8C\u6210 ${p.done}\uFF09\u3002\u4E0B\u9762\u8BB2**\u600E\u4E48\u518D\u52A0\u65B0\u4EFB\u52A1**\u3002` : "\u8FD9\u4E2A\u9879\u76EE\u4E00\u4E2A\u4EFB\u52A1\u90FD\u8FD8\u6CA1\u6709\u3002\u4E0B\u9762\u8BB2**\u600E\u4E48\u628A\u5B83\u62C6\u6210\u4EFB\u52A1**\u3002");
    body.push("\u6267\u884C\u8981\u6C42\uFF08\u987A\u5E8F\u522B\u6362\uFF09\uFF1A");
    body.push(`  1) \u5148\u770B\u73B0\u72B6\uFF1Aproject_overview(project="${p.key}") \u62FF\u9879\u76EE\u56FE\u548C\u6700\u8FD1\u4E8B\u4EF6\u3002`);
    body.push(...mapRequirement(p, "2"));
    body.push("  3) \u2605 **\u5148\u5224\u65AD\u8FD9\u5757\u6D3B\u8BE5\u4E0D\u8BE5\u5EFA\u5361**\uFF08\u8FD9\u4E00\u6B65\u6700\u5BB9\u6613\u628A\u5E93\u641E\u4E71\uFF09\uFF1A");
    body.push("     \xB7 \u8FD8\u5728\u67D0\u4E2A**\u5DF2\u6709\u4EFB\u52A1\u7684\u5408\u540C\u8303\u56F4\u5185**\uFF08acceptance / constraints \u91CC\u5C31\u5199\u7740\uFF09");
    body.push("       \u2192 **\u522B\u5EFA\u65B0\u5361**\uFF0C\u53BB\u90A3\u4E2A\u4EFB\u52A1\u91CC\u8865\u4E00\u4E2A\u68C0\u67E5\u70B9\u5C31\u591F\u4E86\u3002");
    body.push('       \u5EFA\u4E86\u4F1A\u53D8\u6210"\u4E24\u5F20\u5361\u8BF4\u540C\u4E00\u4EF6\u4E8B"\uFF0C\u5BF9\u8D26\u65F6\u5224\u4E0D\u6E05\u8C01\u8D1F\u8D23\u3002');
    body.push("     \xB7 \u5408\u540C\u91CC**\u6CA1\u6709**\u7684\u3001\u6267\u884C\u4E2D\u65B0\u53D1\u73B0\u7684\u6D3B \u2192 \u8FD9\u624D\u662F\u8BE5\u5EFA\u5361\u7684\u60C5\u51B5\u3002");
    body.push("     \xB7 \u7EAF\u8D44\u6599/\u7EAF\u8BB0\u5F55\u7C7B\u9879\u76EE \u2192 \u4E0D\u7528\u5EFA\u5361\uFF0C\u628A\u8D44\u6599\u7ED3\u6784\u548C\u6765\u6E90\u6574\u7406\u8FDB\u77E5\u8BC6\u56FE\u8C31\u5C31\u884C\uFF0C\u522B\u786C\u9020\u4EFB\u52A1\u3002");
    body.push("     \xB7 \u62FF\u4E0D\u51C6\u5C31\u95EE\u7528\u6237\uFF0C\u522B\u81EA\u5DF1\u5B9A\uFF08\u8FD9\u4E00\u6B65\u5224\u9519\u4F1A\u7559\u4E0B\u957F\u671F\u70C2\u8D26\uFF09\u3002");
    body.push("  4) \u8981\u5EFA\u7684\u8BDD\u5148\u67E5\u91CD\uFF1A\u770B\u4E0A\u9762\u90A3\u4EFD\u6E05\u5355\uFF0C\u522B\u548C\u73B0\u6709\u7684\u91CD\u4E86 \u2014\u2014");
    body.push("     \u540C\u4E00\u4E2A key \u5EFA\u7B2C\u4E8C\u6B21\u4F1A\u76F4\u63A5\u62A5 Task already exists\uFF1B\u4F46\u6362\u4E2A key \u5EFA\u540C\u4E00\u4EF6\u4E8B\u4E0D\u4F1A\u62A5\uFF0C");
    body.push("     \u53EA\u4F1A\u8BA9\u5E93\u91CC\u591A\u4E00\u5F20\u91CD\u590D\u5361\u3002");
    body.push("     \u26A0 \u8FD8\u6709\u4E00\u6761\uFF1A**\u5E73\u53F0\u4E0D\u5141\u8BB8\u6539\u4EFB\u52A1\u540D / \u8BF4\u660E**\uFF08project_task_update \u53EA\u6539 status / next_action\uFF09\u3002");
    body.push('       \u6240\u4EE5"\u8303\u56F4\u53D8\u4E86"\u8981\u9760**\u66F4\u65B0\u5408\u540C**\u6216\u5EFA\u65B0\u5361\u89E3\u51B3\uFF0C\u4E0D\u8981\u6307\u671B\u6539\u540D\u3002');
    body.push("  5) \u5199\u9A8C\u6536\u6807\u51C6\u65F6**\u5C3D\u91CF\u5199\u6210\u53EF\u5224\u5B9A\u7684\u5224\u636E**\uFF08\u5EFA\u5361\u65F6\u6700\u8BE5\u82B1\u5FC3\u601D\u7684\u4E00\u6B65\uFF09\uFF1A");
    body.push("     \u4E3A\u4EC0\u4E48\u503C\u5F97\uFF1A\u5E73\u53F0\u4F1A**\u6309\u5224\u636E\u62E6 done**\uFF08\u5224\u636E\u6CA1\u8FC7\u5C31\u62D2\u7EDD\u6807 done\uFF09\uFF0C\u5224\u636E\u662F\u4F60\u90A3\u9053\u95E8\uFF1A");
    body.push("     \u4E0B\u9762\u8FD9\u6BB5\u5199\u6CD5\u6BCF\u4E2A\u5757\u90FD\u6709\uFF0C\u522B\u8DF3\u8FC7 \u2014\u2014");
    body.push(...predicateGuide("     "));
    body.push("  6) \u2605 \u5EFA\u5361\u8FD9\u6761\u8DEF\u5206\u4E24\u79CD\u60C5\u51B5\uFF08\u5148\u786E\u8BA4\u662F\u54EA\u4E00\u79CD\uFF0C\u522B\u649E\u5899\uFF09\uFF1A");
    body.push("     \xB7 \u5148\u767B\u8BB0\u81EA\u5DF1\uFF08\u6CA1\u767B\u8BB0\u540E\u9762\u6240\u6709\u5199\u64CD\u4F5C\u90FD\u4F1A\u5931\u8D25\uFF09\uFF1A");
    body.push(`       project_session_register(project="${p.key}", provider="<\u4F60\u7684 provider>",`);
    body.push('                                model="<\u4F60\u7684 model>", session_id="<\u4F60\u7684\u4F1A\u8BDD id>")');
    body.push("     \xB7 \u8BA1\u5212**\u6CA1\u9501** \u2192 \u76F4\u63A5\u5EFA\uFF1A");
    body.push("       project_task_create(project=\u2026, task_key=\u2026, title=\u2026, description=\u2026, priority=\u2026)");
    body.push(`     \xB7 \u8BA1\u5212**\u5DF2\u9501**\uFF08\u62A5 "This project's initial plan is locked"\uFF09\u2192 \u53EA\u80FD\u63D0\u6848\uFF1A`);
    body.push("       project_plan_propose(project=\u2026, session_id=<\u4F60>, reason=<\u4E3A\u4EC0\u4E48\u52A0>,");
    body.push('         changes=[{operation:"add_task", task_key=\u2026, title=\u2026, description=\u2026,');
    body.push('                   contract:{objective:\u2026, acceptance:["file_exists:<\u8DEF\u5F84>"]}}])');
    body.push("       \u7136\u540E**\u8BF7\u53E6\u4E00\u4E2A\u4F1A\u8BDD\u6216\u4EBA\u6765\u6279**\uFF08\u63D0\u8BAE\u8005\u4E0D\u80FD\u5BA1\u81EA\u5DF1\u7684\u63D0\u6848\uFF09\uFF1A");
    body.push("         project_plan_review(proposal_id=\u2026, reviewer_session_id=<\u5BA1\u6279\u8005>,");
    body.push('                             decision="approve", note=\u2026)');
    body.push("       \u4E09\u6761\u786C\u89C4\u5219\uFF08\u90FD\u5B9E\u6D4B\u8FC7\uFF09\uFF1A");
    body.push('       \u2460 \u53C2\u6570\u540D\u662F **decision**\uFF08\u53D6\u503C "approve" / "reject"\uFF09\u2014\u2014 \u4E0D\u662F status');
    body.push("       \u2461 \u5BA1\u6279\u8005\u5FC5\u987B**\u5C5E\u4E8E\u672C\u9879\u76EE** \u2014\u2014 \u5148\u8BA9\u4ED6\u4E5F register \u4E00\u4E0B\uFF1B");
    body.push('          \u62A5 "Reviewer belongs to another project" \u5C31\u662F\u8FD9\u4E2A\u539F\u56E0');
    body.push('       \u2462 **\u63D0\u8BAE\u8005\u4E0D\u80FD\u5BA1\u81EA\u5DF1**\uFF08\u62A5 "cannot review its own plan proposal"\uFF09');
    body.push("       \u2605 \u6279\u51C6**\u4E00\u6B21**\u5C31**\u6C38\u4E45\u89E3\u9501**\uFF08plan_locked \u53D8 false\uFF09\uFF1A\u4E4B\u540E\u5EFA\u4EFB\u52A1\u76F4\u63A5 project_task_create\uFF0C");
    body.push("         \u4E0D\u7528\u518D\u63D0\u6848 \u2014\u2014 \u6240\u4EE5\u8FD9\u6761\u8DEF\u53EA\u8D70\u4E00\u6B21\u3002");
    body.push("  7) \u2605 **\u5EFA\u5B8C\u5361\u4E4B\u540E\uFF0C\u6CA1\u505A\u5B8C\u7684\u5361\u7EDD\u5BF9\u4E0D\u8981\u6807 done**\uFF1A");
    body.push('       \xB7 \u505A\u5B8C\u4E86 \u2192 status="done"\uFF08\u6807\u4E4B\u524D\u5148 project_preflight \u9A8C\u5224\u636E\uFF09');
    body.push("       \xB7 \u8FD8\u8981\u63A5\u7740\u505A \u2192 \u7559 pending\uFF08\u5B83\u672C\u6765\u5C31\u662F pending\uFF0C\u4EC0\u4E48\u90FD\u4E0D\u7528\u6539\uFF09");
    body.push('       \xB7 \u5361\u5728\u5916\u90E8\u539F\u56E0 \u2192 status="blocked"');
    body.push('       \xB7 \u5E72\u5B8C\u4E86\u7B49\u522B\u4EBA\u9A8C \u2192 status="review"');
    body.push("     \u6807\u9519\u4EE3\u4EF7\u5F88\u5927\uFF1A\u9762\u677F\u4F1A\u8BF4\u8FD9\u4EF6\u4E8B\u5B8C\u4E86\u3001\u4E0B\u4E2A\u4F1A\u8BDD\u4EE5\u4E3A\u4E0D\u7528\u7BA1\uFF0C");
    body.push("     \u800C\u4E14\u5E73\u53F0\u7981\u6B62 done\u2192running\uFF08\u8981\u6539\u56DE\u6765\u5FC5\u987B\u8D70 project_task_reopen\uFF09\u3002");
    body.push("  8) \u5EFA\u5B8C\u628A\u7ED3\u679C\u544A\u8BC9\u6211\uFF1A\u52A0\u4E86\u54EA\u51E0\u4E2A\u4EFB\u52A1\u3002**\u4E0D\u8981\u81EA\u5DF1\u5F00\u5B50\u4F1A\u8BDD\u5206\u6D3E\u4EFB\u52A1** \u2014\u2014 \u6211\u81EA\u5DF1\u627E\u4EBA\u505A\u3002");
    body.push(...discipline());
    return body.join("\n");
  }
  var countRafs = /* @__PURE__ */ new Map();
  function countTo(el, to, dur = 520) {
    const prev = countRafs.get(el);
    if (prev) cancelAnimationFrame(prev);
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(to * e));
      if (k < 1) countRafs.set(el, requestAnimationFrame(step));
      else {
        el.textContent = String(to);
        countRafs.delete(el);
      }
    };
    countRafs.set(el, requestAnimationFrame(step));
  }
  var lastStatsKey = "";
  function renderStats() {
    const scope = view.kind === "projects" ? ALL : [byKey(view.proj)];
    const sumOf = (f) => scope.reduce((n, p) => n + f(p), 0);
    const items = view.kind === "projects" ? [[ALL.length, "\u4E2A\u9879\u76EE"], [sumOf((p) => inFlightOf(p) > 0 ? 1 : 0), "\u8FDB\u884C\u4E2D"], [sumOf(readyOf), "\u5F85\u5F00\u59CB"], [sumOf(reviewOf), "\u5F85\u9A8C\u6536"]] : [[totalOf(scope[0]), "\u4E2A\u4EFB\u52A1"], [sumOf(doneOf), "\u5DF2\u5B8C\u6210"], [sumOf((p) => inFlightOf(p)), "\u8FDB\u884C\u4E2D"], [sumOf(readyOf), "\u5F85\u5F00\u59CB"], [sumOf(reviewOf), "\u5F85\u9A8C\u6536"]];
    const key = items.map(([n, l]) => `${n}:${l}`).join("|");
    if (key === lastStatsKey) return;
    lastStatsKey = key;
    statsEl.innerHTML = items.map(([n, label]) => `<div class="stat"><b data-n="${n}">0</b><span>${label}</span></div>`).join("");
    requestAnimationFrame(animateCounts);
  }
  function animateCounts() {
    statsEl.querySelectorAll("b").forEach((b) => {
      const el = b;
      countTo(el, Number(el.dataset.n || 0));
    });
  }
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".btn, .chip, .card-copy, .tcopy, .d-nav, .sw");
    if (!el) return;
    el.classList.add("ripple-host");
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const w = document.createElement("span");
    w.className = "ripple-wave";
    w.style.width = w.style.height = size + "px";
    w.style.left = e.clientX - r.left - size / 2 + "px";
    w.style.top = e.clientY - r.top - size / 2 + "px";
    el.appendChild(w);
    setTimeout(() => w.remove(), 570);
  });
  var view = { kind: "projects" };
  var folded = new Set(GROUPS.filter((g) => g.folded).map((g) => g.title));
  function projUrgency(p) {
    if (p.total === 0) return 4;
    if (doingOf(p) > 0) return 0;
    if (readyOf(p) > 0) return 1;
    if (failedOf(p) > 0) return 2;
    return 3;
  }
  function sortProjects(items) {
    return [...items].sort((a, b) => projUrgency(a) - projUrgency(b) || readyOf(b) - readyOf(a) || a.name.localeCompare(b.name, "zh"));
  }
  function projCard(p) {
    const st2 = projState(p);
    const { done, total } = prog(p);
    const pct = total ? Math.round(done / total * 100) : 0;
    const readyN = readyOf(p);
    const single = total === 1;
    const empty = total === 0;
    const t0 = p.tasks[0];
    const artN = p.artifacts || 0;
    const mapN = p.mapNodes || 0;
    const ckN = p.checkpoints || 0;
    const extraBits = [];
    if (artN > 0) extraBits.push(`<span class="meta-extra" title="${artN} \u4E2A\u4EA7\u51FA\uFF08\u4F1A\u8BDD\u53D1\u5E03\u8FC7\u7684\u4EA4\u4ED8\u7269\uFF09"><svg class="ic"><use href="#i-artifact"/></svg>${artN}</span>`);
    if (ckN > 0) extraBits.push(`<span class="meta-extra" title="${ckN} \u6761\u68C0\u67E5\u70B9\uFF08\u4F1A\u8BDD\u8BB0\u5F55\u7684\u8FC7\u7A0B\uFF1A\u505A\u4E86\u4EC0\u4E48 / \u5751 / \u4E0B\u4E00\u6B65\uFF09"><svg class="ic"><use href="#i-log"/></svg>${ckN}</span>`);
    if (mapN > 0) extraBits.push(`<span class="meta-extra" title="\u4EE3\u7801\u5730\u56FE ${mapN} \u8282\u70B9 / ${p.mapEdges || 0} \u6761\u8C03\u7528\u5173\u7CFB"><svg class="ic"><use href="#i-graph"/></svg>${mapN}</span>`);
    const extraRow = extraBits.length ? `<div class="mr">${extraBits.join("")}</div>` : "";
    const meta = total === 0 ? `<div class="mr"><span>\u672A\u62C6\u89E3 \xB7 \u5148\u7528\u300C\u62C6\u4EFB\u52A1\u300D\u628A\u5B83\u62C6\u5F00</span></div>${extraRow}` : single ? `<div class="mr"><span class="meta-ready">${t0 ? taskLabel(t0).label : ""}</span><span>${p.ago}</span></div>${stallNote(p)}${extraRow}` : `<div class="mr"><span class="cells" title="${total} \u4E2A\u4EFB\u52A1\uFF08\u5DF2\u5B8C\u6210 ${done} / \u8FDB\u884C\u4E2D ${inFlightOf(p)} / \u5F85\u9A8C\u6536 ${reviewOf(p)} / \u5F85\u5F00\u59CB ${readyN}\uFF09">${Array(done).fill('<i class="c done"></i>').join("") + Array(inFlightOf(p)).fill('<i class="c doing"></i>').join("") + Array(readyN).fill('<i class="c ready"></i>').join("")}</span><span>${done}/${total}</span>${readyN ? `<span class="meta-ready">${readyN} \u5F85\u5F00\u59CB</span>` : ""}<span>${p.ago}</span></div>${stallNote(p)}${extraRow}`;
    const acts = empty ? "" : `<div class="card-acts">` + (!single ? `<button class="card-copy always" data-copy-proj="${p.key}"><svg class="ic"><use href="#i-copy"/></svg>\u590D\u5236\u73B0\u72B6\u7B80\u62A5</button>` : "") + `<button class="card-copy always" data-export-proj="${p.key}" title="\u5BFC\u51FA\u8FDB\u5EA6\u62A5\u544A\uFF08PDF\uFF09"><svg class="ic"><use href="#i-download"/></svg>\u5BFC\u51FA</button></div>`;
    return `
  <div class="card" data-proj="${p.key}">
    <div class="card-body">
      <div class="card-top"><span class="card-name">${p.name}</span><span class="badge ${st2.cls}"><svg class="ic"><use href="#${st2.icon}"/></svg>${st2.label}</span></div>
      ${p.sub ? `<div class="card-sub">${p.sub}${total > 1 ? ` \xB7 ${total} \u4E2A\u4EFB\u52A1` : ""}</div>` : total > 1 ? `<div class="card-sub">${total} \u4E2A\u4EFB\u52A1</div>` : ""}
      <div class="card-meta">${meta}</div>
      ${p.tags.length ? `<div class="tags">${p.tags.map((x) => `<span class="tag">${x}</span>`).join("")}</div>` : ""}
    </div>

    ${acts}
  </div>`;
  }
  function taskCard(p, t, i = 0) {
    const st2 = taskLabel(t);
    return `
  <div class="tcard" style="animation-delay:${i * 45}ms">
    <div class="tcard-top">
      <span class="tcard-title">${t.title}</span>
      <span class="badge ${st2.cls}"><svg class="ic"><use href="#${st2.icon}"/></svg>${st2.label}</span>
    </div>
    <div class="tcard-meta">
      <span class="tkey">${t.key}</span>
      ${t.pri <= 1 && t.status !== "done" ? '<span class="pri"><svg class="ic ic-sm"><use href="#i-pri"/></svg>\u4F18\u5148</span>' : ""}
      ${t.owner ? `<span class="owner"><svg class="ic ic-sm"><use href="#i-owner"/></svg>${t.owner}</span>` : ""}
      ${t.depends?.length ? `<span class="dep"><svg class="ic ic-sm"><use href="#i-dep"/></svg>\u7B49 ${t.depends[0]}</span>` : ""}
    </div>
    <button class="tcopy" data-copy-task="${t.key}"><svg class="ic"><use href="#i-copy"/></svg>\u590D\u5236\u63A5\u7EED\u5757</button>
  </div>`;
  }
  function renderProjects() {
    renderStats();
    let html = "";
    for (const g of GROUPS) {
      const items = sortProjects(g.items);
      if (!items.length) continue;
      const isFolded = folded.has(g.title);
      const readyN = items.reduce((n, p) => n + readyOf(p), 0);
      html += `<div class="group-label ${g.folded !== void 0 ? "foldable" : ""} ${isFolded ? "folded" : ""}" data-group="${g.title}">
      ${g.folded !== void 0 ? '<svg class="ic ic-sm caret"><use href="#i-caret"/></svg>' : ""}${g.title}
      <span style="font-weight:500;opacity:.75">${items.length}${readyN ? ` \xB7 ${readyN} \u5F85\u5F00\u59CB` : ""}</span></div>`;
      if (!isFolded) html += items.map(projCard).join("");
    }
    listEl.innerHTML = html;
  }
  var TASK_ORDER = { doing: 0, review: 1, ready: 2, blocked: 3, done: 4 };
  var TASK_GROUP_TITLE = {
    doing: "\u6B63\u5728\u505A",
    review: "\u5F85\u9A8C\u6536",
    ready: "\u5F85\u5F00\u59CB",
    blocked: "\u88AB\u5361\u4F4F",
    done: "\u5DF2\u5B8C\u6210"
  };
  var buildTaskList = (tasks) => [...tasks].sort((a, b) => TASK_ORDER[a.status] - TASK_ORDER[b.status] || a.pri - b.pri);
  function renderTasks(projKey) {
    const p = byKey(projKey);
    const list = buildTaskList(p.tasks);
    const segments = [];
    for (const t of list) {
      const last2 = segments[segments.length - 1];
      if (last2 && last2.status === t.status) last2.items.push(t);
      else segments.push({ status: t.status, items: [t] });
    }
    const { done, total } = prog(p);
    renderStats();
    const loading = !p.tasks.length && p.total > 0;
    const body = loading ? `<div class="empty"><div class="empty-t">\u6B63\u5728\u8BFB\u4EFB\u52A1\u2026</div><div class="empty-d">\u4ECE\u5171\u4EAB\u5E93\u53D6 ${p.total} \u4E2A\u4EFB\u52A1\u7684\u660E\u7EC6</div></div>` : total === 0 ? `<div class="empty">
         <div class="empty-t">\u8FD9\u4E2A\u9879\u76EE\u8FD8\u6CA1\u6709\u4EFB\u52A1</div>
         <div class="empty-d">\u8BA9 AI \u8BFB\u4E00\u904D\u4E0A\u4E0B\u6587\uFF0C\u628A\u5B83\u89C4\u5212\u6210\u51E0\u4E2A\u4EFB\u52A1\u5199\u8FDB\u5171\u4EAB\u5E93</div>
         <button class="btn btn-primary" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>\u8BA9 AI \u62C6\u4EFB\u52A1</button>
       </div>` : list.length ? `<div class="tlist">${segments.map(
      (seg) => `<div class="tgroup"><span class="tgroup-t">${TASK_GROUP_TITLE[seg.status]}</span><span class="tgroup-n">${seg.items.length}</span></div>` + seg.items.map((t) => taskCard(p, t, list.indexOf(t))).join("")
    ).join("")}</div>
        <div class="tadd"><button class="btn btn-ghost btn-addtask" data-split-proj="${p.key}"><svg class="ic"><use href="#i-plus"/></svg>\u8BA9 AI \u52A0\u65B0\u4EFB\u52A1</button></div>` : `<div class="empty"><div class="empty-t">\u8FD9\u4E2A\u9879\u76EE\u6CA1\u6709\u4EFB\u52A1</div><div class="empty-d">\u70B9\u300C\u8BA9 AI \u62C6\u4EFB\u52A1\u300D\u628A\u5B83\u89C4\u5212\u6210\u51E0\u4E2A\u4EFB\u52A1\u5199\u8FDB\u5171\u4EAB\u5E93</div>
         <button class="btn btn-primary" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>\u8BA9 AI \u62C6\u4EFB\u52A1</button></div>`;
    listEl.innerHTML = `
  <div class="detail">
    <button class="d-nav" data-back="1"><svg class="ic"><use href="#i-back"/></svg>\u5168\u90E8\u9879\u76EE</button>
    <div class="dh">
      <div class="dh-name" data-vt="1">${p.name}</div>
      <div class="dh-sub">${total === 0 ? "\u8FD8\u6CA1\u62C6\u89E3" : `${total} \u4E2A\u4EFB\u52A1 \xB7 ${done} \u4E2A\u5DF2\u5B8C\u6210`}${p.sub ? " \xB7 " + p.sub : ""}</div>
    </div>
    ${body}
  </div>`;
  }
  var doc = document;
  async function transition(swap) {
    if (typeof doc.startViewTransition === "function") {
      const t = doc.startViewTransition(swap);
      try {
        await t.finished;
      } catch {
      }
    } else {
      await swap();
    }
  }
  async function gotoTasks(key) {
    const p = byKey(key);
    const card = listEl.querySelector(`[data-proj="${key}"]`);
    const name = `vt-${key}`;
    if (card) card.style.viewTransitionName = name;
    setBotState("burst", clock);
    await transition(() => {
      view = { kind: "tasks", proj: key };
      renderTasks(key);
      const h = listEl.querySelector("[data-vt]");
      if (h) h.style.viewTransitionName = name;
    });
    if ((!p.tasks.length || dirtyProjects.has(key)) && p.total > 0) {
      p.tasks = [];
      p.fromDb = false;
      dirtyProjects.delete(key);
      await loadTasks(key);
      if (open && view.kind === "tasks" && view.proj === key) renderTasks(key);
    }
  }
  async function backToProjects() {
    const key = view.kind === "tasks" ? view.proj : null;
    const name = key ? `vt-${key}` : "";
    const h = listEl.querySelector("[data-vt]");
    if (h && name) h.style.viewTransitionName = name;
    await transition(() => {
      view = { kind: "projects" };
      renderProjects();
      if (key) {
        const card = listEl.querySelector(`[data-proj="${key}"]`);
        if (card) card.style.viewTransitionName = name;
      }
    });
    if (key) {
      const card = listEl.querySelector(`[data-proj="${key}"]`);
      if (card) card.style.viewTransitionName = "";
    }
  }
  listEl.addEventListener("click", async (e) => {
    const t = e.target;
    const grp = t.closest("[data-group]");
    if (grp && grp.classList.contains("foldable")) {
      const n = grp.dataset.group;
      folded.has(n) ? folded.delete(n) : folded.add(n);
      renderProjects();
      return;
    }
    if (t.closest("[data-back]")) {
      await backToProjects();
      setBotState("wink", clock);
      return;
    }
    const splitP = t.closest("[data-split-proj]");
    if (splitP) {
      const p = byKey(splitP.dataset.splitProj);
      await copyText(splitBlock(p), `${p.name} \xB7 \u62C6\u4EFB\u52A1`);
      flash(splitP);
      return;
    }
    const expP = t.closest("[data-export-proj]");
    if (expP) {
      void exportProjectPdf(expP.dataset.exportProj, expP);
      return;
    }
    const copyP = t.closest("[data-copy-proj]");
    if (copyP) {
      const p = byKey(copyP.dataset.copyProj);
      if (p.total === 1 && p.tasks[0]) {
        await copyText(projBlock(p, p.tasks[0]), `${p.name} \xB7 ${p.tasks[0].title}`);
      } else {
        await copyText(projBlock(p), `${p.name} \xB7 \u73B0\u72B6\u7B80\u62A5`);
      }
      flash(copyP);
      return;
    }
    const copyT = t.closest("[data-copy-task]");
    if (copyT) {
      const tk = copyT.dataset.copyTask;
      const p = byKey(view.kind === "tasks" ? view.proj : "");
      const task = p.tasks.find((x) => x.key === tk);
      await copyText(projBlock(p, task), task.title);
      flash(copyT);
      return;
    }
    const card = t.closest("[data-proj]");
    if (card) {
      const key = card.dataset.proj;
      const p = byKey(key);
      await gotoTasks(key);
    }
  });
  function flash(btn) {
    btn.classList.add("done");
    const old = btn.innerHTML;
    btn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>\u5DF2\u590D\u5236';
    setBotState("burst", clock);
    setTimeout(() => {
      btn.classList.remove("done");
      btn.innerHTML = old;
    }, 1500);
  }
  async function copyText(text, what) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(`\u5DF2\u590D\u5236\u300C${what}\u300D\xB7 \u7C98\u8FDB\u4EFB\u610F agent \u5BF9\u8BDD\u6846`);
  }
  var LIBRARY_RECORD_REQUIREMENT = [
    `\u3010\u5171\u4EAB\u9879\u76EE\u5E93 \xB7 \u8BB0\u5F55\u8981\u6C42\u3011`,
    ``,
    `\u26A0 \u672C\u4F1A\u8BDD\u53EF\u80FD\u505A\u4E86\u4E0D\u6B62\u4E00\u4E2A\u4EFB\u52A1\u3002\u6BCF\u4E00\u8F6E\u505A\u8FC7\u7684\u90FD\u5F97\u8BB0\uFF0C\u4E0D\u80FD\u53EA\u8BB0\u6700\u540E\u4E00\u8F6E \u2014\u2014`,
    `   \u5E93\u91CC\u6CA1\u6709"\u6574\u573A\u4F1A\u8BDD"\u8FD9\u79CD\u8BB0\u5F55\u7C92\u5EA6\uFF08\u68C0\u67E5\u70B9\u5FC5\u987B\u6302\u5728\u5177\u4F53\u4EFB\u52A1\u4E0A\uFF09\uFF0C\u505A\u4E86 N \u4E2A\u5C31\u8BB0 N \u6B21\u3002`,
    ``,
    `\u3010\u7B2C\u4E00\u6B65 \xB7 \u76D8\u70B9\u3011\u628A\u672C\u4F1A\u8BDD\u4ECE\u5F00\u59CB\u5230\u73B0\u5728\u505A\u8FC7\u7684\u4EFB\u52A1\u5217\u4E00\u904D\u3002\u6539\u8FC7\u4EE3\u7801 / \u5199\u8FC7\u6587\u6863 /`,
    `   \u67E5\u8FC7\u95EE\u9898\u5E76\u5F97\u51FA\u8FC7\u7ED3\u8BBA \u2014\u2014 \u90FD\u7B97\u3002\u7279\u522B\u6CE8\u610F\u6CA1\u5728\u5E93\u91CC\u9886\u8FC7\u7684\u90A3\u4E9B\uFF08\u6700\u5BB9\u6613\u6F0F\uFF09\u3002`,
    `   \u26A0 \u90A3\u4E00\u6279\u91CC\u5982\u679C\u6709\u7684**\u5DF2\u7ECF\u987A\u624B\u6807\u4E86 done**\uFF08\u6CA1\u9886\u8FC7\u4E5F\u80FD\u6807\uFF09\uFF0C\u73B0\u5728\u662F\u8865\u8BB0\u4E0D\u8FDB\u5E93\u7684 \u2014\u2014`,
    `     \u9010\u6761\u8BD5\u90FD\u4F1A\u62A5\u9519\u3002\u7528\u8FD9\u4E00\u6761\u6253\u5F00\uFF1A`,
    `     project_task_reopen(task_id=<id>, session_id=<\u4F60>, reason="<\u4E3A\u4EC0\u4E48\u8981\u91CD\u5F00>")`,
    `     \u5B83\u628A\u4EFB\u52A1\u9000\u56DE pending\uFF08\u6E05 owner\u3001\u7559 task_reopened \u4E8B\u4EF6\uFF09\uFF0C`,
    `     \u4E4B\u540E\u5C31\u80FD\u6B63\u5E38\u8D70\uFF1A\u9886 \u2192 \u8865\u68C0\u67E5\u70B9 \u2192 \u518D\u6807 done\u3002`,
    `     reason \u662F\u5FC5\u586B\u7684 \u2014\u2014 \u5E73\u53F0\u4E0D\u7559\u300C\u6084\u6084\u6539\u7EC8\u6001\u300D\u7684\u53E3\u5B50\u3002`,
    `     \uFF08\u5DF2 done \u7684\u4EFB\u52A1\u4E0D\u80FD\u76F4\u63A5\u6539\u72B6\u6001\uFF1Adone\u2192running \u4F1A\u88AB\u62D2\uFF0C\u7406\u7531\u662F Self-approval \u2014\u2014`,
    `       \u5B9E\u6D4B\u6709\u4EFB\u52A1\u88AB\u8BA4\u9886 4 \u6B21\u3001\u6807 done 3 \u6B21\uFF0C\u5951\u7EA6/\u5BF9\u8D26/\u4EA7\u51FA\u5168\u6210\u4E86\u53EF\u88AB\u9759\u9ED8\u63A8\u7FFB\u7684\u6B8B\u7559\u3002\uFF09`,
    ``,
    `   \u2605 \u66F4\u7701\u4E8B\u7684\u505A\u6CD5\uFF08\u4E0B\u6B21\u5F00\u5DE5\u5C31\u8FD9\u4E48\u5E72\uFF09\uFF1A**\u4E00\u4EF6\u4E8B\u4E00\u5F20\u5361\uFF0C\u52A8\u624B\u524D\u5148\u5EFA\u597D**\u3002`,
    `     \u4E00\u4E2A\u4F1A\u8BDD\u5F80\u5F80\u4E00\u53E3\u6C14\u5E72\u597D\u51E0\u4EF6\u4E8B\uFF0C\u5982\u679C\u90FD\u7B49\u5E72\u5B8C\u624D\u56DE\u5934\u8865\u5361\uFF0C\u5C31\u5F97\u9010\u4E2A\u5224\u65AD`,
    `     \u300C\u8FD9\u6D3B\u539F\u6765\u90A3\u5F20\u5361\u7684\u5408\u540C\u91CC\u6709\u6CA1\u6709\u8981\u6C42\u300D\uFF08\u7B2C\u56DB\u6B65\u90A3\u5957\uFF09\uFF0C\u5F88\u8D39\u795E\u3001\u4E5F\u5BB9\u6613\u6F0F\u3002`,
    `     \u5F00\u5DE5\u524D\u5148\u5EFA\u597D\u5361\uFF0C\u6536\u5C3E\u65F6\u9010\u4E2A\u95ED\u73AF\u5C31\u884C\uFF0C\u4E0D\u7528\u518D\u8865\u3002`,
    ``,
    `   \u2605 \u611F\u89C9\u5FEB\u6CA1\u4E0A\u4E0B\u6587\u4E86 / \u8981\u88AB\u4E2D\u65AD\u65F6\uFF1A**\u5148\u628A\u73B0\u573A\u51BB\u4F4F\u518D\u8D70**\uFF0C\u522B\u786C\u6491\u5230\u88AB\u622A\u65AD\u3002`,
    `     project_handoff(project=\u2026, task_id=<id>, from_session_id=<\u4F60>, kind="mid-cycle",`,
    `       summary="\u4E00\u53E5\u8BDD\u8BF4\u660E\u4E3A\u4EC0\u4E48\u4E2D\u65AD",`,
    `       state={current_edit:[\u2026], in_flight_reasoning:[\u2026], decisions_made:[\u2026], decisions_deferred:[\u2026]})`,
    `     \u56DB\u4E2A\u5C0F\u8282\uFF08\u81F3\u5C11\u5199\u4E00\u4E2A\uFF09\uFF1A`,
    `       current_edit        \u6539\u5230\u54EA\u4E86\uFF1A\u54EA\u4E9B\u6587\u4EF6\u3001\u4EC0\u4E48\u72B6\u6001\u3001\u8FD8\u5DEE\u4EC0\u4E48`,
    `       in_flight_reasoning \u2605 \u8111\u5B50\u91CC\u6B63\u5728\u60F3\u7684\uFF08\u8FD8\u6CA1\u5199\u8FDB\u4EE3\u7801/\u6587\u6863\u7684\u63A8\u7406\uFF09\u2014\u2014 \u8FD9\u6761**\u6700\u5BB9\u6613\u4E22**\uFF0C`,
    `                            \u4EE3\u7801\u91CC\u6839\u672C\u6CA1\u6709\u5B83\uFF0C\u4F1A\u8BDD\u4E00\u65AD\u5C31\u6C38\u4E45\u6CA1\u4E86`,
    `       decisions_made      \u5DF2\u7ECF\u5B9A\u7684\u4E8B\uFF08\u5199\u6E05\u7406\u7531\uFF0C\u514D\u5F97\u4E0B\u4E2A\u4EBA\u91CD\u65B0\u8BA8\u8BBA\u4E00\u904D\uFF09`,
    `       decisions_deferred  \u6545\u610F\u7559\u7ED9\u540E\u9762\u5B9A\u7684\u4E8B\uFF0C\u4EE5\u53CA\u4E3A\u4EC0\u4E48\u73B0\u5728\u4E0D\u5B9A`,
    `     \u4E0D\u5199\u7684\u8BDD\uFF0C\u4E0B\u4E2A\u4F1A\u8BDD\u8981\u4E48\u91CD\u8BFB\u5168\u4ED3\u5E93\uFF0C\u8981\u4E48\u8E29\u4E00\u904D\u540C\u6837\u7684\u5751\u3002`,
    ``,
    `\u3010\u7B2C\u4E8C\u6B65 \xB7 \u5148\u5206\u6D41\u3011\u2605 \u5173\u952E\u4E00\u6B65\uFF0C\u522B\u8DF3\uFF1A\u628A\u7B2C\u4E00\u6B65\u5217\u51FA\u7684\u4EFB\u52A1**\u5206\u6210\u4E24\u5806** \u2014\u2014`,
    `     \xB7 \u771F\u505A\u5B8C\u7684\uFF08\u6D3B\u5E72\u5B8C\u4E86\u3001\u4E1C\u897F\u4EA4\u51FA\u53BB\u4E86\uFF09        \u2192 \u8D70\u3010\u7B2C\u4E8C\u6B65 A\u3011`,
    `     \xB7 \u6CA1\u505A\u5B8C\u7684\uFF08\u5E72\u4E86\u4E00\u534A / \u53D1\u73B0\u4E86\u4F46\u6CA1\u52A8 / \u5361\u4F4F\u4E86\uFF09\u2192 \u8D70\u3010\u7B2C\u4E8C\u6B65 B\u3011`,
    `   \u26A0 \u4E3A\u4EC0\u4E48\u5FC5\u987B\u5148\u5206\u6D41\uFF1AA \u7684\u6700\u540E\u4E00\u6B65\u662F\u300C\u6807 done\u300D\u3002\u5982\u679C\u5BF9**\u6BCF\u4E00\u4E2A**\u4EFB\u52A1\u90FD\u4E00\u8DEF\u8D70\u5230\u5E95\uFF0C`,
    `     \u6CA1\u505A\u5B8C\u7684\u4E5F\u4F1A\u88AB\u6807\u6210\u5DF2\u5B8C\u6210 \u2014\u2014 \u90A3\u662F**\u6700\u4E25\u91CD\u7684\u4E00\u79CD\u6570\u636E\u6C61\u67D3**\uFF1A`,
    `     \u9762\u677F\u4F1A\u8BF4\u8FD9\u4EF6\u4E8B\u5B8C\u4E86\u3001\u4E0B\u4E00\u4E2A\u4F1A\u8BDD\u4EE5\u4E3A\u4E0D\u7528\u518D\u7BA1\u3001\u5BF9\u8D26\u65F6\u62FF\u4E0D\u5230\u4E1C\u897F\u3002`,
    `     \u5B81\u53EF\u5C11\u6807\u4E00\u4E2A done\uFF0C\u4E5F\u4E0D\u8981\u628A\u6CA1\u505A\u5B8C\u7684\u6807\u6210\u5B8C\u6210\u3002`,
    ``,
    `\u3010\u7B2C\u4E8C\u6B65 A \xB7 \u771F\u505A\u5B8C\u7684\u4EFB\u52A1\u3011\u6309\u8FD9\u4E2A\u987A\u5E8F\uFF08\u987A\u5E8F\u9519\u4E86\u4F1A\u628A\u81EA\u5DF1\u9501\u6B7B\uFF09\uFF1A`,
    `   \u2460 project_task_dispatch(project=\u2026, task_key="<\u4EFB\u52A1\u7684 key>") \u2192 \u62FF\u5230 id\uFF0832 \u4F4D uuid\uFF09`,
    `      \u26A0 \u540E\u9762\u6240\u6709\u5DE5\u5177\u8981\u7684\u90FD\u662F\u8FD9\u4E2A **id**\uFF0C\u4E0D\u662F key \u2014\u2014 \u4F20 key \u4F1A\u62A5 Task not found\u3002`,
    `      \u6CA1\u9886\u8FC7\u4EFB\u52A1\u7684\u540E\u679C\uFF1A\u53D1\u4E0D\u51FA\u4EA7\u51FA\u3001\u6807\u4E0D\u4E86\u5B8C\u6210\uFF08\u90FD\u8981\u6C42"\u4EFB\u52A1\u5728\u4F60\u540D\u4E0B"\uFF09\u3002`,
    `      \u5148\u6807 done \u4F1A\u5BFC\u81F4\u53D1\u4E0D\u51FA\u4EA7\u51FA\uFF08artifact_publish \u8981\u6C42\u4EFB\u52A1\u662F\u6D3B\u8DC3\u7684\uFF09\uFF1B`,
    `      \u4EE3\u7801\u5730\u56FE\u4E0D\u4E00\u6837 \u2014\u2014 \u6807\u4E86 done \u4E5F\u80FD\u8865\u5199\uFF0C\u53EA\u8981\u4F60\u5728\u672C\u9879\u76EE\u91CC\u5E72\u8FC7\u3002`,
    `   \u2461 project_checkpoint(project=\u2026, task_id=<id>, state={...}) \u2014\u2014 \u4E94\u9879\u4E00\u4E2A\u90FD\u522B\u7701\uFF1A`,
    `        completed \u5B8C\u6210\u4E86\u4EC0\u4E48 / not_done \u6CA1\u5B8C\u6210\u4EC0\u4E48 / pitfalls \u8E29\u8FC7\u7684\u5751\uFF08\u2605 \u6700\u91CD\u8981\uFF0C\u5199\u5177\u4F53\uFF09`,
    `        / blockers \u5361\u5728\u4EC0\u4E48\u5916\u90E8\u4F9D\u8D56 / next_action \u4E0B\u4E00\u6B65`,
    `      \u26A0 \u5E26 next_action \u7684\u68C0\u67E5\u70B9\u4F1A\u4E00\u5E76\u66F4\u65B0\u4EFB\u52A1\u7684"\u4E0B\u4E00\u6B65"\u5E76\u8BA9\u9762\u677F\u5237\u65B0\uFF1B\u4E0D\u5E26\u5C31\u4E0D\u4F1A\u52A8\u9762\u677F\u3002`,
    `   \u2462 project_artifact_publish(project=\u2026, task_id=<id>, kind="doc", path="<\u771F\u5B9E\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84>")`,
    `      \u8DEF\u5F84\u5FC5\u987B\u843D\u5728\u9879\u76EE\u76EE\u5F55\u5185\u3001\u6587\u4EF6\u5FC5\u987B\u771F\u7684\u5B58\u5728\uFF0C\u5426\u5219\u5F53\u573A\u62A5\u9519\u3002`,
    `   \u2463 \u6807 done \u4E4B\u524D\u5148\u8DD1\u4E00\u904D\u9A8C\u6536\u5224\u636E\uFF1Aproject_preflight(project=\u2026, task_id=<id>)`,
    `      \u5B83\u6267\u884C\u5408\u540C\u91CC\u7684\u53EF\u5224\u5B9A\u5224\u636E\uFF0C\u544A\u8BC9\u4F60\u54EA\u6761\u8FD8\u6CA1\u8FC7 \u2014\u2014 \u5728**\u8FD8\u80FD\u6539**\u7684\u65F6\u5019\u770B\u5230\u3002`,
    `      \u26A0 **preflight \u62A5"\u5224\u636E\u6CA1\u8FC7"\u5C31\u8BF4\u660E\u5B83\u6CA1\u505A\u5B8C \u2014\u2014 \u632A\u5230\u3010\u7B2C\u4E8C\u6B65 B\u3011\uFF0C\u4E0D\u8981\u6807 done\u3002**`,
    `      \uFF08\u5224\u636E\u600E\u4E48\u5199\u5728\u3010\u7B2C\u56DB\u6B65\u3011\uFF1B\u5408\u540C\u6539\u52A8\u4F1A\u7559\u7248\u672C\u5386\u53F2\uFF0Cproject_contract_history \u53EF\u67E5\u3002\uFF09`,
    `   \u2464 project_task_update(project=\u2026, task_id=<id>, status="done", next_action="\u4E0B\u4E00\u6B65")`,
    `      \u2605\u2605 **\u5E73\u53F0\u4F1A\u66FF\u4F60\u62E6\u4E00\u9053**\uFF1A\u5408\u540C\u91CC\u6709\u53EF\u5224\u5B9A\u5224\u636E\u3001\u800C\u5224\u636E\u6CA1\u8FC7\u65F6\uFF0C\u6807 done \u88AB**\u76F4\u63A5\u62D2\u7EDD**\uFF0C`,
    `         \u62A5\u9519\u5217\u51FA\u6CA1\u8FC7\u7684\u90A3\u51E0\u6761\u548C\u8BC1\u636E\u3002\u770B\u5230\u5B83**\u4E0D\u8981\u7ED5**\uFF08\u522B\u6539\u5224\u636E\u3001\u522B\u6807 failed \u8499\u8FC7\u53BB\uFF09\u2014\u2014`,
    `         \u5B83\u5C31\u662F\u5728\u8BF4"\u8FD9\u6D3B\u6CA1\u505A\u5B8C"\uFF0C\u6309\u3010\u7B2C\u4E8C\u6B65 B\u3011\u5904\u7406\u3002`,
    `         \u26A0 \u53EA\u6709**\u7EAF\u6563\u6587**\u9A8C\u6536\u6807\u51C6\u7684\u5408\u540C\u4E0D\u53D7\u6B64\u9650\uFF08\u9760\u72EC\u7ACB\u5BF9\u8D26\u88C1\u5B9A\uFF09\u2014\u2014`,
    `           \u4E5F\u5C31\u662F\u8BF4\uFF1A**\u6CA1\u5199\u5224\u636E\u7684\u4EFB\u52A1\uFF0C\u5E73\u53F0\u62E6\u4E0D\u4F4F\u5047 done**\uFF08\u5224\u636E\u600E\u4E48\u5199\u5728\u3010\u7B2C\u56DB\u6B65\u3011\uFF09\u3002`,
    `         \u26A0 \u771F\u8981\u5E26\u75C5\u6536\u5C3E\uFF08\u5224\u636E\u5DF2\u8FC7\u65F6\u3001\u4E0D\u518D\u53CD\u6620\u8981\u6C42\uFF09\u2192 **\u5148\u6539\u5408\u540C**\u8BA9\u5224\u636E\u53CD\u6620\u73B0\u5B9E`,
    `           \uFF08\u4F1A\u7559\u7248\u672C\u5386\u53F2\uFF09\uFF0C\u522B\u7528 allow_unmet=True \u786C\u8FC7 \u2014\u2014 \u90A3\u4E2A\u53E3\u5B50\u4E0D\u662F\u7ED9"\u6211\u4E0D\u60F3\u8865"\u7528\u7684\u3002`,
    `   \u2465 \u4EE3\u7801\u5730\u56FE\u8981\u5728\u6807 done \u4E4B\u524D\u66F4\u65B0\uFF08\u90A3\u65F6\u8BED\u4E49\u6700\u6E05\u695A\uFF09\u3002\u5DF2\u7ECF\u6807\u4E86 done \u4E5F\u80FD\u8865\u5199 \u2014\u2014`,
    `      \u53EA\u8981\u4F60\u5728\u672C\u9879\u76EE\u91CC\u5E72\u8FC7\uFF08\u62E5\u6709\u4EFB\u52A1 / \u8FD1 7 \u5929\u6709\u68C0\u67E5\u70B9\uFF09\u5C31\u653E\u884C\u3002`,
    ``,
    `\u3010\u7B2C\u4E8C\u6B65 B \xB7 \u6CA1\u505A\u5B8C\u7684\u4EFB\u52A1\u3011\u2605 \u8FD9\u4E00\u5806**\u7EDD\u5BF9\u4E0D\u8981\u6807 done**\u3002\u53EA\u505A\u4E24\u4EF6\u4E8B\uFF1A`,
    `   \u2460 \u628A"\u5E72\u5230\u54EA\u4E86"\u5199\u8FDB\u68C0\u67E5\u70B9\uFF08**\u8FD9\u9879\u5FC5\u505A**\uFF0C\u4E0D\u5199\u5C31\u7B49\u4E8E\u8FD9\u8F6E\u767D\u5E72\uFF09\uFF1A`,
    `      project_checkpoint(project=\u2026, task_id=<id>, state={`,
    `          completed:[\u8FD9\u8F6E\u771F\u7684\u505A\u5B8C\u4E86\u4EC0\u4E48], not_done:[\u8FD8\u6CA1\u505A\u7684\u3001\u5DEE\u4EC0\u4E48],`,
    `          pitfalls:[\u8E29\u7684\u5751\uFF0C\u5199\u5177\u4F53], blockers:[\u5361\u5728\u4EC0\u4E48\u5916\u90E8\u4F9D\u8D56], next_action:\u4E0B\u4E00\u6B65})`,
    `      \uFF08\u4EFB\u52A1\u4E0D\u5728\u4F60\u540D\u4E0B \u2014\u2014 \u5C31\u662F\u6CA1\u9886\u8FC7 \u2014\u2014 \u5148\u7528 project_task_dispatch \u9886\u4E0B\u6765\u518D\u5199\uFF1B`,
    `        \u5DF2\u7ECF\u662F done \u7684\u8981\u5148 project_task_reopen \u9000\u56DE\u961F\u5217\uFF0C\u89C1\u4E0A\u9762\u7B2C\u4E00\u6B65\u3002\uFF09`,
    `   \u2461 \u72B6\u6001**\u6309\u5B9E\u9645\u60C5\u51B5\u7559**\uFF0C\u4E0D\u662F\u4E00\u5F8B done\uFF1A`,
    `      \xB7 \u8FD8\u8981\u63A5\u7740\u505A            \u2192 \u7559 pending\uFF08\u4EC0\u4E48\u90FD\u4E0D\u7528\u6539\uFF0C\u5B83\u672C\u6765\u5C31\u662F\uFF09`,
    `      \xB7 \u5361\u5728\u5916\u90E8\u539F\u56E0\uFF08\u7B49\u4EBA / \u7B49\u5BA1\u6279 / \u7B49\u5BF9\u65B9\u63A5\u53E3\uFF09\u2192 status="blocked"`,
    `      \xB7 \u5E72\u5B8C\u4E86\u3001\u7B49\u522B\u4EBA\u9A8C      \u2192 status="review"`,
    `   \u2462 **\u4E0D\u8981**\u4E3A\u4E86"\u770B\u8D77\u6765\u6536\u5C3E\u4E86"\u800C\u6807 done\u3002\u6CA1\u505A\u5B8C\u5C31\u662F\u6CA1\u505A\u5B8C \u2014\u2014`,
    `      \u6807\u4E86 done \u4F1A\u8BA9\u9762\u677F\u8BF4\u8C0E\u3001\u8BA9\u4E0B\u4E2A\u4F1A\u8BDD\u6F0F\u6389\u3001\u8BA9\u5BF9\u8D26\u65E0\u4ECE\u4E0B\u624B\u3002`,
    ``,
    `   \u26A0 \u5E72\u6D3B\u671F\u95F4\u5B9A\u671F\u53D1\u4E00\u6B21\u5FC3\u8DF3\uFF1Aproject_session_heartbeat(session_id=<\u4F60\u7684 id>, task_id=<id>)`,
    `     \u4E3A\u4EC0\u4E48\u5FC5\u987B\u53D1\uFF1A\u9762\u677F\u5224\u300C\u5728\u4E0D\u5728\u5E72\u300D\u9760\u4E24\u4EF6\u4E8B\uFF0C\u5E73\u53F0\u5DF2\u628A\u5B83\u4EEC\u62C6\u6210\u4E24\u4E2A\u5B57\u6BB5 \u2014\u2014`,
    `       \xB7 \u5FC3\u8DF3\u7EED\u7684\u662F **liveness**\uFF08\u300C\u6211\u8FD8\u5728\u300D\uFF09\uFF1A\u8D85\u8FC7 2 \u5C0F\u65F6\u4E0D\u53D1\uFF0C\u4F1A\u8BDD\u4F1A\u88AB\u56DE\u843D\u5230 idle\u3001\u4EFB\u52A1\u88AB\u91CA\u653E`,
    `       \xB7 \u68C0\u67E5\u70B9/\u4EA7\u51FA\u52A8\u7684\u662F **progress**\uFF08\u300C\u6211\u5728\u63A8\u8FDB\u300D\uFF09\uFF1A\u5FC3\u8DF3**\u4E0D\u4F1A**\u52A8\u5B83`,
    `     \u6240\u4EE5\u300C\u5149\u53D1\u5FC3\u8DF3\u4E0D\u5199\u68C0\u67E5\u70B9\u300D\u4E0D\u4F1A\u8BA9\u4F60\u53D8\u56DE\u300C\u5F85\u5F00\u59CB\u300D\uFF08\u90A3\u6B63\u662F\u4EE5\u524D\u90A3\u4E2A bug\uFF0C\u5DF2\u4FEE\uFF09\uFF0C`,
    `     \u9762\u677F\u4F1A\u663E\u793A\u300C\u8FDB\u884C\u4E2D\u300D\u4F46\u6253\u4E0A**\u300C\u5360\u7740\u6CA1\u63A8\u8FDB\u300D**\u7684\u6807\u8BB0 \u2014\u2014 \u90A3\u662F\u63D0\u9192\u4F60\u8BE5\u5199\u68C0\u67E5\u70B9\u4E86\uFF0C\u4E0D\u662F\u8BF4\u4F60\u6CA1\u5E72\u3002`,
    `     \u2605 \u5E72\u957F\u6D3B\u4E4B\u524D\u5148\u58F0\u660E ETA\uFF0C\u9762\u677F\u5728 ETA \u4E4B\u524D\u5C31\u4E0D\u4F1A\u50AC\u4F60\uFF1A`,
    `       project_session_heartbeat(session_id=<\u4F60\u7684 id>, task_id=<id>, eta_seconds=5400)`,
    `       \u6D3B\u6BD4\u9884\u671F\u4E45\u5C31**\u518D\u53D1\u4E00\u6B21\u5E26\u65B0 eta_seconds \u7684\u5FC3\u8DF3**\u6539\u4E00\u4E0B \u2014\u2014 \u62A5\u9519\u7684 ETA \u6BD4\u4E0D\u62A5\u66F4\u7CDF\u3002`,
    ``,
    `\u3010\u7B2C\u4E09\u6B65 \xB7 \u81EA\u68C0\u3011\u9010\u4E2A\u5FF5\u4E00\u904D\uFF08\u2605 \u7B2C 1 \u95EE\u662F\u91CD\u70B9\uFF0C\u4E13\u95E8\u9632"\u6CA1\u505A\u5B8C\u7684\u88AB\u6807\u6210\u5B8C\u6210"\uFF09\uFF1A`,
    `   1. **\u6211\u6807\u6210 done \u7684\u6BCF\u4E00\u4E2A\u4EFB\u52A1\uFF0C\u771F\u7684\u505A\u5B8C\u4E86\u5417\uFF1F**`,
    `      \u9010\u6761\u95EE\u81EA\u5DF1\uFF1A\u6D3B\u5E72\u5B8C\u4E86\u5417\uFF1F\u4E1C\u897F\u4EA4\u51FA\u53BB\u4E86\u5417\uFF1Fpreflight \u8FC7\u4E86\u5417\uFF1F`,
    `      \u53EA\u8981\u6709\u4E00\u6761\u7B54\u6848\u662F"\u6CA1\u6709" \u2014\u2014 \u90A3\u5C31\u662F\u6807\u9519\u4E86\uFF0C\u8981\u6539\u56DE\u6765\uFF1A`,
    `        project_task_reopen(task_id=<id>, session_id=<\u4F60>, reason="\u6807\u65E9\u4E86\uFF0C\u5B9E\u9645\u6CA1\u505A\u5B8C")`,
    `      \u7136\u540E\u6309\u3010\u7B2C\u4E8C\u6B65 B\u3011\u5904\u7406\uFF08\u5199\u68C0\u67E5\u70B9\u3001\u72B6\u6001\u7559 pending \u6216 blocked\uFF09\u3002`,
    `      \u26A0 \u5B81\u53EF\u4E8B\u540E\u591A\u6539\u4E00\u6761\uFF0C\u4E5F\u4E0D\u8981\u7559\u4E00\u4E2A\u5047\u7684 done \u2014\u2014 \u5047\u7684 done \u4F1A\u88AB\u4E0B\u4E2A\u4F1A\u8BDD\u5F53\u6210\u4E0D\u7528\u7BA1\u3002`,
    `   2. \u6211\u7B2C\u4E00\u6B65\u5217\u51FA\u7684\u4EFB\u52A1\uFF0C\u6BCF\u4E00\u4E2A\u90FD\u6709\u68C0\u67E5\u70B9\u4E86\u5417\uFF1F\u6CA1\u8D70\u5B8C\u7684\u6709\u6CA1\u6709\u8D70\u5B8C\uFF1F`,
    `   3. \u6CA1\u505A\u5B8C\u7684\u90A3\u4E9B\uFF0C\u72B6\u6001\u5BF9\u4E0D\u5BF9\uFF08pending / blocked / review\uFF0C\u800C\u4E0D\u662F done\uFF09\uFF1F`,
    ``,
    `\u3010\u7B2C\u56DB\u6B65 \xB7 \u5224\u65AD\u8981\u4E0D\u8981\u65B0\u5EFA\u5361\u3011\u2014\u2014 \u8FD9\u4E00\u6B65\u6700\u5BB9\u6613\u628A\u5E93\u641E\u4E71\uFF0C\u52A1\u5FC5\u8D70\u4E00\u904D\u3002`,
    `   \u5E72\u5B8C\u4E00\u5757\u6D3B\u5148\u95EE\uFF1A\u8FD9\u5757\u6D3B**\u539F\u6765\u4EFB\u52A1\u7684\u5408\u540C\u91CC\u6709\u6CA1\u6709\u8981\u6C42**\uFF1F\uFF08\u5408\u540C\u5728 context pack \u91CC\u3002\uFF09`,
    ``,
    `   \xB7 \u5408\u540C\u91CC\u8981\u6C42\u7684 \u2192 **\u522B\u5EFA\u65B0\u5361**\uFF0C\u5728\u539F\u4EFB\u52A1\u91CC\u8865\u4E00\u4E2A\u68C0\u67E5\u70B9\u5C31\u591F\u4E86\u3002`,
    `     \u5EFA\u4E86\u4F1A\u53D8\u6210"\u4E24\u5F20\u5361\u8BF4\u540C\u4E00\u4EF6\u4E8B"\uFF0C\u5BF9\u8D26\u65F6\u5224\u4E0D\u6E05\u8C01\u8D1F\u8D23\u3002`,
    `   \xB7 \u5408\u540C\u91CC\u6CA1\u6709\u7684\u3001\u6267\u884C\u4E2D\u65B0\u53D1\u73B0\u7684\u6D3B \u2192 **\u5EFA\u65B0\u5361**\uFF1A\u505A\u5B8C\u6807 done\uFF0C\u6CA1\u505A\u5B8C\u7559 pending\u3002`,
    `     \u5EFA\u4E4B\u524D\u518D\u786E\u8BA4\u4E00\u6B21\u5B83\u4E0D\u662F\u539F\u4EFB\u52A1\u7684\u7EC4\u6210\u90E8\u5206 \u2014\u2014 \u62FF\u4E0D\u51C6\u5C31\u95EE\u4EBA\uFF0C\u522B\u81EA\u5DF1\u5B9A\u3002`,
    `   \xB7 \u771F\u53D1\u73B0\u8303\u56F4\u53D8\u4E86 \u2192 \u5E73\u53F0**\u4E0D\u5141\u8BB8\u6539\u4EFB\u52A1\u540D/\u8BF4\u660E**\uFF08project_task_update \u53EA\u6539`,
    `     status / next_action\uFF09\u3002\u6B63\u786E\u505A\u6CD5\u662F**\u66F4\u65B0\u5408\u540C**\u6216\u62C6\u65B0\u5361\uFF0C\u522B\u9760\u6539\u6570\u636E\u5E93\u7ED5\u8FC7\u3002`,
    ``,
    `   \u2605 \u5EFA\u5361\u65F6\u628A**\u9A8C\u6536\u6807\u51C6\u5199\u6210\u5224\u636E**\uFF08\u8FD9\u662F\u6700\u8BE5\u82B1\u5FC3\u601D\u7684\u4E00\u6B65\uFF0C\u4E5F\u662F\u8FD9\u6761\u95E8\u7981\u7684\u524D\u63D0\uFF09\uFF1A`,
    `     file_exists:<\u8DEF\u5F84> / no_placeholders:<\u8DEF\u5F84> / grep_absent:<\u8DEF\u5F84>::<\u6587\u672C> /`,
    `     sha256:<\u8DEF\u5F84>::<\u6458\u8981> / tests_pass:<\u547D\u4EE4> / endpoint_ok:<URL>`,
    `     \u8981\u70B9\uFF1A\u628A**\u5177\u4F53\u8DEF\u5F84 / \u5177\u4F53\u547D\u4EE4 / \u5177\u4F53 URL** \u5199\u51FA\u6765 \u2014\u2014 \u4E0D\u5199\u4F1A\u751F\u6210\u4E00\u6761\u6A21\u7CCA\u7684`,
    `     \u9ED8\u8BA4\u9A8C\u6536\u6807\u51C6\uFF0C\u5224\u4E0D\u4E86\uFF0C\u5E73\u53F0\u4E5F\u5C31\u62E6\u4E0D\u4F4F\u5047 done\u3002`,
    `     \u26A0 \u522B\u6307\u671B\u81EA\u52A8\u8F6C\u6362\uFF1A\u5B9E\u6D4B\u5168\u5E93 176 \u6761\u9A8C\u6536\u6807\u51C6\u81EA\u52A8\u63D0\u5224\u636E**\u53EA\u63D0\u51FA 9 \u6761**\uFF085%\uFF09\u3002`,
    ``,
    `   \u26A0 \u65E0\u8BBA\u5EFA\u4E0D\u5EFA\u5361\uFF1A**\u53D1\u73B0\u4E86\u4F46\u6CA1\u505A\u7684\u6D3B\uFF0C\u5FC5\u987B\u5199\u8FDB\u68C0\u67E5\u70B9\u7684 not_done**\u3002`,
    `     \u90A3\u662F\u5B83\u4F20\u5230\u4E0B\u4E00\u4E2A\u4F1A\u8BDD\u7684\u552F\u4E00\u901A\u9053 \u2014\u2014 \u9762\u677F\u4E0D\u663E\u793A\u68C0\u67E5\u70B9\uFF0C\u4E0D\u5199\u5C31\u7B49\u4E8E\u4E22\u4E86\u3002`,
    ``,
    `   \u5EFA\u5361\u95E8\u7981\uFF08\u8BA1\u5212\u9501\u7740\u600E\u4E48\u8D70\u63D0\u6848\u3001\u8C01\u6765\u6279\uFF09\u2192 \u70B9\u9879\u76EE\u5361\u4E0A\u7684\u300C\u62C6\u4EFB\u52A1\u300D\u6309\u94AE\uFF0C`,
    `   \u90A3\u91CC\u6709\u5B8C\u6574\u5B9E\u6D4B\u8FC7\u7684\u6B65\u9AA4\u548C\u4E09\u4E2A\u786C\u89C4\u5219\u3002\u8FD9\u91CC\u4E0D\u91CD\u590D\u3002`,
    ``,
    `\u60F3\u8BA9\u9762\u677F\u52A8\uFF0C\u5FC5\u987B\u52A8**\u4EFB\u52A1\u672C\u8EAB**\uFF08\u72B6\u6001 / \u8BF4\u660E / \u4E0B\u4E00\u6B65\uFF09\u2014\u2014 \u9762\u677F\u8BFB\u7684\u662F\u5B83\u3002`,
    `\u5B8C\u6574\u673A\u5236\uFF08\u542B\u5404\u79CD\u95E8\u7981\u548C\u62A5\u9519\u539F\u56E0\uFF09\u89C1 D:\\codex-memory\\README.md \u548C\u5404\u9879\u76EE AGENTS.md\u3002`
  ].join("\n");
  var NEW_PROJECT_START = [
    `\u3010\u5F00\u59CB\u4E00\u4E2A\u65B0\u4E1C\u897F\u3011`,
    ``,
    `  \u4F60\u8981\u5E2E\u7528\u6237\u4ECE\u96F6\u5F00\u59CB\u4E00\u4E2A\u4E1C\u897F\u3002\u2605 **\u4E0D\u8981\u6025\u7740\u5EFA\u9879\u76EE** \u2014\u2014 \u987A\u5E8F\u662F\uFF1A\u5148\u8C08\u6E05\u695A\uFF0C\u518D\u5EFA\u3002`,
    ``,
    `\u2605 0) \u2605\u2605 **\u5148\u8D70 \`grill-me\` \u8FD9\u4E2A skill** \u2014\u2014 \u5B83\u4E13\u95E8\u5E72\u8FD9\u4EF6\u4E8B\uFF08\u63A5\u9700\u6C42\u5148\u5228\u6839\u95EE\u5E95\uFF09\u3002`,
    `     \u5B83\u6BCF\u6B21\u53EA\u95EE 1~2 \u4E2A\u95EE\u9898\uFF0C\u987A\u5E8F\u662F\uFF1A\u76EE\u7684 \u2192 \u5BF9\u8C61/\u573A\u666F \u2192 \u671F\u5F85\u6548\u679C \u2192 \u8FB9\u754C \u2192 \u9A8C\u6536\u6807\u51C6\uFF1B`,
    `     \u7528\u6237\u7B54"\u4E0D\u77E5\u9053"\u5C31\u7ED9\u4ED6 2~3 \u4E2A\u65B9\u5411\u6311\uFF08\u522B\u903C\u95EE\uFF09\uFF1B\u4ED6\u8BF4"\u4F60\u5B9A"\u5C31\u66FF\u4ED6\u5B9A\u5E76**\u6807\u6CE8\u662F\u4F60\u5B9A\u7684**\u3002`,
    `     \u2605 \u8C08\u5B8C\u8981**\u590D\u8FF0\u4E94\u8981\u7D20 + \u95EE"\u6211\u7406\u89E3\u5BF9\u4E86\u5417\uFF1F"** \u2014\u2014 \u786E\u8BA4\u8FC7\u624D\u53EB\u5F00\u5DE5\u3002`,
    ``,
    `     \u26A0 \u8FD9\u4E00\u6B65**\u4E0D\u78B0\u4EFB\u4F55\u5E73\u53F0\u5DE5\u5177**\uFF0C\u4E5F**\u4E0D\u9700\u8981\u76EE\u5F55\u3001\u4EE3\u7801\u3001\u4EFB\u52A1** \u2014\u2014`,
    `       \u7528\u6237\u53EF\u80FD\u53EA\u6709\u4E00\u4E2A\u60F3\u6CD5\uFF0C\u6216\u8005\u4E22\u7ED9\u4F60\u4E00\u4EFD PPT / \u4E00\u7BC7\u6587\u7AE0\uFF0C\u8FD9\u90FD\u6B63\u5E38\uFF0C\u4E0D\u7528\u5148\u5EFA\u76EE\u5F55\u3002`,
    `     \u26A0 \u8BA8\u8BBA\u9636\u6BB5**\u6CA1\u6709\u4EFB\u4F55\u8BB0\u5F55**\uFF1A\u4F1A\u8BDD\u4E00\u65AD\uFF0C\u804A\u8FC7\u7684\u5168\u4E22\uFF08\u5E93\u91CC\u6CA1\u5730\u65B9\u6302\uFF0C\u9879\u76EE\u90FD\u8FD8\u6CA1\u5EFA\uFF09\u3002`,
    `       \u6240\u4EE5**\u8C08\u6E05\u695A\u5C31\u5C3D\u5FEB\u5EFA\u9879\u76EE**\uFF0C\u522B\u804A\u5230\u5929\u8352\u5730\u8001\u3002`,
    ``,
    `  1) \u60F3\u8C08\u5F97\u66F4\u7EC6\u53EF\u4EE5\u53E0\u52A0 \`ai-delivery-flow\` skill\uFF08AI \u4EA4\u4ED8\u5168\u6D41\u7A0B\uFF09\uFF1A`,
    `     \u4EA7\u54C1\u8FB9\u754C\u600E\u4E48\u780D\uFF08MVP\uFF09\u3001\u8981\u4E0D\u8981\u5148\u505A\u4E2A Demo\u3001\u6280\u672F\u9009\u578B\u600E\u4E48\u804A \u2014\u2014 \u90A3\u91CC\u90FD\u6709\u73B0\u6210\u7684\u505A\u6CD5\u3002`,
    ``,
    `  2) \u2605 \u8C08\u6E05\u695A\u540E\uFF0C\u628A\u7ED3\u8BBA\u843D\u6210**\u7B2C\u4E00\u6279\u4EFB\u52A1** \u2014\u2014 \u8FD9\u4E5F\u662F"\u5FC5\u987B\u5148\u8C08\u6E05\u695A"\u7684\u786C\u7406\u7531\uFF1A`,
    `     \u6BCF\u4E2A\u4EFB\u52A1\u628A\u9A8C\u6536\u6807\u51C6**\u5C3D\u91CF\u5199\u6210\u5224\u636E** \u2014\u2014 \u8FD9\u4E00\u6B65\u522B\u5077\u61D2\uFF0C\u5B83\u51B3\u5B9A\u540E\u9762\u5E73\u53F0\u80FD\u4E0D\u80FD\u66FF\u4F60\u9A8C\uFF1A`,
    `       file_exists:<\u8DEF\u5F84> / no_placeholders:<\u8DEF\u5F84> / grep_absent:<\u8DEF\u5F84>::<\u6587\u672C> /`,
    `       sha256:<\u8DEF\u5F84>::<\u6458\u8981> / tests_pass:<\u547D\u4EE4> / endpoint_ok:<URL>`,
    `     \u8981\u70B9\uFF1A\u628A**\u5177\u4F53\u8DEF\u5F84 / \u5177\u4F53\u547D\u4EE4 / \u5177\u4F53 URL** \u5199\u51FA\u6765\u3002`,
    `     \uFF08"\u6D4B\u8BD5\u5168\u90E8\u901A\u8FC7"\u6CA1\u7528\u2192"\u6D4B\u8BD5 npm test \u5168\u90E8\u901A\u8FC7"\u624D\u884C\uFF1B\u5B8C\u6574\u5199\u6CD5\u89C1\u300C\u52A0\u65B0\u4EFB\u52A1\u300D\u5757\u3002\uFF09`,
    `     \u26A0 \u4E0D\u5199 contract \u4F1A**\u81EA\u52A8\u751F\u6210**\u4E00\u6761\u6A21\u7CCA\u7684\uFF08"\u5B8C\u6210\u53EF\u9A8C\u8BC1\u4EA4\u4ED8\u7269\u5E76\u7559\u4E0B\u68C0\u67E5\u70B9"\uFF09\u2014\u2014`,
    `       \u90A3\u6761\u8C01\u90FD\u5224\u4E0D\u4E86\uFF0C\u7B49\u4E8E\u5E73\u53F0\u62E6\u4E0D\u4F4F\u5047 done\u3002`,
    `     \u26A0 tasks **\u7559\u7A7A**\uFF08\u6216\u5E72\u8106\u4E0D\u4F20\uFF09\u4F1A\u76F4\u63A5\u62A5\u9519\u5EFA\u4E0D\u51FA\u6765 \u2014\u2014 \u5B9E\u6D4B\u539F\u6587\uFF1A`,
    `         requires at least one planned task`,
    `       \u4E0A\u9650 20 \u4E2A\uFF08\u8D85\u4E86\u4E5F\u62A5\uFF09\u3002\u6240\u4EE5"\u7B2C\u4E00\u6279\u4EFB\u52A1"\u662F\u786C\u8981\u6C42\uFF0C\u4E0D\u80FD\u7701\u3002`,
    ``,
    `  3) \u5EFA\u9879\u76EE\uFF08**\u4E00\u6B21\u7ED9\u5168**\uFF0C\u5EFA\u5B8C\u5C31\u9501\uFF09`,
    `     project_bootstrap(`,
    `         project_key="<\u77ED\u6A2A\u7EBF\u5C0F\u5199>",              # \u5FC5\u586B\uFF0C\u4E4B\u540E\u5230\u5904\u7528\u5B83`,
    `         name="<\u540D\u5B57\uFF0C\u2605 \u5FC5\u987B\u542B\u4E2D\u6587>",              # \u5FC5\u586B\uFF08\u7EAF\u82F1\u6587\u540D\u4F1A\u88AB\u62D2\uFF09`,
    `         scope="<\u4E00\u53E5\u8BDD\uFF1A\u505A\u4EC0\u4E48\u3001\u7ED9\u8C01\u7528\u3001\u6700\u7EC8\u5F62\u6001>",  # \u5FC5\u586B`,
    `         session_id="<\u4F60\u7684\u4F1A\u8BDD id>",               # \u5FC5\u586B`,
    `         provider=\u2026, model=\u2026,`,
    `         root_path="<\u4EE3\u7801\u76EE\u5F55\u7684\u7EDD\u5BF9\u8DEF\u5F84>",          # \u2605 \u5FC5\u987B\u662F**\u5DF2\u5B58\u5728\u7684\u76EE\u5F55**`,
    `         kind=\u2026,                                  # \u89C1\u4E0B`,
    `         tasks=[{task_key:\u2026, title:\u2026, description:\u2026,`,
    `                 contract:{objective:\u2026, acceptance:["file_exists:<\u8DEF\u5F84>"]}}, \u2026])`,
    ``,
    `     \u2605 \u6CA1\u76EE\u5F55\u600E\u4E48\u529E\uFF1A**\u5EFA\u4E00\u4E2A**\uFF08\u6BD4\u5982 D:\\codex\\<\u9879\u76EE\u540D>\uFF09\u3002`,
    `       \u4E3A\u4EC0\u4E48\u8EB2\u4E0D\u6389\uFF1A\u4EA7\u51FA\uFF08\u6587\u6863/\u62A5\u544A/\u4EE3\u7801\uFF09\u6700\u7EC8\u8981\u843D\u5728\u9879\u76EE\u76EE\u5F55\u91CC \u2014\u2014`,
    `       artifact_publish \u8981\u6C42\u6587\u4EF6\u5728\u9879\u76EE\u76EE\u5F55\u5185\uFF0C\u6CA1\u76EE\u5F55\u5C31\u4EA4\u4E0D\u51FA\u4E1C\u897F\u3002`,
    `       \u800C\u4E14 root_path \u662F**\u4EE5\u540E\u65B0\u4F1A\u8BDD\u8BA4\u8DEF**\u7684\u4F9D\u636E\uFF1A\u5B83\u8BA9 project_for_path \u80FD\u628A`,
    `       "\u76EE\u5F55"\u5BF9\u5E94\u5230"\u9879\u76EE"\u3002\u586B\u9519\u7684\u4EE3\u4EF7\u5B9E\u6D4B\u8FC7 \u2014\u2014 \u5E93\u91CC\u6709 4 \u4E2A\u9879\u76EE\u56E0\u4E3A\u6CA1\u767B\u8BB0`,
    `       root_path\uFF0C\u7AD9\u5728\u81EA\u5DF1\u76EE\u5F55\u91CC\u4E5F\u8BA4\u4E0D\u51FA\u5C5E\u4E8E\u54EA\u4E2A\u9879\u76EE\u3002`,
    ``,
    `     \u2605 kind \u600E\u4E48\u9009\uFF08\u5B83\u51B3\u5B9A\u7B2C 4 \u6B65\u8981\u4E0D\u8981\u5EFA\u4EE3\u7801\u5730\u56FE\uFF09\uFF1A`,
    `         code  \u2014\u2014 \u8981\u5199/\u6539\u4EE3\u7801       \u2192 **\u8981\u5EFA\u56FE**`,
    `         doc   \u2014\u2014 \u6587\u6863/\u65B9\u6CD5\u8BBA/\u8D44\u6599  \u2192 **\u4E0D\u5EFA**\uFF08\u7EAF\u8D44\u6599\u7C7B\u903C\u5B83\u5EFA\u7B49\u4E8E\u6559\u5B83\u505A\u9519\u4E8B\uFF09`,
    `         data / ops / other \u2014\u2014 \u6709\u4EE3\u7801\u7BA1\u7EBF\uFF08\u811A\u672C\u3001ETL\u3001\u914D\u7F6E\uFF09\u5C31\u5F53 code\uFF0C\u7EAF\u5206\u6790\u5C31\u5F53 doc`,
    `       \u9009\u9519\u4E0D\u4F1A\u62A5\u9519\uFF08\u5E73\u53F0\u53EA\u6821\u9A8C\u5B83\u662F\u8FD9\u4E94\u4E2A\u4E4B\u4E00\uFF09\uFF0C\u4F46\u4F1A\u8BA9\u4F60\u540E\u9762\u505A\u9519\u4E8B\u3002`,
    ``,
    `  4) \u2605 \u5EFA\u5B8C\u5148\u505A\u8FD9\u4E09\u4EF6\u4E8B`,
    `     a. \u786E\u8BA4\u5EFA\u597D\u4E86\uFF1Aproject_overview(project="<key>")`,
    `        \u26A0 \u65B0\u9879\u76EE\u7684\u56FE\u662F\u7A7A\u7684\u3001\u4E5F\u6CA1\u6709\u5386\u53F2\u4E8B\u4EF6 \u2014\u2014 **\u8FD9\u662F\u6B63\u5E38\u7684**\uFF0C\u522B\u4EE5\u4E3A\u51FA\u9519\u4E86\u3002`,
    `        \uFF08\u4E5F\u4E0D\u7528\u53BB project_ready_tasks \u6311\u6D3B\uFF1A\u6D3B\u5C31\u662F\u4F60\u521A\u5199\u8FDB tasks \u7684\u90A3\u4E9B\u3002\uFF09`,
    `     b. \u4EE3\u7801\u5730\u56FE\uFF1A\u6309\u7B2C 3 \u6B65\u9009\u7684 kind \u51B3\u5B9A\u5EFA\u4E0D\u5EFA\uFF08\u8981\u5EFA\u5C31 project_code_map_write\uFF0C`,
    `        \u5E26 revision = 7 \u4F4D\u4EE5\u4E0A git \u77ED SHA\uFF1B\u4E0D\u4F20\u4E0B\u4E2A\u4F1A\u8BDD\u770B\u5230\u7684\u662F unversioned\uFF09\u3002`,
    `     c. project_decision \u628A**\u6280\u672F\u9009\u578B / \u76EE\u5F55\u7ED3\u6784 / \u5173\u952E\u53D6\u820D**\u8BB0\u4E0B\u6765 \u2014\u2014`,
    `        \u65B0\u9879\u76EE\u6CA1\u4EBA\u8BB0\u8FC7\uFF0C\u800C\u8FD9\u4E9B\u4E1C\u897F**\u4EE3\u7801\u91CC\u8BFB\u4E0D\u51FA\u6765**\uFF0C\u4F1A\u8BDD\u4E00\u65AD\u5C31\u6C38\u4E45\u6CA1\u4E86\u3002`,
    ``,
    `  5) \u7136\u540E\u5F00\u59CB\u5E72\u3002\u6D3B\u662F\u4F60\u81EA\u5DF1\u5199\u8FDB tasks \u7684\uFF0C\u4E0D\u7528\u518D"\u6311"\uFF0C\u4F46**\u5148\u505A\u54EA\u4E2A\u81EA\u5DF1\u6392**\u3002`,
    `     \u26A0 \u5EFA\u51FA\u6765\u662F**\u9501\u7740**\u7684\uFF08plan_locked=true\uFF09\uFF1A\u60F3**\u52A0**\u65B0\u4EFB\u52A1\u53EA\u80FD\u8D70\u63D0\u6848\uFF0C`,
    `       \u800C\u63D0\u8BAE\u8005\u4E0D\u80FD\u5BA1\u81EA\u5DF1 \u2192 \u5F97\u53E6\u4E00\u4E2A\u4F1A\u8BDD\u6216\u4EBA\u6765\u6279\uFF08\u6279\u51C6\u4E00\u6B21\u5C31\u6C38\u4E45\u89E3\u9501\uFF09\u3002`,
    `     \u6536\u5C3E\u600E\u4E48\u8BB0 \u2192 \u70B9\u53F3\u4E0A\u89D2\u300C\u600E\u4E48\u8BB0\u5F55\u8FDB\u5171\u4EAB\u5E93\u300D\uFF1B\u52A0\u65B0\u4EFB\u52A1 \u2192 \u89C1\u300C\u7ED9\u5DF2\u6709\u9879\u76EE\u52A0\u65B0\u4EFB\u52A1\u300D\u3002`,
    ...discipline()
  ].join("\n");
  var reqBtn = document.getElementById("reqBtn");
  if (reqBtn) {
    reqBtn.addEventListener("pointerdown", () => {
      reqBtn.classList.remove("press");
      void reqBtn.offsetWidth;
      reqBtn.classList.add("press");
      setTimeout(() => reqBtn.classList.remove("press"), 340);
    });
    reqBtn.addEventListener("click", async () => {
      await copyText(LIBRARY_RECORD_REQUIREMENT, "\u600E\u4E48\u8BB0\u5F55\u8FDB\u5171\u4EAB\u5E93");
      if (reqBtn.classList.contains("done")) return;
      const old = reqBtn.innerHTML;
      reqBtn.classList.add("done");
      reqBtn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      setBotState("burst", clock);
      setTimeout(() => {
        reqBtn.classList.remove("done");
        reqBtn.innerHTML = old;
      }, 1500);
    });
  }
  var newProjBtn = document.getElementById("newProjBtn");
  if (newProjBtn) {
    newProjBtn.addEventListener("pointerdown", () => {
      newProjBtn.classList.remove("press");
      void newProjBtn.offsetWidth;
      newProjBtn.classList.add("press");
      setTimeout(() => newProjBtn.classList.remove("press"), 340);
    });
    newProjBtn.addEventListener("click", async () => {
      await copyText(NEW_PROJECT_START, "\u5F00\u59CB\u4E00\u4E2A\u65B0\u4E1C\u897F");
      if (newProjBtn.classList.contains("done")) return;
      const old = newProjBtn.innerHTML;
      newProjBtn.classList.add("done");
      newProjBtn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      setBotState("burst", clock);
      setTimeout(() => {
        newProjBtn.classList.remove("done");
        newProjBtn.innerHTML = old;
      }, 1500);
    });
  }
  var toastEl = null;
  var toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2300);
  }
  var dragging = false;
  var moved = false;
  var sx = 0;
  var sy = 0;
  var sRight = 0;
  var sTop = 0;
  var lastScreenX = 0;
  var lastScreenY = 0;
  ballEl.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    if (isTauri) {
      beginDrag();
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
    }
    const r = ballEl.getBoundingClientRect();
    sRight = window.innerWidth - r.right;
    sTop = r.top;
    ballEl.classList.add("dragging");
    ballEl.setPointerCapture(e.pointerId);
  });
  ballEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 4) moved = true;
    if (!moved) return;
    if (isTauri) {
      dragBy(e.screenX - lastScreenX, e.screenY - lastScreenY);
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
    } else {
      const w = ballEl.offsetWidth;
      ballEl.style.right = Math.max(-w / 3, Math.min(window.innerWidth - w / 1.6, sRight - dx)) + "px";
      ballEl.style.top = Math.max(-w / 3, Math.min(window.innerHeight - w / 1.6, sTop + dy)) + "px";
      if (open) positionPanel();
    }
  });
  ballEl.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    ballEl.classList.remove("dragging");
    if (moved) {
      if (!isTauri) {
        const r = ballEl.getBoundingClientRect();
        const edge = 56;
        if (r.left < edge) ballEl.style.right = window.innerWidth - r.width - 22 + "px";
        else if (window.innerWidth - r.right < edge) ballEl.style.right = "22px";
        ballEl.style.transition = "right .34s cubic-bezier(.34,1.3,.64,1), top .34s cubic-bezier(.34,1.3,.64,1)";
        setTimeout(() => ballEl.style.transition = "", 360);
        if (open) positionPanel();
      }
    } else {
      open ? closePanel() : openPanel();
    }
    e.stopPropagation();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!open) return;
    const t = e.target;
    if (panel.contains(t) || ballEl.contains(t)) return;
    if (panel.classList.contains("pinned")) return;
    closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (view.kind === "tasks") backToProjects();
    else closePanel();
  });
  renderProjects();
  var refreshTimer = 0;
  function startRefresh() {
    stopRefresh();
    refreshTimer = window.setInterval(() => {
      if (!open) return;
      loadProjects();
      if (view.kind === "tasks") {
        const p = byKey(view.proj);
        p.tasks = [];
        loadTasks(view.proj);
      }
    }, 5e3);
  }
  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = 0;
    }
  }
  var KIND_TEXT = {
    task_claimed: "\u6709\u4EFB\u52A1\u88AB\u9886\u53D6",
    task_created: "\u65B0\u4EFB\u52A1\u521B\u5EFA",
    task_updated: "\u4EFB\u52A1\u72B6\u6001\u66F4\u65B0",
    task_reconciled: "\u4EFB\u52A1\u5DF2\u5BF9\u8D26",
    task_lease_expired: "\u4EFB\u52A1\u79DF\u7EA6\u8FC7\u671F",
    checkpoint_saved: "\u5199\u4E86\u68C0\u67E5\u70B9",
    artifact_published: "\u53D1\u5E03\u4E86\u4EA7\u7269",
    context_pack_created: "\u751F\u6210\u4E86\u4E0A\u4E0B\u6587\u5305",
    session_registered: "\u4F1A\u8BDD\u63A5\u5165",
    handoff_created: "\u5199\u4E86\u4EA4\u63A5",
    project_created: "\u65B0\u9879\u76EE\u5EFA\u7ACB",
    project_control_changed: "\u9879\u76EE\u72B6\u6001\u53D8\u66F4",
    project_baseline_captured: "\u6355\u83B7\u4E86\u57FA\u7EBF",
    plan_proposed: "\u63D0\u4EA4\u4E86\u8BA1\u5212\u63D0\u6848",
    plan_committed: "\u8BA1\u5212\u5DF2\u6279\u51C6",
    plan_rejected: "\u8BA1\u5212\u88AB\u9A73\u56DE",
    code_map_updated: "\u4EE3\u7801\u5730\u56FE\u66F4\u65B0",
    task_auto_synced: "\u4EFB\u52A1\u81EA\u52A8\u540C\u6B65"
  };
  var es = null;
  var sseRetry = 0;
  var sseLastOkAt = 0;
  async function startSSE() {
    if (!isTauri || es) return;
    try {
      await listen("cx-change", (e) => {
        let d = null;
        try {
          d = JSON.parse(String(e.payload));
        } catch {
        }
        void logDbg("SSE \u6536\u5230: " + String(e.payload).slice(0, 120));
        onLibraryChanged(d);
      });
      await invoke("start_event_stream", {});
      es = { close: () => {
      } };
      sseRetry = 0;
      sseLastOkAt = Date.now();
    } catch (e) {
      sseRetry++;
      void logDbg(`SSE \u542F\u52A8\u5931\u8D25\uFF08\u7B2C ${sseRetry} \u6B21\uFF09: ` + String(e).slice(0, 220));
      const wait = Math.min(3e4, 4e3 * sseRetry);
      setTimeout(() => {
        es = null;
        void startSSE();
      }, wait);
    }
  }
  function reconnectSSE() {
    es = null;
    sseRetry = 0;
    void startSSE();
  }
  function stopSSE() {
    if (es) {
      es.close();
      es = null;
    }
  }
  async function logDbg(msg) {
    try {
      await invoke("debug_log", { msg });
    } catch {
    }
  }
  function onLibraryChanged(d) {
    loadProjects();
    if (open && view.kind === "tasks") {
      const p = byKey(view.proj);
      if (p) {
        p.tasks = [];
        p.fromDb = false;
        loadTasks(view.proj);
      }
    } else {
      for (const x of ALL) dirtyProjects.add(x.key);
    }
    const key = String(d?.kind || "");
    const label = KIND_TEXT[key] || (key ? key.replace(/_/g, " ") : "\u6570\u636E\u6709\u66F4\u65B0");
    if (open) toast(`\u5171\u4EAB\u5E93 \xB7 ${label}`);
  }
  var syncing = false;
  async function syncNow() {
    if (syncing) return;
    syncing = true;
    const btn = document.getElementById("syncBtn");
    btn?.classList.add("spinning");
    const problems = [];
    try {
      reconnectSSE();
      collecting = true;
      addedProjects = [];
      changedProjectCount = 0;
      changedProjectDetail = [];
      await loadProjects();
      collecting = false;
      const viewing = view.kind === "tasks" ? view.proj : "";
      if (viewing) {
        const p = byKey(viewing);
        const before = new Map((p?.tasks ?? []).map((t) => [t.key, t.status]));
        if (p) {
          p.tasks = [];
          p.fromDb = false;
        }
        await loadTasks(viewing);
        dirtyProjects.delete(viewing);
        const after = byKey(viewing)?.tasks ?? [];
        for (const t of after) {
          const was = before.get(t.key);
          if (was && was !== t.status) changedProjectDetail.push(`\u4EFB\u52A1 ${t.key}\uFF1A${was} \u2192 ${t.status}`);
          else if (!was) changedProjectDetail.push(`\u4EFB\u52A1 ${t.key}\uFF1A\u65B0\u51FA\u73B0`);
        }
        if (open && view.kind === "tasks" && view.proj === viewing) renderTasks(viewing);
      }
      const verify = await verifyConsistency();
      const lines = [];
      const fresh = lastLoadAt ? Math.round((Date.now() - lastLoadAt) / 1e3) : -1;
      const sseOk = sseLastOkAt > 0;
      const sseAge = sseOk ? Math.round((Date.now() - sseLastOkAt) / 1e3) : -1;
      if (!addedProjects.length && !changedProjectCount) {
        lines.push("\u6CA1\u6709\u53D8\u5316 \u2014\u2014 \u9762\u677F\u672C\u6765\u5C31\u662F\u6700\u65B0\u7684");
      } else {
        if (addedProjects.length) lines.push(`\u65B0\u51FA\u73B0\uFF1A${addedProjects.length} \u4E2A\u9879\u76EE\uFF08${addedProjects.slice(0, 3).join("\u3001")}${addedProjects.length > 3 ? " \u2026" : ""}\uFF09`);
        if (changedProjectCount) lines.push(`\u6709\u53D8\u5316\uFF1A${changedProjectCount} \u4E2A\u9879\u76EE`);
        for (const d of changedProjectDetail.slice(0, 4)) lines.push("  " + d);
        if (changedProjectDetail.length > 4) lines.push(`  \u2026\u8FD8\u6709 ${changedProjectDetail.length - 4} \u6761`);
      }
      lines.push(sseOk ? `\u5B9E\u65F6\u901A\u9053\uFF1A\u6B63\u5E38\uFF08${sseAge} \u79D2\u524D\u6302\u4E0A\uFF09` : "\u5B9E\u65F6\u901A\u9053\uFF1A\u672A\u6302\u4E0A \u2014\u2014 \u73B0\u5728\u9760 5 \u79D2\u8F6E\u8BE2\u515C\u5E95");
      lines.push(`\u6570\u636E\u8BFB\u53D6\uFF1A${fresh >= 0 ? fresh + " \u79D2\u524D" : "\u521A\u521A"}`);
      lines.push(verify.ok ? verify.projects === 0 ? '\u6838\u5BF9\uFF1A\u8FD9\u6B21\u6CA1\u6709\u53EF\u6838\u5BF9\u7684\u9879\u76EE\uFF08\u660E\u7EC6\u8FD8\u6CA1\u62C9\u5168\uFF09\u2014\u2014 \u6240\u4EE5\u8FD9\u4E00\u884C\u4E0D\u7B97"\u5DF2\u6838\u5BF9"' : `\u6838\u5BF9\uFF1A\u4E00\u81F4\uFF08${verify.projects} \u4E2A\u9879\u76EE / ${verify.tasks} \u4E2A\u4EFB\u52A1\uFF09` + (verify.skipped ? `\uFF0C\u53E6\u6709 ${verify.skipped} \u4E2A\u660E\u7EC6\u6CA1\u62C9\u5168\u3001\u672A\u6838\u5BF9` : "") : `\u6838\u5BF9\uFF1A\u53D1\u73B0 ${verify.problems.length} \u5904\u5BF9\u4E0D\u4E0A\uFF08\u6838\u5BF9\u4E86 ${verify.projects} \u4E2A\u9879\u76EE\uFF09`);
      for (const p of verify.problems.slice(0, 4)) lines.push("  \u26A0 " + p);
      if (archivedProjects.length) {
        lines.push(`\u53E6\u6709 ${archivedProjects.length} \u4E2A\u5DF2\u5F52\u6863\u672A\u663E\u793A\uFF08${archivedProjects.slice(0, 3).map((a) => a.key).join("\u3001")}${archivedProjects.length > 3 ? " \u2026" : ""}\uFF09`);
      }
      void logDbg("\u540C\u6B65\u62A5\u544A\uFF1A" + lines.join(" | ").slice(0, 600));
      showSyncReport(lines, !verify.ok);
    } catch (e) {
      void logDbg("\u540C\u6B65\u5931\u8D25: " + String(e).slice(0, 300));
      showSyncReport(["\u540C\u6B65\u5931\u8D25\uFF1A" + String(e).slice(0, 90), "\u539F\u59CB\u62A5\u9519\u5DF2\u5199\u8FDB\u8C03\u8BD5\u65E5\u5FD7"], true);
    } finally {
      syncing = false;
      setTimeout(() => btn?.classList.remove("spinning"), 400);
    }
  }
  async function verifyConsistency() {
    const problems = [];
    let taskTotal = 0;
    let verified = 0;
    let skipped = 0;
    const scoped = view.kind === "tasks" ? [byKey(view.proj)].filter(Boolean) : ALL;
    for (const p of scoped) {
      if (!p.fromDb || !p.tasks.length) {
        skipped++;
        continue;
      }
      if (num(p.total) === 0) {
        verified++;
        continue;
      }
      taskTotal += num(p.total);
      verified++;
      const sum = num(p.done) + num(p.doing) + num(p.review) + num(p.ready) + heldOf(p) + num(p.failed);
      if (sum !== num(p.total)) {
        problems.push(p.name + "\uFF1A\u516D\u6876\u76F8\u52A0 " + sum + " \u2260 \u4EFB\u52A1\u603B\u6570 " + num(p.total));
      }
      const count = (f) => p.tasks.filter(f).length;
      const tDone = count((t) => t.status === "done");
      const tDoing = count((t) => t.status === "doing");
      const tReview = count((t) => t.status === "review");
      const tReady = count((t) => t.status === "ready");
      const tBlocked = count((t) => t.status === "blocked");
      if (tDone !== num(p.done)) problems.push(p.name + "\uFF1A\u5B8C\u6210\u6570 " + tDone + " \u2260 \u540E\u7AEF " + num(p.done));
      if (tDoing !== num(p.doing)) problems.push(p.name + "\uFF1A\u5728\u505A\u6570 " + tDoing + " \u2260 \u540E\u7AEF " + num(p.doing));
      if (tReview !== num(p.review)) problems.push(p.name + "\uFF1A\u5F85\u9A8C\u6536\u6570 " + tReview + " \u2260 \u540E\u7AEF " + num(p.review));
      if (tReady !== num(p.ready)) problems.push(p.name + "\uFF1A\u5F85\u5F00\u59CB\u6570 " + tReady + " \u2260 \u540E\u7AEF " + num(p.ready));
      if (tBlocked !== blockedOf(p)) problems.push(p.name + "\uFF1A\u5361\u4F4F\u6570 " + tBlocked + " \u2260 \u540E\u7AEF " + blockedOf(p));
    }
    return { ok: problems.length === 0, problems, projects: verified, tasks: taskTotal, skipped };
  }
  var syncReportEl = null;
  var syncReportTimer = 0;
  function showSyncReport(lines, sticky) {
    if (!syncReportEl) {
      syncReportEl = document.createElement("div");
      syncReportEl.className = "sync-report";
      syncReportEl.addEventListener("click", () => syncReportEl.classList.remove("show"));
      document.body.appendChild(syncReportEl);
    }
    const [head, ...rest] = lines;
    syncReportEl.innerHTML = `<div class="sr-head">${head}</div>` + rest.map((l) => `<div class="sr-line${l.startsWith("  \u26A0") ? " warn" : ""}">${l}</div>`).join("");
    syncReportEl.classList.add("show");
    clearTimeout(syncReportTimer);
    if (!sticky) syncReportTimer = window.setTimeout(() => syncReportEl.classList.remove("show"), 2e3);
  }
  var syncBtn = document.getElementById("syncBtn");
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      void syncNow();
    });
  }
  function parseState(raw) {
    if (raw === null || raw === void 0) return {};
    if (typeof raw === "object") return raw;
    const s = String(raw).trim();
    if (!s) return {};
    try {
      const o = JSON.parse(s);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }
  function toItems(v) {
    if (v === null || v === void 0) return [];
    if (Array.isArray(v)) return v.map(objToLine).filter((s2) => s2.trim());
    if (typeof v === "object") return [objToLine(v)].filter((s2) => s2.trim());
    const s = String(v).trim();
    if (!s) return [];
    const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    return lines.length > 1 ? lines : [s];
  }
  function objToLine(x) {
    if (x === null || x === void 0) return "";
    if (typeof x !== "object") return String(x);
    const main = x.item ?? x.text ?? x.title ?? x.summary ?? x.note ?? x.what ?? "";
    const detail = x.detail ?? x.description ?? x.why ?? "";
    const rest = [];
    for (const k of ["kind", "owner", "who", "status", "when", "file", "path"]) {
      if (x[k] !== void 0 && x[k] !== null && String(x[k]).trim()) rest.push(`${k}=${x[k]}`);
    }
    const head = String(main).trim() || JSON.stringify(x);
    const tail = detail ? ` \u2014\u2014 ${String(detail).trim()}` : "";
    const meta = rest.length ? `\uFF08${rest.join(" \xB7 ")}\uFF09` : "";
    return `${head}${meta}${tail}`;
  }
  var safeName = (s) => s.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
  var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function clip(s, n) {
    const t = String(s).trim();
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const m = /[。；！！？!?、,，\n][^。；！！？!?、,，\n]*$/.exec(cut);
    const at = m ? cut.length - m[0].length + 1 : cut.length;
    return cut.slice(0, at).replace(/[。；、,，\s]+$/, "") + "\u2026";
  }
  var today = () => {
    const d = /* @__PURE__ */ new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  var STATUS_CN = {
    done: "\u5DF2\u5B8C\u6210",
    doing: "\u8FDB\u884C\u4E2D",
    review: "\u5F85\u9A8C\u6536",
    ready: "\u5F85\u5F00\u59CB",
    blocked: "\u7B49\u5F85\u4E2D"
  };
  var st = (t) => STATUS_CN[t.status] || t.status;
  function buildReportHtml(p, ckRows) {
    const ck = /* @__PURE__ */ new Map();
    for (const r of ckRows) {
      const prev = ck.get(r.task_key);
      if (!prev || String(r.at || "") > String(prev.at || "")) ck.set(r.task_key, r);
    }
    const doneItems = [];
    const notDoneItems = [];
    const blockers = [];
    const nextItems = [];
    const seen = /* @__PURE__ */ new Set();
    const push = (arr, text, from) => {
      const k = text.slice(0, 80);
      if (seen.has(k)) return;
      seen.add(k);
      arr.push({ text, from });
    };
    for (const t of p.tasks) {
      const row = ck.get(t.key);
      const s = parseState(row?.state);
      for (const x of toItems(s.completed)) push(doneItems, x, t.key);
      for (const x of toItems(s.not_done)) push(notDoneItems, x, t.key);
      for (const x of toItems(s.blockers)) push(blockers, x, t.key);
      const nx = toItems(s.next_action);
      for (const x of nx) push(nextItems, x, t.key);
    }
    for (const t of p.tasks) {
      if (t.status !== "done" && t.nextAct) push(nextItems, t.nextAct, t.key);
    }
    const doing = p.tasks.filter((t) => t.status === "doing");
    const review = p.tasks.filter((t) => t.status === "review");
    const ready = p.tasks.filter((t) => t.status === "ready");
    const blocked = p.tasks.filter((t) => t.status === "blocked");
    const doneTasks = p.tasks.filter((t) => t.status === "done");
    const taskTable = (list) => list.length ? `
    <table>
      <tr><th style="width:24%">\u4EFB\u52A1</th><th style="width:11%">\u72B6\u6001</th><th>\u8BF4\u660E / \u4E0B\u4E00\u6B65</th></tr>
      ${list.map((t) => `<tr>
        <td><b>${esc(t.key)}</b><div class="dim">${esc(t.title)}</div></td>
        <td class="${t.status}">${st(t)}${t.owner ? `<div class="dim">${esc(t.owner)}</div>` : ""}</td>
        <td>${t.desc ? `<div class="desc">${esc(clip(t.desc, 260))}</div>` : '<div class="dim">\u5E93\u91CC\u6CA1\u5199\u8BF4\u660E</div>'}
            ${t.nextAct ? `<div class="na"><b>\u4E0B\u4E00\u6B65\uFF1A</b>${esc(clip(t.nextAct, 220))}</div>` : ""}
            ${t.depends?.length ? `<div class="dim">\u524D\u7F6E\uFF1A${esc(t.depends[0])}${t.depends.length > 1 ? ` \u7B49 ${t.depends.length} \u9879` : ""}</div>` : ""}</td>
      </tr>`).join("")}
    </table>` : '<p class="dim">\uFF08\u65E0\uFF09</p>';
    const bullets = (arr, empty) => arr.length ? `<ul>${arr.map((x) => `<li>${esc(x.text)}<span class="src">\u6765\u6E90\uFF1A${esc(x.from)}</span></li>`).join("")}</ul>` : `<p class="dim">${empty}</p>`;
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(p.name)} \xB7 \u8FDB\u5EA6\u62A5\u544A</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 10.5pt; color: #111; line-height: 1.75; margin: 0; }
  h1 { font-size: 19pt; margin: 0 0 4px; letter-spacing: -.01em; }
  .sub { color: #666; font-size: 9pt; margin-bottom: 16px; }
  h2 { font-size: 12.5pt; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  h3 { font-size: 11pt; margin: 14px 0 6px; color: #333; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 9.5pt; text-align: left; vertical-align: top; }
  th { background: #f5f5f6; font-weight: 600; }
  ul { margin: 4px 0 10px; padding-left: 20px; }
  li { margin-bottom: 6px; }
  .dim { color: #888; font-size: 9pt; }
  .desc { color: #333; }
  .na { margin-top: 4px; color: #1a4f8a; }
  .src { color: #aaa; font-size: 8pt; margin-left: 6px; }
  .done { color: #17a06b; font-weight: 600; }
  .doing { color: #3b7ef6; font-weight: 600; }
  .review { color: #8a6d1e; font-weight: 600; }
  .ready { color: #777; }
  .blocked { color: #c0392b; font-weight: 600; }
  .kpi { display: flex; gap: 22px; margin: 10px 0 4px; padding: 10px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
  .kpi div { font-size: 9pt; color: #666; }
  .kpi b { display: block; font-size: 16pt; color: #111; font-weight: 650; }
  .note { margin-top: 18px; padding-top: 8px; border-top: 1px solid #eee; color: #999; font-size: 8.5pt; }
</style></head><body>

<h1>${esc(p.name)}</h1>
<div class="sub">\u8FDB\u5EA6\u62A5\u544A \xB7 \u751F\u6210\u4E8E ${today()} \xB7 \u6570\u636E\u6765\u81EA\u5171\u4EAB\u9879\u76EE\u5E93</div>

${p.scope ? `<p>${esc(p.scope)}</p>` : '<p class="dim">\uFF08\u5E93\u91CC\u6CA1\u5199\u8FD9\u4E2A\u9879\u76EE\u7684 scope\uFF09</p>'}
${p.root ? `<p class="dim">\u4EE3\u7801\u76EE\u5F55\uFF1A${esc(p.root)}</p>` : ""}

<div class="kpi">
  <div><b>${p.done}/${p.total}</b>\u4EFB\u52A1\u5B8C\u6210</div>
  <div><b>${p.doing}</b>\u8FDB\u884C\u4E2D</div>
  <div><b>${p.review}</b>\u5F85\u9A8C\u6536</div>
  <div><b>${p.ready}</b>\u5F85\u5F00\u59CB</div>
  <div><b>${p.failed}</b>\u5361\u4F4F / \u5931\u8D25</div>
  <div><b>${p.artifacts || 0}</b>\u4EA4\u4ED8\u4EA7\u51FA</div>
  ${p.mapNodes ? `<div><b>${p.mapNodes}</b>\u4EE3\u7801\u6A21\u5757</div>` : ""}
</div>

<h2>\u96F6\u3001\u4EFB\u52A1\u76EE\u6807\u4E0E\u9A8C\u6536\u6807\u51C6</h2>
${(() => {
      const rows = p.tasks.map((t) => ({ t, c: parseContract(t.contract || "") })).filter((x) => x.c.goal || x.c.acceptance.length);
      if (!rows.length) return '<p class="dim">\u5E93\u91CC\u8FD9\u4E9B\u4EFB\u52A1\u6CA1\u6709\u767B\u8BB0\u5408\u540C\uFF08\u76EE\u6807 / \u9A8C\u6536\u6807\u51C6\uFF09\u3002</p>';
      return rows.map(({ t, c }) => `
    <h3>${esc(t.title)}<span class="dim"> \xB7 ${esc(t.key)} \xB7 ${st(t)}</span></h3>
    ${c.goal ? `<p><b>\u76EE\u6807\uFF1A</b>${esc(c.goal)}</p>` : ""}
    ${c.acceptance.length ? `<ul>${c.acceptance.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
  `).join("");
    })()}

<h2>\u4E00\u3001\u505A\u4E86\u4EC0\u4E48</h2>
${bullets(doneItems, '\u5404\u4EFB\u52A1\u7684\u68C0\u67E5\u70B9\u91CC\u6CA1\u6709\u8BB0\u5F55"\u5DF2\u5B8C\u6210"\u7684\u6761\u76EE\u3002')}

<h2>\u4E8C\u3001\u8FD8\u6CA1\u505A\u4EC0\u4E48</h2>
${bullets(notDoneItems, '\u68C0\u67E5\u70B9\u91CC\u6CA1\u6709\u8BB0\u5F55"\u672A\u5B8C\u6210"\u7684\u6761\u76EE \u2014\u2014 \u4E0D\u4EE3\u8868\u6CA1\u6709\uFF0C\u53EF\u80FD\u662F\u6CA1\u5199\u8FDB\u68C0\u67E5\u70B9\u3002')}

<h2>\u4E09\u3001\u5361\u5728\u54EA\u513F</h2>
${blockers.length ? bullets(blockers, "") : '<p class="dim">\u68C0\u67E5\u70B9\u91CC\u6CA1\u6709\u8BB0\u5F55\u963B\u585E\u9879\u3002</p>'}
${blocked.length ? `<h3>\u5E93\u91CC\u6807\u4E3A\u300C\u7B49\u5F85\u4E2D\u300D\u7684\u4EFB\u52A1</h3>${taskTable(blocked)}` : ""}

<h2>\u56DB\u3001\u51C6\u5907\u505A\u4EC0\u4E48</h2>
${review.length ? `<h3>\u5F85\u9A8C\u6536\uFF08\u7B49\u786E\u8BA4\uFF0C\u4E0D\u662F\u7B49\u81EA\u5DF1\u505A\uFF09</h3>${taskTable(review)}` : ""}
${doing.length ? `<h3>\u6B63\u5728\u8FDB\u884C</h3>${taskTable(doing)}` : ""}
${ready.length ? `<h3>\u5F85\u5F00\u59CB</h3>${taskTable(ready)}` : ""}
${nextItems.length ? `<h3>\u5404\u4EFB\u52A1\u767B\u8BB0\u7684\u4E0B\u4E00\u6B65</h3>${bullets(nextItems, "")}` : ""}

<h2>\u4E94\u3001\u5DF2\u7ECF\u5B8C\u6210\u7684\u4EFB\u52A1</h2>
${taskTable(doneTasks)}

<div class="note">
  \u672C\u62A5\u544A\u7531\u300C\u5171\u4EAB\u9879\u76EE\u5E93\u300D\u60AC\u6D6E\u7403\u9762\u677F\u5BFC\u51FA\uFF0C\u5185\u5BB9\u5168\u90E8\u53D6\u81EA\u5171\u4EAB\u9879\u76EE\u5E93\uFF08PostgreSQL\uFF09\uFF0C\u672A\u505A\u4EBA\u5DE5\u6DA6\u8272\u3002<br>
  \u4EFB\u52A1\u72B6\u6001\u3001\u8BF4\u660E\u3001\u4E0B\u4E00\u6B65\u6765\u81EA\u4EFB\u52A1\u8868\uFF1B\u300C\u505A\u4E86\u4EC0\u4E48 / \u8FD8\u6CA1\u505A / \u5361\u5728\u54EA\u513F\u300D\u6765\u81EA\u5404\u4F1A\u8BDD\u5199\u7684\u68C0\u67E5\u70B9\u3002<br>
  \u5E93\u91CC\u7684\u5B57\u6BB5\u4E0D\u7EDF\u4E00\uFF08\u68C0\u67E5\u70B9\u7684 completed \u7B49\u5B57\u6BB5\u53EF\u80FD\u662F\u6570\u7EC4\u6216\u6574\u6BB5\u6587\u672C\uFF09\uFF0C\u5BFC\u51FA\u65F6\u5DF2\u7EDF\u4E00\u6210\u6761\u76EE\u5217\u51FA\u3002
</div>
</body></html>`;
  }
  async function exportProjectPdf(projKey, btn) {
    const p = byKey(projKey);
    if (!p) {
      toast("\u627E\u4E0D\u5230\u8FD9\u4E2A\u9879\u76EE");
      return;
    }
    btn?.classList.add("spinning");
    try {
      if (!p.fromDb || !p.tasks.length) {
        await loadTasks(projKey);
        if (open && view.kind === "tasks" && view.proj === projKey) renderTasks(projKey);
      }
      let ckRows = [];
      try {
        const raw = await invoke("qcheckpoints", { projectKey: projKey });
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) ckRows = parsed;
      } catch (e) {
        void logDbg('\u8BFB\u68C0\u67E5\u70B9\u5931\u8D25\uFF08\u62A5\u544A\u4F1A\u5C11"\u505A\u4E86\u4EC0\u4E48"\u90A3\u51E0\u8282\uFF09\uFF1A' + String(e).slice(0, 200));
      }
      const html = buildReportHtml(p, ckRows);
      const dir = "D:\\codex-memory\\vault\\exports\\" + projKey;
      const stamp = today().replace(/[: ]/g, "-");
      const filename = `${safeName(p.name)}-\u8FDB\u5EA6-${stamp}`;
      const pdf = await invoke("export_pdf", { html, dir, filename });
      void logDbg("\u5BFC\u51FA\u6210\u529F: " + pdf);
      try {
        await invoke("open_file", { path: pdf });
      } catch (e2) {
        void logDbg("\u81EA\u52A8\u6253\u5F00\u5931\u8D25: " + String(e2).slice(0, 200));
      }
      setBotState("burst", clock);
    } catch (e) {
      void logDbg("\u5BFC\u51FA\u5931\u8D25: " + String(e).slice(0, 300));
      showSyncReport(["\u5BFC\u51FA\u5931\u8D25", String(e).slice(0, 200), "\u539F\u59CB\u62A5\u9519\u5DF2\u5199\u8FDB\u8C03\u8BD5\u65E5\u5FD7"], true);
    } finally {
      setTimeout(() => btn?.classList.remove("spinning"), 400);
    }
  }
})();
