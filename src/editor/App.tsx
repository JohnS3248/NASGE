import React, { useState } from "react";
import TipTapEditor from "./components/TipTapEditor";

const App: React.FC = () => {
  const [htmlPreview, setHtmlPreview] = useState<string>("");

  const sectionStyle: React.CSSProperties = {
    borderRadius: "1.05rem",
    background: "rgba(20, 33, 52, 0.88)",
    border: "1px solid rgba(102, 192, 244, 0.18)",
    padding: "1.6rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
    boxShadow: "0 18px 36px rgba(10, 18, 30, 0.45)"
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 20% 0%, rgba(102, 192, 244, 0.2), transparent 55%), linear-gradient(180deg, #101a2b 0%, #0b1522 100%)",
        padding: "2.5rem",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "2rem"
      }}
    >
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: "#f6fbff",
            textShadow: "0 10px 25px rgba(7, 14, 23, 0.5)"
          }}
        >
          NASGE 编辑器
        </h1>
        <p
          style={{
            margin: "1rem 0 0",
            maxWidth: "560px",
            lineHeight: 1.8,
            color: "#a4bedc"
          }}
        >
          Sprint 0 验证页：当前仅渲染占位内容，后续将集成所见即所得编辑器、章节导航与实时预览。
          现在的目标是确认页面能够通过扩展入口打开，并具备 React 渲染能力。
        </p>
      </header>

      <section style={sectionStyle}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#d7e8ff" }}>
          即将交付的能力
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            lineHeight: 1.8,
            color: "#adc6df"
          }}
        >
          <li>React + Tiptap/Slate 富文本编辑核心</li>
          <li>图片上传、插入与撤销机制</li>
          <li>章节列表管理与本地草稿保存</li>
          <li>Steam API 集成（内容脚本 + 背景 Service Worker）</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#d7e8ff" }}>
          检查清单
        </h3>
        <ol
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            lineHeight: 1.8,
            color: "#adc6df"
          }}
        >
          <li>扩展打包是否生成 <code>editor/index.html</code> 资源</li>
          <li>通过 popup 入口能否在新标签页打开此页面</li>
          <li>热更新／ watch 模式是否及时输出</li>
        </ol>
      </section>

      <section
        style={{
          ...sectionStyle,
          background: "rgba(13, 23, 36, 0.9)",
          border: "1px solid rgba(102, 192, 244, 0.28)"
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#d7e8ff" }}>
          富文本编辑器 POC
        </h2>
        <p style={{ margin: "0.4rem 0 1.2rem", color: "#9eb4d4", lineHeight: 1.7 }}>
          这是 Tiptap 的最小可行版本，已支持加粗、斜体、列表和代码块。后续会扩展成 BBCode
          映射、章节同步等功能。
        </p>

        <TipTapEditor onUpdate={setHtmlPreview} />

        <div
          style={{
            marginTop: "1.2rem",
            background: "rgba(6, 14, 25, 0.85)",
            border: "1px solid rgba(102, 192, 244, 0.2)",
            borderRadius: "0.75rem",
            padding: "0.9rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
            fontSize: "0.8rem",
            color: "#80a4c7",
            lineHeight: 1.6,
            maxHeight: "160px",
            overflowY: "auto"
          }}
        >
          {htmlPreview || "<p>编辑器输出将实时展示在此。</p>"}
        </div>
      </section>
    </div>
  );
};

export default App;
