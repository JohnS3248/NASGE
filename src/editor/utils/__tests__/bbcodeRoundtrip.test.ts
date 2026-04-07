import { describe, expect, it, vi, beforeAll } from "vitest";

// Mock useSteamGuideImageStore — bbcode.ts 用它查图片 URL，roundtrip 测试不需要实际 URL
vi.mock("../../stores/useSteamGuideImageStore", () => ({
  useSteamGuideImageStore: {
    getState: () => ({ items: [] })
  }
}));

// Mock logger
vi.mock("../../../shared/logger", () => ({
  loggers: {
    editor: { info: () => {}, warn: () => {}, verbose: () => {}, debug: () => {} },
    bridge: { info: () => {}, warn: () => {}, verbose: () => {} },
    store: { info: () => {}, warn: () => {}, verbose: () => {} },
    sync: { info: () => {}, warn: () => {}, verbose: () => {} },
    config: { info: () => {}, warn: () => {}, verbose: () => {} },
    image: { info: () => {}, warn: () => {}, verbose: () => {} },
    persist: { info: () => {}, warn: () => {}, verbose: () => {} }
  }
}));

import { bbcodeToHtml, htmlToBBCode, bbcodeTitleToHtml } from "../bbcode";

/**
 * 标准化 BBCode 用于比较：
 * - 去掉尾部空白行
 * - 统一换行符
 */
function normalize(bbcode: string): string {
  return bbcode.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

/**
 * 执行 roundtrip 测试：BBCode → HTML → BBCode
 * 比较标准化后的结果
 */
function testRoundtrip(input: string, label?: string) {
  const html = bbcodeToHtml(input);
  const output = htmlToBBCode(html);
  const normalizedInput = normalize(input);
  const normalizedOutput = normalize(output);

  if (normalizedInput !== normalizedOutput) {
    // 打印详细 diff 信息
    console.log(`\n--- ${label || "roundtrip"} ---`);
    console.log("INPUT :", JSON.stringify(normalizedInput));
    console.log("HTML  :", html);
    console.log("OUTPUT:", JSON.stringify(normalizedOutput));
  }

  expect(normalizedOutput).toBe(normalizedInput);
}

// ============================================================
// 一、纯文本换行
// ============================================================
describe("纯文本换行 roundtrip", () => {
  it("单换行", () => {
    testRoundtrip("第一行\n第二行");
  });

  it("双换行（1个空行）", () => {
    testRoundtrip("第一行\n\n第二行");
  });

  it("三换行（2个空行）", () => {
    testRoundtrip("第一行\n\n\n第二行");
  });

  it("四换行（3个空行）", () => {
    testRoundtrip("第一行\n\n\n\n第二行");
  });
});

// ============================================================
// 二、标题与文本混合
// ============================================================
describe("标题与文本 roundtrip", () => {
  it("标题后紧跟文字", () => {
    testRoundtrip("[h2]小标题A[/h2]\n紧跟标题的文字");
  });

  it("标题后空一行再跟文字", () => {
    testRoundtrip("[h2]小标题B[/h2]\n\n空一行后的文字");
  });

  it("文字后空一行再跟标题", () => {
    testRoundtrip("这是一段文字\n\n[h2]小标题C[/h2]");
  });

  it("连续标题", () => {
    testRoundtrip("[h1]一级标题[/h1]\n[h2]二级标题[/h2]\n[h3]三级标题[/h3]");
  });

  it("标题之间有空行", () => {
    testRoundtrip("[h2]标题D[/h2]\n\n[h2]标题E[/h2]");
  });
});

// ============================================================
// 三、文本格式
// ============================================================
describe("文本格式 roundtrip", () => {
  it("基本格式", () => {
    testRoundtrip("[b]粗体文字[/b]\n[i]斜体文字[/i]\n[u]下划线文字[/u]\n[strike]删除线文字[/strike]\n[spoiler]剧透文字[/spoiler]");
  });

  it("格式组合", () => {
    testRoundtrip("[b][i]粗斜体[/i][/b]\n[u][b]粗体下划线[/b][/u]\n[strike][i]斜体删除线[/i][/strike]");
  });

  it("格式跨段落", () => {
    testRoundtrip("[b]粗体第一行[/b]\n\n[i]斜体第二行[/i]\n\n[u]下划线第三行[/u]");
  });
});

// ============================================================
// 四、链接
// ============================================================
describe("链接 roundtrip", () => {
  it("基本链接", () => {
    testRoundtrip("[url=https://store.steampowered.com]Steam商店[/url]");
  });

  it("链接中带格式", () => {
    testRoundtrip("[url=https://example.com][b]粗体链接[/b][/url]");
  });

  it("文字中夹杂链接", () => {
    testRoundtrip("这是一段包含[url=https://google.com]链接[/url]的文字，链接后面还有文字。");
  });
});

// ============================================================
// 五、图片（核心 — 本次修复重点）
// ============================================================
describe("图片 roundtrip", () => {
  it("单独图片", () => {
    testRoundtrip("[previewimg=10000001;sizeOriginal,floatLeft;测试指南图1024x687.jpg][/previewimg]");
  });

  it("图片前后有文字", () => {
    testRoundtrip("图片前的文字\n[previewimg=10000002;sizeOriginal,floatLeft;测试用图片400x400.jpg][/previewimg]\n图片后的文字");
  });

  it("图片在段落中间（前后各空一行）", () => {
    testRoundtrip("这是第一段文字，下面是一张图片。\n\n[previewimg=10000003;sizeOriginal,floatLeft;测试用图片100x100.jpg][/previewimg]\n\n这是图片后的第二段文字。");
  });

  it("内联图标 previewicon", () => {
    testRoundtrip("这是一段文字[previewicon=10000003;sizeOriginal,inline;测试用图片100x100.jpg][/previewicon]中间有个图标，图标后还有文字。");
  });

  it("连续多张图片", () => {
    testRoundtrip(
      "[previewimg=10000001;sizeOriginal,floatLeft;测试指南图1024x687.jpg][/previewimg]\n" +
      "[previewimg=10000002;sizeOriginal,floatLeft;测试用图片400x400.jpg][/previewimg]\n" +
      "[previewimg=10000003;sizeOriginal,floatLeft;测试用图片100x100.jpg][/previewimg]"
    );
  });

  it("图片不同尺寸（各间隔空行）", () => {
    testRoundtrip(
      "[previewimg=10000001;sizeOriginal,floatLeft;测试指南图1024x687.jpg][/previewimg]\n\n" +
      "[previewimg=10000001;sizeFull,floatLeft;测试指南图1024x687.jpg][/previewimg]\n\n" +
      "[previewimg=10000001;sizeThumb,floatLeft;测试指南图1024x687.jpg][/previewimg]"
    );
  });

  it("图片不同对齐 + 文字", () => {
    testRoundtrip(
      "[previewimg=10000002;sizeThumb,floatLeft;测试用图片400x400.jpg][/previewimg]\n左浮动图片\n\n" +
      "[previewimg=10000002;sizeThumb,floatRight;测试用图片400x400.jpg][/previewimg]\n右浮动图片"
    );
  });
});

// ============================================================
// 六、列表
// ============================================================
describe("列表 roundtrip", () => {
  it("无序列表", () => {
    testRoundtrip("[list]\n[*]列表项1\n[*]列表项2\n[*]列表项3\n[/list]");
  });

  it("有序列表", () => {
    testRoundtrip("[olist]\n[*]第一项\n[*]第二项\n[*]第三项\n[/olist]");
  });

  it("列表前后有文字", () => {
    testRoundtrip("列表前的文字\n[list]\n[*]项目A\n[*]项目B\n[/list]\n列表后的文字");
  });

  it("列表前后有空行", () => {
    testRoundtrip("列表前的文字\n\n[list]\n[*]项目X\n[*]项目Y\n[/list]\n\n列表后的文字");
  });
});

// ============================================================
// 七、表格
// ============================================================
describe("表格 roundtrip", () => {
  it("基本表格", () => {
    testRoundtrip(
      "[table]\n" +
      "[tr][th]表头1[/th][th]表头2[/th][th]表头3[/th][/tr]\n" +
      "[tr][td]数据1[/td][td]数据2[/td][td]数据3[/td][/tr]\n" +
      "[tr][td]数据4[/td][td]数据5[/td][td]数据6[/td][/tr]\n" +
      "[/table]"
    );
  });

  it("表格前后有文字", () => {
    testRoundtrip(
      "表格前的文字\n" +
      "[table]\n[tr][th]列A[/th][th]列B[/th][/tr]\n[tr][td]A1[/td][td]B1[/td][/tr]\n[/table]\n" +
      "表格后的文字"
    );
  });
});

// ============================================================
// 八、代码块
// ============================================================
describe("代码块 roundtrip", () => {
  it("单行代码", () => {
    testRoundtrip('[code]console.log("Hello World");[/code]');
  });

  it("多行代码", () => {
    testRoundtrip('[code]function test() {\n    console.log("line 1");\n    console.log("line 2");\n    return true;\n}[/code]');
  });

  it("代码块前后有文字", () => {
    testRoundtrip("代码前的文字\n[code]var x = 1;[/code]\n代码后的文字");
  });

  it("代码块前后有空行", () => {
    testRoundtrip("代码前有空行\n\n[code]var y = 2;[/code]\n\n代码后有空行");
  });
});

// ============================================================
// 九、引用
// ============================================================
describe("引用 roundtrip", () => {
  it("基本引用", () => {
    testRoundtrip("[quote]这是一段引用内容[/quote]");
  });

  it("带作者引用", () => {
    testRoundtrip("[quote=某作者]这是某作者说的话[/quote]");
  });

  it("引用前后有文字", () => {
    testRoundtrip("引用前的文字\n[quote]引用内容[/quote]\n引用后的文字");
  });

  it("引用前后有空行", () => {
    testRoundtrip("引用前有空行\n\n[quote]引用内容[/quote]\n\n引用后有空行");
  });
});

// ============================================================
// 十、分隔线
// ============================================================
describe("分隔线 roundtrip", () => {
  it("基本分隔线", () => {
    testRoundtrip("上面的文字\n[hr]\n下面的文字");
  });

  it("分隔线前后有空行", () => {
    testRoundtrip("上面有空行\n\n[hr]\n\n下面有空行");
  });
});

// ============================================================
// 十一、复杂混合
// ============================================================
describe("复杂混合 roundtrip", () => {
  it("标题+图片+文字", () => {
    testRoundtrip(
      "[h2]混合场景A[/h2]\n" +
      "[previewimg=10000002;sizeThumb,floatLeft;测试用图片400x400.jpg][/previewimg]\n" +
      "这是图片旁边的说明文字，测试图片和文字的混排效果。"
    );
  });

  it("列表后接图片后接文字", () => {
    testRoundtrip(
      "[list]\n[*]W键前进\n[*]S键后退\n[*]空格跳跃\n[/list]\n\n" +
      "[previewimg=10000001;sizeThumb,floatLeft;测试指南图1024x687.jpg][/previewimg]\n\n" +
      "如图所示，这是游戏的主界面。"
    );
  });

  it("引用内含格式", () => {
    testRoundtrip("[quote=测试者]这段引用包含[b]粗体[/b]、[i]斜体[/i]和[url=https://example.com]链接[/url][/quote]");
  });
});

// ============================================================
// 十二、边界情况
// ============================================================
describe("边界情况 roundtrip", () => {
  it("超长单行文字", () => {
    testRoundtrip("这是一行非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的文字");
  });

  it("空内容标签", () => {
    testRoundtrip("[b][/b]");
  });
});

// ============================================================
// 完整大章节 roundtrip（集成测试）
// ============================================================
describe("完整大章节 roundtrip", () => {
  it("纯文本 sections (1-4)", () => {
    const bbcode = `[h1]一、纯文本换行测试[/h1]

1.1 单换行（应显示为两个段落，无空行）
第一行
第二行

1.2 双换行（应显示为两个段落，中间1个空行）
第一行

第二行

1.3 三换行（应显示为两个段落，中间2个空行）
第一行


第二行

1.4 四换行（应显示为两个段落，中间3个空行）
第一行



第二行

[h1]二、标题与文本混合测试[/h1]

2.1 标题后紧跟文字（无空行）
[h2]小标题A[/h2]
紧跟标题的文字

2.2 标题后空一行再跟文字
[h2]小标题B[/h2]

空一行后的文字

2.3 文字后空一行再跟标题
这是一段文字

[h2]小标题C[/h2]

2.4 连续标题测试
[h1]一级标题[/h1]
[h2]二级标题[/h2]
[h3]三级标题[/h3]

2.5 标题之间有空行
[h2]标题D[/h2]

[h2]标题E[/h2]

[h1]三、文本格式测试[/h1]

3.1 基本格式
[b]粗体文字[/b]
[i]斜体文字[/i]
[u]下划线文字[/u]
[strike]删除线文字[/strike]
[spoiler]剧透文字[/spoiler]

3.2 格式组合
[b][i]粗斜体[/i][/b]
[u][b]粗体下划线[/b][/u]
[strike][i]斜体删除线[/i][/strike]

3.3 格式跨段落（每个格式独立一行）
[b]粗体第一行[/b]

[i]斜体第二行[/i]

[u]下划线第三行[/u]

[h1]四、链接测试[/h1]

4.1 基本链接
[url=https://store.steampowered.com]Steam商店[/url]

4.2 链接中带格式
[url=https://example.com][b]粗体链接[/b][/url]

4.3 文字中夹杂链接
这是一段包含[url=https://google.com]链接[/url]的文字，链接后面还有文字。`;
    testRoundtrip(bbcode, "纯文本 sections 1-4");
  });

  it("图片 section (5)", () => {
    const bbcode = `[h1]五、图片测试[/h1]

5.1 单独图片（原始尺寸，左浮动）
[previewimg=10000001;sizeOriginal,floatLeft;测试指南图1024x687.jpg][/previewimg]

5.2 图片前后有文字
图片前的文字
[previewimg=10000002;sizeOriginal,floatLeft;测试用图片400x400.jpg][/previewimg]
图片后的文字

5.3 图片在段落中间
这是第一段文字，下面是一张图片。

[previewimg=10000003;sizeOriginal,floatLeft;测试用图片100x100.jpg][/previewimg]

这是图片后的第二段文字。

5.4 内联图标（previewicon）
这是一段文字[previewicon=10000003;sizeOriginal,inline;测试用图片100x100.jpg][/previewicon]中间有个图标，图标后还有文字。

5.5 连续多张图片
[previewimg=10000001;sizeOriginal,floatLeft;测试指南图1024x687.jpg][/previewimg]
[previewimg=10000002;sizeOriginal,floatLeft;测试用图片400x400.jpg][/previewimg]
[previewimg=10000003;sizeOriginal,floatLeft;测试用图片100x100.jpg][/previewimg]

5.6 图片不同尺寸
[previewimg=10000001;sizeOriginal,floatLeft;测试指南图1024x687.jpg][/previewimg]

[previewimg=10000001;sizeFull,floatLeft;测试指南图1024x687.jpg][/previewimg]

[previewimg=10000001;sizeThumb,floatLeft;测试指南图1024x687.jpg][/previewimg]

5.7 图片不同对齐
[previewimg=10000002;sizeThumb,floatLeft;测试用图片400x400.jpg][/previewimg]
左浮动图片

[previewimg=10000002;sizeThumb,floatRight;测试用图片400x400.jpg][/previewimg]
右浮动图片`;
    testRoundtrip(bbcode, "图片 section 5");
  });

  it("分隔线 section (10)", () => {
    const bbcode = `[h1]十、分隔线测试[/h1]

10.1 基本分隔线
上面的文字
[hr]
下面的文字

10.2 分隔线前后有空行
上面有空行

[hr]

下面有空行`;
    testRoundtrip(bbcode, "分隔线 section 10");
  });

  it("复杂混合 section (11)", () => {
    const bbcode = `[h1]十一、复杂混合测试[/h1]

11.1 标题+图片+文字
[h2]混合场景A[/h2]
[previewimg=10000002;sizeThumb,floatLeft;测试用图片400x400.jpg][/previewimg]
这是图片旁边的说明文字，测试图片和文字的混排效果。

11.2 列表+图片
[list]
[*]列表项带图片[previewicon=10000003;sizeOriginal,inline;测试用图片100x100.jpg][/previewicon]
[*]普通列表项
[/list]

11.3 表格+图片
[table]
[tr][th]图片列[/th][th]说明列[/th][/tr]
[tr][td][previewicon=10000003;sizeOriginal,inline;测试用图片100x100.jpg][/previewicon][/td][td]这是图片说明[/td][/tr]
[/table]

11.4 引用内含格式
[quote=测试者]这段引用包含[b]粗体[/b]、[i]斜体[/i]和[url=https://example.com]链接[/url][/quote]

11.5 完整文章模拟
[h1]游戏攻略标题[/h1]

欢迎阅读本攻略，下面是详细内容。

[h2]第一章：入门[/h2]

首先，你需要了解基本操作：

[list]
[*]W键前进
[*]S键后退
[*]空格跳跃
[/list]

[previewimg=10000001;sizeThumb,floatLeft;测试指南图1024x687.jpg][/previewimg]

如图所示，这是游戏的主界面。

[h2]第二章：进阶[/h2]

进阶技巧包括：

[olist]
[*]学会闪避
[*]掌握连招
[*]合理配装
[/olist]

[quote=老玩家]熟能生巧，多练习就会了[/quote]

[h2]附录：数据表[/h2]

[table]
[tr][th]属性[/th][th]效果[/th][th]推荐度[/th][/tr]
[tr][td]力量[/td][td]+攻击[/td][td]★★★[/td][/tr]
[tr][td]敏捷[/td][td]+速度[/td][td]★★☆[/td][/tr]
[tr][td]智力[/td][td]+魔法[/td][td]★☆☆[/td][/tr]
[/table]

祝游戏愉快！`;
    testRoundtrip(bbcode, "复杂混合 section 11");
  });
});

// ============================================================
// 十二、Steam 兼容性回归（hotfix 防退化）
// ============================================================
describe("Steam 兼容性回归", () => {
  // [code] 内容必须按字面保留，不被全局 BBCode replace 误吞
  // 历史 bug：[code][b]X[/b][/code] → <pre><code><strong>X</strong></code></pre>
  //          反向走 textContent → [code]X[/code]，[b] 标签永久消失
  it("[code] 内的 BBCode 标签按字面保留", () => {
    testRoundtrip("[code][b]not bold[/b][/code]");
  });

  it("[code] 内的多种 BBCode 标签", () => {
    testRoundtrip("[code][b]粗体[/b] [i]斜体[/i] [url=https://x.com]链接[/url][/code]");
  });

  it("[code] 内的尖括号字符", () => {
    testRoundtrip("[code]if (x < 10 && y > 5) { return true; }[/code]");
  });

  it("[code] 内的实体字符 &amp;", () => {
    testRoundtrip("[code]a & b && c[/code]");
  });

  // Negative assertion：确保 [code] 内的 [b] 不会被解析成 <strong>
  it("[code] 内 [b] 不应被解析为 <strong>", () => {
    const html = bbcodeToHtml("[code][b]X[/b][/code]");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("[b]X[/b]");
  });

  // [url] 无等号形式：Steam 自动用 URL 做 label
  // 历史 bug：[url]https://x[/url] → 输出畸形 [url]https://x（缺闭合标签）
  // 修复后：bare 形式被规范化为命名形式 [url=X]X[/url]，Steam 渲染等价。
  // 这是合法规范化（类似 [/td]\n[/tr] → [/td][/tr]），需验证：
  //   1. 不再产生畸形输出
  //   2. 规范化后的形式幂等
  it("[url] 无等号形式不再产生畸形输出", () => {
    const input = "[url]https://example.com[/url]";
    const html = bbcodeToHtml(input);
    const out = htmlToBBCode(html);
    // 必须含完整闭合标签
    expect(out).toContain("[/url]");
    // 必须能被解析为有效链接
    expect(html).toContain('<a href="https://example.com">');
    // 规范化为命名形式后必须幂等
    testRoundtrip(out);
  });

  it("[url] 无等号形式与文字混排", () => {
    const input = "访问 [url]https://store.steampowered.com[/url] 查看详情";
    const html = bbcodeToHtml(input);
    const out = htmlToBBCode(html);
    expect(out).toContain("访问 ");
    expect(out).toContain(" 查看详情");
    expect(out).toContain("[/url]");
    testRoundtrip(out);  // 规范化后幂等
  });

  // Negative assertion 模式补强：[code] 内任意 inline 标签都不应被解析
  it("[code] 内 [i] 不应被解析为 <em>", () => {
    const html = bbcodeToHtml("[code][i]X[/i][/code]");
    expect(html).not.toContain("<em>");
    expect(html).toContain("[i]X[/i]");
  });

  it("[code] 内 [url=] 不应被解析为 <a>", () => {
    const html = bbcodeToHtml("[code][url=https://x.com]X[/url][/code]");
    expect(html).not.toContain("<a ");
    expect(html).toContain("[url=https://x.com]");
  });
});

// ============================================================
// 十三、嵌套引用规范化（idempotent，不严格 roundtrip）
// ============================================================
// 注：嵌套 quote 的 [/quote] 闭合前会被加 \n，这是 converter 的合法规范化
// （Steam 渲染等价）。检查策略：第二次往返必须与第一次相同（幂等）。
describe("嵌套引用规范化", () => {
  function testIdempotent(input: string) {
    const out1 = htmlToBBCode(bbcodeToHtml(input));
    const out2 = htmlToBBCode(bbcodeToHtml(out1));
    expect(out2).toBe(out1);
  }

  it("带作者嵌套 quote", () => {
    testIdempotent("[quote=外][quote=内]inner[/quote]outer[/quote]");
  });

  it("无作者嵌套 quote", () => {
    testIdempotent("[quote][quote]a[/quote]b[/quote]");
  });

  it("嵌套 quote 末尾无文字", () => {
    testIdempotent("[quote=A][quote=B]X[/quote][/quote]");
  });

  it("嵌套 quote 前后都有文字", () => {
    testIdempotent("[quote=A]pre[quote=B]X[/quote]post[/quote]");
  });
});

// ============================================================
// 十四、标题内换行（[h1]X\nY[/h1] → <h1>X<br>Y</h1>）
// ============================================================
describe("标题内换行", () => {
  it("h1 含换行", () => {
    testRoundtrip("[h1]第一行\n第二行[/h1]");
  });

  it("h2 含换行", () => {
    testRoundtrip("[h2]A\nB[/h2]");
  });

  it("h3 单独使用", () => {
    testRoundtrip("[h3]三级标题[/h3]");
  });

  it("h3 后紧跟文字", () => {
    testRoundtrip("[h3]小节标题[/h3]\n小节内容");
  });

  it("h3 后空一行再跟文字", () => {
    testRoundtrip("[h3]小节标题[/h3]\n\n空一行后的文字");
  });
});

// ============================================================
// 十五、图片尺寸/对齐组合补全
// ============================================================
describe("图片尺寸对齐组合", () => {
  // previewicon 完整尺寸/对齐矩阵
  it("previewicon sizeFull,inline", () => {
    testRoundtrip("[previewicon=12345;sizeFull,inline;a.png][/previewicon]");
  });

  it("previewicon sizeThumb,floatLeft", () => {
    testRoundtrip("X[previewicon=12345;sizeThumb,floatLeft;a.png][/previewicon]Y");
  });

  it("previewicon sizeThumb,floatRight", () => {
    testRoundtrip("X[previewicon=12345;sizeThumb,floatRight;a.png][/previewicon]Y");
  });

  // previewimg 补 sizeFull + 各种对齐
  it("previewimg sizeFull,floatRight", () => {
    testRoundtrip("[previewimg=12345;sizeFull,floatRight;a.png][/previewimg]");
  });

  it("previewimg sizeThumb,floatRight", () => {
    testRoundtrip("[previewimg=12345;sizeThumb,floatRight;a.png][/previewimg]");
  });

  // 原始 [img] 标签（非 preview 形式）
  it("[img] 原始图片标签", () => {
    testRoundtrip("[img]https://example.com/a.png[/img]");
  });

  it("[img] 与文字混排", () => {
    testRoundtrip("前文\n[img]https://example.com/a.png[/img]\n后文");
  });
});

// ============================================================
// 十六、bbcodeTitleToHtml — 章节标题预览
// ============================================================
describe("bbcodeTitleToHtml", () => {
  it("纯文本标题不解析任何 BBCode", () => {
    // 标题预览不解析 [b] 等格式标签，按字面保留
    expect(bbcodeTitleToHtml("普通章节标题")).toBe("普通章节标题");
    expect(bbcodeTitleToHtml("[b]粗体[/b]")).toBe("[b]粗体[/b]");
  });

  it("含 previewicon 的标题渲染为 <img> 并丢弃后续文字", () => {
    const html = bbcodeTitleToHtml(
      "[previewicon=12345;sizeOriginal,inline;a.png][/previewicon]章节文字"
    );
    expect(html).toContain("<img");
    expect(html).toContain("nasge-chapter-preview-image");
    // 图片后的"章节文字"应被剥离
    expect(html).not.toContain("章节文字");
  });

  it("含 previewimg 的标题渲染为 <img>", () => {
    const html = bbcodeTitleToHtml(
      "[previewimg=12345;sizeOriginal,floatLeft;a.png][/previewimg]"
    );
    expect(html).toContain("<img");
    expect(html).toContain('alt="a.png"');
  });

  it("含原始 [img] 的标题", () => {
    const html = bbcodeTitleToHtml("[img]https://example.com/a.png[/img]");
    expect(html).toContain("<img");
    expect(html).toContain('src="https://example.com/a.png"');
  });

  it("非字符串输入：fallback 到字符串化", () => {
    // @ts-expect-error 故意传非字符串
    expect(bbcodeTitleToHtml(null)).toBe("");
    // @ts-expect-error 故意传非字符串
    expect(bbcodeTitleToHtml(123)).toBe("123");
  });
});
