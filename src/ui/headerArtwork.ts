// Pick once per page load so the artwork stays consistent through the start flow.
const variants = ["01", "03", "05", "06", "07", "08", "09", "10"] as const;
export const headerArtwork = `/branding/header-variants/${variants[Math.floor(Math.random() * variants.length)]}.webp`;
