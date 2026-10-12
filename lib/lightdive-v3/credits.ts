// Third-party media used by the Lightdive v3 preview, with the credit lines their licenses require.
// ESA/Hubble images are CC BY 4.0 and must be credited visibly; music by Kevin MacLeod is CC BY 4.0;
// sound effects come from the Sonniss #GameAudioGDC bundle (no credit required, listed here anyway).

export type SpaceImage = { src: string; title: string; credit: string; url: string };

export const GALAXY_IMAGE: SpaceImage = {
  src: "/lightdive/space/galaxy.jpg",
  title: "The Whirlpool Galaxy (M51) and companion galaxy",
  credit: "NASA, ESA, S. Beckwith (STScI), and The Hubble Heritage Team (STScI/AURA)",
  url: "https://esahubble.org/images/heic0506a/",
};

/** One backdrop per star cluster, ① to ⑥. */
export const CLUSTER_IMAGES: SpaceImage[] = [
  { src: "/lightdive/space/cluster-1.jpg", title: "The Lagoon Nebula (Hubble's 28th birthday picture)", credit: "NASA, ESA, STScI", url: "https://esahubble.org/images/heic1808a/" },
  { src: "/lightdive/space/cluster-2.jpg", title: "Westerlund 2 (Hubble's 25th anniversary image)", credit: "NASA, ESA, the Hubble Heritage Team (STScI/AURA), A. Nota (ESA/STScI), and the Westerlund 2 Science Team", url: "https://esahubble.org/images/heic1509a/" },
  { src: "/lightdive/space/cluster-3.jpg", title: "New view of the Pillars of Creation (visible)", credit: "NASA, ESA/Hubble and the Hubble Heritage Team", url: "https://esahubble.org/images/heic1501a/" },
  { src: "/lightdive/space/cluster-4.jpg", title: "New infrared view of the Horsehead Nebula", credit: "NASA, ESA, and the Hubble Heritage Team (AURA/STScI)", url: "https://esahubble.org/images/heic1307a/" },
  { src: "/lightdive/space/cluster-5.jpg", title: "Most detailed image of the Crab Nebula", credit: "NASA, ESA and Allison Loll/Jeff Hester (Arizona State University). Acknowledgement: Davide De Martin (ESA/Hubble)", url: "https://esahubble.org/images/heic0515a/" },
  { src: "/lightdive/space/cluster-6.jpg", title: "Tapestry of Blazing Starbirth", credit: "NASA, ESA, and STScI", url: "https://esahubble.org/images/heic2007a/" },
];

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
