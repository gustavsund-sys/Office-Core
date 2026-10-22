import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deathDescription } from '../ui/combatFeed';
test('kill feed describes weapons, deployed hazards and self eliminations', () => {
 assert.equal(deathDescription({killerName:'Gustav',victimName:'Berra',source:'huntingRifle'}),'Gustav killed Berra with a Hunting Rifle');
 assert.equal(deathDescription({killerName:'Gustav',victimName:'Berra',source:'beacon'}),'Berra was killed by a Defensive Beacon (Gustav)');
 assert.equal(deathDescription({killerName:'Berra',victimName:'Berra',source:'bazooka',self:true}),'Berra was killed by their own Bazooka');
 assert.equal(deathDescription({victimName:'Berra',source:'trap'}),'Berra was killed by a Pulse Trap');
 assert.equal(deathDescription({victimName:'Berra'}),'Berra died');
});
