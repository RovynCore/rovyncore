// Dictionary rows for Lightdive, one block per area. Each line: 繁體中文|English|简体中文|한국어
// (the Traditional Chinese text is the key). `{name}` placeholders must appear in every language.
import { COMMON } from "./common";
import { PAGES } from "./pages";
import { STARMAP } from "./starmap";
import { VOYAGE } from "./voyage";
import { PLAIN } from "./plain";
import { ASSETS } from "./assets";
import { SUMMON } from "./summon";
import { MARKET } from "./market";
import { MORE } from "./more";
import { TEXTS_PLACES } from "./texts-places";
import { TEXTS_ROVYN } from "./texts-rovyn";
import { TEXTS_VOYAGE } from "./texts-voyage";
import { TEXTS_LOGS_A } from "./texts-logs-a";
import { TEXTS_LOGS_B } from "./texts-logs-b";
import { PUNCT } from "./punct";
import { IDLE } from "./idle";
import { NEXT } from "./next";
import { ALERTS } from "./alerts";
import { LIVE } from "./live";
import { V31 } from "./v31";
import { V32 } from "./v32";
import { V33 } from "./v33";
import { V34 } from "./v34";

export const ROWS: string[] = [COMMON, PAGES, STARMAP, VOYAGE, PLAIN, ASSETS, SUMMON, MARKET, MORE, TEXTS_PLACES, TEXTS_ROVYN, TEXTS_VOYAGE, TEXTS_LOGS_A, TEXTS_LOGS_B, PUNCT, IDLE, NEXT, ALERTS, LIVE, V31, V32, V33, V34];
