// Hand-built SVG stickers: each kid doing each chore.
// All scenes share a 120x120 canvas with the kid's head at (60, 50).

const INK = '#2b2233';
let uid = 0;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(hex, target, amt) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const lighten = (hex, amt) => mix(hex, '#ffffff', amt);
export const darken = (hex, amt) => mix(hex, '#000000', amt);
export const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;

// ---------- the kid ----------

function hairBack(look) {
  const c = look.hairColor;
  switch (look.hair) {
    case 'long':
      return `<path d="M36 42 C29 62 29 90 35 106 C47 110 73 110 85 106 C91 90 91 62 84 42 Z" fill="${c}"/>`;
    case 'pigtails':
      return `<ellipse cx="29" cy="64" rx="8.5" ry="13" transform="rotate(18 29 64)" fill="${c}"/>
        <ellipse cx="91" cy="64" rx="8.5" ry="13" transform="rotate(-18 91 64)" fill="${c}"/>`;
    case 'ponytail':
      return `<path d="M76 30 C97 32 100 60 91 78 C89 62 86 50 76 42 Z" fill="${c}"/>`;
    case 'bun':
      return `<circle cx="60" cy="23" r="10.5" fill="${c}"/>`;
    case 'curly':
      return [[37, 40, 10], [44, 29, 11], [60, 23, 12], [76, 29, 11], [83, 40, 10], [86, 54, 8], [34, 54, 8]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
    default:
      return '';
  }
}

function hairFront(look) {
  const c = look.hairColor;
  const shine = `<path d="M47 30 Q53 27 58 27" fill="none" stroke="${lighten(c, 0.3)}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
  switch (look.hair) {
    case 'short':
      return `<path d="M35.5 52 C34 34 44 24.5 60 24.5 C77 24.5 87 35 84.5 52 C82 45 79 41 75 39 C70 42 62 41 57 37 C53 41 46 42 41 41 C38 44 36.5 48 35.5 52 Z" fill="${c}"/>
        <path d="M58 25.5 Q60 18 67 18.5 Q62 21 63 25.5 Z" fill="${c}"/>${shine}`;
    case 'curly':
      return [[45, 34, 7], [54, 31, 7.5], [64, 31, 7.5], [73, 34, 7]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
    case 'bun':
    case 'ponytail':
      return `<path d="M36 51 C35 32 46 25 60 25 C74 25 85 32 84 51 C80 39 71 34 60 34 C49 34 40 39 36 51 Z" fill="${c}"/>${shine}`;
    default: // long, pigtails
      return `<path d="M35 54 C33 33 45 24 60 24 C76 24 87 33 85 54 C84 46 80 40 76 37 C68 41 56 40 49 35 C45 41 39 46 35 54 Z" fill="${c}"/>${shine}`;
  }
}

function extras(look) {
  let s = '';
  if (look.hair === 'pigtails') {
    const tie = look.bow || '#ff6b8a';
    s += `<circle cx="34" cy="54" r="2.8" fill="${tie}"/><circle cx="86" cy="54" r="2.8" fill="${tie}"/>`;
  } else if (look.bow) {
    s += `<g transform="translate(77 30) rotate(18)">
      <path d="M0 0 L-8 -5.5 Q-10 0 -8 5.5 Z M0 0 L8 -5.5 Q10 0 8 5.5 Z" fill="${look.bow}"/>
      <circle r="2.6" fill="${darken(look.bow, 0.18)}"/></g>`;
  }
  if (look.glasses) {
    s += `<g fill="none" stroke="${INK}" stroke-width="1.7"><circle cx="51" cy="52" r="6.2"/><circle cx="69" cy="52" r="6.2"/><path d="M57.2 51.5 h5.6"/></g>`;
  }
  return s;
}

function face(look, mood) {
  const eyes = mood === 'closed'
    ? `<path d="M47 53 q4 -4.5 8 0 M65 53 q4 -4.5 8 0" fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/>`
    : `<ellipse cx="51" cy="52" rx="3.1" ry="3.8" fill="${INK}"/><ellipse cx="69" cy="52" rx="3.1" ry="3.8" fill="${INK}"/>
       <circle cx="52.2" cy="50.4" r="1.2" fill="#fff"/><circle cx="70.2" cy="50.4" r="1.2" fill="#fff"/>`;
  const mouth = mood === 'smile'
    ? `<path d="M55 61 Q60 66 65 61" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round"/>`
    : `<path d="M54.5 60.5 Q60 69 65.5 60.5 Z" fill="#b8324f"/>`;
  const cheeks = `<ellipse cx="45" cy="59.5" rx="4.3" ry="2.7" fill="#ff7f95" opacity=".45"/>
    <ellipse cx="75" cy="59.5" rx="4.3" ry="2.7" fill="#ff7f95" opacity=".45"/>`;
  const freckles = look.freckles
    ? `<g fill="${darken(look.skin, 0.28)}"><circle cx="44" cy="56" r=".8"/><circle cx="47" cy="57.5" r=".8"/><circle cx="43.5" cy="59" r=".8"/>
       <circle cx="76" cy="56" r=".8"/><circle cx="73" cy="57.5" r=".8"/><circle cx="76.5" cy="59" r=".8"/></g>`
    : '';
  return eyes + cheeks + freckles + mouth;
}

const EMBLEMS = {
  star: (c) => `<path d="M60 92 l2.4 4.9 5.4 .8 -3.9 3.8 .9 5.4 -4.8 -2.5 -4.8 2.5 .9 -5.4 -3.9 -3.8 5.4 -.8 Z" fill="${c}"/>`,
  heart: (c) => `<path d="M60 105 C52 99 52 93 56 92 C58 91.5 59.5 93 60 94.5 C60.5 93 62 91.5 64 92 C68 93 68 99 60 105 Z" fill="${c}"/>`,
  bolt: (c) => `<path d="M62 91 L54.5 100 H59.5 L57.5 107 L65.5 97.5 H60.5 Z" fill="${c}"/>`,
  flower: (c) => `<g fill="${c}">${[0, 72, 144, 216, 288].map((a) => `<circle cx="60" cy="95.2" r="3.2" transform="rotate(${a} 60 99)"/>`).join('')}</g><circle cx="60" cy="99" r="2.4" fill="#ffd23f"/>`,
};

function body(look) {
  const shirt = look.shirt;
  const emblem = EMBLEMS[look.emblem];
  return `<rect x="54" y="68" width="12" height="12" rx="4" fill="${darken(look.skin, 0.08)}"/>
    <path d="M37 122 V99 C37 85 47 77.5 60 77.5 C73 77.5 83 85 83 99 V122 Z" fill="${shirt}"/>
    <path d="M53 78.5 Q60 85 67 78.5" fill="none" stroke="${darken(shirt, 0.18)}" stroke-width="2.2" stroke-linecap="round"/>
    ${emblem ? emblem(lighten(shirt, 0.75)) : ''}`;
}

const SHOULDERS = [[45.5, 88], [74.5, 88]];

function arms(look, hands) {
  const sleeve = darken(look.shirt, 0.1);
  return hands.map(([hx, hy], i) => {
    const [sx, sy] = SHOULDERS[i];
    return `<path d="M${sx} ${sy} L${hx} ${hy}" stroke="${sleeve}" stroke-width="9" stroke-linecap="round"/>`;
  }).join('');
}

function handDots(look, hands) {
  return hands.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.2" fill="${look.skin}" stroke="${darken(look.skin, 0.14)}" stroke-width="1"/>`).join('');
}

function figure(look, s) {
  const hands = s.hands;
  return `<g transform="translate(${s.dx || 0} 0)">
    ${s.behind || ''}
    ${hairBack(look)}
    ${body(look)}
    ${arms(look, hands)}
    <circle cx="36.5" cy="53" r="5" fill="${darken(look.skin, 0.04)}"/><circle cx="83.5" cy="53" r="5" fill="${darken(look.skin, 0.04)}"/>
    <circle cx="60" cy="50" r="24" fill="${look.skin}"/>
    ${face(look, s.mood || 'smile')}
    ${hairFront(look)}
    ${extras(look)}
    ${s.between || ''}
    ${handDots(look, hands)}
    </g>${s.front || ''}`;
}

// ---------- props, one scene per chore ----------

const bubble = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".85" stroke="#9fd3f5" stroke-width="1.2"/>
  <circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.25}" fill="#fff"/>`;

const drop = (x, y, s = 1) => `<path d="M${x} ${y} q${2.6 * s} ${4 * s} 0 ${6 * s} q${-2.6 * s} ${-2 * s} 0 ${-6 * s} Z" fill="#4fa8e8"/>`;

const SCENES = {
  wave: () => ({
    hands: [[40, 111], [96, 63]],
    mood: 'open',
    between: `<path d="M103 50 q5 5 0 10 M108 46 q7 9 0 18" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".35"/>`,
  }),

  dishes: () => ({
    hands: [[47, 96], [73, 89]],
    between: `<ellipse cx="57" cy="96" rx="16" ry="14" fill="#fff" stroke="#c9d5e2" stroke-width="2"/>
      <ellipse cx="57" cy="96" rx="9" ry="7.5" fill="none" stroke="#e1e8f0" stroke-width="2"/>
      <rect x="66" y="79" width="15" height="11" rx="3" fill="#ffd23f" transform="rotate(-12 73 85)"/>
      <rect x="66" y="79" width="15" height="4" rx="2" fill="#4fb36a" transform="rotate(-12 73 85)"/>
      ${bubble(29, 82, 5)}${bubble(90, 72, 4)}${bubble(97, 86, 6)}${bubble(22, 95, 3.5)}${bubble(84, 60, 3)}`,
    front: `<rect x="0" y="105" width="120" height="16" fill="#a9bccf"/><rect x="0" y="103" width="120" height="5" fill="#c9d7e5"/>
      <path d="M17 103 V86 q0 -6 6 -6 h7" fill="none" stroke="#8d9cad" stroke-width="4" stroke-linecap="round"/>${drop(29, 86, 0.9)}`,
  }),

  trash: () => ({
    hands: [[41, 112], [90, 80]],
    dx: -10,
    between: `<path d="M84 88 C76 92 75 106 80 110 L104 110 C109 106 108 92 100 88 Z" fill="#46566b"/>
      <path d="M86 88 L92 80 L98 88 Z" fill="#46566b"/><path d="M85 87.5 h14" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/>
      <path d="M85 99 q7 4 14 0" fill="none" stroke="#5d6f86" stroke-width="2" stroke-linecap="round"/>`,
    front: `<path d="M106 76 q-3 -4 0 -8 q3 -4 0 -8 M112 82 q-3 -4 0 -8 q3 -4 0 -8" fill="none" stroke="#7bbf5a" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
  }),

  sweep: () => ({
    hands: [[57, 83], [71, 69]],
    between: `<g transform="translate(34 104) rotate(45)">
        <rect x="-2" y="-84" width="4" height="84" rx="2" fill="#b07a45"/>
        <path d="M-9 0 H9 L14 17 H-14 Z" fill="#e7b84b"/><path d="M-9 0 H9 V4 H-9 Z" fill="#c9932f"/>
        <path d="M-6 6 L-8 16 M0 6 V16 M6 6 L8 16" stroke="#c9932f" stroke-width="1.4"/></g>
      <circle cx="16" cy="112" r="4" fill="#c8c1b6" opacity=".8"/><circle cx="10" cy="104" r="2.6" fill="#c8c1b6" opacity=".7"/><circle cx="22" cy="118" r="3" fill="#c8c1b6" opacity=".7"/>`,
  }),

  laundry: () => ({
    hands: [[33, 99], [87, 99]],
    between: `<path d="M44 92 q4 -12 12 -6 l-2 10 Z" fill="#ff6b6b"/><rect x="56" y="83" width="16" height="14" rx="3" fill="#5aa9e6" transform="rotate(10 64 90)"/>
      <path d="M72 94 q6 -14 12 -4 l-4 6 Z" fill="#ffd23f"/>
      <path d="M31 94 H89 L83 122 H37 Z" fill="#d9a066"/><path d="M31 94 H89 V99 H31 Z" fill="#c48a52"/>
      <path d="M41 104 H79 M42 111 H78 M43 118 H77" stroke="#c48a52" stroke-width="2"/>`,
  }),

  table: () => ({
    hands: [[45, 96], [75, 96]],
    between: `<ellipse cx="60" cy="97" rx="19" ry="6.5" fill="#fff" stroke="#c9d5e2" stroke-width="2"/><ellipse cx="60" cy="96.5" rx="11" ry="3.5" fill="#eef3f8"/>`,
    front: `<rect x="0" y="106" width="120" height="16" fill="#b5835a"/><rect x="0" y="104" width="120" height="5" fill="#cf9d72"/>
      <path d="M20 103 V86 M17 86 V92 Q20 95 23 92 V86" fill="none" stroke="#9aa7b5" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="92" y="88" width="12" height="15" rx="2" fill="#7cc6f0"/><rect x="92" y="88" width="12" height="4" rx="2" fill="#fff" opacity=".6"/>`,
  }),

  toys: () => ({
    hands: [[33, 101], [87, 101]],
    between: `<rect x="38" y="82" width="14" height="14" rx="2.5" fill="#ffd23f" transform="rotate(-10 45 89)"/>
      <text x="45" y="94" font-size="10" font-weight="700" text-anchor="middle" fill="#c4512e" font-family="system-ui, sans-serif" transform="rotate(-10 45 89)">A</text>
      <circle cx="66" cy="89" r="8" fill="#4fb3e8"/><path d="M58.5 87 Q66 92 73.5 87" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="80" cy="88" r="4" fill="#b07a45"/><circle cx="86" cy="86" r="4" fill="#b07a45"/>
      <rect x="31" y="95" width="58" height="27" rx="3" fill="#ef6f6c"/><rect x="31" y="95" width="58" height="6" rx="2" fill="#d65552"/>
      ${EMBLEMS.star('#ffd23f').replace('M60 92', 'M60 104')}`,
  }),

  plants: () => ({
    hands: [[42, 111], [80, 80]],
    dx: -8,
    between: `<path d="M76 82 h18 v14 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 Z" fill="#5fb8a4"/>
      <path d="M75 82 q-6 -10 6 -10" fill="none" stroke="#4a9886" stroke-width="3"/>
      <path d="M93 86 L106 77" stroke="#5fb8a4" stroke-width="4" stroke-linecap="round"/>`,
    front: `${drop(104, 82)}${drop(108, 88, 0.85)}${drop(101, 90, 0.75)}
      <path d="M102 100 q-12 -6 -10 -14 q8 2 10 14 q2 -12 10 -14 q2 8 -10 14 Z" fill="#4fb36a"/>
      <path d="M93 100 H111 L108.5 113 H95.5 Z" fill="#d9774a"/><rect x="91" y="98" width="22" height="5" rx="2" fill="#c4613a"/>`,
  }),

  pet: () => ({
    hands: [[62, 102], [80, 99]],
    dx: -12,
    between: `<path d="M58 99 H86 Q85 108 72 108 Q59 108 58 99 Z" fill="#ef6f6c"/><ellipse cx="72" cy="99" rx="14" ry="3" fill="#b5562f"/>
      <circle cx="68" cy="97.5" r="1.6" fill="#8a4a2a"/><circle cx="73" cy="97" r="1.6" fill="#8a4a2a"/><circle cx="77" cy="98" r="1.6" fill="#8a4a2a"/>`,
    front: `<g transform="translate(-4 -12)">
      <ellipse cx="102" cy="114" rx="12" ry="9" fill="#c98b52"/>
      <path d="M113 112 q7 -4 5 -12" fill="none" stroke="#c98b52" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="102" cy="96" r="11" fill="#d9a066"/>
      <ellipse cx="92" cy="96" rx="4.5" ry="8" fill="#9b6537" transform="rotate(15 92 96)"/>
      <ellipse cx="112" cy="96" rx="4.5" ry="8" fill="#9b6537" transform="rotate(-15 112 96)"/>
      <ellipse cx="102" cy="101" rx="5.5" ry="4" fill="#f1d3b0"/><ellipse cx="102" cy="99" rx="2.2" ry="1.6" fill="${INK}"/>
      <circle cx="98" cy="94" r="1.6" fill="${INK}"/><circle cx="106" cy="94" r="1.6" fill="${INK}"/>
      <path d="M102 103 q0 4 -2 5" fill="none" stroke="#ef6f8a" stroke-width="2" stroke-linecap="round"/></g>`,
  }),

  vacuum: () => ({
    hands: [[42, 111], [82, 72]],
    dx: -10,
    between: `<path d="M74 72 L90 104" stroke="#8d9cad" stroke-width="4" stroke-linecap="round"/>
      <rect x="77" y="80" width="15" height="20" rx="5" fill="#7c5cd6" transform="rotate(-26 84 90)"/>
      <rect x="80" y="102" width="26" height="9" rx="4" fill="#5a4a9e"/><circle cx="84" cy="111" r="3" fill="${INK}"/><circle cx="102" cy="111" r="3" fill="${INK}"/>`,
  }),

  bed: () => ({
    hands: [[33, 100], [87, 100]],
    mood: 'closed',
    between: `<rect x="30" y="86" width="60" height="30" rx="12" fill="#fff" stroke="#c9d5e2" stroke-width="2"/>
      <path d="M38 94 q22 6 44 0" fill="none" stroke="#e3eaf2" stroke-width="2"/>
      <text x="96" y="40" font-size="11" font-weight="700" fill="#8aa0c8" font-family="system-ui, sans-serif">z</text>
      <text x="103" y="30" font-size="8" font-weight="700" fill="#8aa0c8" font-family="system-ui, sans-serif">z</text>`,
  }),

  shower: () => ({
    hands: [[42, 33], [78, 33]],
    mood: 'closed',
    behind: `<path d="M122 12 H99 V17" fill="none" stroke="#9aa7b5" stroke-width="4" stroke-linecap="round"/>
      <path d="M91 17 H107 L104 23 H94 Z" fill="#9aa7b5"/>
      ${[[93, 30], [100, 33], [106, 28], [90, 42], [101, 46], [109, 40], [94, 56], [106, 60], [112, 52]].map(([x, y]) => drop(x, y, 0.9)).join('')}`,
    between: `${bubble(50, 26, 6)}${bubble(60, 21, 7)}${bubble(71, 26, 6)}${bubble(40, 40, 4)}${bubble(80, 40, 4)}${bubble(26, 70, 3)}`,
  }),
};

const twinkle = (x, y, r, c = '#ffd23f') => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="${c}"/>`;

Object.assign(SCENES, {
  backpack: () => ({
    hands: [[35, 100], [85, 100]],
    between: `<rect x="42" y="80" width="13" height="17" rx="1.5" fill="#4f7fe0" transform="rotate(-10 48 88)"/>
      <rect x="57" y="77" width="14" height="19" rx="1.5" fill="#4fb36a" transform="rotate(5 64 86)"/>
      <rect x="70" y="82" width="11" height="13" fill="#fff" stroke="#d5dde6" transform="rotate(14 75 88)"/>
      <path d="M72.5 86 h6 M72 89 h6" stroke="#c7d0db" stroke-width="1" transform="rotate(14 75 88)"/>
      <rect x="33" y="92" width="54" height="30" rx="11" fill="#f28c28"/>
      <path d="M33 101 Q60 108 87 101" fill="none" stroke="#d9741a" stroke-width="2.5"/>
      <rect x="46" y="106" width="28" height="12" rx="4" fill="#d9741a"/><rect x="57" y="104" width="6" height="5" rx="1.5" fill="#ffd23f"/>`,
  }),

  homework: () => ({
    hands: [[44, 101], [75, 97]],
    between: `<rect x="0" y="105" width="120" height="16" fill="#b5835a"/><rect x="0" y="103" width="120" height="4" fill="#cf9d72"/>
      <path d="M30 104 L34 94 H59 V103 Z" fill="#fff" stroke="#d5dde6"/><path d="M90 104 L86 94 H61 V103 Z" fill="#fff" stroke="#d5dde6"/>
      <path d="M38 98 h16 M37 101 h17 M66 98 h16 M66 101 h17" stroke="#b9c8e8" stroke-width="1"/>
      ${twinkle(98, 74, 5)}${twinkle(22, 82, 4, '#8ec5ff')}`,
    front: `<g transform="rotate(-38 76 96)"><rect x="73" y="78" width="6" height="22" rx="1" fill="#ffd23f"/>
      <rect x="73" y="76" width="6" height="4" rx="1" fill="#ff8fa3"/><path d="M73 100 L76 106 L79 100 Z" fill="#f1c7a2"/>
      <path d="M75 104 L76 106 L77 104 Z" fill="#2b2233"/></g>`,
  }),

  snacks: () => ({
    hands: [[33, 101], [87, 101]],
    between: `<circle cx="46" cy="89" r="7.5" fill="#ef4f4f"/><path d="M46 82 q1 -4 4 -5" stroke="#7a4a24" stroke-width="1.6" fill="none"/>
      <ellipse cx="51" cy="80" rx="3.5" ry="2" fill="#4fb36a" transform="rotate(-25 51 80)"/>
      <path d="M56 95 L64 80 L72 95 Z" fill="#f7d99a"/><path d="M58 93 L64 82 L70 93" fill="none" stroke="#7cc06a" stroke-width="2"/>
      <path d="M74 95 L80 78 L84 82 Z" fill="#ff8a3d"/><path d="M80 78 l-1 -5 M81 78 l3 -4 M80 78 l4 -1" stroke="#4fb36a" stroke-width="1.8" stroke-linecap="round"/>
      <rect x="31" y="94" width="58" height="27" rx="7" fill="#5aa9e6"/><rect x="31" y="94" width="58" height="7" rx="3" fill="#3f8fd1"/>
      <rect x="55" y="99" width="10" height="6" rx="2" fill="#ffd23f"/>`,
  }),

  cleartable: () => ({
    hands: [[40, 100], [80, 100]],
    between: `<path d="M74 74 L80 92" stroke="#9aa7b5" stroke-width="2.4" stroke-linecap="round"/><path d="M72 72 v-4 M74 71.5 v-4 M76 71 v-4" stroke="#9aa7b5" stroke-width="1.4" stroke-linecap="round"/>
      ${[104, 99, 94].map((y) => `<ellipse cx="60" cy="${y}" rx="22" ry="5.5" fill="#fff" stroke="#c9d5e2" stroke-width="1.6"/>`).join('')}
      <ellipse cx="60" cy="93.5" rx="12" ry="2.6" fill="#eef3f8"/>
      <circle cx="55" cy="93" r="1.3" fill="#c48a52"/><circle cx="63" cy="94" r="1.1" fill="#c48a52"/><circle cx="59" cy="92" r="1" fill="#e06b4a"/>`,
  }),

  cleanup: () => ({
    hands: [[40, 101], [82, 86]],
    between: `<path d="M30 98 q10 -6 20 0 q-2 10 -10 12 q-10 -2 -10 -12 Z" fill="#ffd23f"/><path d="M33 100 q7 -3 14 0" stroke="#e6b800" stroke-width="1.4" fill="none"/>
      <rect x="77" y="86" width="14" height="22" rx="4" fill="#7cc6f0"/><rect x="77" y="92" width="14" height="7" fill="#fff" opacity=".6"/>
      <path d="M78 86 V80 H92 L95 83 H90 V86 Z" fill="#5a4a9e"/><path d="M84 86 v6" stroke="#5a4a9e" stroke-width="3"/>
      <circle cx="100" cy="80" r="1.4" fill="#9fd3f5"/><circle cx="104" cy="77" r="1.2" fill="#9fd3f5"/><circle cx="103" cy="84" r="1.2" fill="#9fd3f5"/><circle cx="108" cy="81" r="1" fill="#9fd3f5"/>
      ${twinkle(20, 72, 5)}${twinkle(102, 106, 5)}${twinkle(26, 112, 3.5, '#fff')}`,
  }),

  bottles: () => ({
    hands: [[42, 96], [79, 92]],
    between: `<rect x="34" y="80" width="15" height="26" rx="6" fill="#4fb3e8"/><rect x="36" y="74" width="11" height="8" rx="2.5" fill="#fff" stroke="#c9d5e2"/>
      <rect x="37" y="86" width="4" height="14" rx="2" fill="#fff" opacity=".45"/>
      <path d="M79 92 L50 80" stroke="#b07a45" stroke-width="3" stroke-linecap="round"/>
      <path d="M50 80 L42 76.5" stroke="#9aa7b5" stroke-width="7" stroke-linecap="round" stroke-dasharray="1.5 1.5"/>
      ${bubble(30, 66, 5)}${bubble(62, 60, 3.5)}${bubble(90, 70, 4.5)}${bubble(96, 86, 6)}${bubble(24, 86, 3.5)}`,
    front: `<rect x="0" y="105" width="120" height="16" fill="#a9bccf"/><rect x="0" y="103" width="120" height="5" fill="#c9d7e5"/>`,
  }),

  artroom: () => ({
    hands: [[47, 101], [73, 101]],
    behind: `<circle cx="20" cy="26" r="9" fill="#ff8fa3" opacity=".75"/><circle cx="28" cy="20" r="4" fill="#ff8fa3" opacity=".75"/>
      <circle cx="101" cy="22" r="8" fill="#ffd23f" opacity=".8"/><circle cx="104" cy="56" r="6" fill="#8ec5ff" opacity=".8"/><circle cx="16" cy="60" r="5" fill="#7cc06a" opacity=".75"/>`,
    between: `<path d="M53 92 L44 80" stroke="#b07a45" stroke-width="2.4"/><path d="M43.4 79 L40.6 75" stroke="#ef4f4f" stroke-width="4" stroke-linecap="round"/>
      <path d="M60 92 V81" stroke="#b07a45" stroke-width="2.4"/><path d="M60 81 V77" stroke="#4f7fe0" stroke-width="4" stroke-linecap="round"/>
      <path d="M67 92 L76 80" stroke="#b07a45" stroke-width="2.4"/><path d="M76.6 79 L79.4 75" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/>
      <rect x="47" y="88" width="26" height="28" rx="5" fill="#cfe9f7" fill-opacity=".9" stroke="#a9cfe4" stroke-width="1.5"/>
      <rect x="47" y="104" width="26" height="12" rx="4" fill="#8ec5ff" opacity=".7"/>`,
  }),

  basement: () => ({
    hands: [[33, 100], [87, 100]],
    behind: `<path d="M0 122 V100 H11 V88 H22 V76 H33 V64 H38 V122 Z" fill="#cdbba6"/>
      <path d="M0 100 H11 M11 88 H22 M22 76 H33" stroke="#b3a08a" stroke-width="2"/>
      <path d="M100 0 V14" stroke="#7d6a58" stroke-width="1.5"/><circle cx="100" cy="19" r="5.5" fill="#ffe27a"/>
      <path d="M95 19 h10" stroke="#e6c34a" stroke-width="1.5"/><circle cx="100" cy="19" r="10" fill="#ffe27a" opacity=".25"/>`,
    between: `<rect x="32" y="92" width="56" height="30" rx="2" fill="#d9a066"/><path d="M32 92 L40 86 H80 L88 92 Z" fill="#e7b882"/>
      <rect x="55" y="92" width="10" height="30" fill="#f2d3a6" opacity=".85"/><path d="M40 106 h10 M70 106 h10" stroke="#b9824a" stroke-width="2"/>`,
  }),
});

SCENES.default = SCENES.wave;

export const SCENE_NAMES = Object.keys(SCENES).filter((k) => k !== 'default');

// A rounded-square sticker: white rim, tinted backdrop, the kid acting out the scene.
export function sticker(sceneName, kid, { label = '', backdrop } = {}) {
  const id = `clip${++uid}`;
  const s = (SCENES[sceneName] || SCENES.default)();
  const bg = backdrop || lighten(kid.color, 0.8);
  return `<svg class="art" viewBox="0 0 120 120" role="img" aria-label="${label}">
    <defs><clipPath id="${id}"><rect x="5" y="5" width="110" height="110" rx="24"/></clipPath></defs>
    <rect x="1" y="1" width="118" height="118" rx="28" fill="#fff"/>
    <g clip-path="url(#${id})"><rect width="120" height="120" fill="${bg}"/>
    <circle cx="60" cy="58" r="40" fill="#fff" opacity=".4"/>${figure(kid.look, s)}</g></svg>`;
}

// ---------- award medals ----------

const MEDAL_GLYPHS = {
  early: `<circle cx="12" cy="13" r="3.6" fill="#fff"/><path d="M12 6.5v1.8M12 17.7v1.8M5.5 13h1.8M16.7 13h1.8M7.4 8.4l1.3 1.3M15.3 16.3l1.3 1.3M7.4 17.6l1.3-1.3M15.3 9.7l1.3-1.3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
  streak: `<path d="M12 6c.5 2.6 3.8 3.9 3.8 7.4A3.8 3.8 0 0 1 12 17.2a3.8 3.8 0 0 1-3.8-3.8c0-1.6.8-2.6 1.6-3.3 0 1.3.6 2 1.3 2.2-.4-2.6.9-4.6.9-6.3z" fill="#fff"/>`,
  steady: `<path d="M12 6.6l1.75 3.55 3.9.57-2.82 2.75.67 3.88L12 15.52l-3.5 1.83.67-3.88-2.82-2.75 3.9-.57z" fill="#fff"/>`,
  perfect: `<path d="M6.8 16.2l-.9-7 3.6 2.6L12 7.2l2.5 4.6 3.6-2.6-.9 7z" fill="#fff"/><rect x="6.8" y="16.6" width="10.4" height="1.6" rx=".6" fill="#fff"/>`,
  clean: `<circle cx="10.4" cy="14" r="3.4" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="15.3" cy="10.3" r="2.2" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="14.6" cy="16.4" r="1.4" fill="#fff"/>`,
  comeback: `<path d="M12 6.4l4.4 5h-2.7v5.6h-3.4v-5.6H7.6z" fill="#fff"/>`,
  team: `<path d="M12 17.6c-4.3-2.7-6-4.9-6-7.1A2.9 2.9 0 0 1 12 9.1a2.9 2.9 0 0 1 6 1.4c0 2.2-1.7 4.4-6 7.1z" fill="#fff"/>`,
};

export const MEDAL_COLORS = {
  early: '#f08c1a', streak: '#f0532d', steady: '#7c5cd6', perfect: '#e0a800', clean: '#2b9be0', comeback: '#1f9d61', team: '#e0457b',
};

export function medal(id) {
  const c = MEDAL_COLORS[id] || '#7c5cd6';
  return `<svg class="medal" viewBox="0 0 24 26" aria-hidden="true">
    <path d="M8 1h3.2l2 7H10z" fill="${darken(c, 0.15)}"/><path d="M16 1h-3.2l-2 7H14z" fill="${lighten(c, 0.25)}"/>
    <circle cx="12" cy="13" r="9.4" fill="${c}"/><circle cx="12" cy="13" r="9.4" fill="none" stroke="${lighten(c, 0.45)}" stroke-width="1.4"/>
    ${MEDAL_GLYPHS[id] || ''}</svg>`;
}

// ---------- small UI icons (currentColor) ----------

export const ICONS = {
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.86l-5.5 2.9 1.05-6.13L3.1 9.3l6.15-.9z" fill="currentColor"/></svg>`,
  shower: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 4h-5a3 3 0 0 0-3 3v1"/><path d="M7 11a5 5 0 0 1 10 0z" fill="currentColor"/><path d="M8 15l-1 2M12 15v2.5M16 15l1 2M10 20l-.5 1M14 20l.5 1"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  left: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  right: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v3M8 20h8M9.5 17h5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
};
