// 責務: 武将47人の初期データ（素質・価値観・技・初期関係）。固有名詞はこのdata層のみに置く
import type { Aptitudes, BondKind, SkillId, Values } from "../src/model";

export interface RelationSeed {
  target: string;
  affinity: number;
  trust: number;
  bond?: BondKind;
}

export interface OfficerSeed {
  id: string;
  family: string;
  given: string;
  nickname?: string;
  age: number;
  apt: Aptitudes;
  val: Values;
  skills: SkillId[];
  startNode: string;
  faction?: string;
  fameOfficial: number;
  fameOutlaw: number;
  relations: RelationSeed[];
}

const A = (
  valor: number, intellect: number, leadership: number, charisma: number, craft: number,
): Aptitudes => ({ valor, intellect, leadership, charisma, craft });

const V = (
  altruism: number, loyalty: number, ambition: number, acquisition: number,
  aggression: number, caution: number, face: number, attachment: number,
): Values => ({ altruism, loyalty, ambition, acquisition, aggression, caution, face, attachment });

export const OFFICER_SEEDS: OfficerSeed[] = [
  // ===== 官府（済州府・諸県） =====
  {
    id: "murong", family: "慕容", given: "彦達", age: 52,
    apt: A(35, 60, 55, 50, 30), val: V(10, 60, 55, 90, 40, 70, 80, 30),
    skills: [], startNode: "qingzhou", faction: "court", fameOfficial: 70, fameOutlaw: 0, relations: [],
  },
  {
    id: "gao-lian", family: "高", given: "廉", nickname: "神火将", age: 44,
    apt: A(55, 65, 60, 40, 82), val: V(8, 65, 60, 88, 55, 55, 75, 25),
    skills: ["sorcery", "fire"], startNode: "gaotang", faction: "court", fameOfficial: 60, fameOutlaw: 0,
    relations: [{ target: "murong", affinity: 55, trust: 60, bond: "colleague" }],
  },
  {
    id: "lin-chong", family: "林", given: "冲", nickname: "豹子頭", age: 34,
    apt: A(92, 58, 72, 55, 42), val: V(70, 76, 25, 15, 45, 62, 68, 75),
    skills: ["charge", "volley"], startNode: "kaifeng", faction: "court", fameOfficial: 62, fameOutlaw: 20,
    relations: [{ target: "lu-zhishen", affinity: 76, trust: 80, bond: "sworn" }],
  },
  {
    id: "hua-rong", family: "花", given: "栄", nickname: "小李広", age: 29,
    apt: A(85, 62, 74, 66, 50), val: V(66, 64, 35, 20, 50, 55, 60, 70),
    skills: ["volley"], startNode: "qingfeng", faction: "court", fameOfficial: 55, fameOutlaw: 25,
    relations: [{ target: "song-jiang", affinity: 70, trust: 75 }],
  },
  {
    id: "qin-ming", family: "秦", given: "明", nickname: "霹靂火", age: 40,
    apt: A(88, 40, 70, 50, 35), val: V(55, 70, 40, 25, 90, 22, 72, 50),
    skills: ["charge"], startNode: "qingzhou", faction: "court", fameOfficial: 58, fameOutlaw: 10,
    relations: [{ target: "hua-rong", affinity: 45, trust: 55, bond: "colleague" }],
  },
  {
    id: "huang-xin", family: "黄", given: "信", nickname: "鎮三山", age: 36,
    apt: A(70, 52, 64, 48, 40), val: V(45, 68, 38, 35, 55, 50, 65, 45),
    skills: ["volley"], startNode: "qingzhou", faction: "court", fameOfficial: 45, fameOutlaw: 5,
    relations: [{ target: "qin-ming", affinity: 50, trust: 60, bond: "master" }],
  },
  {
    id: "huyan-zhuo", family: "呼延", given: "灼", nickname: "双鞭", age: 38,
    apt: A(88, 60, 80, 55, 45), val: V(50, 86, 40, 20, 60, 55, 78, 45),
    skills: ["charge", "volley"], startNode: "kaifeng", faction: "court", fameOfficial: 68, fameOutlaw: 0, relations: [],
  },
  {
    id: "guan-sheng", family: "関", given: "勝", nickname: "大刀", age: 37,
    apt: A(90, 65, 82, 62, 40), val: V(60, 82, 42, 15, 55, 58, 82, 40),
    skills: ["charge"], startNode: "luoyang", faction: "court", fameOfficial: 66, fameOutlaw: 0, relations: [],
  },
  {
    id: "yang-zhi", family: "楊", given: "志", nickname: "青面獣", age: 35,
    apt: A(84, 55, 62, 40, 45), val: V(48, 72, 45, 30, 58, 48, 86, 35),
    skills: ["charge"], startNode: "kaifeng", faction: "court", fameOfficial: 40, fameOutlaw: 15, relations: [],
  },
  {
    id: "suo-chao", family: "索", given: "超", nickname: "急先鋒", age: 33,
    apt: A(82, 42, 60, 45, 35), val: V(45, 66, 42, 25, 86, 20, 70, 40),
    skills: ["charge"], startNode: "daming", faction: "court", fameOfficial: 48, fameOutlaw: 0, relations: [],
  },
  {
    id: "dong-ping", family: "董", given: "平", nickname: "双槍将", age: 32,
    apt: A(86, 58, 68, 60, 45), val: V(40, 60, 55, 35, 80, 30, 72, 45),
    skills: ["charge"], startNode: "jizhou", faction: "court", fameOfficial: 52, fameOutlaw: 5, relations: [],
  },
  {
    id: "wen-da", family: "聞", given: "達", age: 45,
    apt: A(74, 55, 70, 45, 35), val: V(35, 74, 35, 40, 50, 55, 60, 40),
    skills: [], startNode: "daming", faction: "court", fameOfficial: 42, fameOutlaw: 0, relations: [],
  },
  {
    id: "li-cheng", family: "李", given: "成", age: 43,
    apt: A(78, 52, 68, 42, 35), val: V(32, 72, 38, 42, 55, 50, 62, 38),
    skills: ["volley"], startNode: "daming", faction: "court", fameOfficial: 44, fameOutlaw: 0, relations: [],
  },
  {
    id: "song-jiang", family: "宋", given: "江", nickname: "呼保義", age: 36,
    apt: A(40, 76, 85, 96, 40), val: V(95, 60, 55, 10, 30, 60, 70, 82),
    skills: ["taunt"], startNode: "yuncheng", faction: "court", fameOfficial: 42, fameOutlaw: 72,
    relations: [
      { target: "chao-gai", affinity: 68, trust: 72 },
      { target: "zhu-tong", affinity: 60, trust: 65, bond: "colleague" },
      { target: "lei-heng", affinity: 55, trust: 60, bond: "colleague" },
    ],
  },
  {
    id: "zhu-tong", family: "朱", given: "仝", nickname: "美髯公", age: 38,
    apt: A(76, 55, 66, 62, 40), val: V(82, 68, 25, 15, 45, 55, 66, 70),
    skills: ["charge"], startNode: "yuncheng", faction: "court", fameOfficial: 46, fameOutlaw: 30,
    relations: [{ target: "lei-heng", affinity: 58, trust: 62, bond: "colleague" }],
  },
  {
    id: "lei-heng", family: "雷", given: "横", nickname: "挿翅虎", age: 35,
    apt: A(72, 48, 58, 45, 42), val: V(55, 60, 35, 45, 70, 35, 76, 60),
    skills: ["charge"], startNode: "yuncheng", faction: "court", fameOfficial: 40, fameOutlaw: 25, relations: [],
  },
  {
    id: "dai-zong", family: "戴", given: "宗", nickname: "神行太保", age: 39,
    apt: A(45, 62, 50, 55, 78), val: V(58, 55, 30, 30, 35, 65, 50, 60),
    skills: ["ambush"], startNode: "jiangzhou", faction: "court", fameOfficial: 38, fameOutlaw: 35,
    relations: [{ target: "li-kui", affinity: 52, trust: 50, bond: "colleague" }],
  },
  // ===== 祝家荘 =====
  {
    id: "zhu-chaofeng", family: "祝", given: "朝奉", age: 58,
    apt: A(40, 66, 62, 55, 35), val: V(25, 50, 60, 75, 45, 60, 78, 55),
    skills: [], startNode: "zhujiazhuang", faction: "zhu", fameOfficial: 35, fameOutlaw: 0,
    relations: [
      { target: "zhu-long", affinity: 70, trust: 75, bond: "kin" },
      { target: "zhu-biao", affinity: 70, trust: 75, bond: "kin" },
    ],
  },
  {
    id: "luan-tingyu", family: "欒", given: "廷玉", nickname: "鉄棒", age: 41,
    apt: A(85, 62, 72, 50, 45), val: V(45, 70, 35, 30, 50, 58, 72, 40),
    skills: ["charge", "ambush"], startNode: "zhujiazhuang", faction: "zhu", fameOfficial: 30, fameOutlaw: 20, relations: [],
  },
  {
    id: "zhu-long", family: "祝", given: "龍", age: 30,
    apt: A(76, 45, 55, 42, 35), val: V(30, 72, 40, 45, 68, 35, 74, 55),
    skills: ["charge"], startNode: "zhujiazhuang", faction: "zhu", fameOfficial: 20, fameOutlaw: 0,
    relations: [{ target: "zhu-biao", affinity: 65, trust: 70, bond: "kin" }],
  },
  {
    id: "zhu-biao", family: "祝", given: "彪", age: 27,
    apt: A(80, 42, 56, 45, 35), val: V(25, 70, 48, 45, 82, 25, 80, 50),
    skills: ["charge"], startNode: "zhujiazhuang", faction: "zhu", fameOfficial: 20, fameOutlaw: 0,
    relations: [{ target: "hu-sanniang", affinity: 45, trust: 40, bond: "kin" }],
  },
  {
    id: "hu-sanniang", family: "扈", given: "三娘", nickname: "一丈青", age: 24,
    apt: A(83, 55, 60, 65, 55), val: V(50, 58, 40, 25, 60, 50, 66, 55),
    skills: ["charge"], startNode: "zhujiazhuang", faction: "zhu", fameOfficial: 15, fameOutlaw: 25, relations: [],
  },
  // ===== 曾頭市 =====
  {
    id: "zeng-nong", family: "曾", given: "弄", age: 55,
    apt: A(42, 60, 60, 48, 35), val: V(20, 45, 62, 78, 50, 55, 75, 50),
    skills: [], startNode: "zengtou", faction: "zeng", fameOfficial: 30, fameOutlaw: 0, relations: [],
  },
  {
    id: "shi-wengong", family: "史", given: "文恭", age: 36,
    apt: A(93, 58, 66, 45, 50), val: V(20, 55, 65, 40, 75, 35, 85, 30),
    skills: ["charge", "volley"], startNode: "zengtou", faction: "zeng", fameOfficial: 25, fameOutlaw: 30,
    relations: [{ target: "zeng-nong", affinity: 50, trust: 55, bond: "colleague" }],
  },
  {
    id: "su-ding", family: "蘇", given: "定", age: 40,
    apt: A(72, 50, 58, 40, 38), val: V(30, 62, 35, 40, 55, 45, 60, 40),
    skills: ["volley"], startNode: "zengtou", faction: "zeng", fameOfficial: 18, fameOutlaw: 10, relations: [],
  },
  // ===== 梁山泊（旧勢力） =====
  {
    id: "wang-lun", family: "王", given: "倫", nickname: "白衣秀士", age: 42,
    apt: A(45, 56, 48, 40, 40), val: V(20, 40, 58, 60, 40, 70, 78, 25),
    skills: [], startNode: "liangshan", faction: "liangshan-band", fameOfficial: 5, fameOutlaw: 35,
    relations: [
      { target: "du-qian", affinity: 45, trust: 50, bond: "colleague" },
      { target: "song-wan", affinity: 45, trust: 50, bond: "colleague" },
    ],
  },
  {
    id: "du-qian", family: "杜", given: "遷", nickname: "摸着天", age: 38,
    apt: A(56, 35, 45, 35, 40), val: V(40, 55, 25, 45, 50, 45, 50, 45),
    skills: [], startNode: "liangshan", faction: "liangshan-band", fameOfficial: 0, fameOutlaw: 25, relations: [],
  },
  {
    id: "song-wan", family: "宋", given: "万", nickname: "雲裏金剛", age: 37,
    apt: A(55, 32, 44, 35, 38), val: V(42, 55, 22, 45, 52, 42, 48, 45),
    skills: [], startNode: "liangshan", faction: "liangshan-band", fameOfficial: 0, fameOutlaw: 24, relations: [],
  },
  {
    id: "zhu-gui", family: "朱", given: "貴", nickname: "旱地忽律", age: 40,
    apt: A(48, 62, 50, 52, 58), val: V(55, 60, 28, 40, 40, 62, 45, 55),
    skills: ["ambush"], startNode: "liangshan", faction: "liangshan-band", fameOfficial: 0, fameOutlaw: 30, relations: [],
  },
  // ===== 桃花山 =====
  {
    id: "li-zhong", family: "李", given: "忠", nickname: "打虎将", age: 38,
    apt: A(60, 40, 50, 42, 40), val: V(38, 52, 35, 55, 55, 45, 58, 42),
    skills: ["charge"], startNode: "taohua", faction: "taohua-band", fameOfficial: 0, fameOutlaw: 28,
    relations: [{ target: "lu-zhishen", affinity: 40, trust: 42 }],
  },
  {
    id: "zhou-tong", family: "周", given: "通", nickname: "小霸王", age: 30,
    apt: A(62, 35, 46, 38, 35), val: V(25, 50, 38, 70, 72, 30, 62, 40),
    skills: ["charge"], startNode: "taohua", faction: "taohua-band", fameOfficial: 0, fameOutlaw: 26,
    relations: [{ target: "li-zhong", affinity: 55, trust: 58, bond: "colleague" }],
  },
  // ===== 東渓村の義士たち =====
  {
    id: "chao-gai", family: "晁", given: "蓋", nickname: "托塔天王", age: 44,
    apt: A(78, 58, 80, 86, 45), val: V(86, 55, 62, 12, 55, 45, 74, 65),
    skills: ["charge"], startNode: "dongxi", fameOfficial: 15, fameOutlaw: 66,
    relations: [
      { target: "wu-yong", affinity: 80, trust: 85, bond: "sworn" },
      { target: "liu-tang", affinity: 62, trust: 65 },
    ],
  },
  {
    id: "wu-yong", family: "呉", given: "用", nickname: "智多星", age: 41,
    apt: A(35, 98, 72, 70, 72), val: V(70, 58, 58, 18, 40, 68, 55, 62),
    skills: ["fire", "taunt"], startNode: "dongxi", fameOfficial: 10, fameOutlaw: 58,
    relations: [{ target: "chao-gai", affinity: 80, trust: 85, bond: "sworn" }],
  },
  {
    id: "gongsun-sheng", family: "公孫", given: "勝", nickname: "入雲龍", age: 38,
    apt: A(50, 80, 55, 58, 96), val: V(65, 45, 30, 8, 35, 70, 40, 45),
    skills: ["sorcery", "fire"], startNode: "dongxi", fameOfficial: 5, fameOutlaw: 50, relations: [],
  },
  {
    id: "liu-tang", family: "劉", given: "唐", nickname: "赤髪鬼", age: 33,
    apt: A(75, 45, 52, 42, 40), val: V(60, 58, 35, 30, 76, 25, 60, 55),
    skills: ["charge"], startNode: "dongxi", fameOfficial: 0, fameOutlaw: 45, relations: [],
  },
  {
    id: "ruan-er", family: "阮", given: "小二", nickname: "立地太歳", age: 36,
    apt: A(70, 42, 55, 45, 55), val: V(62, 56, 30, 25, 72, 30, 58, 68),
    skills: ["charge"], startNode: "dongxi", fameOfficial: 0, fameOutlaw: 40,
    relations: [
      { target: "ruan-wu", affinity: 75, trust: 80, bond: "kin" },
      { target: "ruan-qi", affinity: 75, trust: 80, bond: "kin" },
    ],
  },
  {
    id: "ruan-wu", family: "阮", given: "小五", nickname: "短命二郎", age: 33,
    apt: A(72, 45, 52, 48, 55), val: V(60, 54, 32, 28, 75, 26, 60, 66),
    skills: ["charge"], startNode: "dongxi", fameOfficial: 0, fameOutlaw: 42,
    relations: [{ target: "ruan-qi", affinity: 75, trust: 80, bond: "kin" }],
  },
  {
    id: "ruan-qi", family: "阮", given: "小七", nickname: "活閻羅", age: 30,
    apt: A(71, 44, 50, 50, 56), val: V(62, 52, 34, 26, 78, 22, 58, 64),
    skills: ["charge", "ambush"], startNode: "dongxi", fameOfficial: 0, fameOutlaw: 44, relations: [],
  },
  // ===== 放浪の豪傑たち =====
  {
    id: "lu-zhishen", family: "魯", given: "智深", nickname: "花和尚", age: 37,
    apt: A(90, 48, 62, 60, 42), val: V(94, 42, 28, 5, 72, 20, 55, 68),
    skills: ["charge"], startNode: "kaifeng", fameOfficial: 10, fameOutlaw: 62,
    relations: [{ target: "lin-chong", affinity: 76, trust: 80, bond: "sworn" }],
  },
  {
    id: "wu-song", family: "武", given: "松", nickname: "行者", age: 29,
    apt: A(94, 52, 58, 55, 48), val: V(72, 50, 32, 12, 76, 38, 82, 58),
    skills: ["charge", "ambush"], startNode: "jizhou", fameOfficial: 20, fameOutlaw: 68, relations: [],
  },
  {
    id: "li-kui", family: "李", given: "逵", nickname: "黒旋風", age: 31,
    apt: A(88, 20, 42, 40, 30), val: V(58, 45, 20, 15, 98, 4, 55, 88),
    skills: ["charge"], startNode: "jiangzhou", fameOfficial: 0, fameOutlaw: 48,
    relations: [{ target: "song-jiang", affinity: 66, trust: 70 }],
  },
  {
    id: "shi-jin", family: "史", given: "進", nickname: "九紋龍", age: 24,
    apt: A(78, 45, 55, 52, 42), val: V(64, 48, 45, 20, 66, 28, 68, 55),
    skills: ["charge"], startNode: "changan", fameOfficial: 8, fameOutlaw: 40, relations: [],
  },
  {
    id: "shi-qian", family: "時", given: "遷", nickname: "鼓上蚤", age: 32,
    apt: A(40, 60, 35, 40, 86), val: V(45, 42, 25, 60, 40, 55, 30, 50),
    skills: ["ambush"], startNode: "youzhou", fameOfficial: 0, fameOutlaw: 38, relations: [],
  },
  {
    id: "yang-xiong", family: "楊", given: "雄", nickname: "病関索", age: 34,
    apt: A(74, 48, 56, 48, 42), val: V(52, 58, 30, 25, 58, 42, 72, 58),
    skills: ["charge"], startNode: "youzhou", fameOfficial: 25, fameOutlaw: 30,
    relations: [{ target: "shi-xiu", affinity: 72, trust: 78, bond: "sworn" }],
  },
  {
    id: "shi-xiu", family: "石", given: "秀", nickname: "拚命三郎", age: 28,
    apt: A(80, 64, 58, 50, 50), val: V(74, 55, 35, 18, 70, 35, 76, 60),
    skills: ["charge", "ambush"], startNode: "youzhou", fameOfficial: 5, fameOutlaw: 42,
    relations: [{ target: "yang-xiong", affinity: 72, trust: 78, bond: "sworn" }],
  },
  {
    id: "lu-junyi", family: "盧", given: "俊義", nickname: "玉麒麟", age: 39,
    apt: A(96, 62, 75, 58, 45), val: V(55, 65, 35, 45, 50, 55, 90, 45),
    skills: ["charge"], startNode: "daming", fameOfficial: 50, fameOutlaw: 35,
    relations: [{ target: "yan-qing", affinity: 78, trust: 85, bond: "master" }],
  },
  {
    id: "yan-qing", family: "燕", given: "青", nickname: "浪子", age: 25,
    apt: A(76, 70, 55, 80, 82), val: V(60, 94, 25, 15, 45, 60, 55, 92),
    skills: ["volley", "ambush"], startNode: "daming", fameOfficial: 10, fameOutlaw: 45,
    relations: [{ target: "lu-junyi", affinity: 82, trust: 90, bond: "master" }],
  },
  // ===== 東京の権臣 =====
  {
    id: "gao-qiu", family: "高", given: "俅", nickname: "太尉", age: 48,
    apt: A(30, 55, 50, 45, 30), val: V(3, 55, 70, 95, 50, 60, 90, 20),
    skills: [], startNode: "kaifeng", faction: "court", fameOfficial: 85, fameOutlaw: 0,
    relations: [{ target: "gao-lian", affinity: 60, trust: 65, bond: "kin" }],
  },
  // ===== 方臘（江南） =====
  {
    id: "fang-la", family: "方", given: "臘", nickname: "聖公", age: 42,
    apt: A(60, 72, 82, 88, 55), val: V(45, 40, 95, 40, 65, 40, 80, 50),
    skills: ["taunt"], startNode: "hangzhou", faction: "fangla", fameOfficial: 0, fameOutlaw: 62,
    relations: [
      { target: "shi-bao", affinity: 60, trust: 68, bond: "colleague" },
      { target: "deng-yuanjue", affinity: 58, trust: 65, bond: "colleague" },
    ],
  },
  {
    id: "shi-bao", family: "石", given: "宝", nickname: "南離大将軍", age: 38,
    apt: A(92, 55, 68, 45, 40), val: V(25, 75, 50, 35, 75, 40, 70, 35),
    skills: ["charge"], startNode: "hangzhou", faction: "fangla", fameOfficial: 0, fameOutlaw: 40, relations: [],
  },
  {
    id: "deng-yuanjue", family: "鄧", given: "元覚", nickname: "宝光如来", age: 40,
    apt: A(90, 45, 60, 50, 40), val: V(40, 70, 40, 20, 80, 25, 65, 40),
    skills: ["charge"], startNode: "hangzhou", faction: "fangla", fameOfficial: 0, fameOutlaw: 38, relations: [],
  },
  {
    id: "pang-wanchun", family: "龐", given: "万春", nickname: "小養由基", age: 28,
    apt: A(82, 55, 60, 42, 50), val: V(25, 68, 40, 30, 60, 45, 60, 35),
    skills: ["volley"], startNode: "muzhou", faction: "fangla", fameOfficial: 0, fameOutlaw: 32, relations: [],
  },
  {
    id: "wang-yin", family: "王", given: "寅", nickname: "転山飛", age: 41,
    apt: A(84, 70, 68, 48, 55), val: V(30, 72, 55, 35, 55, 50, 65, 35),
    skills: ["charge", "ambush"], startNode: "shezhou", faction: "fangla", fameOfficial: 0, fameOutlaw: 30, relations: [],
  },
  // ===== 田虎（河東） =====
  {
    id: "tian-hu", family: "田", given: "虎", nickname: "晋王", age: 39,
    apt: A(70, 50, 70, 72, 40), val: V(20, 35, 90, 70, 75, 30, 75, 40),
    skills: ["charge"], startNode: "weisheng", faction: "tianhu", fameOfficial: 0, fameOutlaw: 50, relations: [],
  },
  {
    id: "qiao-daoqing", family: "喬", given: "道清", nickname: "幻魔君", age: 35,
    apt: A(55, 75, 55, 50, 95), val: V(35, 60, 45, 25, 50, 55, 50, 40),
    skills: ["sorcery", "fire"], startNode: "weisheng", faction: "tianhu", fameOfficial: 0, fameOutlaw: 42,
    relations: [{ target: "tian-hu", affinity: 50, trust: 58, bond: "colleague" }],
  },
  {
    id: "sun-an", family: "孫", given: "安", nickname: "勇烈将軍", age: 33,
    apt: A(88, 55, 65, 50, 42), val: V(55, 70, 40, 20, 60, 40, 68, 45),
    skills: ["charge"], startNode: "longde", faction: "tianhu", fameOfficial: 0, fameOutlaw: 35, relations: [],
  },
  // ===== 王慶（淮西） =====
  {
    id: "wang-qing", family: "王", given: "慶", nickname: "楚王", age: 37,
    apt: A(68, 55, 65, 65, 45), val: V(15, 30, 85, 75, 70, 35, 70, 35),
    skills: ["charge"], startNode: "fangzhou", faction: "wangqing", fameOfficial: 0, fameOutlaw: 45, relations: [],
  },
  {
    id: "du-xue", family: "杜", given: "壆", nickname: "険道神", age: 36,
    apt: A(90, 45, 60, 40, 40), val: V(25, 70, 40, 30, 75, 30, 65, 35),
    skills: ["charge"], startNode: "fangzhou", faction: "wangqing", fameOfficial: 0, fameOutlaw: 34, relations: [],
  },
  {
    id: "feng-tai", family: "酆", given: "泰", nickname: "神駒子", age: 32,
    apt: A(80, 35, 52, 38, 35), val: V(20, 60, 35, 35, 85, 20, 60, 30),
    skills: ["charge"], startNode: "junzhou", faction: "wangqing", fameOfficial: 0, fameOutlaw: 30, relations: [],
  },
];
