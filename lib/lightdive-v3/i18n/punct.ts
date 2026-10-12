// Punctuation-only fragments placed between translated pieces. Chinese uses full-width marks; English and Korean
// use ASCII ones with spaces. (The coverage check skips these because they contain no Chinese characters.)
// 繁體中文|English|简体中文|한국어
export const PUNCT = `{0}）|{0})|{0}）|{0})
（{0}）| ({0})|（{0}）| ({0})
{0}（{1}）|{0} ({1})|{0}（{1}）|{0} ({1})
「{0}」|“{0}”|「{0}」|“{0}”
「|“|「|“
」|”|」|”
Rovyn：「{0}」|Rovyn: “{0}”|Rovyn：「{0}」|Rovyn: “{0}”
{0}＝{1}|{0} = {1}|{0}＝{1}|{0} = {1}
、|, |、|, 
。|.|。|.
／|/|／|/
{0}／{1}|{0}/{1}|{0}／{1}|{0}/{1}
／{0}|/{0}|／{0}|/{0}
・| · |・| · 
{0}：{1}|{0}: {1}|{0}：{1}|{0}: {1}
{0}：{1}{2}|{0}: {1}{2}|{0}：{1}{2}|{0}: {1}{2}
{0} {1}：{2}|{0} {1}: {2}|{0} {1}：{2}|{0} {1}: {2}
：{0}|: {0}|：{0}|: {0}
{0} #{1}，{2}|{0} #{1}, {2}|{0} #{1}，{2}|{0} #{1}, {2}
　🔖| 🔖|　🔖| 🔖
ERC-721（RVDIV）|ERC-721 (RVDIV)|ERC-721（RVDIV）|ERC-721 (RVDIV)
USD／$RVYN · 1 {0} ≈ {1} $RVYN|USD/$RVYN · 1 {0} ≈ {1} $RVYN|USD／$RVYN · 1 {0} ≈ {1} $RVYN|USD/$RVYN · 1 {0} ≈ {1} $RVYN
收益的 {0}（回來後扣）|{0} of the reward (deducted on return)|收益的 {0}（回来后扣）|보상의 {0} (귀환 후 차감)`;
