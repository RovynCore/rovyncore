// Idle cards and the caps (decision C, 10-10): batch listing, the disband prompt, server-wide supply.
// 繁體中文|English|简体中文|한국어
export const IDLE = `已上架 {0} 張卡，總價 {1} $RVYN。|Listed {0} card(s) for {1} $RVYN in total.|已上架 {0} 张卡，总价 {1} $RVYN。|카드 {0}장을 총 {1} $RVYN에 등록했습니다.
上架閒置的卡|List idle cards|上架闲置的卡|유휴 카드 등록
一次上架|List several|一次上架|한 번에 등록
這些卡不在隊伍上、沒有停泊、也沒有上架。選擇要上架的卡（一次最多 {0} 張），每張可以設定自己的價格。上架期間卡由市集合約保管、不能出發，取消上架就會回到你手上。|These cards are not on a team, not docked and not listed. Choose the ones to list (up to {0} at a time) and set a price for each. While listed, a card is held by the market contract and can't dive; delist it and it comes back to you.|这些卡不在队伍上、没有停泊、也没有上架。选择要上架的卡（一次最多 {0} 张），每张可以设置自己的价格。上架期间卡由市集合约保管、不能出发，取消上架就会回到你手上。|이 카드들은 팀에 없고, 정박 중이 아니며, 등록되어 있지도 않습니다. 등록할 카드를 고르고(한 번에 최대 {0}장) 카드마다 가격을 정하세요. 등록 중인 카드는 마켓 컨트랙트가 보관하며 출발할 수 없고, 등록을 취소하면 돌아옵니다.
選前 {0} 張|Select the first {0}|选前 {0} 张|앞의 {0}장 선택
全選|Select all|全选|전체 선택
清除|Clear|清除|선택 해제
已選 {0}／{1}|Selected {0}/{1}|已选 {0}／{1}|선택 {0}/{1}
{0} #{1} 的價格|Price for {0} #{1}|{0} #{1} 的价格|{0} #{1} 가격
已選|Selected|已选|선택
總售價|Total price|总售价|총 판매가
全部賣出時實收|You receive if all sell|全部卖出时实收|모두 팔렸을 때 실수령액
目前沒有閒置的卡。|You have no idle cards right now.|目前没有闲置的卡。|지금은 유휴 카드가 없습니다.
確認上架（{0} 張）|Confirm listing ({0})|确认上架（{0} 张）|등록 확인 ({0}장)
正式版會用市集合約一次簽名上架（第一次需要授權市集合約保管你的卡）。預覽模式：上架與成交都是模擬的。|On chain, the market contract lists them all with one signature (the first time, you approve the market to hold your cards). Preview mode: listings and sales are simulated.|正式版会用市集合约一次签名上架（第一次需要授权市集合约保管你的卡）。预览模式：上架与成交都是模拟的。|정식 버전에서는 마켓 컨트랙트가 한 번의 서명으로 모두 등록합니다(처음에는 마켓이 카드를 보관하도록 승인해야 합니다). 미리보기 모드: 등록과 거래는 모의로 진행됩니다.
一次最多上架 20 張，至少要選 1 張。|Choose between 1 and 20 cards to list at once.|一次最多上架 20 张，至少要选 1 张。|한 번에 1장에서 20장까지 등록할 수 있습니다.
隊伍已解散|Team disbanded|队伍已解散|팀 해산됨
這 {0} 張卡現在閒置|These {0} card(s) are now idle|这 {0} 张卡现在闲置|이 카드 {0}장은 이제 유휴 상태입니다
可以留著之後再組隊，或上架到市集讓其他觀測者使用。閒置的卡仍然佔著全服的數量上限，直到它被用掉或歸航。|Keep them for a later team, or list them on the Market for other observers to use. An idle card still holds a place under the server-wide cap until it is used up or goes home.|可以留着之后再组队，或上架到市集让其他观测者使用。闲置的卡仍然占着全服的数量上限，直到它被用掉或归航。|나중에 팀을 짤 때까지 보관하거나, 다른 관측자가 쓸 수 있게 마켓에 등록하세요. 유휴 카드는 다 쓰이거나 귀항할 때까지 서버 전체 수량 상한의 한 자리를 계속 차지합니다.
留著|Keep them|留着|보관하기
上架這些卡|List these cards|上架这些卡|이 카드 등록
全服卡片數量|Cards in play, all observers|全服卡片数量|서버 전체 카드 수량
每種卡同時存在的數量有上限。停泊中和上架中的卡也算在內，卡歸航後名額才會空出來。|Each kind of card has a cap on how many can exist at once. Docked and listed cards count too; a place frees up only when a card goes home.|每种卡同时存在的数量有上限。停泊中和上架中的卡也算在内，卡归航后名额才会空出来。|카드 종류마다 동시에 존재할 수 있는 수량에 상한이 있습니다. 정박 중이거나 등록된 카드도 포함되며, 카드가 귀항해야 자리가 비워집니다.
預覽模式：數字是模擬的。合約部署後會直接讀取鏈上的數量。|Preview mode: these figures are simulated. Once the contracts are deployed they are read from the chain.|预览模式：数字是模拟的。合约部署后会直接读取链上的数量。|미리보기 모드: 수치는 모의값입니다. 컨트랙트가 배포되면 체인에서 직접 읽습니다.
在隊伍上|On teams|在队伍上|팀에 배치
市集上架中|Listed on the Market|市集上架中|마켓 등록 중
閒置或停泊|Idle or docked|闲置或停泊|유휴 또는 정박
還能召喚|Still summonable|还能召唤|추가 소환 가능
一次上架多張（{0}）|List several at once ({0})|一次上架多张（{0}）|여러 장 한 번에 등록 ({0})`;
