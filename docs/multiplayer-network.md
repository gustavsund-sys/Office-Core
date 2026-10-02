# Multiplayer responsiveness review

Movement is predicted using the same Player movement/collision code as the server. Inputs carry an increasing sequence number. The server consumes at most one queued movement command per tick, acknowledges processed commands, and remains authoritative for health, ammo and hits. The client restores acknowledged position/vertical velocity and replays pending inputs. Between network ticks, a fractional movement preview runs at display frame rate. Queues are bounded, stale input stops movement, and malformed sequence identifiers are rejected.

Remote characters interpolate a bounded snapshot history with an 85 ms presentation buffer; angles take the shortest arc. Spawn/teleport distances bypass interpolation. Disconnected characters are removed. Input transmission preserves the accumulator remainder instead of resetting it each frame. A ping echo tracks actual round-trip time in the network client.

Server simulation no longer renders the full scene per player. Player hitbox world matrices are updated directly. Bullet tracers, muzzle flashes, impact sparks, rocket trails and explosion particles are generated on clients; authoritative server events still determine where impacts/explosions occurred. The one initial scene render when a player joins remains to initialize static geometry. Core health bars, prop hit flashes, walking animation and rocket smoke are restored in online presentation. Destroyed props no longer trigger a second explosion in addition to the server event.

Validation: TypeScript checks for client and server; 32 gameplay/network tests, including headless authoritative hits without VFX allocation, sequence validation, angle interpolation and movement/jump replay; two-client lobby/movement/acknowledgement/reconnection smoke test.

Remaining differences and follow-up work:
- Hits are evaluated at current server positions; historical hitbox rewind (lag compensation) is not implemented.
- Shot audio/traces wait for authoritative events. Local movement and aiming are predicted, but speculative shooting feedback is not yet implemented.
- Core buster running scream and breach warnings do not yet have matching multiplayer events.
- Online spatial audio does not yet use wall occlusion everywhere. Jump/landing/death/spawn one-shots are not all distance-attenuated.
- Snapshots still carry the full room state at 20 Hz rather than a delta protocol.
- Internet RTT and a 16-player CPU/load profile must be measured under real player load; no quantitative latency reduction is claimed by these changes.
