import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CoreMatch } from "./match";
test("team selection activates two distinct teams and last living participating core wins", () => {
  for (const team of ["RED", "BLUE", "GREEN", "YELLOW"] as const) {
    const match = new CoreMatch();
    match.start(team);
    const opponent = match.members[1].team;
    assert.notEqual(team, opponent);
    const cores = (["RED", "BLUE", "GREEN", "YELLOW"] as const).map(team => ({ team, hp: 1000 }));
    assert.equal(cores.filter(core => match.isActive(core.team)).length, 2);
    assert.equal(match.evaluate(cores), undefined);
    cores.find(core => core.team === opponent)!.hp = 0;
    assert.equal(match.evaluate(cores), team);
  }
});
test("local core destruction announces the test player's team", () => {
  const match = new CoreMatch();
  match.start("GREEN");
  assert.equal(match.evaluate([{ team: "GREEN", hp: 0 }, { team: "BLUE", hp: 1000 }]), "BLUE");
});
