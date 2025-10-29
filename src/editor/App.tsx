import React from "react";

const sectionStyle: React.CSSProperties = {
  borderRadius: "1rem",
  background: "rgba(255, 255, 255, 0.04)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  padding: "1.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem"
};

const App: React.FC = () => {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(88, 101, 242, 0.25), transparent 60%)",
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
            fontSize: "2.5rem",
            fontWeight: 700,
            letterSpacing: "0.05em"
          }}
        >
          NASGE 编辑器
        </h1>
        <p style={{ margin: "1rem 0 0", maxWidth: "520px", lineHeight: 1.8 }}>
          Sprint 0 验证页：当前仅渲染占位内容，后续将集成所见即所得编辑器、章节导航与实时预览。
          现在的目标是确认页面能够通过扩展入口打开，并具备 React 渲染能力。
        </p>
      </header>

      <section style={sectionStyle}>
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>即将交付的能力</h2>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.8 }}>
          <li>React + Tiptap/Slate 富文本编辑核心</li>
          <li>图片上传、插入与撤销机制</li>
          <li>章节列表管理与本地草稿保存</li>
          <li>Steam API 集成（内容脚本 + 背景 Service Worker）</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: 0, fontSize: "1.15rem" }}>检查清单</h3>
        <ol style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.8 }}>
          <li>扩展打包是否生成 <code>editor/index.html</code> 资源</li>
          <li>通过 popup 入口能否在新标签页打开此页面</li>
          <li>热更新／ watch 模式是否及时输出</li>
        </ol>
      </section>
    </div>
  );
};

export default App;
