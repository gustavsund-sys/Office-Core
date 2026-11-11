export const OUTFITS = [
  ["Suit", "Kostym"], ["Casual", "Vardag"], ["Casual2", "Vardag · hoodie"],
  ["Worker", "Arbetskläder"], ["Swat", "Insatsstyrka"], ["Punk", "Punk"],
  ["Adventurer", "Äventyrare"], ["Farmer", "Lantbrukare"], ["Beach", "Strand"],
  ["King", "Kung"], ["SpaceSuit", "Rymddräkt"],
] as const;
export type Outfit = typeof OUTFITS[number][0];
export type Head = Outfit | "Horse";
export const ANIMATIONS = [
  ["Idle", "Vila"], ["Idle_Neutral", "Neutral vila"], ["Walk", "Gå"],
  ["Run", "Spring"], ["Run_Back", "Spring bakåt"], ["Run_Left", "Spring åt vänster"],
  ["Run_Right", "Spring åt höger"], ["Wave", "Vinka"], ["Interact", "Interagera"],
  ["Roll", "Rulla"], ["Idle_Gun", "Vapenställning"], ["Idle_Gun_Pointing", "Sikta"],
  ["Idle_Gun_Shoot", "Skjut från vila"], ["Gun_Shoot", "Skjut"], ["Run_Shoot", "Spring och skjut"],
  ["Punch_Left", "Vänsterslag"], ["Punch_Right", "Högerslag"],
  ["Kick_Left", "Vänsterspark"], ["Kick_Right", "Högerspark"],
  ["HitRecieve", "Träffreaktion"], ["HitRecieve_2", "Träffreaktion 2"],
  ["Idle_Sword", "Svärdsställning"], ["Sword_Slash", "Svärdshugg"], ["Death", "Falla"],
] as const;
export type CharacterAnimation = typeof ANIMATIONS[number][0];
export interface Appearance {
  head: Head;
  body: Outfit;
  legs: Outfit;
  feet: Outfit;
  backpack: boolean;
}
export const DEFAULT_APPEARANCE: Appearance = {
  head: "Suit", body: "Suit", legs: "Suit", feet: "Suit", backpack: false,
};
export const APPEARANCE_KEY = "officeCore.modularCharacter.v1";
export function normalizeAppearance(value: unknown): Appearance {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const outfits = OUTFITS.map(([id]) => id);
  const pick = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T =>
    choices.includes(value as T) ? value as T : fallback;
  return {
    head: pick([...outfits, "Horse"], raw.head, DEFAULT_APPEARANCE.head),
    body: pick(outfits, raw.body, DEFAULT_APPEARANCE.body),
    legs: pick(outfits, raw.legs, DEFAULT_APPEARANCE.legs),
    feet: pick(outfits, raw.feet, DEFAULT_APPEARANCE.feet),
    backpack: raw.backpack === true,
  };
}
export function readAppearance(): Appearance {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null")); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}
export function appearanceMeshes(value: Appearance): string[] {
  return [
    `${value.head}_Head`, `${value.body}_Body`,
    `${value.legs}_${value.legs === "Farmer" ? "Pants" : "Legs"}`,
    `${value.feet}_Feet`, ...(value.backpack ? ["Backpack"] : []),
  ];
}
