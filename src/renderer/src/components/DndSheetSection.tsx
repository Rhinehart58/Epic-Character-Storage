import type { Dispatch, JSX, SetStateAction } from 'react'
import type { CharacterSaveInput } from '@shared/character-types'
import { cn } from '../lib/utils'

export type ManualAttackDraft = {
  name: string
  hitBonus: string
  damageDice: string
  damageType: string
  range: string
  description: string
}

export function emptyManualAttackDraft(): ManualAttackDraft {
  return {
    name: '',
    hitBonus: '0',
    damageDice: '1d8',
    damageType: 'slashing',
    range: 'Melee 5 ft',
    description: ''
  }
}

type ColorSchemePack = {
  primary: string
  secondary: string
}

type EditableCharacter = Omit<CharacterSaveInput, 'ownerAccountId' | 'campaignId'>

const DND_CLASSES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard'
] as const

const DND_SKILLS: { name: string; key: keyof CharacterSaveInput['stats'] }[] = [
  { name: 'Acrobatics', key: 'dex' },
  { name: 'Animal Handling', key: 'wis' },
  { name: 'Arcana', key: 'int' },
  { name: 'Athletics', key: 'str' },
  { name: 'Deception', key: 'cha' },
  { name: 'History', key: 'int' },
  { name: 'Insight', key: 'wis' },
  { name: 'Intimidation', key: 'cha' },
  { name: 'Investigation', key: 'int' },
  { name: 'Medicine', key: 'wis' },
  { name: 'Nature', key: 'int' },
  { name: 'Perception', key: 'wis' },
  { name: 'Performance', key: 'cha' },
  { name: 'Persuasion', key: 'cha' },
  { name: 'Religion', key: 'int' },
  { name: 'Sleight of Hand', key: 'dex' },
  { name: 'Stealth', key: 'dex' },
  { name: 'Survival', key: 'wis' }
]

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

function formatSigned(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function ecsPortraitSrc(relative: string): string {
  const rel = relative.trim()
  if (!rel) return ''
  return `ecs-portrait://${rel
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

type Props = {
  cardClass: string
  scheme: ColorSchemePack
  editor: EditableCharacter
  setEditor: Dispatch<SetStateAction<EditableCharacter>>
  keywordText: string
  setKeywordText: (value: string) => void
  onGenerateAttacks: () => void
  onRemoveAttack: (attackId: string) => void
  onPickPortrait: () => void
  onClearPortrait: () => void
  dndClass: string
  dndProf: number
  dndSpellAttack: number
  dndSpellSaveDc: number
  dndCastingAbility: keyof CharacterSaveInput['stats']
  showAdvancedCharacterFields: boolean
  setShowAdvancedCharacterFields: Dispatch<SetStateAction<boolean>>
  manualAttackDraft: ManualAttackDraft
  setManualAttackDraft: Dispatch<SetStateAction<ManualAttackDraft>>
  onAddManualAttack: () => void
  /** Live summary from `previewKeywordAttackBatch` (keywords → attack count / elements). */
  keywordIntelLines?: string[]
}

export function DndSheetSection(props: Props): JSX.Element {
  const {
    cardClass,
    scheme,
    editor,
    setEditor,
    keywordText,
    setKeywordText,
    onGenerateAttacks,
    onRemoveAttack,
    onAddManualAttack,
    manualAttackDraft,
    setManualAttackDraft,
    onPickPortrait,
    onClearPortrait,
    dndClass,
    dndProf,
    dndSpellAttack,
    dndSpellSaveDc,
    dndCastingAbility,
    showAdvancedCharacterFields,
    setShowAdvancedCharacterFields,
    keywordIntelLines = []
  } = props

  return (
    <section className={cn('relative overflow-x-clip overflow-y-visible rounded-2xl p-5 shadow-sm motion-safe:animate-ecs-fade-up', cardClass)}>
      <div className="ecs-diagonal-strip pointer-events-none absolute inset-0 opacity-[0.65]" />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">DnD character sheet</h2>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Original digital-style layout inspired by common virtual tabletop tools — not affiliated with or endorsed by Wizards of the Coast or D&D Beyond.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onPickPortrait()}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.98]',
                scheme.primary
              )}
            >
              Portrait…
            </button>
            <button
              type="button"
              onClick={() => void onClearPortrait()}
              className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
            >
              Clear portrait
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="flex flex-col items-center gap-3 lg:col-span-3">
            <div className="ecs-portrait-hex relative h-40 w-36 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300 shadow-inner dark:from-slate-700 dark:to-slate-900">
              {editor.portraitRelativePath ? (
                <img alt="" src={ecsPortraitSrc(editor.portraitRelativePath)} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  No portrait
                </div>
              )}
            </div>
            <input
              value={editor.name}
              onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Character name"
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            />
            <input
              value={editor.factionGroup}
              onChange={(event) => setEditor((prev) => ({ ...prev, factionGroup: event.target.value }))}
              placeholder="Background / faction (optional)"
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            />
          </div>

          <div className="space-y-3 lg:col-span-5">
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={dndClass}
                onChange={(event) => setEditor((prev) => ({ ...prev, archetype: event.target.value }))}
                className="rounded-lg border border-slate-300 bg-transparent px-2 py-2 text-sm dark:border-slate-700"
              >
                {DND_CLASSES.map((klass) => (
                  <option key={klass} value={klass}>
                    {klass}
                  </option>
                ))}
              </select>
              <input
                value={editor.dedicatedEssence}
                onChange={(event) => setEditor((prev) => ({ ...prev, dedicatedEssence: event.target.value }))}
                placeholder="Subclass / oath / patron"
                className="rounded-lg border border-slate-300 bg-transparent px-2 py-2 text-sm dark:border-slate-700"
              />
              <input
                type="number"
                min={1}
                max={20}
                value={editor.level}
                onChange={(event) =>
                  setEditor((prev) => ({
                    ...prev,
                    level: Math.max(1, Math.min(20, Number(event.target.value || 1)))
                  }))
                }
                className="rounded-lg border border-slate-300 bg-transparent px-2 py-2 text-sm dark:border-slate-700"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((key) => (
                <div
                  key={key}
                  className="ecs-stat-wedge border border-slate-200 bg-white/90 px-1 py-2 text-center dark:border-slate-700 dark:bg-slate-950/50"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {key}
                  </div>
                  <div className="text-lg font-bold leading-none">{formatSigned(abilityMod(editor.stats[key]))}</div>
                  <input
                    type="number"
                    value={editor.stats[key]}
                    onChange={(event) =>
                      setEditor((prev) => ({
                        ...prev,
                        stats: { ...prev.stats, [key]: Number(event.target.value || 0) }
                      }))
                    }
                    className="mt-1 w-full border-t border-slate-200 bg-transparent pt-1 text-center text-xs dark:border-slate-700"
                  />
                </div>
              ))}
            </div>

            <div className="ecs-shape-soft max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Skills (ability modifier)
              </div>
              <div className="mt-2 grid gap-x-3 gap-y-1 text-[11px] sm:grid-cols-2">
                {DND_SKILLS.map((sk) => (
                  <div
                    key={sk.name}
                    className="flex justify-between gap-2 border-b border-slate-100 pb-0.5 dark:border-slate-800"
                  >
                    <span className="truncate text-slate-600 dark:text-slate-300">{sk.name}</span>
                    <span className="font-mono font-semibold">{formatSigned(abilityMod(editor.stats[sk.key]))}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                When proficient, add your proficiency bonus (+{dndProf}) on top of the modifier shown.
              </p>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="ecs-shape-soft rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Armor class</div>
                <input
                  type="number"
                  value={editor.armorCurrent}
                  onChange={(event) =>
                    setEditor((prev) => {
                      const ac = Number(event.target.value || 0)
                      return {
                        ...prev,
                        armorCurrent: ac,
                        armorMax: Math.max(prev.armorMax, ac),
                        stats: { ...prev.stats, ac }
                      }
                    })
                  }
                  className="mt-1 w-full bg-transparent text-xl font-bold"
                />
              </label>
              <label className="ecs-shape-soft rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Initiative</div>
                <input
                  type="number"
                  value={editor.stats.initiative}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      stats: { ...prev.stats, initiative: Number(event.target.value || 0) }
                    }))
                  }
                  className="mt-1 w-full bg-transparent text-xl font-bold"
                />
              </label>
              <label className="ecs-shape-soft rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">HP current</div>
                <input
                  type="number"
                  value={editor.hpCurrent}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      hpCurrent: Number(event.target.value || 0)
                    }))
                  }
                  className="mt-1 w-full bg-transparent text-xl font-bold"
                />
              </label>
              <label className="ecs-shape-soft rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">HP max</div>
                <input
                  type="number"
                  value={editor.hpMax}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      hpMax: Number(event.target.value || 0)
                    }))
                  }
                  className="mt-1 w-full bg-transparent text-xl font-bold"
                />
              </label>
            </div>

            <div className="ecs-shape-soft rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Proficiency</div>
                  <div className="text-base font-semibold">+{dndProf}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Passive perception</div>
                  <div className="text-base font-semibold">{10 + abilityMod(editor.stats.wis)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Spell attack ({dndCastingAbility})</div>
                  <div className="text-base font-semibold">+{dndSpellAttack}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Spell save DC</div>
                  <div className="text-base font-semibold">{dndSpellSaveDc}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Attacks & spells
              </div>
              <input
                value={keywordText}
                onChange={(event) => setKeywordText(event.target.value)}
                placeholder="Keywords: fire, thunder, divine..."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => void onGenerateAttacks()}
                className={cn('mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white', scheme.secondary)}
              >
                Generate from keywords
              </button>
              {keywordIntelLines.length > 0 ? (
                <ul
                  className="mt-2 space-y-0.5 rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 py-2 text-[11px] leading-snug text-slate-600 dark:border-slate-600/80 dark:bg-slate-900/40 dark:text-slate-300"
                  aria-live="polite"
                >
                  {keywordIntelLines.map((line, idx) => (
                    <li key={`${idx}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-300/80 p-2 dark:border-slate-600/80">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Add attack manually
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={manualAttackDraft.name}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, name: event.target.value }))}
                    placeholder="Attack name"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.hitBonus}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, hitBonus: event.target.value }))}
                    placeholder="Hit +"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.damageDice}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, damageDice: event.target.value }))}
                    placeholder="e.g. 1d8+3"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.damageType}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, damageType: event.target.value }))}
                    placeholder="Damage type"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.range}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, range: event.target.value }))}
                    placeholder="Range"
                    className="sm:col-span-2 w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.description}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, description: event.target.value }))}
                    placeholder="Short description (optional)"
                    className="sm:col-span-2 w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onAddManualAttack()}
                  className="w-full rounded-lg border border-slate-400 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-800/60"
                >
                  Add to list
                </button>
              </div>
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {editor.attacks.map((attack) => (
                  <li
                    key={attack.id}
                    className="ecs-shape-soft border border-slate-200 p-2 text-xs dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1 font-semibold">
                          <span>{attack.name}</span>
                          {attack.source === 'generated' ? (
                            <span className="rounded bg-amber-200/70 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                              Gen
                            </span>
                          ) : attack.source === 'manual' ? (
                            <span className="rounded bg-sky-200/70 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-sky-900 dark:bg-sky-500/20 dark:text-sky-100">
                              Manual
                            </span>
                          ) : null}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {attack.damageDice} {attack.damageType} | +{attack.hitBonus} | {attack.range}
                        </div>
                        {attack.description ? (
                          <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                            {attack.description}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveAttack(attack.id)}
                        title="Remove this attack"
                        aria-label={`Remove ${attack.name}`}
                        className="shrink-0 rounded border border-rose-300 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <label className="block text-xs">
          Notes
          <textarea
            value={editor.notes}
            onChange={(event) => setEditor((prev) => ({ ...prev, notes: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
          />
        </label>

        <button
          type="button"
          onClick={() => setShowAdvancedCharacterFields((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
        >
          {showAdvancedCharacterFields ? 'Hide bracket-sheet extras' : 'Show bracket-sheet extras'}
        </button>
        {showAdvancedCharacterFields ? (
          <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-600">
            <textarea
              value={editor.traitDescription}
              onChange={(event) => setEditor((prev) => ({ ...prev, traitDescription: event.target.value }))}
              placeholder="Traits / features"
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            />
            <textarea
              value={editor.epicMoveDescription}
              onChange={(event) => setEditor((prev) => ({ ...prev, epicMoveDescription: event.target.value }))}
              placeholder="Big cooldown abilities"
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            />
            <textarea
              value={editor.monolithDescription}
              onChange={(event) => setEditor((prev) => ({ ...prev, monolithDescription: event.target.value }))}
              placeholder="One-shot heroic moments"
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
