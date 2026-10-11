import { startTransition, useEffect, useState } from 'react'

import type { SkinInspection, SkinSummary } from '@/bridge/generated'
import { safeSettings } from '@/features/recorder/safeSettings'
import { chooseSkin } from '@/features/skins/chooseSkin'
import { isFolderSkin } from '@/features/skins/isFolderSkin'
import { pendingInstall } from '@/features/skins/pendingInstall'
import { skins } from '@/features/skins/skins'
import { skinStore } from '@/features/skins/skinStore'
import { errorText } from '@/shared/utils/errorText'

import { skinMessages } from './skinMessages'

export type UseSkinActionsResult = {
  /** The chosen skin folder (a skin being made), if that's what's in use. */
  readonly folderInUse: string | null
  /** Whether an installed skin is the one in use. */
  readonly isChosen: (skin: SkinSummary) => boolean
  /** The current skin's warnings. */
  readonly warnings: readonly string[]
  /** Changes when the installed skins do (see useSkinList). */
  readonly listRevision: number
  /** The new skin's name while naming one from the template. */
  readonly naming: string | undefined
  readonly setNaming: (name: string | undefined) => void
  /** An installed skin's id, a folder, or null for Default. */
  readonly choose: (skin: string | null) => Promise<void>
  readonly chooseFolder: () => Promise<void>
  /** Picks a .sskin and shows its install card. */
  readonly pickAndInspect: () => Promise<void>
  readonly install: (inspection: SkinInspection) => Promise<void>
  readonly remove: (skin: SkinSummary) => Promise<void>
  /** Writes the folder in use as a .sskin. */
  readonly packageFolder: (dir: string) => Promise<void>
  /** A new skin folder from the template, in a folder the user picks. */
  readonly create: (name: string) => Promise<void>
}

/**
 * Choosing, installing, removing, making and packaging skins for Settings ›
 * Skin. Notes and errors go to skinMessages.
 */
export const useSkinActions = (): UseSkinActionsResult => {
  const [chosen, setChosen] = useState<string | null>(
    () => safeSettings()?.skin ?? null,
  )
  const [warnings, setWarnings] = useState<string[]>(
    () => skinStore.get()?.warnings ?? [],
  )
  const [listRevision, setListRevision] = useState(0)
  const [naming, setNaming] = useState<string>()

  useEffect(
    () =>
      skinStore.subscribe(skin => {
        setWarnings(skin.warnings)
        setChosen(safeSettings()?.skin ?? null)
      }),
    [],
  )

  // In a transition, so the grid keeps showing while the list reloads.
  const refresh = () => {
    startTransition(() => {
      setListRevision(r => r + 1)
    })
  }
  const setNote = (text?: string) => {
    skinMessages.set({ note: text })
  }
  const run = async (action: () => Promise<void>) => {
    skinMessages.set({})
    try {
      await action()
    } catch (e) {
      skinMessages.set({ error: errorText(e) })
    }
  }
  const choose = (skin: string | null) =>
    run(async () => {
      await chooseSkin(skin)
      setChosen(skin)
    })

  const folderInUse = isFolderSkin(chosen) ? chosen : null

  return {
    folderInUse,
    isChosen: s =>
      !folderInUse &&
      (s.builtin ? !chosen || chosen === s.id : chosen === s.id),
    warnings,
    listRevision,
    naming,
    setNaming,
    choose,
    chooseFolder: async () => {
      const dir = await skins.pickFolder()
      if (dir) {
        await choose(dir)
      }
    },
    pickAndInspect: async () => {
      const path = await skins.pickArchive()
      if (path) {
        await run(async () => {
          pendingInstall.set({ inspection: await skins.inspect(path) })
        })
      }
    },
    install: inspection =>
      run(async () => {
        pendingInstall.set(null)
        const installed = await skins.install(inspection.path)
        refresh()
        await chooseSkin(installed.id)
        setChosen(installed.id)
        setNote(`Installed ${installed.name}.`)
      }),
    remove: skin =>
      run(async () => {
        if (chosen === skin.id) {
          await chooseSkin(null)
          setChosen(null)
        }
        await skins.remove(skin.id)
        refresh()
      }),
    packageFolder: dir =>
      run(async () => {
        const name = skinStore.get()?.name ?? 'Skin'
        const out = await skins.pickSaveLocation(`${name}.sskin`)
        if (!out) {
          return
        }
        const packaged = await skins.package(dir, out)
        setNote(`Packaged ${packaged.name} as ${packaged.dir}.`)
      }),
    create: name =>
      run(async () => {
        const parent = await skins.pickAnyFolder(
          'Where should the new skin go?',
          'Create Skin Here',
        )
        if (!parent) {
          return
        }
        setNaming(undefined)
        const dir = await skins.create(parent, name)
        await chooseSkin(dir)
        setChosen(dir)
        setNote(
          `Made ${name} from the Default skin. Edit its files and the app ` +
            'updates as you save. README.md in the folder explains the format.',
        )
      }),
  }
}
