import { useCallback, useMemo } from "react";

const runtime = chrome?.runtime;

const App: React.FC = () => {
  const editorUrl = useMemo(() => runtime?.getURL("src/editor/index.html"), []);

  const handleOpenEditor = useCallback(() => {
    if (!editorUrl) {
      console.warn("无法生成编辑器链接");
      return;
    }

    if (chrome?.tabs) {
      chrome.tabs.create({ url: editorUrl });
    } else {
      window.open(editorUrl, "_blank", "noopener,noreferrer");
    }
  }, [editorUrl]);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        padding: "1.5rem",
        background:
          "linear-gradient(180deg, rgba(19, 33, 55, 0.92) 0%, rgba(13, 22, 36, 0.96) 100%)"
      }}
    >
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "#f5fbff"
          }}
        >
          NASGE
        </h1>
        <p
          style={{
            margin: "0.5rem 0 0",
            fontSize: "0.9rem",
            color: "#9eb7d6"
          }}
        >
          Steam 指南扩展 · Sprint 0
        </p>
      </header>

      <section
        style={{
          background: "rgba(21, 34, 52, 0.85)",
          borderRadius: "0.9rem",
          border: "1px solid rgba(102, 192, 244, 0.18)",
          padding: "1.1rem",
          fontSize: "0.85rem",
          lineHeight: 1.6,
          boxShadow: "0 12px 24px rgba(14, 23, 37, 0.45)"
        }}
      >
        <strong>当前状态：</strong> 已完成基础脚手架和示例组件加载。
        <br />
        请在开发者模式下加载扩展，测试弹窗与编辑器页面是否能够打开。
      </section>

      <button
        onClick={handleOpenEditor}
        style={{
          height: "2.6rem",
          borderRadius: "0.75rem",
          border: "none",
          background:
            "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
          color: "#06101e",
          fontSize: "1rem",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 14px 24px rgba(32, 64, 99, 0.35)"
        }}
      >
        打开编辑器页面
      </button>
    </main>
  );
};

export default App;
