const variants = ["01", "03", "05", "06", "07", "08", "09", "10"] as const;
const artworkPath = "/branding/header-variants";
export const lobbyArtwork = `${artworkPath}/01.webp`;

// Choose one panorama per visit to the start page.
export function chooseStartArtwork() {
  return `${artworkPath}/${variants[Math.floor(Math.random() * variants.length)]}.webp`;
}
