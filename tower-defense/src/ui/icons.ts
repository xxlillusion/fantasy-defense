// Hand-made pixel-art icons (palette-indexed string grids -> crisp SVG) plus a few vector glyphs.
import type { AbilityId, EnemyKind, ModifierId, TowerKind } from '../core/types';

type Palette = Record<string, string>;

/** Render a pixel grid as an SVG string. '.' = transparent. Each row may be any width. */
function pixelSvg(rows: readonly string[], pal: Palette, cls = 'px-icon'): string {
  const w = Math.max(...rows.map((r) => r.length));
  const hgt = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    // merge horizontal runs of the same colour into one rect
    let x = 0;
    while (x < row.length) {
      const c = row[x]!;
      let run = 1;
      while (x + run < row.length && row[x + run] === c) run++;
      const fill = pal[c];
      if (c !== '.' && fill) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  });
  return `<svg class="${cls}" viewBox="0 0 ${w} ${hgt}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

const TOWER_GRIDS: Record<TowerKind, { rows: string[]; pal: Palette }> = {
  arrow: {
    rows: [
      '...MM.......',
      '...WmMM.....',
      '...W..mM....',
      '...W...mM...',
      '...W....M.Y.',
      'FF.W....MYY.',
      'FFPPPPPPPPYY',
      'FF.W....MYY.',
      '...W....M.Y.',
      '...W...mM...',
      '...W..mM....',
      '...WmMM.....',
      '...MM.......',
    ],
    pal: { M: '#e0409a', m: '#8a1f63', W: '#f3e9ff', Y: '#ffd35a', P: '#ff9ed1', F: '#b36bff' },
  },
  cannon: {
    rows: [
      '............',
      '.kRRRRYYRRRk',
      '.RrRRRYYRRRR',
      '.RRRRRYYRRRR',
      '.RRRRRYYRRRR',
      '.kddddYYdddk',
      '......HH....',
      '......HH....',
      '......Hh....',
      '......Hh....',
      '......gg....',
      '......gg....',
      '......YY....',
    ],
    pal: { R: '#e2413b', r: '#ff9a7a', d: '#8e1f28', k: '#5a1220', Y: '#ffcf3f', H: '#a8733f', h: '#6e4523', g: '#4a3a64' },
  },
  frost: {
    rows: [
      'c....C....c',
      '.C...C...C.',
      '..C..C..C..',
      '...C.W.C...',
      '....CWC....',
      'CCWWWBWWWCC',
      '....CWC....',
      '...C.W.C...',
      '..C..C..C..',
      '.C...C...C.',
      'c....C....c',
    ],
    pal: { C: '#7fd6ff', c: '#3a8fd1', W: '#e9fbff', B: '#ffffff' },
  },
  sniper: {
    rows: [
      '...........W',
      '..........WS',
      '.........WS.',
      '........WS..',
      '.......WS...',
      '......WS....',
      '.....WS.....',
      '..Y.WS......',
      '...YY.......',
      '...PYY......',
      '..PP........',
      '.PP.........',
      'Pp..........',
    ],
    pal: { W: '#f4f0ff', S: '#8f86b8', Y: '#ffcf3f', P: '#7b3fb8', p: '#3d1f66' },
  },
  tesla: {
    rows: [
      '.....c......',
      '....cc...c..',
      '...cCc..cc..',
      '..cCCCccCc..',
      '..cCWWCCCc..',
      '.cCWWWWWCCc.',
      '.cCWKWWKWCc.',
      '.cCWWWWWWCc.',
      '.cCCWWWWCCc.',
      '..cCCCCCCc..',
      '...cccccc...',
    ],
    pal: { c: '#1f9fb8', C: '#5ff0ff', W: '#e8feff', K: '#12324a' },
  },
};

export const towerIcon = (k: TowerKind): string => pixelSvg(TOWER_GRIDS[k].rows, TOWER_GRIDS[k].pal, `px-icon tower-icon tower-icon-${k}`);

export const coinIcon = pixelSvg(
  ['..KKKK..', '.KYYYYK.', 'KYWYYYyK', 'KYWYYYyK', 'KYYYYYyK', 'KYYYYyyK', '.KyyyyK.', '..KKKK..'],
  { K: '#6b4212', Y: '#ffd044', y: '#d9941c', W: '#fff6c4' },
  'px-icon coin-icon',
);

/** Lives = the portal's light: a glowing spirit crystal. */
export const portalIcon = pixelSvg(
  ['...KK...', '..KCCK..', '.KCWCCK.', 'KCWCCCcK', 'KCCCCccK', '.KCCccK.', '..KccK..', '...KK...'],
  { K: '#0c3c52', C: '#62f2ff', c: '#27a9c9', W: '#ffffff' },
  'px-icon portal-icon',
);

export const waveIcon = pixelSvg(
  ['R......R', '.R....R.', '..R..R..', '...RR...', '...RR...', '..HR.H..', '.H....H.', 'H......H'],
  { R: '#e8e3f0', H: '#b08950' },
  'px-icon wave-icon',
);

// ---- enemies: shared outline/eye/gold colours, per-kind body palette
const ENEMY_BASE: Palette = { K: '#1a1420', W: '#ffef9a', Y: '#ffd35a' };
const ENEMY_GRIDS: Record<EnemyKind, { rows: string[]; pal: Palette }> = {
  grunt: { rows: ['.K....K.', '.KGGGGK.', 'KGGGGGGK', 'KGWGGWGK', 'KGGGGGGK', '.KGKKGK.', '..KGGK..'], pal: { G: '#7bc04a' } },
  runner: { rows: ['K.....K.', 'KG...GK.', 'KGGGGGGK', 'KGWGGWGK', '.KGGGGGK', '..KGGGGK', '...KKKK.'], pal: { G: '#c9874a' } },
  brute: { rows: ['.KKKKKK.', 'KGGGGGGK', 'KGKGGKGK', 'KGGGGGGK', 'KGWGGWGK', 'KGGKKGGK', '.KKKKKK.'], pal: { G: '#8a9aa8' } },
  swarmling: { rows: ['K......K', 'KK....KK', '.KGGGGK.', '.GWGGWG.', '.KGGGGK.', '..KGGK..'], pal: { G: '#e0506a' } },
  flyer: { rows: ['K......K', 'GK....KG', 'GGKGGKGG', '.GGWWGG.', '..GGGG..', '...GG...'], pal: { G: '#b066e0' } },
  boss: { rows: ['.Y.YY.Y.', '.YYYYYY.', 'KGGGGGGK', 'KGWGGWGK', 'KGGGGGGK', 'KGKKKKGK', '.KKKKKK.'], pal: { G: '#f0b030' } },
  shaman: {
    rows: ['.R.Y.R...', '..RYR...C', '.KGGGGK.H', 'KGGGGGGKH', 'KGWGGWGKH', 'KGGGGGGKH', '.KPPPPK.H', '.KPPPPK.H', '..KKKK...'],
    pal: { G: '#6fc05a', P: '#7b4fb8', R: '#e0506a', C: '#9ff7ff', H: '#8a5a2c' },
  },
  shieldbearer: {
    rows: ['...KKKK..', '..KGGGGK.', '.KGWGGWGK', '.KGTGGTGK', 'SSSSKGGGK', 'SMMSKGGGK', 'SMMSKGGGK', 'SSSSKKKK.'],
    pal: { G: '#6b8f4a', T: '#f4f0e0', S: '#a8b0c0', M: '#d04040' },
  },
  broodmother: {
    rows: ['K.K....K.K', '.K.KKKK.K.', '..KPPPPK..', '.KPWPPWPK.', 'KPPPPPPPPK', 'KPpPPPPpPK', '.KPPpPPPK.', 'K.K.KK.K.K'],
    pal: { P: '#b0588f', p: '#ffc8e6' },
  },
  wraith: {
    rows: ['..KKKK..', '.KCCCCK.', 'KCKKKKCK', 'KCKWKWCK', 'KCKKKKCK', '.KCCCCK.', 'KCCCCCCK', 'KC.CC.CK', '.K..K..K'],
    pal: { C: '#b8c8ff', W: '#7ff6ff' },
  },
  dragon: {
    rows: ['Y..........Y', 'RK........KR', 'RRK.YKKY.KRR', 'RRRKRRRRKRRR', '.RRRWRRWRRR.', '..RRRRRRRR..', '...RROORR...', '....RRRR....', '.....RR.....'],
    pal: { R: '#e0503a', O: '#ffb040' },
  },
};

export function enemyIcon(kind: EnemyKind): string {
  const g = ENEMY_GRIDS[kind];
  return pixelSvg(g.rows, { ...ENEMY_BASE, ...g.pal }, `px-icon enemy-icon enemy-icon-${kind}`);
}

// ---- abilities
const ABILITY_GRIDS: Record<AbilityId, { rows: string[]; pal: Palette }> = {
  meteor: {
    rows: ['r...........', '.rO.........', '..rOO.......', '...rOOY.....', '....rOYYK...', '.....KBBBK..', '....KBbBBBK.', '....KBBBbBK.', '....KBbBBBK.', '.....KBBBK..', '......KKK...'],
    pal: { r: '#c2334a', O: '#ff8a3a', Y: '#ffd35a', K: '#2a1410', B: '#8a4a2a', b: '#ffb040' },
  },
  frostNova: {
    rows: ['.....W.....', '..c..C..c..', '...C.C.C...', 'c...CWC...c', '...CWBWC...', 'WCCWBBBWCCW', '...CWBWC...', 'c...CWC...c', '...C.C.C...', '..c..C..c..', '.....W.....'],
    pal: { C: '#7fd6ff', c: '#3a8fd1', W: '#e9fbff', B: '#ffffff' },
  },
  goldRush: {
    rows: ['.....W......', '....WYW..W..', '.....W......', '..KKKKK.....', '.KYYYYYK....', '.KyyyyyK.W..', '.KYYYYYKKK..', '.KyyyyyKYYK.', '.KYYYYYKyyK.', '.KyyyyyKYYK.', '..KKKKK.KK..'],
    pal: { K: '#6b4212', Y: '#ffd044', y: '#d9941c', W: '#fff6c4' },
  },
  bladeStorm: {
    rows: ['...aaaa.....', '.aa....a....', 'a.....S.a...', 'a....SW..a..', '.a..SW....a.', '...SW.....a.', '.GSW......a.', '.HGG.....a..', 'H..G...aa...', '.......a....', '.aaaaaa.....'],
    pal: { a: '#9ff7ff', S: '#c8d0dc', W: '#ffffff', G: '#ffd35a', H: '#8a5a2c' },
  },
};

export const abilityIcon = (id: AbilityId): string => pixelSvg(ABILITY_GRIDS[id].rows, ABILITY_GRIDS[id].pal, `px-icon ability-icon ability-icon-${id}`);

// ---- modifiers
const MODIFIER_GRIDS: Record<ModifierId, { rows: string[]; pal: Palette }> = {
  swift: { rows: ['....YYK.', '...YYK..', '..YYK...', '.YYYYYK.', '...YYK..', '..YYK...', '.YK.....', 'YK......'], pal: { Y: '#ffe066', K: '#b07a10' } },
  ironclad: { rows: ['KKKKKKKK', 'KSSSWSSK', 'KSSSWSSK', 'KSSSWSSK', '.KSSWSK.', '.KSSSSK.', '..KSSK..', '...KK...'], pal: { K: '#39424e', S: '#a8b4c4', W: '#e8eef4' } },
  glass: { rows: ['...KK...', '..KCCK..', '.KCWKCK.', 'KCWCKCcK', 'KCCKCccK', '.KCKccK.', '..KccK..', '...KK...'], pal: { K: '#0c3c52', C: '#62f2ff', c: '#27a9c9', W: '#ffffff' } },
  austerity: { rows: ['..KKKK..', '.KyyyyK.', 'KyyyyyyK', 'KyRRRRyK', 'KyyyyyyK', 'KyyyyyyK', '.KyyyyK.', '..KKKK..'], pal: { K: '#4a3212', y: '#9c7a3c', R: '#ff6b6b' } },
  nosell: { rows: ['R.KKKK.R', '.RYYYYR.', 'KYRYYRyK', 'KYYRRYyK', 'KYYRRyyK', 'KYRyyRyK', '.RyyyyR.', 'R.KKKK.R'], pal: { K: '#6b4212', Y: '#ffd044', y: '#d9941c', R: '#ff4d4d' } },
  horde: { rows: ['..KK....', '.KGGK.KK', '.KWWKKGGK', 'KK..KKWWK', 'KGGK..KK.', 'KWWK.KK..', '.KK.KGGK.', '....KWWK.'], pal: { K: '#1a1420', G: '#7bc04a', W: '#ffef9a' } },
};

export const modifierIcon = (id: ModifierId): string => pixelSvg(MODIFIER_GRIDS[id].rows, MODIFIER_GRIDS[id].pal, `px-icon modifier-icon modifier-icon-${id}`);

// ---- hero: Aldric the Greatsword
export const heroFace = pixelSvg(
  [
    '...HHHHHH...',
    '..HHhhHHHH..',
    '.HHhHHHHHHH.',
    '.HBBBBBBBBH.',
    '.HSSSSSSSSH.',
    '.HSKSSSSKSH.',
    '.HSKSSSSKSH.',
    '..SSSSSSSS..',
    '..sSSMMSSs..',
    '...sSSSSs...',
    '.aAAGAAGAAa.',
    'aAAAAGGAAAAa',
  ],
  { H: '#6b3f22', h: '#a86a3a', B: '#3a6fd8', S: '#f2c29a', s: '#d69a72', K: '#1a1420', M: '#a0503a', A: '#a8b4c4', a: '#5a6878', G: '#ffd35a' },
  'px-icon hero-face',
);

/** Speech/help mark for the controls button. */
export const helpGlyph = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5.5a3 3 0 1 1 4.2 2.75c-.75.33-1.2.9-1.2 1.75v.5H6.8V10c0-1.4.8-2.3 1.9-2.8A1.3 1.3 0 1 0 6.9 5.5z"/><rect x="6.8" y="11.6" width="2.2" height="2.2" rx="0.4"/></svg>';

// ---- vector glyphs (buttons) ----
export const pauseGlyph = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="0.5"/><rect x="9.5" y="2" width="3.5" height="12" rx="0.5"/></svg>';
export const playGlyph = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z"/></svg>';
export const gearGlyph =
  '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2l.4 2 1.3.6 1.7-1.2 1.4 1.4-1.2 1.7.6 1.3 2 .4v2l-2 .4-.6 1.3 1.2 1.7-1.4 1.4-1.7-1.2-1.3.6L9 15H7l-.4-2-1.3-.6-1.7 1.2-1.4-1.4 1.2-1.7L2.8 9.4 1 9V7l2-.4.6-1.3-1.2-1.7 1.4-1.4 1.7 1.2L6.6 3z M8 5.5A2.5 2.5 0 1 0 8 10.5A2.5 2.5 0 1 0 8 5.5z" fill-rule="evenodd"/></svg>';
/** Level stars: L1-L3 gold, L4 is a gem. */
export function levelStars(level: number): string {
  let out = '';
  for (let i = 1; i <= 4; i++) out += starSvg(`star${i === 4 ? ' gem' : ''}${i <= level ? ' is-on' : ''}`);
  return out;
}
export const starSvg = (cls = 'star'): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path class="star-bg" d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/><path class="star-fill" d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>`;
