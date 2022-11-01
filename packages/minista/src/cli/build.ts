import type { RollupOutput } from "rollup"
import type { PluginOption } from "vite"
import path from "node:path"
import fs from "fs-extra"
import pc from "picocolors"
import {
  defineConfig as defineViteConfig,
  mergeConfig as mergeViteConfig,
  build as viteBuild,
  createLogger,
} from "vite"
import { default as pluginReact } from "@vitejs/plugin-react"
import { default as pluginMdx } from "@mdx-js/rollup"
import beautify from "js-beautify"

import type { InlineConfig } from "../config/index.js"
import type { RunSsg, SsgPage } from "../scripts/ssg.js"
import { resolveConfig } from "../config/index.js"
import { pluginSvgr } from "../plugins/svgr.js"
import { pluginSprite } from "../plugins/sprite.js"
import { pluginFetch } from "../plugins/fetch.js"
import { pluginSsg } from "../plugins/ssg.js"
import { pluginPartial } from "../plugins/partial.js"
import { pluginHydrate } from "../plugins/hydrate.js"
import { pluginPreact } from "../plugins/preact.js"
import { pluginBundle } from "../plugins/bundle.js"

export type BuildResult = {
  output: BuildItem[]
}
type BuildItem = RollupOutput["output"][0] & {
  source?: string
  code?: string
}

export async function build(inlineConfig: InlineConfig = {}) {
  const config = await resolveConfig(inlineConfig)

  const ssgConfig = mergeViteConfig(
    config.vite,
    defineViteConfig({
      build: { write: false, ssr: true, minify: false },
      plugins: [
        pluginReact(),
        pluginMdx(config.mdx) as PluginOption,
        pluginSvgr(config),
        pluginSprite(config, true),
        pluginFetch(config),
        pluginSsg(),
        pluginPartial(config),
      ],
      customLogger: createLogger("warn", { prefix: "[minista]" }),
    })
  )
  const assetsConfig = mergeViteConfig(
    config.vite,
    defineViteConfig({
      build: { write: false },
      plugins: [
        pluginReact(),
        pluginMdx(config.mdx) as PluginOption,
        pluginSvgr(config),
        pluginSprite(config),
        pluginBundle(),
      ],
      customLogger: createLogger("warn", { prefix: "[minista]" }),
    })
  )
  const partialConfig = mergeViteConfig(
    config.vite,
    defineViteConfig({
      build: { write: false },
      plugins: [
        pluginReact(),
        pluginPreact(config),
        pluginMdx(config.mdx) as PluginOption,
        pluginSvgr(config),
        pluginSprite(config),
        pluginHydrate(),
      ],
      customLogger: createLogger("warn", { prefix: "[minista]" }),
    })
  )

  let ssgResult: BuildResult
  let assetsResult: BuildResult
  let partialResult: BuildResult

  await Promise.all([
    (ssgResult = (await viteBuild(ssgConfig)) as unknown as BuildResult),
    (assetsResult = (await viteBuild(assetsConfig)) as unknown as BuildResult),
  ])

  const hasPartial = fs.existsSync(path.join(config.sub.tempDir, "partials"))

  if (hasPartial) {
    partialResult = (await viteBuild(partialConfig)) as unknown as BuildResult
  } else {
    partialResult = { output: [] }
  }

  const resolvedOut = path.join(config.sub.resolvedRoot, config.main.out)
  const resolvedPublic = path.join(config.sub.resolvedRoot, config.main.public)
  const hasPublic = fs.existsSync(resolvedPublic)

  await fs.emptyDir(resolvedOut)
  hasPublic && (await fs.copy(resolvedPublic, resolvedOut))

  const bundleCssName = path.join(
    config.main.assets.outDir,
    config.main.assets.bundle.outName + ".css"
  )
  const bugBundleCssName = path.join(config.main.assets.outDir, "bundle.css")
  const hasBundleCss = assetsResult.output.some(
    (item) =>
      item.fileName === bundleCssName || item.fileName === bugBundleCssName
  )
  const partialJsName = path.join(
    config.main.assets.outDir,
    config.main.assets.partial.outName + ".js"
  )

  const ssgItems = ssgResult.output.filter((item) =>
    item.fileName.match(/__minista_plugin_ssg\.js$/)
  )
  const assetItems = assetsResult.output.filter(
    (item) => !item.fileName.match(/__minista_plugin_bundle\.js$/)
  )
  const partialItems = partialResult.output.filter((item) =>
    item.fileName.match(/__minista_plugin_hydrate\.js$/)
  )

  let ssgPages: SsgPage[] = []

  async function getHtmlItems(ssgItem: BuildItem) {
    const ssgPath = path.join(config.sub.tempDir, "ssg.mjs")
    const ssgData = ssgItem.source || ssgItem.code || ""

    if (!ssgData) {
      return []
    }
    await fs.outputFile(ssgPath, ssgData)

    const { runSsg }: { runSsg: RunSsg } = await import(ssgPath)
    ssgPages = await runSsg(config)

    if (ssgPages.length === 0) {
      return []
    }
    return ssgPages.map((item) => {
      return {
        fileName: item.fileName,
        data: item.html,
      }
    })
  }

  function optimizeItems(items: BuildItem[]) {
    return items
      .map((item) => {
        const isBundleCss = item.fileName.match(/__minista_plugin_bundle\.css$/)
        const isBugBundleCss = item.fileName === bugBundleCssName
        const isPartialJs = item.fileName.match(/__minista_plugin_hydrate\.js$/)

        let fileName = item.fileName
        isBundleCss && (fileName = bundleCssName)
        isBugBundleCss && (fileName = bundleCssName)
        isPartialJs && (fileName = partialJsName)

        let data = ""
        item.source && (data = item.source)
        item.code && (data = item.code)

        if (data === "\n") {
          data = ""
        }
        return {
          fileName,
          data,
        }
      })
      .filter((item) => item.data)
  }

  const htmlItems = ssgItems[0] ? await getHtmlItems(ssgItems[0]) : []
  const optimizedAssetItems = optimizeItems([...assetItems, ...partialItems])
  const mergedItems = [...htmlItems, ...optimizedAssetItems]

  const nameLengths = mergedItems.map((api) => api.fileName.length)
  const maxNameLength = nameLengths.reduce((a, b) => (a > b ? a : b), 0)

  await Promise.all(
    mergedItems.map(async (item) => {
      const isHtml = item.fileName.match(/.*\.html$/)
      const isCss = item.fileName.match(/.*\.css$/)
      const isJs = item.fileName.match(/.*\.js$/)

      let hasPartialJs = false
      let fileName = item.fileName
      let data = item.data

      if (isHtml) {
        hasPartialJs = data.includes(
          `data-${config.main.assets.partial.rootAttrSuffix}`
        )

        if (hasPartialJs) {
          data = data.replace(/data-minista-build-partial-src=/g, "src=")
        } else {
          data = data.replace(
            /<script.*data-minista-build-partial-src=.*?><\/script>/g,
            "\n\n"
          )
        }

        if (hasBundleCss) {
          data = data.replace(/data-minista-build-bundle-href=/g, "href=")
        } else {
          data = data.replace(
            /<link.*data-minista-build-bundle-href=.*?>/g,
            "\n\n"
          )
        }

        if (config.main.beautify.useHtml) {
          data = beautify.html(data, config.main.beautify.htmlOptions)
        }
      }

      if (isCss && config.main.beautify.useAssets) {
        data = beautify.css(data, config.main.beautify.cssOptions)
      }
      if (isJs && config.main.beautify.useAssets) {
        data = beautify.js(data, config.main.beautify.jsOptions)
      }

      const nameLength = fileName.length
      const spaceCount = maxNameLength - nameLength + 1
      const space = " ".repeat(spaceCount)

      const routePath = path.join(
        config.sub.resolvedRoot,
        config.main.out,
        fileName
      )
      const relativePath = path.relative(process.cwd(), routePath)
      const dataSize = (data.length / 1024).toFixed(2)

      return await fs
        .outputFile(routePath, data)
        .then(() => {
          console.log(
            `${pc.bold(pc.green("BUILD"))} ${pc.bold(relativePath)}` +
              space +
              pc.gray(`${dataSize} KiB`)
          )
        })
        .catch((err) => {
          console.error(err)
        })
    })
  )
  return
}
