"use client";

import { LightdiveLive } from "@/components/lightdive/v3/live";
import { GameLocale } from "@/components/lightdive/v3/game-locale";

export default function LightdivePage() {
  return <GameLocale><LightdiveLive /></GameLocale>;
}
