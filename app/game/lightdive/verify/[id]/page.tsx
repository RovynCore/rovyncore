import { VerifyDive } from "@/components/lightdive/v3/verify";
import { GameLocale } from "@/components/lightdive/v3/game-locale";

export default async function LightdiveVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GameLocale><VerifyDive id={id} /></GameLocale>;
}
