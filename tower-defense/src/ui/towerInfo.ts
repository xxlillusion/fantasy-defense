// Human-readable tower stats derived from src/data/towers.ts.
import type { TowerKind, TowerLevel } from '../core/types';
import { TOWERS } from '../data';

export interface StatRow {
  label: string;
  value: string;
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 1));

export function targetsLabel(kind: TowerKind): string {
  const d = TOWERS[kind];
  return d.hitsAir && d.hitsGround ? 'Air + Ground' : d.hitsAir ? 'Air only' : 'Ground only';
}

export function statRows(kind: TowerKind, level: TowerLevel): StatRow[] {
  const s = TOWERS[kind].levels[level];
  const rows: StatRow[] = [
    { label: 'Damage', value: s.projectilesPerShot > 1 ? `${num(s.damage)} x${s.projectilesPerShot}` : num(s.damage) },
    { label: 'Rate', value: `${num(s.fireRate)}/s` },
    { label: 'Range', value: num(s.range) },
    { label: 'Hits', value: targetsLabel(kind) },
  ];
  if (s.splashRadius > 0) rows.push({ label: 'Splash', value: `${num(s.splashRadius)} r` });
  if (s.armorPierce) rows.push({ label: 'Armor', value: 'Pierce' });
  if (s.slow) rows.push({ label: 'Slow', value: `${pct(s.slow.amount)} ${num(s.slow.duration)}s` });
  if (s.chain) rows.push({ label: 'Chain', value: `${s.chain.targets} (-${pct(s.chain.falloff)})` });
  if (s.crit) rows.push({ label: 'Crit', value: `${pct(s.crit.chance)} x${num(s.crit.multiplier)}` });
  if (s.burn) rows.push({ label: 'Burn', value: `${num(s.burn.dps)}/s ${num(s.burn.duration)}s` });
  if (s.stun) rows.push({ label: 'Stun', value: `${pct(s.stun.chance)} ${num(s.stun.duration)}s` });
  if (s.aura) rows.push({ label: 'Aura', value: 'All in range' });
  return rows;
}
