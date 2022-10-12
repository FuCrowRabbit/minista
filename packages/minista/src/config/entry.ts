import path from "node:path"

export type Entry =
  | string
  | string[]
  | { [key: string]: string }
  | EntryObject[]

type EntryObject = {
  name?: string
  input: string
  insertPages: string | string[] | { include: string[]; exclude?: string[] }
  position?: "head" | "start" | "end"
  loadType?: "defer" | "async" | "none"
}

export type ResolvedEntry = ResolvedEntryObject[]

type ResolvedEntryObject = {
  name: string
  input: string
  insertPages: string[]
  position: "head" | "start" | "end"
  loadType: "defer" | "async" | "none"
}

export function resolveEntryInclude(
  input: EntryObject["insertPages"]
): string[] {
  if (typeof input === "string") {
    return input.startsWith("!") ? ["**/*"] : [input]
  }
  if (Array.isArray(input) && input.length > 0) {
    return input.filter((item) => !item.startsWith("!"))
  }
  if (typeof input === "object" && input.hasOwnProperty("include")) {
    const object = input as { include: string[] }
    return object.include
  }
  return ["**/*"]
}

export function resolveEntryExclude(
  input: EntryObject["insertPages"]
): string[] {
  if (typeof input === "string") {
    return []
  }
  if (Array.isArray(input) && input.length > 0) {
    const strArray = input as string[]
    const excludeArray = strArray.filter((item) => item.startsWith("!"))
    const replacedExcludeArray = excludeArray.map((item) =>
      item.replace(/^!/, "")
    )
    return replacedExcludeArray
  }
  if (typeof input === "object" && input.hasOwnProperty("exclude")) {
    const object = input as { exclude: string[] }
    return object.exclude
  }
  return []
}

export async function resolveEntry(
  entry: Entry,
  resolvedRoot: string
): Promise<ResolvedEntry> {
  const entries: ResolvedEntryObject[] = []

  async function pushEntries(input: Entry) {
    if (!input) {
      return
    }

    if (typeof input === "string") {
      const pattern: ResolvedEntryObject = {
        name: path.parse(input).name,
        input: path.join(resolvedRoot, input),
        insertPages: ["**/*"],
        position: "head",
        loadType: "defer",
      }
      return entries.push(pattern)
    } else if (Array.isArray(input) && input.length > 0) {
      if (typeof input[0] === "string") {
        const strArray = input as string[]
        await Promise.all(
          strArray.map(async (item) => {
            const pattern: ResolvedEntryObject = {
              name: path.parse(item).name,
              input: path.join(resolvedRoot, item),
              insertPages: ["**/*"],
              position: "head",
              loadType: "defer",
            }
            return entries.push(pattern)
          })
        )
      } else {
        const objectArray = input as EntryObject[]

        await Promise.all(
          objectArray.map(async (item) => {
            const name = item.name || path.parse(item.input).name
            const include = resolveEntryInclude(item.insertPages)
            const exclude = resolveEntryExclude(item.insertPages)
            const fixedExclude = exclude.map((item) => "!" + item)
            const pattern: ResolvedEntryObject = {
              name: name,
              input: path.join(resolvedRoot, item.input),
              insertPages: [...include, ...fixedExclude],
              position: item.position || "head",
              loadType: item.loadType || "defer",
            }
            return entries.push(pattern)
          })
        )
      }
    } else if (typeof input === "object") {
      await Promise.all(
        Object.entries(input).map(async (item) => {
          const pattern: ResolvedEntryObject = {
            name: item[0],
            input: path.join(resolvedRoot, item[1]),
            insertPages: ["**/*"],
            position: "head",
            loadType: "defer",
          }
          return entries.push(pattern)
        })
      )
    }
  }
  await pushEntries(entry)

  return entries
}
