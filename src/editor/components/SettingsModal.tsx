import React from "react";
import { useEditorConfigStore } from "../stores/useEditorConfigStore";

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose
}) => {
  const autoUploadOnPaste = useEditorConfigStore(
    (state) => state.autoUploadOnPaste
  );
  const autoUploadOnDrop = useEditorConfigStore(
    (state) => state.autoUploadOnDrop
  );
  const autoUploadInPanel = useEditorConfigStore(
    (state) => state.autoUploadInPanel
  );
  const promptRenameOnPaste = useEditorConfigStore(
    (state) => state.promptRenameOnPaste
  );
  const debugMode = useEditorConfigStore(
    (state) => state.debugMode
  );
  const setAutoUploadOnPaste = useEditorConfigStore(
    (state) => state.setAutoUploadOnPaste
  );
  const setAutoUploadOnDrop = useEditorConfigStore(
    (state) => state.setAutoUploadOnDrop
  );
  const setAutoUploadInPanel = useEditorConfigStore(
    (state) => state.setAutoUploadInPanel
  );
  const setPromptRenameOnPaste = useEditorConfigStore(
    (state) => state.setPromptRenameOnPaste
  );
  const setDebugMode = useEditorConfigStore(
    (state) => state.setDebugMode
  );

  if (!visible) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.65)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
        onClick={onClose}
      >
        {/* 弹窗内容 */}
        <div
          style={{
            background: "rgba(15, 26, 41, 0.98)",
            border: "1px solid rgba(102, 192, 244, 0.35)",
            borderRadius: "1rem",
            padding: "1.5rem",
            minWidth: "420px",
            maxWidth: "90vw",
            boxShadow: "0 24px 48px rgba(6, 12, 20, 0.75)"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题 */}
          <div
            style={{
              fontSize: "1.15rem",
              fontWeight: 600,
              color: "#e5f3ff",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span>编辑器设置</span>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(205, 226, 255, 0.6)",
                fontSize: "1.5rem",
                cursor: "pointer",
                padding: "0",
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>

          {/* 设置项 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem"
            }}
          >
            {/* 分组标题 */}
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "rgba(173, 205, 244, 0.8)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "-0.5rem"
              }}
            >
              图片上传
            </div>

            {/* 粘贴自动上传 */}
            <ToggleOption
              label="粘贴图片时自动上传"
              description="复制粘贴图片后立即上传到 Steam"
              checked={autoUploadOnPaste}
              onChange={setAutoUploadOnPaste}
            />

            {/* 编辑器拖放自动上传 */}
            <ToggleOption
              label="编辑器拖放自动上传"
              description="拖拽图片到编辑器后立即上传到 Steam"
              checked={autoUploadOnDrop}
              onChange={setAutoUploadOnDrop}
            />

            {/* 悬浮窗自动上传 */}
            <ToggleOption
              label="图片池自动上传"
              description="拖放或粘贴图片到图片池悬浮窗后立即上传"
              checked={autoUploadInPanel}
              onChange={setAutoUploadInPanel}
            />

            {/* 粘贴重命名 */}
            <ToggleOption
              label="粘贴时重命名"
              description="粘贴图片到图片池后自动选中文件名便于重命名"
              checked={promptRenameOnPaste}
              onChange={setPromptRenameOnPaste}
            />

            {/* 提示信息 */}
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.85rem 1rem",
                background: "rgba(102, 192, 244, 0.08)",
                border: "1px solid rgba(102, 192, 244, 0.2)",
                borderRadius: "0.6rem",
                fontSize: "0.8rem",
                color: "rgba(205, 226, 255, 0.75)",
                lineHeight: 1.6
              }}
            >
              💡 <strong>提示：</strong>关闭自动上传后，图片仍会插入编辑器并显示本地预览。
              未来版本将支持手动选择上传图片。
            </div>

            {/* 分隔线 */}
            <div
              style={{
                height: "1px",
                background: "rgba(102, 192, 244, 0.15)",
                margin: "0.5rem 0"
              }}
            />

            {/* 开发者选项分组 */}
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "rgba(173, 205, 244, 0.8)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "-0.5rem"
              }}
            >
              开发者选项
            </div>

            {/* 调试模式 */}
            <ToggleOption
              label="调试模式"
              description="开启后在控制台显示详细日志，便于排查问题"
              checked={debugMode}
              onChange={setDebugMode}
            />
          </div>
        </div>
      </div>
    </>
  );
};

type ToggleOptionProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

const ToggleOption: React.FC<ToggleOptionProps> = ({
  label,
  description,
  checked,
  onChange
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "1rem"
      }}
    >
      {/* 开关 */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: "44px",
          height: "24px",
          background: checked
            ? "rgba(102, 192, 244, 0.85)"
            : "rgba(60, 75, 95, 0.6)",
          border: checked
            ? "1px solid rgba(102, 192, 244, 0.5)"
            : "1px solid rgba(102, 192, 244, 0.25)",
          borderRadius: "12px",
          cursor: "pointer",
          position: "relative",
          transition: "all 0.2s ease",
          padding: 0
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "18px",
            height: "18px",
            background: "#ffffff",
            borderRadius: "50%",
            top: "2px",
            left: checked ? "22px" : "2px",
            transition: "left 0.2s ease",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)"
          }}
        />
      </button>

      {/* 文字说明 */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "#d7e8ff",
            marginBottom: "0.25rem"
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: "rgba(205, 226, 255, 0.6)",
            lineHeight: 1.5
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
};
