import { useCallback, useMemo } from "react";
import { useCurrentPage } from "./hooks/useCurrentPage";

const runtime = chrome?.runtime;

const App: React.FC = () => {
  const pageInfo = useCurrentPage();
  const editorUrl = useMemo(() => runtime?.getURL("src/editor/index.html"), []);
  const version = useMemo(() => runtime?.getManifest()?.version || "0.0.0", []);

  const openEditor = useCallback((mode: string, guideId?: string, appId?: string) => {
    if (!editorUrl) {
      console.warn("[NASGE] 无法生成编辑器链接");
      return;
    }

    // 构建带参数的 URL
    const url = new URL(editorUrl);
    url.searchParams.set('mode', mode);
    if (guideId) {
      url.searchParams.set('guideId', guideId);
    }
    if (appId) {
      url.searchParams.set('appId', appId);
    }

    console.log('[NASGE] 打开编辑器:', { mode, guideId, appId, url: url.toString() });

    if (chrome?.tabs) {
      chrome.tabs.create({ url: url.toString() });
    } else {
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    }
  }, [editorUrl]);

  const handleEditGuide = useCallback(() => {
    if (pageInfo?.guideId) {
      openEditor('guide', pageInfo.guideId);
    }
  }, [pageInfo, openEditor]);

  const handleEditReview = useCallback(() => {
    if (pageInfo?.appId) {
      openEditor('review', undefined, pageInfo.appId);
    }
  }, [pageInfo, openEditor]);

  const handleOpenOffline = useCallback(() => {
    openEditor('offline-guide');
  }, [openEditor]);

  // 根据页面类型显示提示信息
  const getStatusText = () => {
    if (!pageInfo) {
      return "正在检测页面...";
    }

    switch (pageInfo.type) {
      case 'guide':
        return `已检测到指南管理页`;
      case 'review':
        return pageInfo.appId ? `已检测到游戏商店页（appId: ${pageInfo.appId}）` : `已检测到评测页`;
      case 'other':
        return `当前页面不是 Steam 指南或评测页`;
      default:
        return "未知页面类型";
    }
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "1.5rem",
        minWidth: "320px",
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
            fontSize: "0.85rem",
            color: "#9eb7d6"
          }}
        >
          New Awesome Steam Guide Editor · v{version}
        </p>
      </header>

      <section
        style={{
          background: "rgba(21, 34, 52, 0.85)",
          borderRadius: "0.75rem",
          border: "1px solid rgba(102, 192, 244, 0.18)",
          padding: "0.9rem",
          fontSize: "0.85rem",
          lineHeight: 1.5,
          color: "#c7dff7"
        }}
      >
        {getStatusText()}
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {/* 编辑此指南按钮 - 仅在指南管理页显示 */}
        {pageInfo?.type === 'guide' && pageInfo.guideId && (
          <button
            onClick={handleEditGuide}
            style={{
              height: "2.8rem",
              borderRadius: "0.75rem",
              border: "none",
              background:
                "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
              color: "#06101e",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(32, 64, 99, 0.35)",
              transition: "transform 0.1s, box-shadow 0.1s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 12px 20px rgba(32, 64, 99, 0.45)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 16px rgba(32, 64, 99, 0.35)";
            }}
          >
            编辑此指南
          </button>
        )}

        {/* 编辑此评测按钮 - 仅在评测页显示 */}
        {pageInfo?.type === 'review' && (
          <button
            onClick={handleEditReview}
            style={{
              height: "2.8rem",
              borderRadius: "0.75rem",
              border: "none",
              background:
                "linear-gradient(135deg, rgba(155, 89, 182, 0.95), rgba(142, 68, 173, 0.95))",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(91, 44, 111, 0.35)",
              transition: "transform 0.1s, box-shadow 0.1s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 12px 20px rgba(91, 44, 111, 0.45)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 16px rgba(91, 44, 111, 0.35)";
            }}
          >
            编辑此评测
          </button>
        )}

        {/* 打开编辑器按钮 - 总是显示 */}
        <button
          onClick={handleOpenOffline}
          style={{
            height: "2.5rem",
            borderRadius: "0.75rem",
            border: "1px solid rgba(102, 192, 244, 0.3)",
            background: "rgba(21, 34, 52, 0.6)",
            color: "#c7dff7",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.2s, border-color 0.2s"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(21, 34, 52, 0.85)";
            e.currentTarget.style.borderColor = "rgba(102, 192, 244, 0.5)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "rgba(21, 34, 52, 0.6)";
            e.currentTarget.style.borderColor = "rgba(102, 192, 244, 0.3)";
          }}
        >
          打开编辑器（离线模式）
        </button>
      </div>
    </main>
  );
};

export default App;
