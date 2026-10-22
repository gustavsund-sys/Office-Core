import { WEAPONS, type WeaponId } from '../config/weapons';
export type DeathSource = WeaponId | 'beacon' | 'trap' | 'car';
export interface CombatDeath { victimName: string; killerName?: string; source?: DeathSource; self?: boolean; }
export function deathDescriptionParts(event: CombatDeath): [string, string, string] {
  const name = event.source === 'beacon' ? 'Defensive Beacon' : event.source === 'trap' ? 'Pulse Trap' : event.source === 'car' ? 'RC Bomber' : event.source ? WEAPONS[event.source].name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : undefined;
  if (!name) return [`${event.victimName} died`, "", ""];
  if (event.self) return [`${event.victimName} was killed by their own `, name, ""];
  if (event.source === 'beacon' || event.source === 'trap' || event.source === 'car' || !event.killerName)
    return [`${event.victimName} was killed by ${event.source === 'car' ? 'an' : 'a'} `, name, event.killerName ? ` (${event.killerName})` : ""];
  return [`${event.killerName} killed ${event.victimName} with a `, name, ""];
}

export function deathDescription(event: CombatDeath) {
  return deathDescriptionParts(event).join("");
}
