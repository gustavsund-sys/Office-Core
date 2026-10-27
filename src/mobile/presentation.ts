export { installMobilePlatform } from "./platform";
import { isLandscape, setPortraitHandler } from "./platform";
import { Camera, Vector3 } from "@babylonjs/core";
import type { GamePresentation } from "../client/presentation";
import { MobileInput } from "./input";
import { MobileControls } from "./controls";
import { mobileViewSize, MOBILE_CAMERA } from "./controlMath";
import "./mobile.css";
import "./layout.css";

export function mobilePresentation(): GamePresentation {
  let controls: MobileControls | undefined;
  return {
    createInput: (canvas) => new MobileInput(canvas),
    attach(game) {
      controls = new MobileControls(game, game.input as MobileInput);
      setPortraitHandler(() => {
        if (!game.paused) game.setPaused(true);
      });
    },
    update(game, dt) {
      if (!isLandscape() && !game.paused) game.setPaused(true);
      controls?.update(dt);
    },
    resize(game) {
      const aspect =
        game.engine.getRenderWidth() / game.engine.getRenderHeight();
      const half =
        mobileViewSize(
          game.engine.getRenderWidth(),
          game.engine.getRenderHeight(),
        ) / 2;
      Object.assign(game.camera, {
        orthoTop: half,
        orthoBottom: -half,
        orthoLeft: -half * aspect,
        orthoRight: half * aspect,
      });
    },
    camera(game, dt) {
      if (game.rc.camera(game.camera, dt)) return true;
      game.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      const desired = game.player.root.position.add(new Vector3(0, 0, 1.8));
      Vector3.LerpToRef(
        game.cameraTarget,
        desired,
        1 - Math.exp(-9 * dt),
        game.cameraTarget,
      );
      game.camera.position
        .copyFrom(game.cameraTarget)
        .addInPlace(new Vector3(0, MOBILE_CAMERA.height, -MOBILE_CAMERA.back));
      game.camera.setTarget(game.cameraTarget);
      game.player.setViewVisibility(1);
      return true;
    },
  };
}
