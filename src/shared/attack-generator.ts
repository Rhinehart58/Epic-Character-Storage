import type { CharacterAttack, CharacterStats, GeneratedAttackResult } from './character-types'

type KeywordTemplate = {
  keyword: string
  aliases: string[]
  names: string[]
  damageType: string
  range: string
  dicePool: string[]
  tag: string
  note: string
}

type DndClassProfile = {
  className: string
  primaryAbility: keyof CharacterStats
  preferredKeywords: string[]
  actionNames: string[]
  rangeBias: 'melee' | 'ranged' | 'mixed'
}

const KEYWORD_TEMPLATES: KeywordTemplate[] = [
  {
    keyword: 'fire',
    aliases: ['flame', 'burn', 'ember', 'inferno', 'heat'],
    names: ['Cinder Lance', 'Inferno Arc', 'Ashfall Strike'],
    damageType: 'fire',
    range: '60 ft',
    dicePool: ['1d8', '2d6', '2d8'],
    tag: 'elemental',
    note: 'Fire keyword matched: abilities emphasize burning burst damage.'
  },
  {
    keyword: 'ice',
    aliases: ['frost', 'glacial', 'snow', 'winter', 'cold'],
    names: ['Frost Needle', 'Glacial Crash', 'Winter Fang'],
    damageType: 'cold',
    range: '45 ft',
    dicePool: ['1d8', '2d6', '2d8'],
    tag: 'elemental',
    note: 'Ice keyword matched: abilities include chill-themed control attacks.'
  },
  {
    keyword: 'shadow',
    aliases: ['dark', 'umbral', 'night', 'stealth', 'void'],
    names: ['Umbral Slice', 'Nightfang', 'Gloom Rend'],
    damageType: 'necrotic',
    range: 'Melee/20 ft',
    dicePool: ['1d10', '2d6', '2d10'],
    tag: 'stealth',
    note: 'Shadow keyword matched: attacks skew toward precision and ambush.'
  },
  {
    keyword: 'holy',
    aliases: ['radiant', 'light', 'divine', 'sacred', 'sun'],
    names: ['Radiant Smite', 'Dawn Spear', 'Halo Sever'],
    damageType: 'radiant',
    range: 'Melee/30 ft',
    dicePool: ['1d8', '2d8', '3d6'],
    tag: 'divine',
    note: 'Holy keyword matched: attacks favor radiant damage and smite patterns.'
  },
  {
    keyword: 'beast',
    aliases: ['feral', 'claw', 'fang', 'wild', 'predator'],
    names: ['Predator Pounce', 'Rending Claw', 'Packbreaker Bite'],
    damageType: 'slashing',
    range: 'Melee',
    dicePool: ['1d10', '2d6', '2d8'],
    tag: 'feral',
    note: 'Beast keyword matched: attacks emphasize close-range physical pressure.'
  },
  {
    keyword: 'arcane',
    aliases: ['magic', 'spell', 'mystic', 'rune', 'aether'],
    names: ['Aether Bolt', 'Rune Cascade', 'Spellfracture'],
    damageType: 'force',
    range: '90 ft',
    dicePool: ['1d8', '2d6', '3d4'],
    tag: 'magic',
    note: 'Arcane keyword matched: attacks balance utility and force damage.'
  },
  {
    keyword: 'poison',
    aliases: ['venom', 'toxic', 'blight', 'acid', 'corrode'],
    names: ['Venom Barb', 'Toxic Spiral', 'Serpent Kiss'],
    damageType: 'poison',
    range: '30 ft',
    dicePool: ['1d6', '2d6', '2d8'],
    tag: 'debilitating',
    note: 'Poison keyword matched: attacks represent attrition and status pressure.'
  },
  {
    keyword: 'lightning',
    aliases: ['storm', 'thunder', 'volt', 'electric', 'shock'],
    names: ['Storm Javelin', 'Volt Lash', 'Thunder Needle'],
    damageType: 'lightning',
    range: '80 ft',
    dicePool: ['1d8', '2d6', '2d8'],
    tag: 'burst',
    note: 'Lightning keyword matched: attacks are high-tempo burst options.'
  }
]

const FALLBACK_TEMPLATE: KeywordTemplate = {
  keyword: 'martial',
  aliases: ['blade', 'weapon', 'strike', 'warrior', 'fighter'],
  names: ['Heroic Slash', 'Steel Impact', 'Battle Flourish'],
  damageType: 'slashing',
  range: 'Melee',
  dicePool: ['1d8', '1d10', '2d6'],
  tag: 'weapon',
  note: 'No direct keyword match found. Generated balanced martial attacks.'
}

const DND_CLASS_PROFILES: DndClassProfile[] = [
  {
    className: 'barbarian',
    primaryAbility: 'str',
    preferredKeywords: ['beast', 'fire'],
    actionNames: ['Raging Cleave', 'Reckless Charge', 'Brutal Swing'],
    rangeBias: 'melee'
  },
  {
    className: 'bard',
    primaryAbility: 'cha',
    preferredKeywords: ['arcane', 'holy'],
    actionNames: ['Cutting Verse', 'Dissonant Chord', 'Inspiring Crescendo'],
    rangeBias: 'mixed'
  },
  {
    className: 'cleric',
    primaryAbility: 'wis',
    preferredKeywords: ['holy', 'lightning'],
    actionNames: ['Sacred Brand', 'Divine Rebuke', 'Prayer Lance'],
    rangeBias: 'mixed'
  },
  {
    className: 'druid',
    primaryAbility: 'wis',
    preferredKeywords: ['beast', 'ice', 'lightning'],
    actionNames: ['Wildthorn Strike', 'Moonroot Burst', 'Tempest Bloom'],
    rangeBias: 'mixed'
  },
  {
    className: 'fighter',
    primaryAbility: 'str',
    preferredKeywords: ['beast', 'fire'],
    actionNames: ['Precision Slash', 'Battle Surge', 'Guardbreaker'],
    rangeBias: 'melee'
  },
  {
    className: 'monk',
    primaryAbility: 'dex',
    preferredKeywords: ['lightning', 'shadow'],
    actionNames: ['Flurry Palm', 'Step of Wind Strike', 'Stunning Flow'],
    rangeBias: 'melee'
  },
  {
    className: 'paladin',
    primaryAbility: 'cha',
    preferredKeywords: ['holy', 'fire'],
    actionNames: ['Smite Arc', 'Vowbreaker Cut', 'Radiant Judgment'],
    rangeBias: 'melee'
  },
  {
    className: 'ranger',
    primaryAbility: 'dex',
    preferredKeywords: ['beast', 'poison', 'ice'],
    actionNames: ['Hunter Volley', 'Marked Shot', 'Skirmish Fang'],
    rangeBias: 'ranged'
  },
  {
    className: 'rogue',
    primaryAbility: 'dex',
    preferredKeywords: ['shadow', 'poison'],
    actionNames: ['Sneak Pierce', 'Shadow Feint', 'Ambush Rend'],
    rangeBias: 'mixed'
  },
  {
    className: 'sorcerer',
    primaryAbility: 'cha',
    preferredKeywords: ['fire', 'lightning', 'arcane'],
    actionNames: ['Metamagic Lance', 'Chaos Spark', 'Arc Pulse'],
    rangeBias: 'ranged'
  },
  {
    className: 'warlock',
    primaryAbility: 'cha',
    preferredKeywords: ['shadow', 'arcane', 'poison'],
    actionNames: ['Hex Bolt', 'Eldritch Spear', 'Pact Rupture'],
    rangeBias: 'ranged'
  },
  {
    className: 'wizard',
    primaryAbility: 'int',
    preferredKeywords: ['arcane', 'ice', 'fire', 'lightning'],
    actionNames: ['Arcane Missile', 'Runic Barrage', 'Spellfract Cascade'],
    rangeBias: 'ranged'
  }
]

function seededValue(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function pick<T>(items: T[], seed: string): T {
  const idx = Math.floor(seededValue(seed) * items.length)
  return items[Math.min(idx, items.length - 1)]
}

function scoreModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

function primaryAbility(stats: CharacterStats): keyof CharacterStats {
  const abilityKeys: (keyof CharacterStats)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  return abilityKeys.reduce((best, next) => (stats[next] > stats[best] ? next : best), 'str')
}

function levelDiceIndex(level: number): number {
  if (level >= 14) return 2
  if (level >= 7) return 1
  return 0
}

function proficiencyBonus(level: number): number {
  if (level >= 17) return 6
  if (level >= 13) return 5
  if (level >= 9) return 4
  if (level >= 5) return 3
  return 2
}

function normalizeKeywords(raw: string[]): string[] {
  const parts = raw
    .map((k) => k.trim().toLowerCase())
    .flatMap((k) => k.split(/[,\s/|+-]+/g))
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i)
  return parts
}

function scoreTemplateForKeywords(template: KeywordTemplate, keywords: string[]): number {
  const terms = [template.keyword, ...template.aliases]
  let score = 0
  for (const keyword of keywords) {
    for (const term of terms) {
      if (keyword === term) {
        score += term === template.keyword ? 8 : 6
        continue
      }
      if (keyword.includes(term) || term.includes(keyword)) {
        score += term === template.keyword ? 4 : 3
      }
    }
  }
  return score
}

function sortTemplatesByRelevance(keywords: string[], archetype: string): {
  template: KeywordTemplate
  score: number
}[] {
  const archetypeTokens = normalizeKeywords([archetype])
  return KEYWORD_TEMPLATES
    .map((template) => {
      const keywordScore = scoreTemplateForKeywords(template, keywords)
      const archetypeScore = scoreTemplateForKeywords(template, archetypeTokens) > 0 ? 2 : 0
      return { template, score: keywordScore + archetypeScore }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
}

function detectDndClass(archetype: string): DndClassProfile | null {
  const token = archetype.trim().toLowerCase()
  if (!token) return null
  return DND_CLASS_PROFILES.find((profile) => token.includes(profile.className)) ?? null
}

export function generateAttacksFromKeywords(input: {
  characterId: string
  characterName: string
  archetype: string
  level: number
  keywords: string[]
  stats: CharacterStats
}): GeneratedAttackResult {
  const keywords = normalizeKeywords(input.keywords)
  const dndClass = detectDndClass(input.archetype)
  const seededKeywords = dndClass
    ? normalizeKeywords([...keywords, ...dndClass.preferredKeywords, dndClass.className])
    : keywords
  const ranked = sortTemplatesByRelevance(seededKeywords, input.archetype)
  const templates = (ranked.length > 0 ? ranked.map((entry) => entry.template) : [FALLBACK_TEMPLATE]).slice(0, 3)
  const matchedKeywords = ranked.map((entry) => entry.template.keyword).slice(0, 3)

  const primary = dndClass?.primaryAbility ?? primaryAbility(input.stats)
  const prof = proficiencyBonus(input.level)
  const hitBonus = Math.max(2, scoreModifier(input.stats[primary]) + prof)
  const diceIdx = levelDiceIndex(input.level)

  const attacks: CharacterAttack[] = templates.map((template, idx) => {
    const nameSeed = `${input.characterId}:${template.keyword}:name:${idx}`
    const attackName = dndClass ? pick(dndClass.actionNames, `${nameSeed}:class`) : pick(template.names, nameSeed)
    const dice = template.dicePool[Math.min(diceIdx, template.dicePool.length - 1)]
    const id = `${input.characterId}-${template.keyword}-${idx}-${Math.floor(seededValue(nameSeed) * 9999)}`
    const range =
      dndClass?.rangeBias === 'melee'
        ? 'Melee'
        : dndClass?.rangeBias === 'ranged'
          ? template.range.includes('Melee')
            ? '60 ft'
            : template.range
          : template.range

    return {
      id,
      name: attackName,
      hitBonus: hitBonus + idx,
      damageDice: dice,
      damageType: template.damageType,
      range,
      tags: [template.tag, input.archetype.toLowerCase(), template.keyword, dndClass ? 'dnd' : 'ttrpg'],
      description: dndClass
        ? `${attackName} uses ${dndClass.className} training with ${template.damageType} damage (${range.toLowerCase()}).`
        : `${attackName} channels ${template.damageType} energy in a ${range.toLowerCase()} attack.`,
      source: 'generated'
    }
  })

  const generationNotes = [
    ...templates.map((template) => template.note),
    ...(ranked.length > 0
      ? [`Relevance order: ${ranked.slice(0, 3).map((entry) => `${entry.template.keyword}(${entry.score})`).join(', ')}.`]
      : ['No keyword relevance scores found, fallback template used.']),
    ...(dndClass
      ? [
          `DnD class profile detected: ${dndClass.className}.`,
          `Using SRD-style proficiency progression (+${prof}) with ${primary.toUpperCase()}.`,
          `Spell/attack baseline used: 8 + proficiency + ability modifier for DC-style tuning.`
        ]
      : []),
    `Primary ability: ${primary.toUpperCase()} (${input.stats[primary]}).`,
    `Level scaling applied at level ${input.level}.`
  ]

  return { attacks, matchedKeywords, generationNotes }
}

