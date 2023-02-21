import type { HTMLElement as NHTMLElement } from "node-html-parser"
import path from "node:path"
import { parse as parseHtml } from "node-html-parser"

import type { ResolvedConfig } from "../config/index.js"
import type { ResolvedGlobal } from "../server/global.js"
import type { ResolvedPages } from "../server/page.js"
import { transformPage } from "./page.js"
import { transformTags } from "./tag.js"
import { transformComments } from "./comment.js"
import { getHtmlPath } from "../utility/path.js"

export type SsgPages = {
  fileName: string
  path: string
  group: string
  title: string
  html: string
}[]

export async function transformSsg({
  resolvedGlobal,
  resolvedPages,
  config,
}: {
  resolvedGlobal: ResolvedGlobal
  resolvedPages: ResolvedPages
  config: ResolvedConfig
}): Promise<SsgPages> {
  const { resolvedBase } = config.sub

  let pages = resolvedPages.map((page) => {
    const basedPath = resolvedBase.match(/^\/.*\/$/)
      ? path.join(resolvedBase, page.path)
      : page.path
    const { headTags, startTags, endTags } = transformTags({
      command: "build",
      pathname: basedPath,
      config,
    })
    const group = page.frontmatter?.group || ""
    const title = page.frontmatter?.title || ""
    const draft = page.frontmatter?.draft || false
    return {
      path: page.path,
      basedPath,
      group,
      title,
      html: draft
        ? ""
        : transformPage({
            url: page.path,
            resolvedGlobal,
            resolvedPages: [page],
            headTags,
            startTags,
            endTags,
          }),
    }
  })

  pages = pages.filter((page) => page.html)

  if (pages.length === 0) {
    return []
  }

  pages = pages.map((page) => {
    let html = page.html
    let parsedHtml = parseHtml(html, { comment: true }) as NHTMLElement

    transformComments(parsedHtml)

    html = parsedHtml.toString()

    return {
      path: page.path,
      basedPath: page.basedPath,
      group: page.group,
      title: page.title,
      html,
    }
  })

  return pages.map((page) => {
    const fileName = getHtmlPath(page.path)
    return {
      fileName,
      path: page.basedPath,
      group: page.group,
      title: page.title,
      html: page.html,
    }
  })
}
