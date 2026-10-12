// Game icons from game-icons.net (CC BY 3.0), extracted by scripts/lightdive-icons.mjs.
import { ICON_PATHS, type IconName } from "./icons";

export function GameIcon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={`gi${className ? ` ${className}` : ""}`} viewBox="0 0 512 512" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }} />;
}
