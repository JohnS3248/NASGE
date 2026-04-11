import { describe, expect, it } from "vitest";
import {
  applyTruncationRules,
  simulateSteamUrlTruncation,
  isSteamCdnUrl
} from "../steamUrlTruncation";

/**
 * Fixture 来自 Steam 端 53 用例真实回归（A-L 共 12 组）。
 * 因 fixture 多用 cdn.fastly.steamstatic.com 作基准（已知可达），
 * 算法层面用 applyTruncationRules（绕过 Steam CDN 白名单）。
 */

interface Case {
  id: string;
  input: string;
  truncated: string;
  dangerousChars?: string[];
  droppedQuery?: boolean;
  droppedHash?: boolean;
}

const cases: Case[] = [
  // 组 A — 对照组（同一 CDN, _ vs 无 _）
  {
    id: "A1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header.jpg"
  },
  {
    id: "A2",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/capsule_616x353.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/capsule",
    dangerousChars: ["_"]
  },
  {
    id: "A3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/library_600x900.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/library",
    dangerousChars: ["_"]
  },
  {
    id: "A4",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/logo_transparent.png",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/logo",
    dangerousChars: ["_"]
  },

  // 组 B — %5F 编码无法绕过（不做 decode，% 本身就是危险字符）
  {
    id: "B1",
    input: "https://apod.nasa.gov/apod/image/2401/Pleiades_Stocks_2048.jpg",
    truncated: "https://apod.nasa.gov/apod/image/2401/Pleiades",
    dangerousChars: ["_"]
  },
  {
    id: "B2",
    input: "https://apod.nasa.gov/apod/image/2401/Pleiades%5FStocks%5F2048.jpg",
    truncated: "https://apod.nasa.gov/apod/image/2401/Pleiades",
    dangerousChars: ["%"]
  },
  {
    id: "B3",
    input: "https://www.gstatic.com/images/branding/product/1x/googleg_16dp.png",
    truncated: "https://www.gstatic.com/images/branding/product/1x/googleg",
    dangerousChars: ["_"]
  },
  {
    id: "B4",
    input: "https://www.gstatic.com/images/branding/product/1x/googleg%5F16dp.png",
    truncated: "https://www.gstatic.com/images/branding/product/1x/googleg",
    dangerousChars: ["%"]
  },

  // 组 C — query string 含 _
  {
    id: "C2",
    input: "https://picsum.photos/id/237/400/300.jpg?tag_name=test",
    truncated: "https://picsum.photos/id/237/400/300.jpg",
    droppedQuery: true
  },

  // 组 D — 特殊字符
  {
    id: "D1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header*.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["*"]
  },
  {
    id: "D3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header-test.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header-test.jpg"
  },

  // 组 E — 完整危险字符集
  {
    id: "E1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header~x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["~"]
  },
  {
    id: "E2",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header[x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["["]
  },
  {
    id: "E3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header]x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["]"]
  },
  {
    id: "E4",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header{x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["{"]
  },
  {
    id: "E5",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header|x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["|"]
  },
  {
    id: "E6",
    input: 'https://cdn.fastly.steamstatic.com/steam/apps/440/header"x.jpg',
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ['"']
  },
  {
    id: "E7",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: [" "]
  },
  {
    id: "E8",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%20x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },

  // 组 F — _ 在不同位置
  {
    id: "F1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440_test/header.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440",
    dangerousChars: ["_"]
  },
  {
    id: "F2",
    input: "https://sub_domain.fastly.steamstatic.com/steam/apps/440/header.jpg",
    truncated: "https://sub",
    dangerousChars: ["_"]
  },
  {
    id: "F3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/a_b_c_d_e.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/a",
    dangerousChars: ["_"]
  },

  // 组 G — query / hash 整段丢弃
  {
    id: "G1",
    input: "https://picsum.photos/id/237/400/300.jpg?v=1",
    truncated: "https://picsum.photos/id/237/400/300.jpg",
    droppedQuery: true
  },
  {
    id: "G2",
    input: "https://picsum.photos/id/237/400/300.jpg?abc=xxx_yyy",
    truncated: "https://picsum.photos/id/237/400/300.jpg",
    droppedQuery: true
  },
  {
    id: "G3",
    input: "https://picsum.photos/id/237/400/300.jpg?_key=val",
    truncated: "https://picsum.photos/id/237/400/300.jpg",
    droppedQuery: true
  },
  {
    id: "G4",
    input: "https://picsum.photos/id/237/400/300.jpg?a=1&b=2",
    truncated: "https://picsum.photos/id/237/400/300.jpg",
    droppedQuery: true
  },
  {
    id: "G5",
    input: "https://picsum.photos/id/237/400/300.jpg#anchor_name",
    truncated: "https://picsum.photos/id/237/400/300.jpg",
    droppedHash: true
  },

  // 组 H — _ 位置 / 闭合
  {
    id: "H1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header_.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["_"]
  },
  {
    id: "H2",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header_x_.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["_"]
  },
  {
    id: "H3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header_x_y_.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["_"]
  },
  {
    id: "H4",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header.jpg_",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header.jpg",
    dangerousChars: ["_"]
  },

  // 组 I — % 编码（决定不 decode）
  {
    id: "I1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%5fx.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "I2",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%255Fx.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "I3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%5Gx.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "I4",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%5F%5Fx.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "I5",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%2520x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },

  // 组 J — 剩余字符
  {
    id: "J1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header;x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: [";"]
  },
  {
    id: "J2",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header,x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header,x.jpg"
  },
  {
    id: "J3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header=x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["="]
  },
  {
    id: "J4",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header&x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["&"]
  },
  {
    id: "J5",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header+x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["+"]
  },
  {
    id: "J6",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header(x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["("]
  },
  {
    id: "J7",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header)x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: [")"]
  },
  {
    id: "J8",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header<x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["<"]
  },
  {
    id: "J9",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header>x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: [">"]
  },
  {
    id: "J10",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header'x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["'"]
  },

  // 组 K — URL 结构
  {
    id: "K1",
    input: "https://cdn.fastly.steamstatic.com:8080/steam/apps/440/header.jpg",
    truncated: "https://cdn.fastly.steamstatic.com:8080/steam/apps/440/header.jpg"
  },
  {
    id: "K2",
    input: "https://user@cdn.fastly.steamstatic.com/steam/apps/440/header.jpg",
    truncated: "https://user",
    dangerousChars: ["@"]
  },
  {
    id: "K3",
    input: "https://cdn.fastly.steamstatic.com//steam/apps/440/header.jpg",
    truncated: "https://cdn.fastly.steamstatic.com//steam/apps/440/header.jpg"
  },

  // 组 L — % 消歧
  {
    id: "L1",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%xyz.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "L2",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "L3",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%5.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "L4",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%2Dx.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  },
  {
    id: "L5",
    input: "https://cdn.fastly.steamstatic.com/steam/apps/440/header%30x.jpg",
    truncated: "https://cdn.fastly.steamstatic.com/steam/apps/440/header",
    dangerousChars: ["%"]
  }
];

describe("applyTruncationRules — 53 实测用例", () => {
  for (const c of cases) {
    it(`${c.id}: ${c.input}`, () => {
      const result = applyTruncationRules(c.input);
      expect(result.truncated).toBe(c.truncated);
      expect(result.dangerousChars).toEqual(c.dangerousChars ?? []);
      expect(result.droppedQuery).toBe(c.droppedQuery ?? false);
      expect(result.droppedHash).toBe(c.droppedHash ?? false);
      const expectedSafe =
        !c.dangerousChars?.length && !c.droppedQuery && !c.droppedHash;
      expect(result.isSafe).toBe(expectedSafe);
    });
  }
});

describe("isSteamCdnUrl", () => {
  it.each([
    "https://images.steamusercontent.com/ugc/15142986396168066246/abc/",
    "https://cdn.fastly.steamstatic.com/steam/apps/440/header.jpg",
    "https://cdn.akamai.steamstatic.com/foo.jpg",
    "https://steamcommunity-a.akamaihd.net/x.jpg",
    "https://steamuserimages-a.akamaihd.net/ugc/abc/"
  ])("识别 Steam CDN: %s", (url) => {
    expect(isSteamCdnUrl(url)).toBe(true);
  });

  it.each([
    "https://apod.nasa.gov/apod/image/2401/Pleiades.jpg",
    "https://i.imgur.com/abc.png",
    "https://upload.wikimedia.org/foo.jpg",
    "https://example.com/image.jpg"
  ])("不命中 Steam CDN: %s", (url) => {
    expect(isSteamCdnUrl(url)).toBe(false);
  });

  it("非法 URL 返回 false", () => {
    expect(isSteamCdnUrl("not-a-url")).toBe(false);
  });
});

describe("simulateSteamUrlTruncation", () => {
  it("Steam CDN URL：跳过截断，原样返回", () => {
    const url =
      "https://images.steamusercontent.com/ugc/abc/def/?imw=5000&imh=5000&ima=fit&impolicy=Letterbox";
    const result = simulateSteamUrlTruncation(url);
    expect(result.truncated).toBe(url);
    expect(result.isSteamCdn).toBe(true);
    expect(result.isSafe).toBe(true);
    expect(result.droppedQuery).toBe(false);
  });

  it("外链 URL：套用截断", () => {
    const url = "https://apod.nasa.gov/apod/image/2401/Pleiades_Stocks.jpg";
    const result = simulateSteamUrlTruncation(url);
    expect(result.truncated).toBe(
      "https://apod.nasa.gov/apod/image/2401/Pleiades"
    );
    expect(result.isSteamCdn).toBe(false);
    expect(result.isSafe).toBe(false);
    expect(result.dangerousChars).toEqual(["_"]);
  });

  it("外链安全 URL：isSafe=true", () => {
    const url = "https://example.com/image.jpg";
    const result = simulateSteamUrlTruncation(url);
    expect(result.truncated).toBe(url);
    expect(result.isSafe).toBe(true);
    expect(result.isSteamCdn).toBe(false);
  });
});
