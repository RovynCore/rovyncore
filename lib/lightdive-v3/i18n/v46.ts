// 10-30 (P0-02): the verify page, the drand delay banner and the reveal's verify link.
// 繁體中文|English|简体中文|한국어 (terms follow docs/lightdive/i18n-glossary.md)
export const V46 = `隨機信標 drand 延遲中（約 {0} 分鐘）|The drand randomness beacon is running late (about {0} min)|随机信标 drand 延迟中（约 {0} 分钟）|랜덤 신호 drand가 지연되고 있습니다(약 {0}분)
揭曉會晚一點出現。已經出發或召喚的結果不受影響：它們用的那一輪早就固定了，drand 一公開就會揭曉。|Reveals will come a little later. Results of dives and summons already sent are not affected: their rounds were fixed when they were sent, and they reveal as soon as drand publishes them.|揭晓会晚一点出现。已经出发或召唤的结果不受影响：它们用的那一轮早就固定了，drand 一公开就会揭晓。|공개가 조금 늦어집니다. 이미 보낸 출발이나 소환의 결과는 영향을 받지 않습니다. 사용할 라운드가 이미 정해져 있으며, drand가 공개하는 즉시 결과가 나옵니다.
自己驗證這趟結果|Verify this result yourself|自己验证这趟结果|이 결과를 직접 검증하기
驗證航程|Verify a dive|验证航程|항해 검증
航程 #{0} 是怎麼決定的|How dive #{0} was decided|航程 #{0} 是怎么决定的|항해 #{0}의 결과는 어떻게 정해졌나
每一趟的結果都由 drand 公開隨機數決定：出發時就固定用哪一輪，那一輪公開前沒有人（包括我們）知道它的值。下面每一步都只用公開資料，任何人都能自己重算。|Every result comes from drand's public randomness: the round is fixed when the dive is sent, and nobody (including us) knows its value before it is published. Every step below uses public data only, so anyone can redo it.|每一趟的结果都由 drand 公开随机数决定：出发时就固定用哪一轮，那一轮公开前没有人（包括我们）知道它的值。下面每一步都只用公开资料，任何人都能自己重算。|모든 결과는 drand의 공개 난수로 정해집니다. 출발할 때 사용할 라운드가 정해지며, 공개되기 전에는 저희를 포함해 누구도 그 값을 알 수 없습니다. 아래 단계는 모두 공개 데이터만 사용하므로 누구나 직접 다시 계산할 수 있습니다.
航程編號|Dive number|航程编号|항해 번호
驗證另一趟|Verify another|验证另一趟|다른 항해 검증
航程編號不正確。|That dive number isn't valid.|航程编号不正确。|항해 번호가 올바르지 않습니다.
從鏈上和 drand 讀取中…|Reading the chain and drand…|从链上和 drand 读取中…|체인과 drand에서 읽는 중…
目前的測試網上還沒有這一趟航程。|There is no such dive on the current testnet yet.|目前的测试网上还没有这一趟航程。|현재 테스트넷에는 아직 이 항해가 없습니다.
讀不到鏈上資料，請稍後再試。|Couldn't read the chain. Try again later.|读不到链上数据，请稍后再试。|체인 데이터를 읽지 못했습니다. 잠시 후 다시 시도하세요.
這趟航程（鏈上紀錄）|The dive (as recorded on chain)|这趟航程（链上记录）|이 항해(온체인 기록)
出發者|Sent by|出发者|출발한 지갑
指定的 drand 輪次|drand round fixed at departure|指定的 drand 轮次|출발 시 지정된 drand 라운드
drand 公開的簽章|The signature drand published|drand 公开的签章|drand가 공개한 서명
簽章|Signature|签章|서명
隨機數 = sha256(簽章)|Randomness = sha256(signature)|随机数 = sha256(签章)|난수 = sha256(서명)
混入航程編號 = keccak256(隨機數, 航程編號)|Mixed with the dive number = keccak256(randomness, dive number)|混入航程编号 = keccak256(随机数, 航程编号)|항해 번호와 섞기 = keccak256(난수, 항해 번호)
這一輪還沒公開。公開後重新整理這頁，就能看到結果是怎麼算出來的。|This round isn't published yet. Refresh this page once it is to see how the result is worked out.|这一轮还没公开。公开后重新整理这页，就能看到结果是怎么算出来的。|이 라운드는 아직 공개되지 않았습니다. 공개된 뒤 이 페이지를 새로고침하면 결과가 어떻게 계산되는지 볼 수 있습니다.
用這個數字查勝算表|Look the number up in the odds table|用这个数字查胜算表|이 숫자로 확률표 찾기
取最後一段：{0} 除以 10000 的餘數是 {1}。落在哪一列，就是哪個結果。|Take the remainder of {0} divided by 10000: it is {1}. The row it falls in is the result.|取最后一段：{0} 除以 10000 的余数是 {1}。落在哪一列，就是哪个结果。|{0}을(를) 10000으로 나눈 나머지는 {1}입니다. 이 값이 들어가는 행이 결과입니다.
混入後的數字|the mixed number|混入后的数字|섞은 숫자
機率|Chance|概率|확률
落點範圍|Range|落点范围|범위
倍率範圍|Multiplier range|倍率范围|배율 범위
倍率：往右移 128 位、除以這一列倍率範圍的格數取餘數得 {0}，所以是 ×{1}。|Multiplier: shift right by 128 bits and take the remainder by the number of steps in this row's range: {0}, so ×{1}.|倍率：往右移 128 位、除以这一列倍率范围的格数取余数得 {0}，所以是 ×{1}。|배율: 128비트 오른쪽으로 이동한 뒤 이 행의 배율 범위 칸 수로 나눈 나머지는 {0}이므로 ×{1}입니다.
耗損：這趟帶了燈油，耗損固定 1 次航程。|Wear: this dive carried lamp oil, so it wears exactly 1 voyage.|耗损：这趟带了灯油，耗损固定 1 次航程。|소모: 이번 항해는 등불 기름을 가져가서 소모가 항해 1회로 고정됩니다.
耗損：往右移 64 位除以 10000 取餘數得 {0}；小於 {1} 耗損 3，小於 {2} 耗損 2，否則耗損 1，所以耗損 {3}。|Wear: shift right by 64 bits and take the remainder by 10000: {0}. Below {1} wears 3, below {2} wears 2, otherwise 1, so the wear is {3}.|耗损：往右移 64 位除以 10000 取余数得 {0}；小于 {1} 耗损 3，小于 {2} 耗损 2，否则耗损 1，所以耗损 {3}。|소모: 64비트 오른쪽으로 이동한 뒤 10000으로 나눈 나머지는 {0}입니다. {1} 미만이면 3, {2} 미만이면 2, 그 외에는 1이므로 소모는 {3}입니다.
帶回（已扣出發成本）：{0} $RVYN|Brought back (after the departure cost): {0} $RVYN|带回（已扣出发成本）：{0} $RVYN|가져온 양(출발 비용 차감 후): {0} $RVYN
這趟沒有人送出 drand 證明，由主人用保底結算：空手而歸、耗損最多。保底永遠不會比正常抽到的好。|Nobody sent this dive's drand proof, so its owner settled it by the fallback: empty-handed with the most wear. The fallback is never better than a normal draw.|这趟没有人送出 drand 证明，由主人用保底结算：空手而归、耗损最多。保底永远不会比正常抽到的好。|이 항해의 drand 증명을 아무도 보내지 않아 주인이 보장 정산을 했습니다: 빈손, 최대 소모. 보장 정산은 정상 결과보다 절대 좋지 않습니다.
一致：重算的結果和鏈上紀錄完全相同（{0} ×{1}，耗損 {2}）。|Match: the recomputed result is exactly the one recorded on chain ({0} ×{1}, wear {2}).|一致：重算的结果和链上记录完全相同（{0} ×{1}，耗损 {2}）。|일치: 다시 계산한 결과가 온체인 기록과 완전히 같습니다({0} ×{1}, 소모 {2}).
這趟還沒寫入鏈上：結果已經由 drand 決定，就是上面算出的 {0} ×{1}。下一筆交易寫入時，合約會用同一個簽章得到同一個結果。|Not written on chain yet: drand has already decided it, and it is the {0} ×{1} worked out above. When the next transaction writes it, the contract uses the same signature and gets the same result.|这趟还没写入链上：结果已经由 drand 决定，就是上面算出的 {0} ×{1}。下一笔交易写入时，合约会用同一个签章得到同一个结果。|아직 체인에 기록되지 않았습니다. 결과는 이미 drand가 정했으며 위에서 계산한 {0} ×{1}입니다. 다음 거래가 기록할 때 컨트랙트도 같은 서명으로 같은 결과를 얻습니다.
不一致：鏈上紀錄是 {0} ×{1}，重算是 {2} ×{3}。請回報給我們。|Mismatch: the chain records {0} ×{1}, the recomputation gives {2} ×{3}. Please report it to us.|不一致：链上记录是 {0} ×{1}，重算是 {2} ×{3}。请回报给我们。|불일치: 온체인 기록은 {0} ×{1}, 다시 계산한 값은 {2} ×{3}입니다. 저희에게 알려 주세요.
等 drand 公開這一輪後才能比對。|It can be compared once drand publishes this round.|等 drand 公开这一轮后才能比对。|drand가 이 라운드를 공개한 뒤 비교할 수 있습니다.
勝算表由合約 LightdiveConfig3.plan 依目的地、戰力、光束、當天星象、默契、補給與光橋回聲算出；計算步驟和 Expedition3 結算時完全相同。合約未經審計。|The odds table comes from the contract's LightdiveConfig3.plan, from the destination, Power, beam, the day's sky, crew bond, supply and bridge echo; the steps are exactly the ones Expedition3 takes when it settles. The contracts are not audited.|胜算表由合约 LightdiveConfig3.plan 依目的地、战力、光束、当天星象、默契、补给与光桥回声算出；计算步骤和 Expedition3 结算时完全相同。合约未经审计。|확률표는 컨트랙트 LightdiveConfig3.plan이 목적지, 전투력, 광선, 그날의 천체 현상, 호흡, 보급, 빛다리 메아리로 계산합니다. 계산 단계는 Expedition3가 정산할 때와 완전히 같습니다. 컨트랙트는 감사를 받지 않았습니다.`;
