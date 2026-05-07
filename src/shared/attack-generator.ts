import type { CharacterAttack, CharacterStats, GeneratedAttackResult } from './character-types'

// Damage types follow D&D 5e SRD: 3 physical (slashing/piercing/bludgeoning), 5
// elemental (acid/fire/cold/lightning/thunder), and 5 magical (force/radiant/
// necrotic/psychic/poison). Each keyword maps to one damage type and a pool of
// thematic name fragments. We then cross every matched element with a distinct
// "attack archetype" (melee, reach, ranged, spell, AoE, etc.) so a single
// keyword still produces several genuinely different attacks.

type Element = {
  id: string
  damageType: string
  aliases: string[]
  nouns: string[]
  adjectives: string[]
  /** When this element is matched, the verb pool from the archetype is filtered
   * by tone — e.g. "fire" tilts to aggressive verbs, "shadow" to subtle ones. */
  tone: 'aggressive' | 'arcane' | 'precise' | 'savage' | 'sacred'
}

const ELEMENTS: Element[] = [
  {
    id: 'fire',
    damageType: 'fire',
    aliases: ['flame', 'flames', 'burn', 'burning', 'ember', 'embers', 'inferno', 'pyre', 'lava', 'magma', 'heat', 'sun', 'solar'],
    nouns: ['Ember', 'Pyre', 'Cinder', 'Inferno', 'Flame', 'Magma', 'Brand', 'Forge'],
    adjectives: ['Searing', 'Blazing', 'Smoldering', 'Volcanic', 'Kindled'],
    tone: 'aggressive'
  },
  {
    id: 'ice',
    damageType: 'cold',
    aliases: ['frost', 'frozen', 'glacial', 'snow', 'winter', 'cold', 'rime', 'permafrost', 'tundra'],
    nouns: ['Frost', 'Glacier', 'Rime', 'Hailstone', 'Aurora', 'Tundra', 'Spire'],
    adjectives: ['Frigid', 'Glacial', 'Numbing', 'Hoarfrost', 'Subzero'],
    tone: 'precise'
  },
  {
    id: 'lightning',
    damageType: 'lightning',
    aliases: ['storm', 'volt', 'electric', 'shock', 'spark', 'arc', 'static', 'tempest'],
    nouns: ['Storm', 'Volt', 'Bolt', 'Surge', 'Tempest', 'Arc', 'Spark'],
    adjectives: ['Crackling', 'Voltaic', 'Chained', 'Skyborn', 'Galvanic'],
    tone: 'aggressive'
  },
  {
    id: 'thunder',
    damageType: 'thunder',
    aliases: ['boom', 'concussive', 'sonic', 'sound', 'roar', 'shockwave'],
    nouns: ['Thunder', 'Roar', 'Boom', 'Echo', 'Crash'],
    adjectives: ['Booming', 'Concussive', 'Deafening', 'Resounding'],
    tone: 'aggressive'
  },
  {
    id: 'shadow',
    damageType: 'necrotic',
    aliases: ['dark', 'darkness', 'umbral', 'night', 'void', 'gloom', 'shade', 'wraith', 'undead', 'death'],
    nouns: ['Umbra', 'Gloom', 'Wraith', 'Veil', 'Hush', 'Shade'],
    adjectives: ['Whispering', 'Hollow', 'Withering', 'Soulrot', 'Faded'],
    tone: 'precise'
  },
  {
    id: 'holy',
    damageType: 'radiant',
    aliases: ['radiant', 'light', 'divine', 'sacred', 'sun', 'dawn', 'angelic', 'celestial'],
    nouns: ['Halo', 'Dawn', 'Sanctus', 'Aegis', 'Lance', 'Verdict'],
    adjectives: ['Radiant', 'Sacred', 'Hallowed', 'Searing', 'Sunlit'],
    tone: 'sacred'
  },
  {
    id: 'arcane',
    damageType: 'force',
    aliases: ['magic', 'spell', 'mystic', 'rune', 'aether', 'arcane', 'eldritch', 'sigil'],
    nouns: ['Aether', 'Rune', 'Sigil', 'Ward', 'Glyph', 'Circle'],
    adjectives: ['Runic', 'Aetheric', 'Woven', 'Spellbound', 'Resonant'],
    tone: 'arcane'
  },
  {
    id: 'poison',
    damageType: 'poison',
    aliases: ['venom', 'venomous', 'toxic', 'blight', 'plague', 'serpent', 'fang'],
    nouns: ['Venom', 'Fang', 'Bile', 'Wyrm', 'Thorn'],
    adjectives: ['Venomous', 'Festering', 'Wilting', 'Septic'],
    tone: 'savage'
  },
  {
    id: 'acid',
    damageType: 'acid',
    aliases: ['corrosive', 'caustic', 'melt', 'corrode', 'dissolve'],
    nouns: ['Bile', 'Sludge', 'Etcher', 'Vitriol'],
    adjectives: ['Corrosive', 'Caustic', 'Melting', 'Searing'],
    tone: 'savage'
  },
  {
    id: 'psychic',
    damageType: 'psychic',
    aliases: ['mind', 'mental', 'telepathy', 'psionic', 'thought'],
    nouns: ['Mind', 'Thought', 'Will', 'Whisper', 'Echo'],
    adjectives: ['Mind-Rending', 'Piercing', 'Intrusive', 'Unraveling'],
    tone: 'arcane'
  },
  {
    id: 'beast',
    damageType: 'slashing',
    aliases: ['feral', 'claw', 'fang', 'wild', 'predator', 'hunt', 'pack', 'wolf', 'tiger'],
    nouns: ['Claw', 'Fang', 'Pounce', 'Maul', 'Pack', 'Sinew'],
    adjectives: ['Feral', 'Rending', 'Snarling', 'Predatory'],
    tone: 'savage'
  },
  {
    id: 'blade',
    damageType: 'slashing',
    aliases: ['sword', 'edge', 'cutting', 'sharp', 'sabre', 'katana', 'scimitar'],
    nouns: ['Edge', 'Slash', 'Steel', 'Cut', 'Slice'],
    adjectives: ['Whetted', 'Razor', 'Parrying', 'Bright'],
    tone: 'precise'
  },
  {
    id: 'pierce',
    damageType: 'piercing',
    aliases: ['arrow', 'bow', 'spear', 'lance', 'dart', 'bolt', 'pin'],
    nouns: ['Volley', 'Arrow', 'Lance', 'Pike', 'Quill'],
    adjectives: ['Piercing', 'Drilled', 'Skewering', 'Steady'],
    tone: 'precise'
  },
  {
    id: 'crush',
    damageType: 'bludgeoning',
    aliases: ['hammer', 'maul', 'mace', 'fist', 'club', 'smash', 'pound', 'stone'],
    nouns: ['Maul', 'Hammer', 'Stoneblow', 'Crusher', 'Pummel'],
    adjectives: ['Crushing', 'Pounding', 'Rumbling', 'Thunderous'],
    tone: 'aggressive'
  }
]

const DEFAULT_ELEMENT: Element = ELEMENTS.find((entry) => entry.id === 'blade')!

type ArchetypeId = 'cleave' | 'jab' | 'reach' | 'thrown' | 'shot' | 'spell' | 'aoe' | 'subtle'

type AttackArchetype = {
  id: ArchetypeId
  label: string
  range: string
  /** dice for [low, mid, high] tier — picked by character level */
  diceTier: [string, string, string]
  /** modifier on the base hit bonus */
  hitMod: number
  /** which ability score to favor when computing hit/dmg bonus */
  ability: keyof CharacterStats
  verbs: string[]
  flavor: string
  tag: string
}

const ARCHETYPES: AttackArchetype[] = [
  {
    id: 'cleave',
    label: 'Heavy melee',
    range: 'Melee 5 ft, two-handed',
    diceTier: ['1d10', '2d6', '2d10'],
    hitMod: 0,
    ability: 'str',
    verbs: ['Cleave', 'Crush', 'Sunder', 'Smite', 'Rend', 'Pulverize'],
    flavor: 'a wide, committed swing that punches through guards',
    tag: 'heavy'
  },
  {
    id: 'jab',
    label: 'Light melee, finesse',
    range: 'Melee 5 ft, finesse',
    diceTier: ['1d6', '1d8', '2d6'],
    hitMod: 1,
    ability: 'dex',
    verbs: ['Jab', 'Slash', 'Riposte', 'Flicker', 'Snap', 'Cut'],
    flavor: 'a fast, repeatable strike that sets up follow-ups',
    tag: 'finesse'
  },
  {
    id: 'reach',
    label: 'Reach',
    range: 'Melee 10 ft, reach',
    diceTier: ['1d8', '2d6', '2d8'],
    hitMod: 0,
    ability: 'str',
    verbs: ['Sweep', 'Hook', 'Lash', 'Thrust', 'Scythe', 'Cleave'],
    flavor: 'a long-haft attack that keeps enemies at distance',
    tag: 'reach'
  },
  {
    id: 'thrown',
    label: 'Thrown',
    range: 'Thrown 20/60 ft',
    diceTier: ['1d6', '1d8', '2d6'],
    hitMod: 0,
    ability: 'str',
    verbs: ['Hurl', 'Toss', 'Cast', 'Loose', 'Fling'],
    flavor: 'launched from the hand and recovered between swings',
    tag: 'thrown'
  },
  {
    id: 'shot',
    label: 'Ranged shot',
    range: 'Ranged 80/320 ft',
    diceTier: ['1d8', '2d6', '2d8'],
    hitMod: 1,
    ability: 'dex',
    verbs: ['Volley', 'Snipe', 'Pierce', 'Loose', 'Shoot', 'Strike'],
    flavor: 'a precise distance attack from braced footing',
    tag: 'ranged'
  },
  {
    id: 'spell',
    label: 'Spell bolt',
    range: 'Spell 60 ft',
    diceTier: ['1d10', '2d8', '3d8'],
    hitMod: 0,
    ability: 'int',
    verbs: ['Bolt', 'Lance', 'Beam', 'Fling', 'Pierce'],
    flavor: 'a focused projectile of channelled energy',
    tag: 'spell'
  },
  {
    id: 'aoe',
    label: 'Burst (cone)',
    range: 'AoE 15 ft cone — Dex save half',
    diceTier: ['2d6', '3d6', '4d6'],
    hitMod: -1,
    ability: 'cha',
    verbs: ['Wave', 'Blast', 'Surge', 'Pulse', 'Erupt', 'Roar'],
    flavor: 'a sweeping wave that catches everyone in front of you',
    tag: 'aoe'
  },
  {
    id: 'subtle',
    label: 'Subtle / debilitate',
    range: 'Touch or 30 ft',
    diceTier: ['1d6', '2d4', '2d6'],
    hitMod: 0,
    ability: 'wis',
    verbs: ['Whisper', 'Curse', 'Mark', 'Hex', 'Bind', 'Wither'],
    flavor: 'imposes a lingering condition or marks the target',
    tag: 'control'
  }
]

type DndClassProfile = {
  className: string
  primaryAbility: keyof CharacterStats
  rangeBias: 'melee' | 'ranged' | 'mixed' | 'spell'
  preferredArchetypes: ArchetypeId[]
  preferredKeywords: string[]
}

const DND_CLASS_PROFILES: DndClassProfile[] = [
  { className: 'barbarian', primaryAbility: 'str', rangeBias: 'melee', preferredArchetypes: ['cleave', 'reach', 'thrown'], preferredKeywords: ['beast', 'crush'] },
  { className: 'bard', primaryAbility: 'cha', rangeBias: 'mixed', preferredArchetypes: ['spell', 'subtle', 'jab'], preferredKeywords: ['psychic', 'arcane'] },
  { className: 'cleric', primaryAbility: 'wis', rangeBias: 'mixed', preferredArchetypes: ['cleave', 'spell', 'subtle'], preferredKeywords: ['holy', 'thunder'] },
  { className: 'druid', primaryAbility: 'wis', rangeBias: 'mixed', preferredArchetypes: ['spell', 'aoe', 'jab'], preferredKeywords: ['beast', 'ice', 'lightning'] },
  { className: 'fighter', primaryAbility: 'str', rangeBias: 'melee', preferredArchetypes: ['cleave', 'reach', 'shot'], preferredKeywords: ['blade', 'pierce', 'crush'] },
  { className: 'monk', primaryAbility: 'dex', rangeBias: 'melee', preferredArchetypes: ['jab', 'reach', 'thrown'], preferredKeywords: ['lightning', 'shadow'] },
  { className: 'paladin', primaryAbility: 'cha', rangeBias: 'melee', preferredArchetypes: ['cleave', 'spell', 'jab'], preferredKeywords: ['holy', 'fire'] },
  { className: 'ranger', primaryAbility: 'dex', rangeBias: 'ranged', preferredArchetypes: ['shot', 'jab', 'subtle'], preferredKeywords: ['beast', 'poison', 'pierce'] },
  { className: 'rogue', primaryAbility: 'dex', rangeBias: 'mixed', preferredArchetypes: ['jab', 'shot', 'subtle'], preferredKeywords: ['shadow', 'poison', 'blade'] },
  { className: 'sorcerer', primaryAbility: 'cha', rangeBias: 'spell', preferredArchetypes: ['spell', 'aoe', 'subtle'], preferredKeywords: ['fire', 'lightning', 'arcane'] },
  { className: 'warlock', primaryAbility: 'cha', rangeBias: 'spell', preferredArchetypes: ['spell', 'subtle', 'aoe'], preferredKeywords: ['shadow', 'arcane', 'psychic'] },
  { className: 'wizard', primaryAbility: 'int', rangeBias: 'spell', preferredArchetypes: ['spell', 'aoe', 'subtle'], preferredKeywords: ['arcane', 'ice', 'fire', 'lightning'] }
]

function seededValue(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function pickFromSeed<T>(items: T[], seed: string): T {
  if (items.length === 0) throw new Error('pickFromSeed: empty list')
  const idx = Math.floor(seededValue(seed) * items.length)
  return items[Math.min(idx, items.length - 1)]
}

function scoreModifier(score: number): number {
  return Math.floor((score - 10) / 2)
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
  return raw
    .map((k) => k.trim().toLowerCase())
    .flatMap((k) => k.split(/[,\s/|+-]+/g))
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i)
}

/** Same token rules as attack generation — use for UI parsing so commas, spaces, slashes all behave consistently. */
export function normalizeKeywordInput(raw: string): string[] {
  return normalizeKeywords([raw])
}

function matchElements(keywords: string[]): Element[] {
  const matched: Element[] = []
  for (const keyword of keywords) {
    const found = ELEMENTS.find((element) => {
      if (element.id === keyword) return true
      if (element.aliases.includes(keyword)) return true
      // partial / substring matches
      return element.aliases.some((alias) => keyword.includes(alias) || alias.includes(keyword))
    })
    if (found && !matched.find((m) => m.id === found.id)) matched.push(found)
  }
  return matched
}

function detectDndClass(archetype: string): DndClassProfile | null {
  const token = archetype.trim().toLowerCase()
  if (!token) return null
  return DND_CLASS_PROFILES.find((profile) => token.includes(profile.className)) ?? null
}

function bestAbility(stats: CharacterStats): keyof CharacterStats {
  const abilities: (keyof CharacterStats)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  return abilities.reduce((best, next) => (stats[next] > stats[best] ? next : best), 'str')
}

type KeywordAttackPlan = {
  pairs: { archetype: AttackArchetype; element: Element }[]
  matchedElements: Element[]
  elementPool: Element[]
  /** Where the element pool came from — drives user-facing hints. */
  elementSource: 'keywords' | 'archetype' | 'default'
  dndProfile: DndClassProfile | null
  baseAbility: keyof CharacterStats
  baseProf: number
  diceIdx: number
}

function buildKeywordAttackPlan(input: {
  archetype: string
  level: number
  keywords: string[]
  stats: CharacterStats
}): KeywordAttackPlan {
  const keywords = normalizeKeywords(input.keywords)
  const matchedElements = matchElements(keywords)
  const dndProfile = detectDndClass(input.archetype)

  let elementSource: 'keywords' | 'archetype' | 'default' = 'keywords'
  let elementPool: Element[] = matchedElements
  if (elementPool.length === 0) {
    const archetypeMatches = matchElements(normalizeKeywords([input.archetype]))
    if (archetypeMatches.length > 0) {
      elementPool = archetypeMatches
      elementSource = 'archetype'
    } else {
      elementPool = [DEFAULT_ELEMENT]
      elementSource = 'default'
    }
  }

  const preferred = new Set<ArchetypeId>(dndProfile?.preferredArchetypes ?? [])
  const archetypePool: AttackArchetype[] = [...ARCHETYPES]
  archetypePool.sort((a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id)))

  const pairs: { archetype: AttackArchetype; element: Element }[] = []
  for (const arch of archetypePool) {
    for (const element of elementPool) {
      pairs.push({ archetype: arch, element })
    }
  }

  const baseAbility = dndProfile?.primaryAbility ?? bestAbility(input.stats)
  const baseProf = proficiencyBonus(input.level)
  const diceIdx = levelDiceIndex(input.level)

  return { pairs, matchedElements, elementPool, elementSource, dndProfile, baseAbility, baseProf, diceIdx }
}

/** Suggested starter keywords for quick-create DnD characters (matches generator class bias). */
export function starterKeywordsForDndArchetype(archetypeLabel: string): string[] {
  const p = detectDndClass(archetypeLabel)
  return p ? [...p.preferredKeywords] : []
}

export function previewKeywordAttackBatch(input: {
  archetype: string
  level: number
  keywords: string[]
  stats: CharacterStats
}): {
  parsedTokenCount: number
  attackCount: number
  matchedElementIds: string[]
  effectiveElementIds: string[]
  usedArchetypeFallback: boolean
  dndClassName: string | null
  lines: string[]
} {
  const parsedTokenCount = normalizeKeywords(input.keywords).length
  const plan = buildKeywordAttackPlan(input)
  const matchedElementIds = plan.matchedElements.map((e) => e.id)
  const effectiveElementIds = plan.elementPool.map((e) => e.id)
  const usedArchetypeFallback = plan.elementSource === 'archetype'

  const lines: string[] = []
  lines.push(`${plan.pairs.length} attack rows will be generated (${plan.elementPool.length} element flavor(s) × ${ARCHETYPES.length} archetypes).`)
  if (matchedElementIds.length > 0) {
    lines.push(`Matched elements: ${matchedElementIds.join(', ')}.`)
  } else if (usedArchetypeFallback) {
    lines.push(`No keyword matched an element — inferring from class/archetype (${effectiveElementIds.join(', ')}).`)
  } else {
    lines.push('No element match — using default martial flavor (blade).')
  }
  if (plan.dndProfile) {
    lines.push(`DnD class detected: ${plan.dndProfile.className} (primary ${plan.dndProfile.primaryAbility.toUpperCase()}).`)
  }
  if (plan.pairs.length >= 40) {
    lines.push('Large batch — you will be asked to confirm before generating.')
  }

  return {
    parsedTokenCount,
    attackCount: plan.pairs.length,
    matchedElementIds,
    effectiveElementIds,
    usedArchetypeFallback,
    dndClassName: plan.dndProfile?.className ?? null,
    lines
  }
}

/**
 * Build N attacks where each attack is a unique (archetype × element) pair.
 * Variety guarantees:
 *   - Different archetypes ⇒ different ranges and dice baselines.
 *   - Different elements ⇒ different damage types and name fragments.
 *   - With a single matched element we still vary archetypes so attacks
 *     diverge on range/dice/ability.
 */
export function generateAttacksFromKeywords(input: {
  characterId: string
  characterName: string
  archetype: string
  level: number
  keywords: string[]
  stats: CharacterStats
  /** Disambiguates IDs when appending multiple generated batches to one sheet */
  batchId?: string
}): GeneratedAttackResult {
  const batch = (input.batchId ?? '').trim() || '0'
  const seedRoot = `${input.characterId}|${input.characterName}|${input.level}|${batch}`
  const plan = buildKeywordAttackPlan({
    archetype: input.archetype,
    level: input.level,
    keywords: input.keywords,
    stats: input.stats
  })
  const { pairs, matchedElements, dndProfile, baseAbility, baseProf, diceIdx } = plan

  const attacks: CharacterAttack[] = pairs.map((pair, idx) => {
    const { archetype, element } = pair
    const ability = archetype.ability
    const abilityScore = input.stats[ability] ?? input.stats[baseAbility]
    const hitBonus = Math.max(2, scoreModifier(abilityScore) + baseProf + archetype.hitMod)
    const dice = archetype.diceTier[Math.min(diceIdx, archetype.diceTier.length - 1)]

    const nameSeed = `${seedRoot}|${archetype.id}|${element.id}|${idx}`
    const verb = pickFromSeed(archetype.verbs, `${nameSeed}|verb`)
    const noun = pickFromSeed(element.nouns, `${nameSeed}|noun`)
    const adjective = pickFromSeed(element.adjectives, `${nameSeed}|adj`)
    // Two name patterns for variety — alternate per index.
    const name = idx % 2 === 0 ? `${noun} ${verb}` : `${adjective} ${verb}`

    const id = `${input.characterId}-${batch}-${archetype.id}-${element.id}-${idx}`

    const description =
      `${name} — ${archetype.label.toLowerCase()} dealing ${dice} ${element.damageType}. ` +
      `${archetype.flavor.charAt(0).toUpperCase()}${archetype.flavor.slice(1)}.`

    return {
      id,
      name,
      hitBonus,
      damageDice: dice,
      damageType: element.damageType,
      range: archetype.range,
      tags: [archetype.tag, element.id, ability, dndProfile ? 'dnd' : 'ttrpg'],
      description,
      source: 'generated'
    }
  })

  const matchedKeywords = matchedElements.map((element) => element.id)
  const generationNotes: string[] = []
  if (matchedElements.length > 0) {
    generationNotes.push(
      `Matched elements: ${matchedElements.map((el) => `${el.id}→${el.damageType}`).join(', ')}.`
    )
  } else {
    generationNotes.push('No element keywords matched. Using default martial flavor.')
  }
  generationNotes.push(
    `Generated ${attacks.length} distinct attacks across ${pairs.length} archetype/element pairs.`
  )
  if (dndProfile) {
    generationNotes.push(
      `DnD class detected: ${dndProfile.className}. Bias: ${dndProfile.rangeBias}. Primary ability: ${dndProfile.primaryAbility.toUpperCase()}.`
    )
    generationNotes.push(`Proficiency bonus +${baseProf} at level ${input.level}.`)
  } else {
    generationNotes.push(
      `TTRPG mode. Best ability: ${baseAbility.toUpperCase()} (${input.stats[baseAbility]}).`
    )
  }
  generationNotes.push(
    `Each attack rolls hit with the archetype's ability mod (${pairs.map((p) => p.archetype.ability.toUpperCase()).join(', ')}).`
  )

  return { attacks, matchedKeywords, generationNotes }
}
