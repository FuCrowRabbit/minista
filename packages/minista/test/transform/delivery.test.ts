import { describe, expect, it } from "vitest"

import { getDeliveryData, getDeliveryTag } from "../../src/transform/delivery"
import { resolveConfig } from "../../src/config"

describe("getDeliveryData", () => {
  it("Default", async () => {
    const config = await resolveConfig({})
    const result = getDeliveryData({
      ssgPages: [
        {
          fileName: "",
          path: "/about",
          title: "ABOUT",
          html: "",
        },
        {
          fileName: "",
          path: "/",
          title: "",
          html: "<title>HOME</title>",
        },
        {
          fileName: "",
          path: "/404",
          title: "404",
          html: "",
        },
      ],
      config,
    })
    expect(result).toEqual([
      {
        title: "HOME",
        path: "/",
      },
      {
        title: "ABOUT",
        path: "/about",
      },
    ])
  })

  it("Sort by title", async () => {
    const config = await resolveConfig({ delivery: { sortBy: "title" } })
    const result = getDeliveryData({
      ssgPages: [
        {
          fileName: "",
          path: "/about",
          title: "ABOUT",
          html: "",
        },
        {
          fileName: "",
          path: "/",
          title: "",
          html: "<title>HOME</title>",
        },
        {
          fileName: "",
          path: "/404",
          title: "404",
          html: "",
        },
      ],
      config,
    })
    expect(result).toEqual([
      {
        title: "ABOUT",
        path: "/about",
      },
      {
        title: "HOME",
        path: "/",
      },
    ])
  })
})

describe("getDeliveryTag", () => {
  it("Blank", () => {
    const result = getDeliveryTag([])
    expect(result).toEqual("")
  })

  it("Default", () => {
    const result = getDeliveryTag([
      {
        title: "HOME",
        path: "/",
      },
      {
        title: "ABOUT",
        path: "/about",
      },
    ])
    expect(result).toEqual(`<ul class="minista-delivery-list">
<li class="minista-delivery-item">
  <div class="minista-delivery-item-content">
    <a
      class="minista-delivery-item-content-link"
      href="/"
    ></a>
    <div class="minista-delivery-item-content-inner">
      <p class="minista-delivery-item-content-name">HOME</p>
      <p class="minista-delivery-item-content-slug">/</p>
    </div>
    <div class="minista-delivery-item-content-background"></div>
  </div>
</li>
<li class="minista-delivery-item">
  <div class="minista-delivery-item-content">
    <a
      class="minista-delivery-item-content-link"
      href="/about"
    ></a>
    <div class="minista-delivery-item-content-inner">
      <p class="minista-delivery-item-content-name">ABOUT</p>
      <p class="minista-delivery-item-content-slug">/about</p>
    </div>
    <div class="minista-delivery-item-content-background"></div>
  </div>
</li>
</ul>`)
  })
})
