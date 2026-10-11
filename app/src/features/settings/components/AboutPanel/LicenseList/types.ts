export type Pkg = {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly repository?: string | null
  readonly texts: readonly string[]
  readonly note?: string
}

export type LicenseData = {
  readonly lame: Pkg
  readonly rust: readonly Pkg[]
  readonly js: readonly Pkg[]
  readonly texts: Readonly<Record<string, string>>
}

/** A row of the license list: a section header or a package. */
export type LicenseRow =
  | { readonly kind: 'header'; readonly key: string; readonly title: string }
  | { readonly kind: 'pkg'; readonly key: string; readonly pkg: Pkg }
