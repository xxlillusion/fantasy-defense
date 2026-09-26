// Hand-made pixel-art icons (palette-indexed string grids -> crisp SVG) plus a few vector glyphs.
import type { EnemyKind, TowerKind } from '../core/types';

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

const ENEMY_COLORS: Record<EnemyKind, string> = {
  grunt: '#7bc04a',
  runner: '#c9874a',
  brute: '#8a9aa8',
  swarmling: '#e0506a',
  flyer: '#b066e0',
  boss: '#f0b030',
};

export function enemyIcon(kind: EnemyKind): string {
  const c = ENEMY_COLORS[kind];
  const grids: Record<EnemyKind, string[]> = {
    grunt: ['.K....K.', '.KGGGGK.', 'KGGGGGGK', 'KGWGGWGK', 'KGGGGGGK', '.KGKKGK.', '..KGGK..'],
    runner: ['K.....K.', 'KG...GK.', 'KGGGGGGK', 'KGWGGWGK', '.KGGGGGK', '..KGGGGK', '...KKKK.'],
    brute: ['.KKKKKK.', 'KGGGGGGK', 'KGKGGKGK', 'KGGGGGGK', 'KGWGGWGK', 'KGGKKGGK', '.KKKKKK.'],
    swarmling: ['K......K', 'KK....KK', '.KGGGGK.', '.GWGGWG.', '.KGGGGK.', '..KGGK..'],
    flyer: ['K......K', 'GK....KG', 'GGKGGKGG', '.GGWWGG.', '..GGGG..', '...GG...'],
    boss: ['.Y.YY.Y.', '.YYYYYY.', 'KGGGGGGK', 'KGWGGWGK', 'KGGGGGGK', 'KGKKKKGK', '.KKKKKK.'],
  };
  return pixelSvg(grids[kind], { K: '#1a1420', G: c, W: '#ffef9a', Y: '#ffd35a' }, 'px-icon enemy-icon');
}

// ---- vector glyphs (buttons) ----
export const pauseGlyph = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="0.5"/><rect x="9.5" y="2" width="3.5" height="12" rx="0.5"/></svg>';
export const playGlyph = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z"/></svg>';
export const gearGlyph =
  '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2l.4 2 1.3.6 1.7-1.2 1.4 1.4-1.2 1.7.6 1.3 2 .4v2l-2 .4-.6 1.3 1.2 1.7-1.4 1.4-1.7-1.2-1.3.6L9 15H7l-.4-2-1.3-.6-1.7 1.2-1.4-1.4 1.2-1.7L2.8 9.4 1 9V7l2-.4.6-1.3-1.2-1.7 1.4-1.4 1.7 1.2L6.6 3z M8 5.5A2.5 2.5 0 1 0 8 10.5A2.5 2.5 0 1 0 8 5.5z" fill-rule="evenodd"/></svg>';
export const starSvg = (cls = 'star'): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path class="star-bg" d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/><path class="star-fill" d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>`;
