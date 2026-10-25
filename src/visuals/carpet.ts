import { RawTexture, Texture, type Scene } from "@babylonjs/core";

/** Four-by-four carpet tiles, baked once. Soft tonal variation without extra geometry. */
export function officeCarpet(scene: Scene) {
  const size = 256,
    pixels = new Uint8Array(size * size * 4);
  let seed = 8219;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 24) / 255;
  };
  const shades = Array.from({ length: 16 }, () => 225 + noise() * 13);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const tx = x >> 6,
        ty = y >> 6,
        u = x % 64,
        v = y % 64;
      const weave = ((tx + ty) % 2 ? x : y) % 3 === 0 ? -3 : 1;
      const seam = u === 0 || v === 0 ? -7 : 0;
      // Periodic low-frequency variation keeps the large tile seamless.
      const wear =
        3 * Math.sin((x * Math.PI) / 128) * Math.cos((y * Math.PI) / 64);
      const value =
        shades[ty * 4 + tx] + (noise() - 0.5) * 12 + weave + seam + wear;
      const i = (y * size + x) * 4;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
  const texture = RawTexture.CreateRGBATexture(
    pixels,
    size,
    size,
    scene,
    true,
    false,
  );
  texture.name = "woven office carpet · shared";
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  return texture;
}
