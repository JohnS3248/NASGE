import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  useEditorConfigStore,
  ShortcutConfig,
  SHORTCUT_LABELS,
  DEFAULT_SHORTCUTS,
  EditorAlignment,
  ToolbarPosition,
  // 右键菜单配置
  ContextMenuType,
  MenuItemConfig,
  MenuGroupConfig,
  MenuItemDefinition,
  IMAGE_MENU_PRESET_ITEMS,
  IMAGE_MENU_ALIGN_ITEMS,
  IMAGE_MENU_ACTION_ITEMS,
  SELECTION_MENU_ITEMS,
  EMPTY_MENU_ITEMS,
  IMAGE_POOL_MENU_ITEMS
} from "../stores/useEditorConfigStore";
import {
  useImagePanelStore,
  ThumbnailSizePreset,
  THUMBNAIL_SIZE_MAP
} from "../stores/useImagePanelStore";

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
  const promptRenameOnDrop = useEditorConfigStore(
    (state) => state.promptRenameOnDrop
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
  const setPromptRenameOnDrop = useEditorConfigStore(
    (state) => state.setPromptRenameOnDrop
  );
  const setDebugMode = useEditorConfigStore(
    (state) => state.setDebugMode
  );
  const shortcuts = useEditorConfigStore(
    (state) => state.shortcuts
  );
  const setShortcut = useEditorConfigStore(
    (state) => state.setShortcut
  );
  const resetShortcuts = useEditorConfigStore(
    (state) => state.resetShortcuts
  );

  // 图片池设置
  const thumbnailSizePreset = useImagePanelStore(
    (state) => state.thumbnailSizePreset
  );
  const customThumbnailSize = useImagePanelStore(
    (state) => state.customThumbnailSize
  );
  const itemsPerPage = useImagePanelStore(
    (state) => state.itemsPerPage
  );
  const setThumbnailSize = useImagePanelStore(
    (state) => state.setThumbnailSize
  );
  const setItemsPerPage = useImagePanelStore(
    (state) => state.setItemsPerPage
  );

  // 智能布局设置
  const smartLayoutEnabled = useEditorConfigStore(
    (state) => state.smartLayoutEnabled
  );
  const smartLayoutWidthThreshold = useEditorConfigStore(
    (state) => state.smartLayoutWidthThreshold
  );
  const smartLayoutHeightThreshold = useEditorConfigStore(
    (state) => state.smartLayoutHeightThreshold
  );
  const setSmartLayoutEnabled = useEditorConfigStore(
    (state) => state.setSmartLayoutEnabled
  );
  const setSmartLayoutWidthThreshold = useEditorConfigStore(
    (state) => state.setSmartLayoutWidthThreshold
  );
  const setSmartLayoutHeightThreshold = useEditorConfigStore(
    (state) => state.setSmartLayoutHeightThreshold
  );

  // 编辑器布局设置
  const editorAlignment = useEditorConfigStore(
    (state) => state.editorAlignment
  );
  const setEditorAlignment = useEditorConfigStore(
    (state) => state.setEditorAlignment
  );
  const toolbarPosition = useEditorConfigStore(
    (state) => state.toolbarPosition
  );
  const setToolbarPosition = useEditorConfigStore(
    (state) => state.setToolbarPosition
  );

  // 图片池右键菜单（旧版兼容）
  const imageContextMenuEnabled = useEditorConfigStore(
    (state) => state.imageContextMenuEnabled
  );
  const setImageContextMenuEnabled = useEditorConfigStore(
    (state) => state.setImageContextMenuEnabled
  );

  // 右键菜单配置
  const imageMenuConfig = useEditorConfigStore((state) => state.imageMenuConfig);
  const selectionMenuConfig = useEditorConfigStore((state) => state.selectionMenuConfig);
  const emptyMenuConfig = useEditorConfigStore((state) => state.emptyMenuConfig);
  const imagePoolMenuConfig = useEditorConfigStore((state) => state.imagePoolMenuConfig);
  const setContextMenuEnabled = useEditorConfigStore((state) => state.setContextMenuEnabled);
  const setMenuItemEnabled = useEditorConfigStore((state) => state.setMenuItemEnabled);
  const reorderMenuItems = useEditorConfigStore((state) => state.reorderMenuItems);
  const resetContextMenuConfig = useEditorConfigStore((state) => state.resetContextMenuConfig);

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
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
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
              marginBottom: "1rem",
              paddingBottom: "0.75rem",
              borderBottom: "1px solid rgba(102, 192, 244, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
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

          {/* 设置项（可滚动） */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              flex: 1,
              overflowY: "auto",
              paddingRight: "0.5rem",
              marginRight: "-0.5rem"
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

            {/* 废弃：粘贴自动上传（现在粘贴统一进入图片池）*/}
            {/* <ToggleOption
              label="粘贴图片时自动上传"
              description="复制粘贴图片后立即上传到 Steam"
              checked={autoUploadOnPaste}
              onChange={setAutoUploadOnPaste}
            /> */}

            {/* 废弃：编辑器拖放自动上传（现在拖放统一进入图片池）*/}
            {/* <ToggleOption
              label="编辑器拖放自动上传"
              description="拖拽图片到编辑器后立即上传到 Steam"
              checked={autoUploadOnDrop}
              onChange={setAutoUploadOnDrop}
            /> */}

            {/* 图片池自动上传 */}
            <ToggleOption
              label="图片池自动上传"
              description="图片添加到图片池后自动上传到 Steam（配合重命名选项时先改名后上传）"
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

            {/* 拖拽重命名 */}
            <ToggleOption
              label="拖拽时重命名"
              description="拖拽图片到图片池后自动选中文件名便于重命名"
              checked={promptRenameOnDrop}
              onChange={setPromptRenameOnDrop}
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

            {/* 图片池设置分组 */}
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
              图片池显示
            </div>

            {/* 每页显示数量 */}
            <NumberInputOption
              label="每页显示数量"
              description="图片池中每页显示的图片数量，0 表示显示全部"
              value={itemsPerPage}
              min={0}
              max={100}
              onChange={setItemsPerPage}
            />

            {/* 缩略图尺寸 */}
            <SelectOption
              label="缩略图尺寸"
              description="图片池中缩略图的显示大小"
              value={thumbnailSizePreset}
              options={[
                { value: "small", label: `小 (${THUMBNAIL_SIZE_MAP.small}px)` },
                { value: "medium", label: `中 (${THUMBNAIL_SIZE_MAP.medium}px)` },
                { value: "large", label: `大 (${THUMBNAIL_SIZE_MAP.large}px)` },
                { value: "custom", label: "自定义" }
              ]}
              onChange={(v) => setThumbnailSize(v as ThumbnailSizePreset)}
            />

            {/* 自定义尺寸滑块 */}
            {thumbnailSizePreset === "custom" && (
              <SliderOption
                label="自定义尺寸"
                description={`当前: ${customThumbnailSize}px`}
                value={customThumbnailSize}
                min={32}
                max={256}
                step={8}
                onChange={(v) => setThumbnailSize("custom", v)}
              />
            )}

            {/* TODO: 智能布局功能暂时隐藏，待解决与缩略图尺寸设置的冲突后再开放
            <ToggleOption
              label="智能布局模式"
              description="全屏模式下根据图片尺寸自动调整网格占用（大图占用更大空间）"
              checked={smartLayoutEnabled}
              onChange={setSmartLayoutEnabled}
            />

            {smartLayoutEnabled && (
              <>
                <SliderOption
                  label="大图宽度阈值"
                  description={`宽度 ≥ ${smartLayoutWidthThreshold}px 的图片视为大图`}
                  value={smartLayoutWidthThreshold}
                  min={200}
                  max={2000}
                  step={50}
                  onChange={setSmartLayoutWidthThreshold}
                />
                <SliderOption
                  label="大图高度阈值"
                  description={`高度 ≥ ${smartLayoutHeightThreshold}px 的图片视为大图`}
                  value={smartLayoutHeightThreshold}
                  min={200}
                  max={2000}
                  step={50}
                  onChange={setSmartLayoutHeightThreshold}
                />
              </>
            )}
            */}

            {/* 分隔线 */}
            <div
              style={{
                height: "1px",
                background: "rgba(102, 192, 244, 0.15)",
                margin: "0.5rem 0"
              }}
            />

            {/* 右键菜单分组 */}
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
              右键菜单
            </div>

            {/* 文字选择菜单 */}
            <MenuConfigSection
              title="文字选择菜单"
              description="选中文字后右键显示的菜单"
              enabled={selectionMenuConfig.enabled}
              onEnabledChange={(enabled) => setContextMenuEnabled('selection', enabled)}
              items={selectionMenuConfig.items}
              definitions={SELECTION_MENU_ITEMS}
              onItemEnabledChange={(itemId, enabled) => setMenuItemEnabled('selection', itemId, enabled)}
              onReorder={(itemIds) => reorderMenuItems('selection', itemIds)}
              onReset={() => resetContextMenuConfig('selection')}
            />

            {/* 空白处菜单 */}
            <MenuConfigSection
              title="空白处菜单"
              description="在编辑器空白处右键显示的菜单"
              enabled={emptyMenuConfig.enabled}
              onEnabledChange={(enabled) => setContextMenuEnabled('empty', enabled)}
              items={emptyMenuConfig.items}
              definitions={EMPTY_MENU_ITEMS}
              onItemEnabledChange={(itemId, enabled) => setMenuItemEnabled('empty', itemId, enabled)}
              onReorder={(itemIds) => reorderMenuItems('empty', itemIds)}
              onReset={() => resetContextMenuConfig('empty')}
            />

            {/* 编辑器图片菜单 */}
            <ImageMenuConfigSection
              title="编辑器图片菜单"
              description="右键编辑器内图片显示的菜单"
              config={imageMenuConfig}
              onEnabledChange={(enabled) => setContextMenuEnabled('image', enabled)}
              onItemEnabledChange={(itemId, enabled, groupId) => setMenuItemEnabled('image', itemId, enabled, groupId)}
              onReorder={(itemIds, groupId) => reorderMenuItems('image', itemIds, groupId)}
              onReset={() => resetContextMenuConfig('image')}
            />

            {/* 图片池菜单 */}
            <MenuConfigSection
              title="图片池菜单"
              description="在图片池中右键图片显示的菜单"
              enabled={imagePoolMenuConfig.enabled}
              onEnabledChange={(enabled) => setContextMenuEnabled('imagePool', enabled)}
              items={imagePoolMenuConfig.items}
              definitions={IMAGE_POOL_MENU_ITEMS}
              onItemEnabledChange={(itemId, enabled) => setMenuItemEnabled('imagePool', itemId, enabled)}
              onReorder={(itemIds) => reorderMenuItems('imagePool', itemIds)}
              onReset={() => resetContextMenuConfig('imagePool')}
              hideIfSingleItem
            />

            {/* 分隔线 */}
            <div
              style={{
                height: "1px",
                background: "rgba(102, 192, 244, 0.15)",
                margin: "0.5rem 0"
              }}
            />

            {/* 快捷键分组 */}
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "rgba(173, 205, 244, 0.8)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "-0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <span>快捷键</span>
              <button
                type="button"
                onClick={resetShortcuts}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "rgba(102, 192, 244, 0.7)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "2px 6px",
                  textTransform: "none",
                  letterSpacing: "normal"
                }}
              >
                重置默认
              </button>
            </div>

            {/* 快捷键设置网格 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem"
              }}
            >
              {(Object.keys(SHORTCUT_LABELS) as (keyof ShortcutConfig)[]).map((key) => (
                <ShortcutInput
                  key={key}
                  label={SHORTCUT_LABELS[key]}
                  value={shortcuts?.[key] ?? DEFAULT_SHORTCUTS[key]}
                  onChange={(value) => setShortcut(key, value)}
                />
              ))}
            </div>

            {/* 分隔线 */}
            <div
              style={{
                height: "1px",
                background: "rgba(102, 192, 244, 0.15)",
                margin: "0.5rem 0"
              }}
            />

            {/* 编辑器布局分组 */}
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
              编辑器布局
            </div>

            {/* 编辑器对齐方式 */}
            <SelectOption
              label="编辑器对齐"
              description="编辑器区域在页面中的水平对齐方式和宽度限制"
              value={editorAlignment}
              options={[
                { value: "center", label: "居中 (720px)" },
                { value: "left", label: "靠左 (720px)" },
                { value: "full", label: "全屏" }
              ]}
              onChange={(v) => setEditorAlignment(v as EditorAlignment)}
            />

            {/* 工具栏位置 */}
            <SelectOption
              label="工具栏位置"
              description="工具栏在编辑器中的位置"
              value={toolbarPosition}
              options={[
                { value: "top", label: "顶部（横向）" },
                { value: "left", label: "左侧（纵向）" }
              ]}
              onChange={(v) => setToolbarPosition(v as ToolbarPosition)}
            />

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

type ShortcutInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * 快捷键输入组件
 * 点击后监听键盘输入，捕获组合键
 */
const ShortcutInput: React.FC<ShortcutInputProps> = ({
  label,
  value,
  onChange
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 忽略单独的修饰键
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      return;
    }

    // 构建快捷键字符串
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");

    // 处理特殊键名
    let key = e.key;
    if (key === " ") key = "Space";
    else if (key === "Escape") key = "Escape";
    else if (key.length === 1) key = key.toUpperCase();

    parts.push(key);
    const shortcut = parts.join("+");

    onChange(shortcut);
    setIsRecording(false);
  }, [onChange]);

  useEffect(() => {
    if (!isRecording) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRecording, handleKeyDown]);

  // 点击外部取消录制
  useEffect(() => {
    if (!isRecording) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsRecording(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecording]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "rgba(205, 226, 255, 0.7)"
        }}
      >
        {label}
      </div>
      <div
        ref={inputRef}
        tabIndex={0}
        onClick={() => setIsRecording(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsRecording(true);
          }
        }}
        style={{
          padding: "6px 10px",
          background: isRecording
            ? "rgba(102, 192, 244, 0.15)"
            : "rgba(40, 55, 75, 0.6)",
          border: isRecording
            ? "1px solid rgba(102, 192, 244, 0.5)"
            : "1px solid rgba(102, 192, 244, 0.2)",
          borderRadius: "6px",
          fontSize: "0.8rem",
          color: isRecording ? "#66c0f4" : "#d7e8ff",
          cursor: "pointer",
          minHeight: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease"
        }}
      >
        {isRecording ? "按下快捷键..." : value}
      </div>
    </div>
  );
};

type NumberInputOptionProps = {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

const NumberInputOption: React.FC<NumberInputOptionProps> = ({
  label,
  description,
  value,
  min,
  max,
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
      {/* 数字输入框 */}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          if (!isNaN(num) && num >= min && num <= max) {
            onChange(num);
          }
        }}
        style={{
          flexShrink: 0,
          width: "70px",
          padding: "6px 8px",
          background: "rgba(40, 55, 75, 0.6)",
          border: "1px solid rgba(102, 192, 244, 0.25)",
          borderRadius: "6px",
          color: "#d7e8ff",
          fontSize: "0.85rem",
          textAlign: "center",
          outline: "none"
        }}
      />

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

type SelectOptionProps = {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

const SelectOption: React.FC<SelectOptionProps> = ({
  label,
  description,
  value,
  options,
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
      {/* 下拉选择 */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flexShrink: 0,
          width: "100px",
          padding: "6px 8px",
          background: "rgba(40, 55, 75, 0.6)",
          border: "1px solid rgba(102, 192, 244, 0.25)",
          borderRadius: "6px",
          color: "#d7e8ff",
          fontSize: "0.8rem",
          cursor: "pointer",
          outline: "none"
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

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

type SliderOptionProps = {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

const SliderOption: React.FC<SliderOptionProps> = ({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        marginLeft: "116px" // 与上面的下拉框对齐
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem"
        }}
      >
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            flex: 1,
            height: "4px",
            appearance: "none",
            background: "rgba(102, 192, 244, 0.3)",
            borderRadius: "2px",
            cursor: "pointer"
          }}
        />
        <span
          style={{
            fontSize: "0.8rem",
            color: "#66c0f4",
            minWidth: "50px",
            textAlign: "right"
          }}
        >
          {value}px
        </span>
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "rgba(205, 226, 255, 0.5)"
        }}
      >
        {label}: {description}
      </div>
    </div>
  );
};

// ==================== 右键菜单配置组件 ====================

type MenuConfigSectionProps = {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  items: MenuItemConfig[];
  definitions: MenuItemDefinition[];
  onItemEnabledChange: (itemId: string, enabled: boolean) => void;
  onReorder: (itemIds: string[]) => void;
  onReset: () => void;
  hideIfSingleItem?: boolean;
};

const MenuConfigSection: React.FC<MenuConfigSectionProps> = ({
  title,
  description,
  enabled,
  onEnabledChange,
  items,
  definitions,
  onItemEnabledChange,
  onReorder,
  onReset,
  hideIfSingleItem = false
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 获取菜单项标签
  const getLabel = (id: string) => {
    const def = definitions.find(d => d.id === id);
    return def?.label || id;
  };

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const currentIds = items.map(item => item.id);
    const draggedIndex = currentIds.indexOf(draggedId);
    const targetIndex = currentIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newIds = [...currentIds];
    newIds.splice(draggedIndex, 1);
    newIds.splice(targetIndex, 0, draggedId);

    onReorder(newIds);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // 如果只有一个项且设置了 hideIfSingleItem，只显示总开关
  const showItemsList = !(hideIfSingleItem && items.length <= 1);

  return (
    <div
      style={{
        background: "rgba(40, 55, 75, 0.3)",
        border: "1px solid rgba(102, 192, 244, 0.15)",
        borderRadius: "0.6rem",
        padding: "0.75rem",
        marginTop: "0.5rem"
      }}
    >
      {/* 标题行：开关 + 标题 + 重置按钮 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: showItemsList ? "0.5rem" : 0
        }}
      >
        {/* 总开关 */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onEnabledChange(!enabled)}
          style={{
            flexShrink: 0,
            width: "36px",
            height: "20px",
            background: enabled ? "rgba(102, 192, 244, 0.85)" : "rgba(60, 75, 95, 0.6)",
            border: enabled ? "1px solid rgba(102, 192, 244, 0.5)" : "1px solid rgba(102, 192, 244, 0.25)",
            borderRadius: "10px",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.2s ease",
            padding: 0
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "14px",
              height: "14px",
              background: "#ffffff",
              borderRadius: "50%",
              top: "2px",
              left: enabled ? "18px" : "2px",
              transition: "left 0.2s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)"
            }}
          />
        </button>

        {/* 标题和描述 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "#d7e8ff" }}>
            {title}
          </div>
          <div style={{ fontSize: "0.75rem", color: "rgba(205, 226, 255, 0.5)" }}>
            {description}
          </div>
        </div>

        {/* 重置按钮 */}
        {showItemsList && (
          <button
            type="button"
            onClick={onReset}
            style={{
              border: "none",
              background: "transparent",
              color: "rgba(102, 192, 244, 0.6)",
              fontSize: "0.7rem",
              cursor: "pointer",
              padding: "2px 6px"
            }}
          >
            重置
          </button>
        )}
      </div>

      {/* 菜单项列表 */}
      {showItemsList && enabled && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            marginTop: "0.5rem"
          }}
        >
          {items.map(item => (
            <DraggableMenuItem
              key={item.id}
              id={item.id}
              label={getLabel(item.id)}
              enabled={item.enabled}
              onEnabledChange={(enabled) => onItemEnabledChange(item.id, enabled)}
              isDragging={draggedId === item.id}
              isDragOver={dragOverId === item.id}
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 图片菜单配置（分组）
type ImageMenuConfigSectionProps = {
  title: string;
  description: string;
  config: { enabled: boolean; groups: MenuGroupConfig[] };
  onEnabledChange: (enabled: boolean) => void;
  onItemEnabledChange: (itemId: string, enabled: boolean, groupId: 'preset' | 'align' | 'action') => void;
  onReorder: (itemIds: string[], groupId: 'preset' | 'align' | 'action') => void;
  onReset: () => void;
};

const GROUP_LABELS: Record<string, string> = {
  preset: '尺寸',
  align: '对齐',
  action: '操作'
};

const GROUP_DEFINITIONS: Record<string, MenuItemDefinition[]> = {
  preset: IMAGE_MENU_PRESET_ITEMS,
  align: IMAGE_MENU_ALIGN_ITEMS,
  action: IMAGE_MENU_ACTION_ITEMS
};

const ImageMenuConfigSection: React.FC<ImageMenuConfigSectionProps> = ({
  title,
  description,
  config,
  onEnabledChange,
  onItemEnabledChange,
  onReorder,
  onReset
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);

  const getLabel = (groupId: string, id: string) => {
    const defs = GROUP_DEFINITIONS[groupId] || [];
    const def = defs.find(d => d.id === id);
    return def?.label || id;
  };

  const handleDragStart = (e: React.DragEvent, id: string, groupId: string) => {
    setDraggedId(id);
    setDragGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string, groupId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id && dragGroupId === groupId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string, groupId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId || dragGroupId !== groupId) return;

    const group = config.groups.find(g => g.groupId === groupId);
    if (!group) return;

    const currentIds = group.items.map(item => item.id);
    const draggedIndex = currentIds.indexOf(draggedId);
    const targetIndex = currentIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newIds = [...currentIds];
    newIds.splice(draggedIndex, 1);
    newIds.splice(targetIndex, 0, draggedId);

    onReorder(newIds, groupId as 'preset' | 'align' | 'action');
    setDraggedId(null);
    setDragOverId(null);
    setDragGroupId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragGroupId(null);
  };

  return (
    <div
      style={{
        background: "rgba(40, 55, 75, 0.3)",
        border: "1px solid rgba(102, 192, 244, 0.15)",
        borderRadius: "0.6rem",
        padding: "0.75rem",
        marginTop: "0.5rem"
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.5rem"
        }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => onEnabledChange(!config.enabled)}
          style={{
            flexShrink: 0,
            width: "36px",
            height: "20px",
            background: config.enabled ? "rgba(102, 192, 244, 0.85)" : "rgba(60, 75, 95, 0.6)",
            border: config.enabled ? "1px solid rgba(102, 192, 244, 0.5)" : "1px solid rgba(102, 192, 244, 0.25)",
            borderRadius: "10px",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.2s ease",
            padding: 0
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "14px",
              height: "14px",
              background: "#ffffff",
              borderRadius: "50%",
              top: "2px",
              left: config.enabled ? "18px" : "2px",
              transition: "left 0.2s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)"
            }}
          />
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "#d7e8ff" }}>
            {title}
          </div>
          <div style={{ fontSize: "0.75rem", color: "rgba(205, 226, 255, 0.5)" }}>
            {description}
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(102, 192, 244, 0.6)",
            fontSize: "0.7rem",
            cursor: "pointer",
            padding: "2px 6px"
          }}
        >
          重置
        </button>
      </div>

      {/* 分组列表 */}
      {config.enabled && config.groups.map((group, index) => (
        <div key={group.groupId}>
          {/* 分组标签 */}
          <div
            style={{
              fontSize: "0.7rem",
              color: "rgba(173, 205, 244, 0.6)",
              marginTop: index > 0 ? "0.5rem" : "0.25rem",
              marginBottom: "0.25rem",
              paddingLeft: "4px"
            }}
          >
            {GROUP_LABELS[group.groupId]}
          </div>

          {/* 组内菜单项 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {group.items.map(item => (
              <DraggableMenuItem
                key={item.id}
                id={item.id}
                label={getLabel(group.groupId, item.id)}
                enabled={item.enabled}
                onEnabledChange={(enabled) => onItemEnabledChange(item.id, enabled, group.groupId)}
                isDragging={draggedId === item.id}
                isDragOver={dragOverId === item.id}
                onDragStart={(e) => handleDragStart(e, item.id, group.groupId)}
                onDragOver={(e) => handleDragOver(e, item.id, group.groupId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item.id, group.groupId)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// 可拖拽菜单项
type DraggableMenuItemProps = {
  id: string;
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

const DraggableMenuItem: React.FC<DraggableMenuItemProps> = ({
  id,
  label,
  enabled,
  onEnabledChange,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 8px",
        background: isDragOver
          ? "rgba(102, 192, 244, 0.2)"
          : isDragging
            ? "rgba(102, 192, 244, 0.1)"
            : "rgba(30, 42, 58, 0.5)",
        borderRadius: "4px",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        transition: "background 0.15s ease",
        border: isDragOver ? "1px dashed rgba(102, 192, 244, 0.5)" : "1px solid transparent"
      }}
    >
      {/* 拖拽手柄 */}
      <span
        style={{
          color: "rgba(205, 226, 255, 0.4)",
          fontSize: "10px",
          cursor: "grab",
          userSelect: "none"
        }}
      >
        ≡
      </span>

      {/* 标签 */}
      <span
        style={{
          flex: 1,
          fontSize: "0.8rem",
          color: enabled ? "#d7e8ff" : "rgba(205, 226, 255, 0.4)"
        }}
      >
        {label}
      </span>

      {/* 启用开关 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEnabledChange(!enabled);
        }}
        style={{
          width: "16px",
          height: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: enabled ? "1px solid rgba(102, 192, 244, 0.5)" : "1px solid rgba(102, 192, 244, 0.25)",
          borderRadius: "3px",
          background: enabled ? "rgba(102, 192, 244, 0.3)" : "transparent",
          color: enabled ? "#66c0f4" : "rgba(205, 226, 255, 0.3)",
          fontSize: "10px",
          cursor: "pointer",
          padding: 0
        }}
      >
        {enabled ? "✓" : ""}
      </button>
    </div>
  );
};
