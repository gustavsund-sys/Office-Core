/// <reference types="vite/client" />

declare module "virtual:game-assets" {
  const assets: { url: string; bytes: number; hash: string }[];
  export default assets;
}
