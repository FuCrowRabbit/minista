import type { ResizeOptions } from "sharp"
import path from "node:path"
import fs from "fs-extra"
import sharp from "sharp"

import type { ResolvedConfig } from "../config/index.js"
import type {
  ResolvedImageOptimize,
  ResolvedImageFormat,
} from "../config/image.js"
import { logger } from "../cli/logger.js"
import { getSpace } from "../utility/space.js"
import { createHash }          from "node:crypto"

export type EntryImages = {
  [src: string]: {
    fileName: string
    width: number
    height: number
    aspectWidth: number
    aspectHeight: number
  }
}

export type CreateImages = {
  [fileName: string]: CreateImage
}
type CreateImage = {
  input: string
  width: number
  height: number
  resizeOptions: ResizeOptions
  format: ResolvedImageFormat
  formatOptions: ResolvedImageOptimize["formatOptions"]
}

type ImageCache = {
  contentHash: string
  optionsHash: string
}

export async function generateImageCache(fileName: string, data: EntryImages) {
  if (Object.keys(data).length === 0) {
    return
  }
  await fs.outputJson(fileName, data, { spaces: 2 }).catch((err) => {
    console.error(err)
  })
}

export async function generateTempImage({
  fileName,
  filePath,
  createImage,
}: {
  fileName: string
  filePath: string
  createImage: CreateImage
}) {
  const { input, width, height, resizeOptions } = createImage
  const image = sharp(input)
  image.resize(width, height, resizeOptions)

  const data = await image.toBuffer()

  await fs
    .outputFile(fileName, data)
    .then(() => {
      logger({ label: "BUILD", main: filePath })
    })
    .catch((err) => {
      console.error(err)
    })
}

export async function generateImages({
  createImages,
  config,
  maxNameLength,
}: {
  createImages: CreateImages
  config: ResolvedConfig
  maxNameLength?: number
}) {
  const { resolvedRoot } = config.sub
  const createArray = Object.entries(createImages)

  if (!createArray.length) {
    return
  }

  const imageCaches = await (async () => {
    if (!fs.existsSync(path.join(resolvedRoot, "__minista_cache", "cache.json"))) {
      return []
    }
    return JSON.parse((await fs.readFile(path.join(resolvedRoot, "__minista_cache", "cache.json"))).toString()) as unknown as ImageCache[] ?? []
  })()

  await Promise.all(
    createArray.map(async (item) => {
      const fileName = item[0]
      const createImage = item[1]
      const { input, width, height, resizeOptions } = createImage
      const { format, formatOptions } = createImage
      const imageCache = (() => {
        const a = createHash('sha256').update(fs.readFileSync(input)).digest('hex')
        const b = createHash('sha256').update(JSON.stringify(createImage)).digest('hex')
        return imageCaches.find((item) => item.contentHash === a && item.optionsHash === b)
      })()
      const exist = fs.existsSync(path.join(resolvedRoot, "__minista_cache", fileName))
      if (imageCache && exist) {
        const space = getSpace({
          nameLength: fileName.length,
          maxNameLength,
          min: 3,
        })
        const routePath = path.join(resolvedRoot, config.main.out, fileName)
        const relativePath = path.relative(process.cwd(), routePath)

        await fs
          .outputFile(routePath, await fs.readFile(path.join(resolvedRoot, "__minista_cache", fileName)))
          .then(() => {
            logger({ label: "SKIPPED", main: relativePath, space })
          })
          .catch((err) => {
            console.error(err)
          })
        return
      }

      const image = sharp(input)
      image.resize(width, height, resizeOptions)

      switch (format) {
        case "jpg":
          image.jpeg({ ...formatOptions?.jpg })
          break
        case "png":
          image.png({ ...formatOptions?.png })
          break
        case "webp":
          image.webp({ ...formatOptions?.webp })
          break
        case "avif":
          image.avif({ ...formatOptions?.avif })
          break
      }
      const data = await image.toBuffer()
      const space = getSpace({
        nameLength: fileName.length,
        maxNameLength,
        min: 3,
      })
      const routePath = path.join(resolvedRoot, config.main.out, fileName)
      const relativePath = path.relative(process.cwd(), routePath)

      await fs
        .outputFile(path.join(resolvedRoot, "__minista_cache", fileName), data)
        .catch((err) => {
          console.error(err)
        })

      imageCaches.push({
        contentHash: createHash('sha256').update(fs.readFileSync(input)).digest('hex'),
        optionsHash: createHash('sha256').update(JSON.stringify(createImage)).digest('hex')
      })

      await fs
        .outputFile(routePath, data)
        .then(() => {
          logger({ label: "BUILD", main: relativePath, space, data })
        })
        .catch((err) => {
          console.error(err)
        })
      return
    })
  )

  await fs.outputJson(path.join(resolvedRoot, "__minista_cache", "cache.json"), imageCaches, { spaces: 2 }).catch((err) => {
    console.error(err)
  })
}
