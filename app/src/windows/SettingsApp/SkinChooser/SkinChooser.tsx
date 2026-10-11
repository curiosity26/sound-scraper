import React, { type FC, useSyncExternalStore } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'

import { AsyncBoundary } from '@/components/AsyncBoundary'
import { TextField } from '@/components/TextField'
import { useDoubleSize } from '@/hooks/useDoubleSize'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { doubleSizeStore } from '@/skin/doubleSizeStore'
import { pendingInstall } from '@/skin/pendingInstall'
import { skinStore } from '@/skin/skinStore'

import { InstallCard } from './InstallCard'
import { InstalledSkins } from './InstalledSkins'
import { SkinCard } from './SkinCard'
import { skinMessages } from './skinMessages'
import { styles } from './styles'
import { useSkinActions } from './useSkinActions'

export type SkinChooserProps = {
  readonly textStyle: object
}

/**
 * Settings › Skin: the installed skins as a grid of pictures, the install
 * card for a .sskin being opened, and tools for skin authors (a folder
 * that reloads as it changes, packaging, a starter template).
 */
export const SkinChooser: FC<SkinChooserProps> = props => {
  const { textStyle } = props
  const t = usePanelStyles()
  // Shared, so they survive the window re-mounting for a new skin.
  const { note, error } = useSyncExternalStore(
    skinMessages.subscribe,
    skinMessages.get,
  )
  const pending = useSyncExternalStore(
    pendingInstall.subscribe,
    pendingInstall.get,
  )
  const { double } = useDoubleSize()
  const a = useSkinActions()
  const { folderInUse, naming } = a
  const modifier = Platform.OS === 'windows' ? 'Ctrl+D' : '⌘D'

  return (
    <View>
      {pending && 'inspection' in pending && (
        <InstallCard
          inspection={pending.inspection}
          onInstall={() => {
            void a.install(pending.inspection)
          }}
          onCancel={() => {
            pendingInstall.set(null)
          }}
          textStyle={textStyle}
        />
      )}
      {pending && 'error' in pending && (
        <View style={[styles.card, styles.installCard, t.border]}>
          <Text style={[styles.title, textStyle]}>
            Couldn't open {baseName(pending.path)}
          </Text>
          <Text selectable style={styles.error}>
            {pending.error}
          </Text>
          <Pressable
            onPress={() => {
              pendingInstall.set(null)
            }}
          >
            <Text style={[styles.link, t.link]}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.grid}>
        {folderInUse && (
          <SkinCard
            name={skinStore.get()?.name ?? baseName(folderInUse)}
            detail={`Live from ${baseName(folderInUse)}`}
            preview={folderInUse}
            chosen
            textStyle={textStyle}
          >
            <Pressable
              onPress={() => {
                void a.packageFolder(folderInUse)
              }}
            >
              <Text style={[styles.link, t.link]}>Package skin…</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void a.choose(null)
              }}
            >
              <Text style={[styles.link, t.link]}>Stop</Text>
            </Pressable>
          </SkinCard>
        )}
        <AsyncBoundary what="list the skins" resetKeys={[a.listRevision]}>
          <InstalledSkins
            revision={a.listRevision}
            isChosen={a.isChosen}
            onChoose={skin => {
              void a.choose(skin)
            }}
            onRemove={skin => {
              void a.remove(skin)
            }}
            textStyle={textStyle}
          />
        </AsyncBoundary>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void a.pickAndInspect()
          }}
          testID="install-skin"
        >
          <Text style={[styles.link, t.link]}>Install skin…</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void a.chooseFolder()
          }}
        >
          <Text style={[styles.link, t.link]}>Use skin folder…</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            a.setNaming(naming === undefined ? 'My Skin' : undefined)
          }}
        >
          <Text style={[styles.link, t.link]}>New skin from template…</Text>
        </Pressable>
      </View>
      {naming !== undefined && (
        <View style={styles.nameRow}>
          <TextField
            value={naming}
            onChangeText={a.setNaming}
            onSubmitEditing={() => {
              if (naming.trim()) {
                void a.create(naming.trim())
              }
            }}
            placeholder="Skin name"
            style={[styles.input, t.input]}
            autoFocus
          />
          <Pressable
            disabled={!naming.trim()}
            onPress={() => {
              void a.create(naming.trim())
            }}
            style={[styles.button, t.button]}
          >
            <Text style={[styles.buttonText, t.buttonText]}>
              Choose folder…
            </Text>
          </Pressable>
        </View>
      )}
      <Text style={[styles.hint, textStyle]}>
        Tip: double-click a .sskin file, or drop it on any Sound Scraper window,
        to install it.
      </Text>

      <Pressable
        testID="double-size"
        onPress={() => {
          doubleSizeStore.set(!double)
        }}
        style={styles.toggle}
      >
        <Text style={[styles.label, textStyle]}>
          {double ? '☑' : '☐'} Double size ({modifier})
        </Text>
      </Pressable>
      {note && <Text style={[styles.note, textStyle]}>{note}</Text>}
      {error && (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      )}
      {a.warnings.map((w, i) => (
        <Text key={i} selectable style={[styles.warning, textStyle]}>
          ⚠︎ {w}
        </Text>
      ))}
    </View>
  )
}

const baseName = (path: string): string => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
