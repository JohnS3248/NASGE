import { useCallback, useMemo } from "react";

const runtime = chrome?.runtime;

const App: React.FC = () => {
  const editorUrl = useMemo(() => {
    return runtime?.getURL("src/editor/index.html");
  }, []);

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
        gap: "1rem",
        padding: "1.25rem"
      }}
    >
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            letterSpacing: "0.04em"
          }}
        >
          NASGE
        </h1>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", opacity: 0.7 }}>
          Steam 指南扩展 · Sprint 0
        </p>
      </header>

      <section
        style={{
          background: "rgba(255, 255, 255, 0.06)",
          borderRadius: "0.75rem",
          padding: "1rem",
          fontSize: "0.85rem",
          lineHeight: 1.6
        }}
      >
        <strong>当前状态：</strong> 已完成基础脚手架和示例组件加载。
        <br />
        请在开发者模式下加载扩展，测试弹窗与编辑器页面是否能够打开。
      </section>

      <button
        onClick={handleOpenEditor}
        style={{
          height: "2.5rem",
          borderRadius: "0.75rem",
          border: "none",
          background:
            "linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(129, 140, 248, 0.9))",
          color: "#fff",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        打开编辑器页面
      </button>
    </main>
  );
};

export default App;
