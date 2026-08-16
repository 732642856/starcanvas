// ============================================================================
// characterAstrologyService.ts — 紫微斗数角色设计引擎
// 基于 iztro (MIT, 3.8k⭐)，将星盘数据转换为角色性格描述
// ============================================================================
"use client"

interface FunctionalStar {
  name: string
  brightness?: string
  mutagen?: string
}

interface FunctionalPalace {
  name: string
  majorStars: FunctionalStar[]
  minorStars: FunctionalStar[]
  decadal?: { range?: number[] }
}

interface FunctionalAstrolabe {
  palaces: FunctionalPalace[]
  chineseDate: string
  palace: (name: string) => FunctionalPalace | undefined
}

// ── 输入数据 ────────────────────────────────────────────────────────────────

export interface BirthInput {
  dateStr: string       // "2000-8-16"
  timeIndex: number     // 0~12（时辰索引）
  gender: "男" | "女"
  dateType: "solar" | "lunar"
  isLeapMonth?: boolean
  language?: string     // "zh-CN" | "zh-TW" | "en-US"
}

// ── 输出类型 ────────────────────────────────────────────────────────────────

export interface CharacterPersonality {
  /** 核心性格（去重后前6项） */
  coreTraits: string[]
  /** 优势 */
  strength: string[]
  /** 劣势 */
  weakness: string[]
  /** 天赋特长 */
  talent: string[]
  /** 感情风格 */
  relationshipStyle: string
  /** 事业风格 */
  careerStyle: string
  /** 财富观 */
  wealthStyle: string
  /** 人生维度贡献 */
  lifeDomains: Array<{
    domain: string
    description: string
  }>
  /** 完整性格摘要 */
  personalitySummary: string
  /** 原始四柱八字 */
  chineseDate: string
  /** 原始星盘宫位摘要 */
  palaceSummary: Array<{
    name: string
    majorStars: string
    minorStars: string
    decadalAge: string
  }>
  /** 错误信息（如有） */
  error?: string
}

// ── 宫位→人生维度映射 ─────────────────────────────────────────────────────

const PALACE_TO_LIFE_DOMAIN: Record<string, string> = {
  "命宫": "核心性格、外在形象",
  "兄弟": "手足关系、社交能力",
  "夫妻": "感情观、伴侣关系",
  "子女": "创造力、子女缘",
  "财帛": "财富观、赚钱方式",
  "疾厄": "健康、抗压能力",
  "迁移": "对外应变、人生机遇",
  "仆役": "人际关系、下属朋友",
  "官禄": "事业成就、社会地位",
  "田宅": "家庭背景、物质基础",
  "福德": "精神世界、福气享乐",
  "父母": "家族渊源、父母影响",
}

// ── 主星→核心性格特质映射 ────────────────────────────────────────────────

const MAJOR_STAR_TRAITS: Record<string, string[]> = {
  "紫微": ["帝王气质", "领导力强", "好面子", "稳重"],
  "天机": ["聪明灵活", "善谋略", "多变", "有智慧"],
  "太阳": ["热情开朗", "光明磊落", "好施舍", "急躁"],
  "武曲": ["刚毅果决", "执行力强", "财运佳", "严肃"],
  "天同": ["温和善良", "有福气", "懒散", "人际关系好"],
  "廉贞": ["次桃花", "有才华", "好胜心强", "处世精明"],
  "天府": ["稳重保守", "有领导力", "重享受", "守成"],
  "太阴": ["温柔内敛", "感性", "有艺术气质", "细腻"],
  "贪狼": ["主桃花", "多才多艺", "欲望强", "社交能力强"],
  "巨门": ["口才好", "有思想", "易招是非", "有研究精神"],
  "天相": ["温和有礼", "有正义感", "协调能力强", "安定"],
  "天梁": ["有靠山", "有慈悲心", "稳重", "有权威感"],
  "七杀": ["有魄力", "勇于突破", "独立", "爱冒险"],
  "破军": ["敢冲敢闯", "有破坏力", "有创意", "不安于现状"],
}

// ── 辅星→附加特质映射 ────────────────────────────────────────────────────

const MINOR_STAR_TRAITS: Record<string, string[]> = {
  "文昌": ["有文采", "有学识", "聪明"],
  "文曲": ["口才佳", "有才艺", "浪漫"],
  "左辅": ["有助力", "人缘好", "稳重"],
  "右弼": ["贵人运", "有恒心", "温和"],
  "天魁": ["有贵人", "受赏识", "好运"],
  "天钺": ["暗中助力", "有提拔", "吉运"],
  "禄存": ["有财源", "保守", "福气"],
  "天马": ["奔波", "变动", "积极"],
  "擎羊": ["有冲劲", "易有争执", "急躁"],
  "陀罗": ["拖延", "有耐力", "反复"],
  "火星": ["有爆发力", "急躁", "有冲劲"],
  "铃星": ["有心机", "有智谋", "暗动"],
  "地空": ["有创意", "不切实际", "变化"],
  "地劫": ["失去", "有损失", "波动"],
}

// ── 四化→性格影响映射 ─────────────────────────────────────────────────────

const MUTAGEN_TRAITS: Record<string, string> = {
  "禄": "此项能力突出、福气好、容易获得",
  "权": "掌控欲强、有主见、在此领域有权威",
  "科": "有才华、好名声、有教养",
  "忌": "有欠缺、执着点、在此领域需努力",
}

// ── 星曜亮度→强度映射 ────────────────────────────────────────────────────

const BRIGHTNESS_LEVEL: Record<string, number> = {
  "庙": 5, "旺": 4, "得": 3, "利": 2, "平": 1, "不": 0, "陷": -1,
}

// ── 事业风格映射 ──────────────────────────────────────────────────────────

function describeCareer(stars: string[]): string {
  if (stars.includes("紫微") || stars.includes("天府")) return "管理型，适合领导岗位"
  if (stars.includes("武曲")) return "实干型，适合金融/技术类"
  if (stars.includes("天机")) return "策划型，适合咨询/教育/媒体"
  if (stars.includes("贪狼")) return "开创型，适合商务/娱乐/创意"
  if (stars.includes("七杀") || stars.includes("破军")) return "开拓型，适合创业/军警/外科"
  if (stars.includes("天相")) return "稳定型，适合法务/公共服务"
  if (stars.includes("天梁")) return "助人型，适合医疗/慈善/教育"
  if (stars.includes("太阳")) return "外放型，适合销售/演艺/公益"
  if (stars.includes("巨门")) return "言说型，适合法律/教育/咨询"
  return "综合型，适应力强"
}

// ── 感情风格映射 ──────────────────────────────────────────────────────────

function describeRelationship(stars: string[]): string {
  if (stars.includes("贪狼")) return "热烈多情，需要新鲜感"
  if (stars.includes("廉贞")) return "专一深情，但占有欲强"
  if (stars.includes("太阴")) return "温柔细腻，重感情陪伴"
  if (stars.includes("天同")) return "宽容随和，注重和谐"
  if (stars.includes("七杀")) return "热烈直接，敢爱敢恨"
  if (stars.includes("紫微")) return "主导型，需要对方服从"
  return "平稳发展，注重实际"
}

// ── 财富观映射 ────────────────────────────────────────────────────────────

function describeWealth(stars: string[]): string {
  if (stars.includes("武曲")) return "正财运佳，善于理财"
  if (stars.includes("天府")) return "守成稳重，有积蓄"
  if (stars.includes("太阴")) return "细水长流型，精打细算"
  if (stars.includes("禄存")) return "财源稳定，有储蓄习惯"
  if (stars.includes("破军")) return "大进大出，敢于投资"
  if (stars.includes("贪狼")) return "偏财运好，但花销大"
  return "收支平衡，趋于稳健"
}

// ── 核心转换函数 ──────────────────────────────────────────────────────────

/**
 * 将紫微斗数星盘转换为角色性格描述
 */
export function astrolabeToCharacterProfile(astrolabe: FunctionalAstrolabe): CharacterPersonality {
  const coreTraits: string[] = []
  const strength: string[] = []
  const weakness: string[] = []
  const talent: string[] = []
  const lifeDomains: CharacterPersonality["lifeDomains"] = []

  // 1. 遍历十二宫，收集特质
  for (const palace of astrolabe.palaces) {
    const domainLabel = PALACE_TO_LIFE_DOMAIN[palace.name]
    const majorNames = palace.majorStars.map((s: {name: string}) => s.name)
    const minorNames = palace.minorStars.map((s: {name: string}) => s.name)
    const allStarNames = [...majorNames, ...minorNames]
    const mutagens = palace.majorStars
      .concat(palace.minorStars)
      .filter((s) => s.mutagen)
      .map((s) => s.mutagen!)

    // 主星特质
    for (const starName of majorNames) {
      const star = palace.majorStars.find((s: {name: string; brightness?: string}) => s.name === starName)
      const traits = MAJOR_STAR_TRAITS[starName]
      if (!traits) continue
      const intensity = BRIGHTNESS_LEVEL[star?.brightness ?? ""] ?? 1

      if (intensity >= 3) {
        coreTraits.push(...traits)
        strength.push(...traits)
      } else if (intensity <= 0) {
        weakness.push(...traits.map((t: string) => `${t}不足`))
      } else {
        coreTraits.push(...traits)
      }
    }

    // 辅星特质
    for (const starName of minorNames) {
      const traits = MINOR_STAR_TRAITS[starName]
      if (traits) coreTraits.push(...traits)
    }

    // 四化 → 天赋
    for (const m of mutagens) {
      const trait = MUTAGEN_TRAITS[m]
      if (trait) talent.push(`${palace.name}: ${trait}`)
    }

    // 人生维度描述
    const domainDesc = allStarNames.length > 0
      ? `主星: ${majorNames.join("、") || "无"}, 辅星: ${minorNames.join("、") || "无"}`
      : "无主星"
    if (domainLabel) {
      lifeDomains.push({
        domain: `${palace.name}（${domainLabel}）`,
        description: domainDesc,
      })
    }
  }

  // 2. 官禄宫 → 事业风格
  const careerPalace = astrolabe.palace("官禄")
  const careerStyle = careerPalace
    ? describeCareer(careerPalace.majorStars.map((s: {name: string}) => s.name))
    : "综合型，适应力强"

  // 3. 夫妻宫 → 感情风格
  const marriagePalace = astrolabe.palace("夫妻")
  const relationshipStyle = marriagePalace
    ? describeRelationship(marriagePalace.majorStars.map((s: {name: string}) => s.name))
    : "平稳发展，注重实际"

  // 4. 财帛宫 → 财富观
  const wealthPalace = astrolabe.palace("财帛")
  const wealthStyle = wealthPalace
    ? describeWealth(wealthPalace.majorStars.map((s: {name: string}) => s.name))
    : "收支平衡，趋于稳健"

  // 5. 宫位摘要
  const palaceSummary = astrolabe.palaces.map((p: {name: string; majorStars: {name: string}[]; minorStars: {name: string}[]; decadal?: {range?: number[]}}) => ({
    name: p.name,
    majorStars: p.majorStars.map((s: {name: string}) => s.name).join("、") || "无",
    minorStars: p.minorStars.map((s: {name: string}) => s.name).join("、") || "无",
    decadalAge: `${p.decadal?.range?.[0] ?? 0}~${p.decadal?.range?.[1] ?? 0}岁`,
  }))

  // 6. 汇总
  const uniqueTraits = [...new Set(coreTraits)]
  const uniqueStrength = [...new Set(strength)]
  const uniqueWeakness = [...new Set(weakness)]
  const uniqueTalent = [...new Set(talent)]

  return {
    coreTraits: uniqueTraits.slice(0, 6),
    strength: uniqueStrength.slice(0, 4),
    weakness: uniqueWeakness.slice(0, 3),
    talent: uniqueTalent.slice(0, 4),
    relationshipStyle,
    careerStyle,
    wealthStyle,
    lifeDomains: lifeDomains.slice(0, 6),
    chineseDate: astrolabe.chineseDate,
    palaceSummary: palaceSummary.slice(0, 6),
    personalitySummary: `这是一个${uniqueTraits.slice(0, 6).join("、")}的人。${careerStyle}。${relationshipStyle}。${wealthStyle}。`,
  }
}

// ── 排盘 + 转换 ────────────────────────────────────────────────────────────

/**
 * 根据出生信息排盘并生成角色性格
 */
export async function generateCharacterFromBirth(input: BirthInput): Promise<{
  astrolabe?: FunctionalAstrolabe
  profile?: CharacterPersonality
  error?: string
}> {
  try {
    if (!input.dateStr || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(input.dateStr)) {
      return { error: "日期格式错误，请使用 YYYY-M-D 格式" }
    }
    if (input.timeIndex < 0 || input.timeIndex > 12) {
      return { error: "时辰序号必须在 0~12 之间" }
    }
    if (!["男", "女"].includes(input.gender)) {
      return { error: '性别必须为 "男" 或 "女"' }
    }

    const { astro } = await import("iztro")
    const astrolabe = input.dateType === "solar"
      ? astro.bySolar(input.dateStr, input.timeIndex, input.gender, true, (input.language ?? "zh-CN") as any)
      : astro.byLunar(input.dateStr, input.timeIndex, input.gender, input.isLeapMonth ?? false, true, (input.language ?? "zh-CN") as any)

    const functionalAstrolabe = astrolabe as FunctionalAstrolabe
    const profile = astrolabeToCharacterProfile(functionalAstrolabe)
    return { astrolabe: functionalAstrolabe, profile }
  } catch (e: any) {
    return { error: e.message || "排盘失败，请检查输入的出生信息" }
  }
}
