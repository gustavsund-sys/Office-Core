# Multiplayer responsiveness review

Movement is predicted using the same Player movement/collision code as the server. Inputs carry an increasing sequence number. The server consumes at most one queued movement command per tick, acknowledges processed commands, and remains authoritative for health, ammo and hits. The client restores acknowledged position/vertical velocity and replays pending inputs. Between network ticks, a fractional movement preview runs at display frame rate. Queues are bounded, stale input stops movement, and malformed sequence identifiers are rejected.

Remote characters interpolate a bounded snapshot history with an 85 ms presentation buffer; angles take the shortest arc. Spawn/teleport distances bypass interpolation. Disconnected characters are removed. Input transmission preserves the accumulator remainder instead of resetting it each frame. A ping echo tracks actual round-trip time in the network client.

Server simulation no longer renders the full scene per player. Player hitbox world matrices are updated directly. Bullet tracers, muzzle flashes, impact sparks, rocket trails and explosion particles are generated on clients; authoritative server events still determine where impacts/explosions occurred. The one initial scene render when a player joins remains to initialize static geometry. Core health bars, prop hit flashes, walking animation and rocket smoke are restored in online presentation. Destroyed props no longer trigger a second explosion in addition to the server event.

Validation: TypeScript checks for client and server; 38 gameplay/network tests, including headless authoritative hits without VFX allocation, sequence validation, angle interpolation and movement/jump replay; two-client lobby/movement/acknowledgement/reconnection smoke test.

Remaining differences and follow-up work:
- Hits are evaluated at current server positions; historical hitbox rewind (lag compensation) is not implemented.
- Local shots now predict audio, recoil, muzzle flash and hitscan tracers immediately at display frame rate. Server events identify the shooter and processed input sequence; own confirmed shot/trace events are not presented twice. Impacts, damage and ammunition remain authoritative. Bazooka launch feedback and a cosmetic missile now appear immediately; the missile model transfers to its authoritative snapshot object using shooter ownership. Cosmetic prediction may differ from a rejected or corrected server shot; historical hitbox rewind remains separate work.
- Core buster running screams now broadcast once per acquisition and use distance/panning. Snapshots carry all active Core alarms, plus bomb ownership for the personal countdown. Breach warnings still need their own multiplayer event.
- Online spatial audio does not yet use wall occlusion everywhere. Jump/landing/death/spawn one-shots are not all distance-attenuated.
- Snapshots still carry the full room state at 20 Hz rather than a delta protocol.
- Internet RTT and a 16-player CPU/load profile must be measured under real player load; no quantitative latency reduction is claimed by these changes.

Bazooka direct impact deals 120 damage. Nearby targets within four metres receive up to 90 damage with linear falloff, once per explosion. Solid walls and closed Core doors block splash; existing Core shield and Core-door immunity rules remain. Player damage events carry actual HP lost for temporary red numbers. Blast damage follows existing friendly-fire behavior, including the shooter if close enough.
