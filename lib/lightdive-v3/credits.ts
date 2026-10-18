// Media used by Lightdive v3: the project's own space art, and the third-party media with the credit lines their
// licenses require. Music by Kevin MacLeod is CC BY 4.0;
// sound effects come from the Sonniss #GameAudioGDC bundle (no credit required, listed here anyway).

export type SpaceImage = { src: string; name: string };

/** The star map and the six clusters, ① to ⑥: the project's own art since 10-18 (they replaced ESA/Hubble photos). */
export const GALAXY_IMAGE: SpaceImage = { src: "/lightdive/space/galaxy.webp", name: "星圖" };
export const CLUSTER_IMAGES: SpaceImage[] = ["微光淺域", "迴光礁海", "碑影星團", "霧光深谷", "裂光星團", "核心星冠"]
  .map((name, i) => ({ src: `/lightdive/space/cluster-${i + 1}.webp`, name }));

export type Track = { src: string; title: string; credit: string };
const macleod = (title: string, file: string): Track => ({
  src: `/lightdive/music/${file}.mp3`,
  title,
  credit: `"${title}" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/`,
});

/** Background music: observatory (lobby and other pages), the star map, and the deep clusters. */
export const MUSIC = {
  observatory: macleod("Floating Cities", "observatory"),
  map: macleod("Lightless Dawn", "map"),
  deep: macleod("Dark Fog", "deep"),
};

export const SFX_CREDIT =
  "Sound effects: excerpts from the Sonniss #GameAudioGDC Bundle 2024 (BluezoneCorp, CB Sounddesign, Doex Studio, Rescopic Sound, Rogue Waves, Chupapsound, Mechanical Wave, Jake Fielding, Orbital Emitter), used under the GDC Bundle License.";
export const ICON_CREDIT = "Icons: game-icons.net (Lorc, Delapouite and contributors), CC BY 3.0.";
