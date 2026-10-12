// Traditional → Simplified Chinese, character by character, for the Lightdive texts only. The table covers every
// Traditional character the game's story, whitepaper and dictionary use (著 is always the particle 着 there; 乾 is
// always "dry"). A character missing from the table passes through unchanged, so re-check after adding new text:
//   node scripts/lightdive-hant2hans.mjs --check    lists characters in the sources that look Traditional but aren't mapped
//   node scripts/lightdive-hant2hans.mjs --rows     compares the hand-written 简体 column of the dictionary with this table
//   node scripts/lightdive-hant2hans.mjs IN OUT     converts a file
import fs from "node:fs";

const PAIRS = `並并 亂乱 佈布 佔占 來来 係系 個个 們们 倉仓 側侧 備备 傳传 傷伤 傾倾 價价 儲储 兇凶 兌兑 兒儿 內内 兩两 冊册 凍冻
則则 剛刚 剝剥 劃划 劍剑 勝胜 勢势 勵励 動动 務务 區区 卻却 參参 厲厉 問问 啞哑 啟启 喚唤 單单 嗎吗 嘆叹 嘯啸 噴喷 嚇吓 嚨咙
唸念 圍围 圓圆 圖图 團团 執执 報报 場场 塊块 塗涂 塵尘 壓压 壞坏 壽寿 夠够 夢梦 夥伙 夾夹 媽妈 學学 實实 審审 寫写 寬宽
寶宝 將将 專专 對对 導导 屜屉 層层 屬属 峽峡 師师 帳帐 帶带 幣币 幫帮 幾几 廢废 廣广 廳厅 庫库 張张 強强 彎弯 後后 從从
復复 悶闷 態态 慣惯 慮虑 慶庆 憶忆 應应 懶懒 懷怀 懸悬 戰战 戲戏 戶户 捨舍 捲卷 掛挂 揚扬 換换 損损 搖摇 搶抢 摺折 撈捞
撐撑 撲扑 撿捡 擁拥 擇择 擊击 擋挡 據据 擠挤 擬拟 擱搁 擴扩 擺摆 擾扰 攔拦 攤摊 揮挥 敗败 數数 斷断 於于 時时 曉晓 暈晕
暫暂 曬晒 書书 會会 東东 條条 極极 構构 樁桩 樂乐 標标 樣样 樹树 橋桥 機机 檔档 檢检 檻槛 櫃柜 欄栏 權权 歡欢 歲岁 歸归
殘残 殼壳 毀毁 氣气 決决 沒没 沖冲 況况 涼凉 淚泪 淨净 淵渊 淺浅 渙涣 減减 渦涡 測测 湧涌 湊凑 準准 溫温 滅灭 滲渗 滾滚
滿满 漁渔 漣涟 漬渍 漲涨 漸渐 漿浆 潛潜 濁浊 濃浓 濕湿 濟济 濾滤 瀉泻 瀏浏 灑洒 灘滩 灣湾 為为 無无 煙烟 煩烦 熱热 熾炽
燈灯 燒烧 燙烫 營营 燭烛 爍烁 爭争 爺爷 爾尔 牆墙 牠它 狀状 猶犹 獎奖 獨独 現现 環环 產产 畫画 當当 疊叠 瘋疯 發发 皺皱
盞盏 盡尽 盤盘 盪荡 睜睁 確确 碼码 礎础 禮礼 禱祷 稅税 稜棱 種种 稱称 積积 穩稳 穫获 竄窜 筆笔 節节 範范 篩筛 簡简 簽签
籠笼 籤签 紀纪 約约 紅红 紋纹 紙纸 級级 紮扎 細细 終终 組组 結结 給给 統统 絲丝 綁绑 經经 綠绿 網网 緊紧 緒绪 線线 緣缘
編编 緩缓 練练 縫缝 縮缩 縷缕 總总 織织 繞绕 繡绣 繩绳 繪绘 繫系 繳缴 繼继 續续 纏缠 習习 翹翘 聞闻 聲声 聽听 脈脉 脫脱
腦脑 腳脚 膚肤 膩腻 臉脸 臟脏 與与 舉举 舊旧 艙舱 萬万 蒼苍 蓋盖 薦荐 藍蓝 處处 號号 虧亏 蟲虫 蠟蜡 衛卫 衝冲 補补 裝装
裡里 製制 複复 見见 規规 視视 親亲 覺觉 覽览 觀观 觸触 計计 訊讯 記记 訝讶 設设 許许 訴诉 註注 詞词 試试 話话 該该 詳详
誌志 認认 語语 說说 誰谁 調调 請请 謊谎 講讲 證证 識识 譯译 議议 護护 讀读 變变 讓让 豐丰 貓猫 負负 貨货 責责 買买 費费
貼贴 資资 賣卖 質质 購购 賽赛 贈赠 趕赶 跡迹 車车 軌轨 軟软 較较 載载 輕轻 輝辉 輩辈 輪轮 輸输 轉转 轟轰 辦办 這这 連连
進进 遊游 運运 過过 達达 遞递 遠远 適适 選选 還还 邊边 鄉乡 醜丑 醫医 釋释 針针 鈕钮 鉛铅 銀银 銘铭 銳锐 銷销 鋪铺 錄录
錢钱 錯错 鍵键 鎖锁 鏈链 鏡镜 鏽锈 鐘钟 鐵铁 鑄铸 鑰钥 長长 門门 閃闪 閉闭 開开 閒闲 間间 闔阖 關关 陣阵 陽阳 隊队 階阶
際际 隨随 險险 隻只 雖虽 雙双 雜杂 離离 難难 電电 霧雾 靜静 韓韩 響响 頁页 頂顶 項项 順顺 須须 預预 頓顿 領领 頭头 頰颊
頻频 顆颗 題题 額额 顏颜 願愿 類类 顧顾 顯显 風风 颳刮 飄飘 飛飞 餅饼 養养 餘余 馬马 駁驳 駝驼 騙骗 驕骄 驚惊 驟骤 髒脏
體体 髮发 鬆松 鬧闹 魚鱼 鯨鲸 鳥鸟 鳴鸣 麼么 黃黄 點点 齊齐 齒齿 著着 乾干 愛爱 痠酸 迴回 煉炼 鍊链 錶表 檯台 臺台 裏里
啟启 縣县 雲云 夠够 貝贝 員员 億亿 優优 認认 僅仅 雞鸡 歷历 曆历 勞劳 舖铺 懼惧 罰罚 戀恋 誤误 誇夸 謝谢 謎谜 謹谨 費费
帥帅 腫肿 嚴严 憑凭 噸吨 錦锦 頸颈 礙碍 艷艳 蘇苏 雛雏 鑽钻 銅铜 鋼钢 錫锡 鏟铲 鐲镯 閱阅 闊阔 隸隶 雋隽 韌韧 韻韵 頌颂
頗颇 頒颁 頹颓 頸颈 顫颤 飢饥 飯饭 飲饮 飽饱 飾饰 館馆 饋馈 駐驻 驗验 骯肮 鬥斗 鬱郁 鷹鹰 鹽盐 麥麦 龍龙 龜龟 傘伞 傢家
倫伦 偉伟 側侧 偵侦 傑杰 僕仆 儀仪 儘尽 儉俭 償偿 劇剧 劑剂 勁劲 勳勋 匯汇 卹恤 厭厌 叢丛 吳吴 呂吕 嗆呛 嗚呜 嘩哗 嘗尝
噹当 嚀咛 嚐尝 嚮向 囉啰 園园 圈圈 堅坚 壇坛 壘垒 壯壮 奪夺 奮奋 婦妇 嬰婴 孫孙 寧宁 實实 尋寻 嶼屿 巔巅 幟帜 庵庵 廂厢
彈弹 徑径 徹彻 恆恒 惡恶 惱恼 愜惬 慘惨 憐怜 憤愤 懇恳 戔戋 撥拨 擔担 擬拟 擾扰 攏拢 攜携 敵敌 斂敛 晝昼 暢畅 曠旷 栗栗
棧栈 棟栋 槍枪 樓楼 橫横 歐欧 歎叹 毆殴 氫氢 決决 汙污 涇泾 淒凄 渾浑 溝沟 漢汉 澀涩 灶灶 炮炮 烏乌 煥焕 熒荧 燦灿 爐炉
犧牺 獅狮 獲获 玀猡 璽玺 瓏珑 畢毕 異异 療疗 癢痒 皚皑 盜盗 監监 睏困 瞞瞒 矚瞩 礦矿 禍祸 窩窝 窮穷 竊窃 糧粮 紐纽 紗纱
紛纷 絕绝 絨绒 綜综 維维 綿绵 緞缎 締缔 緯纬 罈坛 罷罢 羅罗 職职 肅肃 脅胁 膽胆 艦舰 莊庄 華华 蓮莲 蔥葱 蕭萧 藝艺 蘆芦
虛虚 蝦虾 螞蚂 蠅蝇 術术 襯衬 覓觅 訂订 訓训 託托 訪访 詐诈 診诊 誕诞 誠诚 誼谊 諾诺 謀谋 謂谓 豎竖 貌貌 販贩 貫贯 貴贵
賀贺 賠赔 賦赋 賴赖 贏赢 趨趋 踐践 蹤踪 軍军 軒轩 辭辞 農农 違违 遙遥 遲迟 鄰邻 醞酝 釀酿 鈴铃 鉤钩 鋒锋 錘锤 鍋锅 鎮镇
鐺铛 閣阁 闆板 陰阴 陸陆 隱隐 雛雏 霸霸 靈灵 頑顽 頻频 颱台 飼饲 驅驱 驢驴 骨骨 髓髓 鬍胡 魂魂 鮮鲜 鴉鸦 鴿鸽 鵝鹅 麗丽 別别`;

// Mainland wording, applied before the character table.
const WORDS = [["紀錄", "记录"], ["網路", "网络"], ["座標", "坐标"], ["計畫", "计划"], ["機率", "概率"], ["帳上", "账上"], ["帳戶", "账户"], ["快轉", "快进"], ["想像", "想象"], ["份量", "分量"], ["反覆", "反复"], ["介面", "界面"], ["資訊", "信息"], ["即時", "实时"], ["入帳", "入账"], ["預設", "默认"], ["儲存", "保存"], ["滑價", "滑点"], ["執行緒", "线程"], ["記憶體", "内存"], ["分頁", "标签页"], ["設定", "设置"], ["鏈上資料", "链上数据"]];

export const T2S = new Map();
for (const p of PAIRS.split(/\s+/)) if (p.length === 2 && p[0] !== p[1]) T2S.set(p[0], p[1]);

// {placeholders} stay exactly as written.
export const toHans = (s) => s.split(/({[^}]*})/).map((part) => part.startsWith("{") ? part : [...WORDS.reduce((x, [a, b]) => x.replaceAll(a, b), part)].map((c) => T2S.get(c) ?? c).join("")).join("");

const [, , a, b] = process.argv;
if (a === "--check") {
  // characters that appear in the sources and have a Simplified form different from themselves would be listed here
  // only if mapped; unmapped ones cannot be detected automatically, so print the unmapped set for a human eye.
  const src = ["docs/lightdive/STORY-v2.md", "docs/lightdive/WHITEPAPER-v3.md"].map((f) => fs.readFileSync(f, "utf8")).join("");
  const seen = new Set([...src].filter((c) => /[一-鿿]/.test(c) && !T2S.has(c)));
  console.log(`${seen.size} unmapped characters (should all already be Simplified-compatible):\n${[...seen].sort().join("")}`);
} else if (a === "--rows") {
  const dir = "lib/lightdive-v3/i18n";
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(`${dir}/${f}`, "utf8").split(/\r?\n/)) {
      const c = line.replace(/^export const \w+ = `/, "").replace(/`;$/, "").split("|");
      if (c.length !== 4 || line.startsWith("//")) continue;
      const want = toHans(c[0]);
      if (want !== c[2]) { n++; console.log(`${f}\n  繁 ${c[0]}\n  表 ${want}\n  手 ${c[2]}`); }
    }
  }
  console.log(`${n} rows differ`);
} else if (a && b) {
  fs.writeFileSync(b, toHans(fs.readFileSync(a, "utf8")));
  console.log(`wrote ${b}`);
}
