import type { FC } from 'react'

import { useLibraryTable } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { showDetails } from '@/features/library/components/LibraryScreen/LibraryBody/showDetails'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'

import { ToolbarLink } from './ToolbarLink'

/** "Edit n selected": the checked recordings' tags, in the details. */
export const EditCheckedLink: FC = () => {
  const { openDetails } = useLibraryScreen()
  const { checkedNames } = useLibraryTable().checks
  if (checkedNames.length === 0) {
    return null
  }
  return (
    <ToolbarLink
      id="edit-checked-tags"
      label={`Edit ${checkedNames.length} selected`}
      onPress={() => {
        showDetails(checkedNames, openDetails)
      }}
    />
  )
}
