import React, { useEffect, useMemo, useState } from "react";
import TipTapEditor from "./components/TipTapEditor";
import { bbcodeToHtml, htmlToBBCode } from "./utils/bbcode";
import { useGuideStore } from "./stores/useGuideStore";

const App: React.FC = () => {
  const [htmlPreview, setHtmlPreview] = useState<string>("");
  const [bbcodePreview, setBbcodePreview] = useState<string>("");
  const [externalHtml, setExternalHtml] = useState<string>("");
  const [bbcodeInput, setBbcodeInput] = useState<string>("");

  const { chapters, activeId, addChapter, selectChapter, updateChapter, deleteChapter, restoreChapter } = useGuideStore();

  const activeChapter = useMemo(() => chapters.find((chapter) => chapter.id === activeId) ?? chapters[0], [chapters, activeId]);

  useEffect(() => {
    if (activeChapter && activeChapter.bbcode) {
      const html = bbcodeToHtml(activeChapter.bbcode);
      setExternalHtml(html);
      setHtmlPreview(html);
      setBbcodePreview(activeChapter.bbcode);
    } else {
      setExternalHtml('');
      setHtmlPreview('');
      setBbcodePreview('');
    }
  }, [activeChapter?.id]);

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
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: "1.5rem",
          alignItems: "start"
        }}
      >
        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}
        >
          <button
            type="button"
            onClick={addChapter}
            style={{
              height: "2.4rem",
              borderRadius: "0.75rem",
              border: "none",
              background:
                "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
              color: "#06101e",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 12px 22px rgba(32, 64, 99, 0.35)"
            }}
          >
            新增章节
          </button>

          <div
            style={{
              background: "rgba(8, 14, 23, 0.85)",
              border: "1px solid rgba(102, 192, 244, 0.18)",
              borderRadius: "0.75rem",
              overflow: "hidden"
            }}
          >
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => selectChapter(chapter.id)}
                style={{
                  width: "100%",
                  border: "none",
                  background:
                    activeChapter?.id === chapter.id
                      ? "rgba(102, 192, 244, 0.22)"
                      : "transparent",
                  color: "#d7e8ff",
                  textAlign: "left",
                  padding: "0.7rem 0.9rem",
                  fontSize: "0.9rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer"
                }}
              >
                <span style={{ flex: 1, marginRight: "0.5rem" }}>{chapter.title}</span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    opacity: 0.6
                  }}
                >
                  {new Date(chapter.updatedAt).toLocaleTimeString()}
                </span>
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem"
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
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <TipTapEditor
          externalHTML={externalHtml}
          onUpdate={({ html }) => {
            setHtmlPreview(html);
            setBbcodePreview(htmlToBBCode(html));
            if (activeChapter) {
              updateChapter(activeChapter.id, { bbcode: htmlToBBCode(html) });
            }
          }}
        />

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
        <div
          style={{
            marginTop: "1rem",
            background: "rgba(6, 14, 25, 0.9)",
            border: "1px solid rgba(102, 192, 244, 0.15)",
            borderRadius: "0.75rem",
            padding: "0.9rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
            fontSize: "0.78rem",
            color: "#7ea0c6",
            lineHeight: 1.6,
            maxHeight: "160px",
            overflowY: "auto"
          }}
        >
          {bbcodePreview || "BBCode 将展示在此。"}
        </div>

        <div
          style={{
            marginTop: "1.4rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem"
          }}
        >
          <label style={{ color: "#9eb4d4", fontSize: "0.9rem" }}>
            从 BBCode 导入
          </label>
          <textarea
            value={bbcodeInput}
            onChange={(event) => setBbcodeInput(event.target.value)}
            placeholder="[b]示例[/b]"
            style={{
              width: "100%",
              minHeight: "120px",
              background: "rgba(6, 14, 25, 0.85)",
              border: "1px solid rgba(102, 192, 244, 0.18)",
              borderRadius: "0.75rem",
              padding: "0.75rem",
              color: "#d7e8ff",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              resize: "vertical"
            }}
          />
          <button
            type="button"
            onClick={() => {
              const html = bbcodeToHtml(bbcodeInput);
              setExternalHtml(html);
              if (activeChapter) {
                updateChapter(activeChapter.id, { bbcode: bbcodeInput });
              }
            }}
            style={{
              alignSelf: "flex-start",
              padding: "0.6rem 1.2rem",
              borderRadius: "0.6rem",
              border: "none",
              background:
                "linear-gradient(135deg, rgba(102, 192, 244, 0.95), rgba(66, 139, 202, 0.95))",
              color: "#06101e",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(32, 64, 99, 0.3)"
            }}
          >
            应用 BBCode
          </button>
        </div>
        </div>
      </section>
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
