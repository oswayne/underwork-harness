/** Local write-back of an edited page schema into the app-package directory. */

/** Minimal filesystem surface the write-back needs (sandbox policy applies). */
export interface PackageFs {
  resolve(path: string): Promise<{ displayPath: string }>
  writeText(target: { displayPath: string }, content: string): Promise<void>
}

/**
 * Write `pages/<identifier>.json` with two-space JSON and one trailing
 * newline, returning the written path.
 * @param fs - filesystem seam (sandbox policy applies).
 * @param directory - app-package directory.
 * @param pageIdentifier - page file stem, e.g. `order-list`.
 * @param schema - edited Eureka page JSON.
 * @returns the absolute written path.
 */
export async function savePageSchema(
  fs: PackageFs,
  directory: string,
  pageIdentifier: string,
  schema: unknown,
): Promise<string> {
  const target = await fs.resolve(`${directory}/pages/${pageIdentifier}.json`)
  await fs.writeText(target, `${JSON.stringify(schema, null, 2)}\n`)
  return target.displayPath
}
