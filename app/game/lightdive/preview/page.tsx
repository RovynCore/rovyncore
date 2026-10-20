"use client";

import { LightdivePreview } from "@/components/lightdive/v3/preview";
import { GameLocale } from "@/components/lightdive/v3/game-locale";

export default function LightdivePreviewPage() {
  return <GameLocale><LightdivePreview /></GameLocale>;
}
