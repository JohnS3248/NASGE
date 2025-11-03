import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import TipTapEditor from "./components/TipTapEditor";
import { bbcodeToHtml, htmlToBBCode } from "./utils/bbcode";
import { useGuideStore } from "./stores/useGuideStore";
import { JSONContent } from "@tiptap/core";
import { EMPTY_DOC, createEditorExtensions, createEmptyDoc } from "./utils/editorExtensions";
import { generateHTML, generateJSON } from "@tiptap/html";
import UploadStatusHUD from "./components/UploadStatusHUD";
import SteamImagePool from "./components/SteamImagePool";
import { deleteSteamImage } from "./services/steamBridge";
import { useSteamGuideImageStore } from "./stores/useSteamGuideImageStore";

const App: React.FC = () => {
  const [externalDoc, setExternalDoc] = useState<JSONContent>(() => createEmptyDoc());
  const [currentHtml, setCurrentHtml] = useState<string>("");
  const lastAppliedSerializedRef = useRef<string | null>(null);
  const [chapterPanelOpen, setChapterPanelOpen] = useState(false);

  const { chapters, activeId, addChapter, selectChapter, updateChapter, deleteChapter, restoreChapter } = useGuideStore();

  const activeChapter = useMemo(() => chapters.find((chapter) => chapter.id === activeId) ?? chapters[0], [chapters, activeId]);
  const htmlExtensions = useMemo(() => createEditorExtensions(), []);

  const docToHtml = useCallback(
    (doc: JSONContent) => generateHTML(doc, htmlExtensions),
    [htmlExtensions]
  );

  useEffect(() => {
    const nextDoc = activeChapter?.content ?? createEmptyDoc();
    const nextSerialized = JSON.stringify(nextDoc);

    if (lastAppliedSerializedRef.current === nextSerialized) {
      return;
    }

    lastAppliedSerializedRef.current = nextSerialized;
    setExternalDoc(nextDoc);
    setCurrentHtml(docToHtml(nextDoc));
  }, [activeChapter?.content, activeChapter?.id, docToHtml]);

  const handleExportBBCode = useCallback(() => {
    if (!currentHtml) {
      window.alert("当前章节为空，没有可导出的 BBCode。");
      return;
    }
    const bbcode = htmlToBBCode(currentHtml);
    try {
      void navigator.clipboard?.writeText(bbcode);
      window.alert("BBCode 已复制到剪贴板。");
    } catch {
      window.prompt("复制以下 BBCode", bbcode);
    }
  }, [currentHtml]);

  const handleImportBBCode = useCallback(() => {
    const input = window.prompt("粘贴要导入的 BBCode", "");
    if (input === null) return;
    const html = bbcodeToHtml(input);
    let doc: JSONContent;
    try {
      doc = generateJSON(html, htmlExtensions);
    } catch (error) {
      console.error("导入 BBCode 失败", error);
      window.alert("BBCode 内容无法识别，请检查格式后再试。");
      return;
    }
    setExternalDoc(doc);
    setCurrentHtml(docToHtml(doc));
    lastAppliedSerializedRef.current = JSON.stringify(doc);
    if (activeChapter) {
      updateChapter(activeChapter.id, { content: doc });
    }
  }, [activeChapter, updateChapter, htmlExtensions, docToHtml]);

  const handleDeleteUploadedRecord = useCallback(async (previewId: string) => {
    console.info("[NASGE] 请求删除 Steam 预览记录", previewId);

    if (!window.confirm("确定要删除这张图片吗？删除后无法恢复。")) {
      return;
    }

    try {
      await deleteSteamImage(previewId, "chapter-preview");

      const steamImageStore = useSteamGuideImageStore.getState();
      steamImageStore.removeItem(previewId);

      window.alert("图片已成功删除。");
    } catch (error) {
      console.error("[NASGE] 删除图片失败", error);
      const message = error instanceof Error ? error.message : "删除失败，未知错误";
      window.alert(`删除图片失败：${message}`);
    }
  }, []);

  const sectionStyle: React.CSSProperties = {
    borderRadius: "1.05rem",
    background: "rgba(13, 23, 36, 0.9)",
    border: "1px solid rgba(102, 192, 244, 0.25)",
    padding: "1.6rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
    boxShadow: "0 24px 40px rgba(10, 18, 30, 0.45)"
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 20% 0%, rgba(102, 192, 244, 0.2), transparent 55%), linear-gradient(180deg, #101a2b 0%, #0b1522 100%)",
        padding: "2rem 2.5rem 3rem",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "2rem"
      }}
    >
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem"
        }}
      >
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
            maxWidth: "620px",
            lineHeight: 1.8,
            color: "#a4bedc"
          }}
        >
          New Awesome Steam Guide Editor — 在浏览器中构建完全所见即所得的 Steam 指南。
          支持自定义 BBCode、图片、表格与章节同步。
        </p>
      </header>

      <section
        style={{
          ...sectionStyle,
          padding: "1rem 1.4rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem",
            borderRadius: "0.6rem",
            background: "rgba(8, 14, 23, 0.6)",
            cursor: "pointer"
          }}
          onClick={() => setChapterPanelOpen(!chapterPanelOpen)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            <span style={{ fontSize: "0.9rem", color: "#d7e8ff", fontWeight: 600 }}>
              {chapterPanelOpen ? "▼" : "▶"} 章节管理
            </span>
            <span style={{ fontSize: "0.85rem", color: "#8aa4c7" }}>
              当前: {activeChapter?.title || "未选择"}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addChapter();
            }}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
              color: "#06101e",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.8rem"
            }}
          >
            新增章节
          </button>
        </div>

        {chapterPanelOpen && (
          <div
            style={{
              padding: "0.8rem",
              borderRadius: "0.7rem",
              background: "rgba(8, 14, 23, 0.85)",
              border: "1px solid rgba(102, 192, 244, 0.18)",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem"
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "0.6rem",
                maxHeight: "200px",
                overflowY: "auto"
              }}
            >
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => selectChapter(chapter.id)}
                  style={{
                    border: "1px solid rgba(102, 192, 244, 0.2)",
                    borderRadius: "0.5rem",
                    background:
                      activeChapter?.id === chapter.id
                        ? "rgba(102, 192, 244, 0.22)"
                        : "rgba(12, 20, 32, 0.7)",
                    color: "#d7e8ff",
                    textAlign: "left",
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem"
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{chapter.title}</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                    {new Date(chapter.updatedAt).toLocaleTimeString()}
                  </span>
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid rgba(102, 192, 244, 0.15)"
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (activeChapter) {
                    const newTitle = window.prompt("章节标题", activeChapter.title);
                    if (newTitle) {
                      updateChapter(activeChapter.id, { title: newTitle });
                    }
                  }
                }}
                style={subActionButtonStyle}
              >
                重命名
              </button>
              <button
                type="button"
                onClick={() => activeChapter && deleteChapter(activeChapter.id)}
                style={subActionButtonStyle}
              >
                删除
              </button>
              <button
                type="button"
                onClick={() => restoreChapter()}
                style={subActionButtonStyle}
              >
                撤销删除
              </button>
            </div>
          </div>
        )}
      </section>

      <section
        style={{
          ...sectionStyle,
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: "1.5rem",
          alignItems: "start"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.6rem"
            }}
          >
            <button
              type="button"
              onClick={handleImportBBCode}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "0.6rem",
                border: "1px solid rgba(102, 192, 244, 0.35)",
                background: "rgba(12, 21, 33, 0.85)",
                color: "#cfe7ff",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              导入 BBCode
            </button>
            <button
              type="button"
              onClick={handleExportBBCode}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "0.6rem",
                border: "1px solid rgba(102, 192, 244, 0.35)",
                background:
                  "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
                color: "#06101e",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              导出 BBCode
            </button>
          </div>
          <TipTapEditor
            externalDoc={externalDoc}
            onUpdate={({ html, json }) => {
              setCurrentHtml(html);
              if (activeChapter) {
                const nextSerialized = JSON.stringify(json);
                lastAppliedSerializedRef.current = nextSerialized;
                const currentSerialized = JSON.stringify(activeChapter.content);
                if (nextSerialized !== currentSerialized) {
                  updateChapter(activeChapter.id, { content: json });
                }
              }
            }}
          />
        </div>

        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}
        >
          <SteamImagePool onDelete={handleDeleteUploadedRecord} />
        </aside>
      </section>
      <UploadStatusHUD />
    </div>
  );
};

export default App;

const subActionButtonStyle: React.CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: "0.65rem",
  padding: "0.55rem 0.75rem",
  background: "rgba(20, 33, 52, 0.85)",
  color: "#d7e8ff",
  cursor: "pointer",
  fontSize: "0.85rem"
};
