import { installVentSmoke, type VentOutlet } from "../effects/ventSmoke";
import { ROOF_FINISH_Y } from "./surfaceHeights";
import { roofDuctReturns, serviceDuctPath } from "./ductPath";
import {
  Color3,
  Mesh,
  MeshBuilder,
  RawTexture,
  Texture,
  Vector3,
  Quaternion,
} from "@babylonjs/core";
import type { World } from "./builder";
import { enclosedOfficeZones } from "./officeDeadZones";
import { cutFloorOpenings } from "./floorSurfaces";
import { office01 } from "../maps/office01";
import { OFFICE_WINDOWS } from "./lowerOffice";
import { mergeStaticParts } from "../weapons/staticModel";

export const SERVICE_ROOF_Y = ROOF_FINISH_Y - 0.052;

export function buildOfficeServiceDecor(world: World) {
  if (world.authoritative) return;
  const scene = world.scene;
  const smokeOutlets: VentOutlet[] = [];
  const ceiling = world.mat("#33434a").clone("dark acoustic technical roof");
  ceiling.specularColor = new Color3(0.025, 0.025, 0.025);
  if (typeof document !== "undefined") {
    const data = new Uint8Array(128 * 128 * 4);
    for (let z = 0; z < 128; z++)
      for (let x = 0; x < 128; x++) {
        const seam = x < 2 || z < 2;
        const perforation = x % 8 === 4 && z % 8 === 4;
        const grain = ((x * 17 + z * 31 + x * z) % 13) - 6;
        const value = seam ? 165 : perforation ? 200 : 232 + grain;
        const i = (z * 128 + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
      }
    const tex = RawTexture.CreateRGBATexture(
      data,
      128,
      128,
      scene,
      true,
      false,
    );
    tex.name = "shared dark perforated roof panels";
    tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 4;
    ceiling.diffuseTexture = tex;
  }
  const keepClear = [
    ...office01.footprint.map((r) => ({ ...r, w: r.w + 0.35, d: r.d + 0.35 })),
    ...OFFICE_WINDOWS.map((r) => ({
      ...r,
      z: r.z - 0.45,
      w: r.w + 0.6,
      d: r.d + 1.5,
    })),
  ];
  const metal = world.finish("#8d9b9d", "metal");
  const dark = world.finish("#42565d", "metal");
  const zones = enclosedOfficeZones(office01.footprint);
  for (const [index, zone] of zones.entries()) {
    const patches = cutFloorOpenings(zone.patches, keepClear);
    const parts: Mesh[] = [];
    const keep = (m: Mesh) => {
      m.isPickable = false;
      m.metadata = { visualOnly: true, officeService: true };
      world.shadows.removeShadowCaster(m);
      parts.push(m);
      return m;
    };
    const box = (
      name: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: string,
    ) => keep(world.box(name, x, y, z, w, h, d, color));
    for (const r of patches) {
      const m = box(
        "office service ceiling",
        r.x,
        -0.018,
        r.z,
        r.w,
        0.14,
        r.d,
        "#33434a",
      );
      m.material = ceiling;
      const uv = m.getVerticesData("uv")!,
        positions = m.getVerticesData("position")!;
      for (let i = 0; i < positions.length / 3; i++) {
        uv[i * 2] = (positions[i * 3] + r.x) / 2.4;
        uv[i * 2 + 1] = (positions[i * 3 + 2] + r.z) / 1.2;
      }
      m.setVerticesData("uv", uv);
    }
    // The central roof is split into adjoining strips by floor clipping. Treat
    // its broad northern atrium strips as one installation area, rather than
    // choosing the long, narrow strip behind them as the largest single patch.
    const atriumStrips = patches.filter(
      (r) => Math.abs(r.x) < 1 && r.z > 16 && r.z < 30 && r.w > 20 && r.d > 3,
    );
    const atriumMinZ = Math.min(...atriumStrips.map((r) => r.z - r.d / 2));
    const atriumMaxZ = Math.max(...atriumStrips.map((r) => r.z + r.d / 2));
    const anchor =
      atriumStrips.length === 2
        ? {
            x: 0,
            z: (atriumMinZ + atriumMaxZ) / 2,
            w: Math.min(...atriumStrips.map((r) => r.w)),
            d: atriumMaxZ - atriumMinZ,
          }
        : patches
            .filter((r) => r.w > 3.2 && r.d > 3.2)
            .sort((a, b) => b.w * b.d - a.w * a.d)[0];
    if (!anchor) {
      for (const mesh of parts) mesh.position.y += SERVICE_ROOF_Y;
      mergeStaticParts(world, parts);
      continue;
    }
    const { x, z } = anchor,
      w = anchor.w - 0.8,
      d = anchor.d - 0.8;
    const alongX = w >= d,
      length = (alongX ? w : d) - 0.08;
    // The broad enclosed roof immediately north of the atrium gets a main HVAC run.
    const atriumRoof = Math.abs(x) < 1 && z > 16 && z < 30 && w > 16 && d > 8;
    const largeDuctRoof = atriumRoof || (x < -30 && z < -35 && w > 30 && d > 4);
    if (largeDuctRoof) {
      const trunkPath = serviceDuctPath(x, z, w - 0.8, d - 1.6);
      for (const point of trunkPath) point.y = 0.82;
      const trunk = keep(
        MeshBuilder.CreateTube(
          "atrium main ventilation trunk",
          {
            path: roofDuctReturns(trunkPath, 0.95),
            radius: 0.7,
            tessellation: 16,
            cap: Mesh.CAP_ALL,
          },
          scene,
        ),
      );
      trunk.material = metal;
      for (const dx of [-8, -5, 1, 4, 7, 10]) {
        const dz = dx < -w * 0.12 ? -0.9 : 0.9;
        const band = keep(
          MeshBuilder.CreateTorus(
            "atrium trunk reinforcement band",
            { diameter: 1.46, thickness: 0.065, tessellation: 16 },
            scene,
          ),
        );
        band.position.set(x + dx, 0.82, z + dz);
        band.rotation.z = Math.PI / 2;
        band.material = dark;
        const support = box(
          "atrium duct support",
          x + dx,
          0.18,
          z + dz,
          0.2,
          0.3,
          1.85,
          "#42565d",
        );
        support.material = dark;
      }
      if (atriumRoof) {
        for (const side of [-1, 1]) {
          const path = serviceDuctPath(x, z + side * 3.4, w - 1.2, 2.4);
          for (const point of path) point.y = 0.34;
          const pipe = keep(
            MeshBuilder.CreateTube(
              "atrium auxiliary pipe",
              {
                path: roofDuctReturns(path, 0.4),
                radius: 0.16,
                tessellation: 10,
                cap: Mesh.CAP_ALL,
              },
              scene,
            ),
          );
          pipe.material = dark;
        }
        const unit = box(
          "atrium ventilation plenum",
          x + 5,
          0.65,
          z + 2.8,
          3.5,
          1.25,
          2.1,
          "#8d9b9d",
        );
        unit.material = metal;
        smokeOutlets.push({
          position: new Vector3(
            unit.position.x,
            SERVICE_ROOF_Y + 1.32,
            unit.position.z,
          ),
          large: true,
        });
        const connector = box(
          "atrium plenum connector",
          x + 5,
          0.65,
          z + 1.6,
          1.3,
          0.8,
          1.2,
          "#8d9b9d",
        );
        connector.material = metal;
        for (let i = 0; i < 12; i++)
          box(
            "atrium intake grille",
            x + 3.6 + i * 0.25,
            1.285,
            z + 2.8,
            0.12,
            0.045,
            1.6,
            "#30474d",
          );
      } else {
        for (let i = 0; i < 10; i++)
          box(
            "main duct exhaust grille",
            x - 1.1 + i * 0.24,
            1.535,
            z - 0.9,
            0.1,
            0.04,
            0.8,
            "#30474d",
          );
        smokeOutlets.push({
          position: new Vector3(x, SERVICE_ROOF_Y + 1.58, z - 0.9),
          large: true,
        });
      }
    }
    const pipe = () => {
      const path = serviceDuctPath(x, z, w, d);
      const duct = keep(
        MeshBuilder.CreateTube(
          "curved roof ventilation duct",
          { path, radius: 0.23, tessellation: 12, cap: Mesh.CAP_ALL },
          scene,
        ),
      );
      duct.material = metal;
      let distance = 0,
        nextRing = 0.28;
      for (let i = 1; i < path.length; i++) {
        const start = path[i - 1],
          delta = path[i].subtract(start),
          segment = delta.length();
        if (segment < 1e-6) continue;
        const tangent = delta.scale(1 / segment);
        while (nextRing <= distance + segment) {
          const ring = keep(
            MeshBuilder.CreateTorus(
              "duct coupling",
              { diameter: 0.49, thickness: 0.035, tessellation: 12 },
              scene,
            ),
          );
          ring.position.copyFrom(start.add(tangent.scale(nextRing - distance)));
          ring.rotationQuaternion = new Quaternion();
          Quaternion.FromUnitVectorsToRef(
            Vector3.Up(),
            tangent,
            ring.rotationQuaternion,
          );
          ring.material = dark;
          nextRing += 2.4;
        }
        distance += segment;
      }
      for (const end of [path[0], path[path.length - 1]]) {
        const collar = box(
          "roof duct wall collar",
          end.x,
          0.34,
          end.z,
          alongX ? 0.12 : 0.72,
          0.62,
          alongX ? 0.72 : 0.12,
          "#42565d",
        );
        collar.material = dark;
      }
    };
    if (!largeDuctRoof && index % 3 !== 1) {
      pipe();
      const unit = box(
        "air handling service unit",
        x + (alongX ? length * 0.28 : 0.7),
        0.34,
        z + (alongX ? 0.65 : length * 0.28),
        1.25,
        0.65,
        1.1,
        "#7c8f90",
      );
      unit.material = metal;
      smokeOutlets.push({
        position: new Vector3(
          unit.position.x,
          SERVICE_ROOF_Y + 0.72,
          unit.position.z,
        ),
      });
      for (let i = 0; i < 7; i++)
        box(
          "air unit grille",
          unit.position.x - 0.45 + i * 0.15,
          0.675,
          unit.position.z,
          0.055,
          0.02,
          0.8,
          "#30474d",
        );
    }
    if (index % 3 !== 0) {
      const tray = box(
        "office cable tray",
        x,
        0.15,
        z,
        alongX ? length : 0.46,
        0.22,
        alongX ? 0.46 : length,
        "#42565d",
      );
      tray.material = dark;
      for (const offset of [-0.11, 0.11])
        box(
          "service cable",
          x + (alongX ? 0 : offset),
          0.275,
          z + (alongX ? offset : 0),
          alongX ? length : 0.055,
          0.045,
          alongX ? 0.055 : length,
          index % 2 ? "#8c7057" : "#72868a",
        );
      const hatch = box(
        "ceiling access hatch",
        x + (alongX ? -0.8 : 0.7),
        0.035,
        z + (alongX ? 0.8 : -0.8),
        0.95,
        0.06,
        0.95,
        "#43575d",
      );
      box(
        "hatch inset",
        hatch.position.x,
        0.071,
        hatch.position.z,
        0.81,
        0.012,
        0.81,
        "#596c70",
      );
      box(
        "hatch handle",
        hatch.position.x + 0.25,
        0.09,
        hatch.position.z,
        0.14,
        0.025,
        0.04,
        "#3a5056",
      );
    }
    for (const mesh of parts) mesh.position.y += SERVICE_ROOF_Y;
    mergeStaticParts(world, parts);
  }
  installVentSmoke(scene, smokeOutlets);
}
