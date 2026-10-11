import React, { type FC, useRef, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'

import { rowKey } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/rowKey'
import { useLibraryTable } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryView } from '@/features/library/components/LibraryScreen/LibraryBody/useLibraryView'
import type { Row } from '@/features/library/types'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { usePanelTheme } from '@/shared/hooks/usePanelTheme'

import { EmptyTable } from './EmptyTable'
import { InsertMarker } from './InsertMarker'
import { LibraryRow } from './LibraryRow'
import { SkinScrollbar } from './SkinScrollbar'
import { usePlaylistDrag } from './usePlaylistDrag'
import { useRowClicks } from './useRowClicks'

/**
 * The rows, scrolling, with the skin's scroll bar if it has one. In a
 * playlist the box also takes drags on the ≡ handles (see usePlaylistDrag).
 */
export const RowList: FC = () => {
  const { shown, checks: checkedRows } = useLibraryView()
  const { rows, order, canReorder, checks } = useLibraryTable()
  const t = usePanelStyles()
  const scrollbar = usePanelTheme()?.scrollbar
  const list = useRef<FlatList<Row>>(null)
  const [scroll, setScroll] = useState({ viewport: 0, content: 0, offset: 0 })
  const drag = usePlaylistDrag({
    rows,
    playlist: shown.view,
    order,
    canReorder,
    checked: checkedRows.checked,
    checkedItemIds: checks.checkedItemIds,
    scrollOffset: scroll.offset,
  })
  const clicks = useRowClicks({
    boxAt: drag.boxAt,
    rowHeight: drag.rowHeight,
    scrollOffset: scroll.offset,
  })

  return (
    <View
      ref={drag.box}
      style={[styles.listBox, t.table]}
      onLayout={e => {
        const viewport = e.nativeEvent.layout.height
        setScroll(v => ({ ...v, viewport }))
        drag.measureBox()
      }}
      onStartShouldSetResponderCapture={drag.startCapture}
      onResponderTerminationRequest={() => false}
      onResponderGrant={drag.begin}
      onResponderMove={drag.move}
      onResponderRelease={drag.end}
      onResponderTerminate={drag.end}
    >
      <FlatList
        ref={list}
        data={rows}
        scrollEnabled={drag.drag === null}
        showsVerticalScrollIndicator={!scrollbar}
        style={scrollbar ? { marginRight: scrollbar.track[2] } : undefined}
        onContentSizeChange={(_, content) => {
          setScroll(v => ({ ...v, content }))
        }}
        onScroll={e => {
          const offset = e.nativeEvent.contentOffset.y
          setScroll(v => ({ ...v, offset }))
        }}
        scrollEventThrottle={16}
        keyExtractor={rowKey}
        ListEmptyComponent={<EmptyTable />}
        renderItem={({ item: row, index }) => (
          <LibraryRow
            row={row}
            index={index}
            onLayout={
              index === 0
                ? e => {
                    drag.rowHeight.current = e.nativeEvent.layout.height
                  }
                : undefined
            }
            onRightClick={e => {
              clicks.rightClick(row, e)
            }}
            onAuxClick={e => {
              clicks.auxClick(row, index, e)
            }}
            onPress={() => {
              clicks.press(row)
            }}
          />
        )}
      />
      {drag.drag && drag.rowHeight.current > 0 && (
        <InsertMarker
          top={drag.drag.target * drag.rowHeight.current - scroll.offset - 1}
        />
      )}
      {scrollbar && (
        <SkinScrollbar
          scrollbar={scrollbar}
          viewport={scroll.viewport}
          content={scroll.content}
          offset={scroll.offset}
          onScrollTo={offset =>
            list.current?.scrollToOffset({ offset, animated: false })
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  listBox: { flex: 1 },
})
