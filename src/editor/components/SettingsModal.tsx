import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMountTransition } from "../hooks/useMountTransition";
import {
  useEditorConfigStore,
  ShortcutConfig,
  DEFAULT_SHORTCUTS,
  MenuItemConfig,
  MenuGroupConfig,
} from "../stores/useEditorConfigStore";
import type { LocaleSetting } from "../../i18n/types";
import { useTour } from "../hooks/useTour";
import {
  useImagePanelStore,
  ThumbnailSizePreset,
  THUMBNAIL_SIZE_MAP
} from "../stores/useImagePanelStore";

// ============================================================================
// Tailwind class constants
// ============================================================================

const tabBase = "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium nasge-transition-quick cursor-pointer w-full border-0";
const tabActive = "bg-accent-muted text-text-primary";
const tabInactive = "text-text-secondary hover:bg-bg-hover hover:text-text-primary bg-transparent";

const sectionTitle = "text-[13px] font-semibold text-text-primary mb-3";
const settingRow = "flex items-start gap-4";
const settingLabel = "text-[13px] font-medium text-text-primary";
const settingDesc = "text-xs text-text-muted leading-relaxed";
const divider = "h-px bg-border-subtle my-4";
const btnText = "text-xs text-accent hover:text-accent-hover nasge-transition-quick cursor-pointer bg-transparent border-0 p-0";

// ============================================================================
// Lucide SVG icons
// ============================================================================

const XIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

const SlidersHorizontalIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 5H3" /><path d="M12 19H3" /><path d="M14 3v4" /><path d="M16 17v4" /><path d="M21 12h-9" /><path d="M21 19h-5" /><path d="M21 5h-7" /><path d="M8 10v4" /><path d="M8 12H3" />
  </svg>
);

const ImageIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const ListIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" />
  </svg>
);

const KeyboardIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" />
  </svg>
);

const GripVerticalIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const LightbulbIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" />
  </svg>
);

// ============================================================================
// Utility: format shortcut for display (Mod → ⌘ / Ctrl)
// ============================================================================

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function formatShortcut(value: string): string {
  return value
    .replace(/\bMod\b/g, isMac ? "⌘" : "Ctrl")
    .replace(/\bMeta\b/g, isMac ? "⌘" : "Win");
}

// ============================================================================
// Tab types
// ============================================================================

type TabId = "general" | "images" | "menus" | "shortcuts" | "help";

const TAB_ICONS: Record<TabId, React.FC<{ className?: string }>> = {
  general: SlidersHorizontalIcon,
  images: ImageIcon,
  menus: ListIcon,
  shortcuts: KeyboardIcon,
  help: LightbulbIcon,
};

const TAB_KEYS: Record<TabId, string> = {
  general: "settings:tabs.general",
  images: "settings:tabs.image",
  menus: "settings:tabs.menu",
  shortcuts: "settings:tabs.shortcuts",
  help: "settings:tabs.help",
};

const TAB_IDS: TabId[] = ["general", "images", "menus", "shortcuts", "help"];

// ============================================================================
// SettingsModal
// ============================================================================

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose
}) => {
  const { t } = useTranslation("settings");
  const shouldRender = useMountTransition(visible, 150);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const contentRef = useRef<HTMLDivElement>(null);

  // --- Store selectors ---
  const autoUploadInPanel = useEditorConfigStore((s) => s.autoUploadInPanel);
  const promptRenameOnPaste = useEditorConfigStore((s) => s.promptRenameOnPaste);
  const promptRenameOnDrop = useEditorConfigStore((s) => s.promptRenameOnDrop);
  const debugMode = useEditorConfigStore((s) => s.debugMode);
  const setAutoUploadInPanel = useEditorConfigStore((s) => s.setAutoUploadInPanel);
  const setPromptRenameOnPaste = useEditorConfigStore((s) => s.setPromptRenameOnPaste);
  const setPromptRenameOnDrop = useEditorConfigStore((s) => s.setPromptRenameOnDrop);
  const setDebugMode = useEditorConfigStore((s) => s.setDebugMode);
  const shortcuts = useEditorConfigStore((s) => s.shortcuts);
  const setShortcut = useEditorConfigStore((s) => s.setShortcut);
  const resetShortcuts = useEditorConfigStore((s) => s.resetShortcuts);

  const theme = useEditorConfigStore((s) => s.theme);
  const setTheme = useEditorConfigStore((s) => s.setTheme);
  const locale = useEditorConfigStore((s) => s.locale);
  const setLocale = useEditorConfigStore((s) => s.setLocale);
  const showPreview = useEditorConfigStore((s) => s.showPreview);
  const setShowPreview = useEditorConfigStore((s) => s.setShowPreview);

  // 新手引导重播
  const { startBasicTour, startAdvancedTour } = useTour();
  const handleReplayTour = useCallback((tier: "basic" | "advanced") => {
    onClose();
    // 等 modal 关闭动画结束后启动 tour
    setTimeout(() => {
      if (tier === "basic") {
        startBasicTour({ replay: true });
      } else {
        startAdvancedTour({ replay: true });
      }
    }, 200);
  }, [onClose, startBasicTour, startAdvancedTour]);

  // 图片池设置
  const thumbnailSizePreset = useImagePanelStore((s) => s.thumbnailSizePreset);
  const customThumbnailSize = useImagePanelStore((s) => s.customThumbnailSize);
  const itemsPerPage = useImagePanelStore((s) => s.itemsPerPage);
  const setThumbnailSize = useImagePanelStore((s) => s.setThumbnailSize);
  const setItemsPerPage = useImagePanelStore((s) => s.setItemsPerPage);

  // 右键菜单配置
  const imageMenuConfig = useEditorConfigStore((s) => s.imageMenuConfig);
  const selectionMenuConfig = useEditorConfigStore((s) => s.selectionMenuConfig);
  const emptyMenuConfig = useEditorConfigStore((s) => s.emptyMenuConfig);
  const imagePoolMenuConfig = useEditorConfigStore((s) => s.imagePoolMenuConfig);
  const setContextMenuEnabled = useEditorConfigStore((s) => s.setContextMenuEnabled);
  const setMenuItemEnabled = useEditorConfigStore((s) => s.setMenuItemEnabled);
  const reorderMenuItems = useEditorConfigStore((s) => s.reorderMenuItems);
  const resetContextMenuConfig = useEditorConfigStore((s) => s.resetContextMenuConfig);

  // Reset scroll when switching tabs
  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, []);

  // Escape to close
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  if (!shouldRender) return null;

  return (
    // Backdrop
    <div
      className={`fixed inset-0 bg-black/65 z-[9990] flex items-center justify-center ${
        visible ? "animate-modal-backdrop" : "opacity-0 transition-opacity duration-[150ms]"
      }`}
      onClick={onClose}
    >
      {/* Modal container */}
      <div
        className={`bg-bg-surface border border-border-accent rounded-lg shadow-2xl w-[720px] max-w-[90vw] h-[540px] max-h-[85vh] flex flex-col ${
          visible ? "animate-modal-enter" : "opacity-0 scale-95 transition-all duration-[150ms]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
          <span className="text-[15px] font-semibold text-text-primary">{t("title")}</span>
          <button
            type="button"
            data-tour="settings-close"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover nasge-transition-quick cursor-pointer border-0 bg-transparent"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Tab Nav + Content */}
        <div className="flex flex-1 min-h-0">
          {/* Tab Nav */}
          <nav className="w-40 shrink-0 border-r border-border-subtle p-3 flex flex-col gap-1">
            {TAB_IDS.map((id) => {
              const Icon = TAB_ICONS[id];
              return (
                <button
                  key={id}
                  data-tour-tab={id}
                  className={`${tabBase} ${activeTab === id ? tabActive : tabInactive}`}
                  onClick={() => handleTabChange(id)}
                >
                  <Icon className="w-4 h-4" />
                  {t(TAB_KEYS[id])}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div ref={contentRef} data-tour="settings-content" className="flex-1 overflow-y-auto p-5">
            {/* ===== 通用 Tab ===== */}
            {activeTab === "general" && (
              <div>
                <div className={sectionTitle}>{t("language.title")}</div>
                <SelectOption
                  label={t("language.label")}
                  description={t("language.description")}
                  value={locale}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "zh-CN", label: "简体中文" },
                    { value: "en-US", label: "English" },
                  ]}
                  onChange={(v) => setLocale(v as LocaleSetting)}
                />

                <div className={divider} />

                <div className={sectionTitle}>{t("theme.title")}</div>
                <SelectOption
                  label={t("theme.label")}
                  description={t("theme.description")}
                  value={theme}
                  options={[
                    { value: "steam-dark", label: "Steam Dark" },
                    { value: "steam-midnight", label: "Steam Midnight" },
                    { value: "steam-classic", label: "Steam Classic" },
                  ]}
                  onChange={setTheme}
                />

                <div className={divider} />

                <div className={sectionTitle}>{t("preview.title")}</div>
                <ToggleOption
                  label={t("preview.label")}
                  description={t("preview.description")}
                  checked={showPreview}
                  onChange={setShowPreview}
                />

                <div className={divider} />

                <div className={sectionTitle}>{t("developer.title")}</div>
                <ToggleOption
                  label={t("developer.debugLabel")}
                  description={t("developer.debugDescription")}
                  checked={debugMode}
                  onChange={setDebugMode}
                />
              </div>
            )}

            {/* ===== 图片 Tab ===== */}
            {activeTab === "images" && (
              <div>
                <div className={sectionTitle}>{t("imageUpload.title")}</div>

                <ToggleOption
                  label={t("imageUpload.autoLabel")}
                  description={t("imageUpload.autoDescription")}
                  checked={autoUploadInPanel}
                  onChange={setAutoUploadInPanel}
                />

                <div className="h-3" />

                <ToggleOption
                  label={t("imageUpload.pasteRenameLabel")}
                  description={t("imageUpload.pasteRenameDescription")}
                  checked={promptRenameOnPaste}
                  onChange={setPromptRenameOnPaste}
                />

                <div className="h-3" />

                <ToggleOption
                  label={t("imageUpload.dropRenameLabel")}
                  description={t("imageUpload.dropRenameDescription")}
                  checked={promptRenameOnDrop}
                  onChange={setPromptRenameOnDrop}
                />

                <div className="bg-accent-subtle border border-accent/20 rounded-md p-3 text-xs text-text-secondary leading-relaxed mt-4">
                  <strong>{t("common:tip")}</strong>{t("imageUpload.tip")}
                </div>

                <div className={divider} />

                <div className={sectionTitle}>{t("imagePool.title")}</div>

                <NumberInputOption
                  label={t("imagePool.pageSize")}
                  description={t("imagePool.pageSizeDescription")}
                  value={itemsPerPage}
                  min={0}
                  max={100}
                  onChange={setItemsPerPage}
                />

                <div className="h-3" />

                <SelectOption
                  label={t("imagePool.thumbSize")}
                  description={t("imagePool.thumbSizeDescription")}
                  value={thumbnailSizePreset}
                  options={[
                    { value: "small", label: `${t("imagePool.thumbSmall")} (${THUMBNAIL_SIZE_MAP.small}px)` },
                    { value: "medium", label: `${t("imagePool.thumbMedium")} (${THUMBNAIL_SIZE_MAP.medium}px)` },
                    { value: "large", label: `${t("imagePool.thumbLarge")} (${THUMBNAIL_SIZE_MAP.large}px)` },
                    { value: "custom", label: t("imagePool.thumbCustom") }
                  ]}
                  onChange={(v) => setThumbnailSize(v as ThumbnailSizePreset)}
                />

                {thumbnailSizePreset === "custom" && (
                  <>
                    <div className="h-3" />
                    <SliderOption
                      label={t("imagePool.customSize")}
                      description={t("imagePool.customSizeCurrent", { size: customThumbnailSize })}
                      value={customThumbnailSize}
                      min={32}
                      max={256}
                      step={8}
                      onChange={(v) => setThumbnailSize("custom", v)}
                    />
                  </>
                )}
              </div>
            )}

            {/* ===== 菜单 Tab ===== */}
            {activeTab === "menus" && (
              <div>
                <div className={sectionTitle}>{t("contextMenu.title")}</div>

                <MenuConfigSection
                  title={t("contextMenu.selection")}
                  description={t("contextMenu.selectionDesc")}
                  enabled={selectionMenuConfig.enabled}
                  onEnabledChange={(enabled) => setContextMenuEnabled('selection', enabled)}
                  items={selectionMenuConfig.items}
                  onItemEnabledChange={(itemId, enabled) => setMenuItemEnabled('selection', itemId, enabled)}
                  onReorder={(itemIds) => reorderMenuItems('selection', itemIds)}
                  onReset={() => resetContextMenuConfig('selection')}
                />

                <div className="h-3" />

                <MenuConfigSection
                  title={t("contextMenu.empty")}
                  description={t("contextMenu.emptyDesc")}
                  enabled={emptyMenuConfig.enabled}
                  onEnabledChange={(enabled) => setContextMenuEnabled('empty', enabled)}
                  items={emptyMenuConfig.items}
                  onItemEnabledChange={(itemId, enabled) => setMenuItemEnabled('empty', itemId, enabled)}
                  onReorder={(itemIds) => reorderMenuItems('empty', itemIds)}
                  onReset={() => resetContextMenuConfig('empty')}
                />

                <div className="h-3" />

                <ImageMenuConfigSection
                  title={t("contextMenu.image")}
                  description={t("contextMenu.imageDesc")}
                  config={imageMenuConfig}
                  onEnabledChange={(enabled) => setContextMenuEnabled('image', enabled)}
                  onItemEnabledChange={(itemId, enabled, groupId) => setMenuItemEnabled('image', itemId, enabled, groupId)}
                  onReorder={(itemIds, groupId) => reorderMenuItems('image', itemIds, groupId)}
                  onReset={() => resetContextMenuConfig('image')}
                />

                <div className="h-3" />

                <MenuConfigSection
                  title={t("contextMenu.imagePool")}
                  description={t("contextMenu.imagePoolDesc")}
                  enabled={imagePoolMenuConfig.enabled}
                  onEnabledChange={(enabled) => setContextMenuEnabled('imagePool', enabled)}
                  items={imagePoolMenuConfig.items}
                  onItemEnabledChange={(itemId, enabled) => setMenuItemEnabled('imagePool', itemId, enabled)}
                  onReorder={(itemIds) => reorderMenuItems('imagePool', itemIds)}
                  onReset={() => resetContextMenuConfig('imagePool')}
                  hideIfSingleItem
                />
              </div>
            )}

            {/* ===== 快捷键 Tab ===== */}
            {activeTab === "shortcuts" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={sectionTitle + " !mb-0"}>{t("shortcuts.title")}</div>
                  <button type="button" onClick={resetShortcuts} className={btnText}>
                    {t("shortcuts.resetAll")}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(DEFAULT_SHORTCUTS) as (keyof ShortcutConfig)[]).map((key) => (
                    <ShortcutInput
                      key={key}
                      label={t(`menu.${key}`)}
                      value={shortcuts?.[key] ?? DEFAULT_SHORTCUTS[key]}
                      onChange={(value) => setShortcut(key, value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ===== 帮助 Tab ===== */}
            {activeTab === "help" && (
              <div>
                <div className={sectionTitle}>{t("settings:tour.title")}</div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleReplayTour("basic")}
                    className="px-3 py-1.5 rounded text-sm text-text-secondary border border-border-default hover:text-text-primary hover:border-border-accent nasge-transition-quick cursor-pointer bg-transparent"
                  >
                    {t("settings:tour.replayBasic")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReplayTour("advanced")}
                    className="px-3 py-1.5 rounded text-sm text-text-secondary border border-border-default hover:text-text-primary hover:border-border-accent nasge-transition-quick cursor-pointer bg-transparent"
                  >
                    {t("settings:tour.replayAdvanced")}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1.5">{t("settings:tour.replayNote")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ToggleOption — 30×20px pill toggle
// ============================================================================

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
}) => (
  <div className={settingRow}>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`shrink-0 w-[30px] h-[20px] rounded-full relative p-0 border nasge-transition-quick cursor-pointer ${
        checked ? "bg-accent border-accent/50" : "bg-bg-hover border-border-accent"
      }`}
    >
      <div
        className={`absolute w-3.5 h-3.5 bg-white rounded-full top-[2px] shadow-sm nasge-transition-quick ${
          checked ? "left-[13px]" : "left-[2px]"
        }`}
      />
    </button>
    <div className="flex-1">
      <div className={settingLabel}>{label}</div>
      <div className={settingDesc}>{description}</div>
    </div>
  </div>
);

// ============================================================================
// SelectOption — 30px tall dropdown
// ============================================================================

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
}) => (
  <div className={settingRow}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="shrink-0 w-[120px] h-[30px] px-2 bg-bg-input border border-border-accent rounded-md text-[13px] text-text-primary cursor-pointer outline-none nasge-transition-quick"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <div className="flex-1">
      <div className={settingLabel}>{label}</div>
      <div className={settingDesc}>{description}</div>
    </div>
  </div>
);

// ============================================================================
// NumberInputOption — 30px tall number input
// ============================================================================

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
}) => (
  <div className={settingRow}>
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
      className="shrink-0 w-[70px] h-[30px] px-2 bg-bg-input border border-border-accent rounded-md text-[13px] text-text-primary text-center outline-none"
    />
    <div className="flex-1">
      <div className={settingLabel}>{label}</div>
      <div className={settingDesc}>{description}</div>
    </div>
  </div>
);

// ============================================================================
// SliderOption
// ============================================================================

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
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 appearance-none bg-accent/30 rounded-sm cursor-pointer"
      />
      <span className="text-[13px] text-accent min-w-[50px] text-right">
        {value}px
      </span>
    </div>
    <div className="text-xs text-text-muted">
      {label}: {description}
    </div>
  </div>
);

// ============================================================================
// ShortcutInput
// ============================================================================

type ShortcutInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

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

    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");

    let key = e.key;
    if (key === " ") key = "Space";
    else if (key === "Escape") key = "Escape";
    else if (key.length === 1) key = key.toUpperCase();

    parts.push(key);
    onChange(parts.join("+"));
    setIsRecording(false);
  }, [onChange]);

  useEffect(() => {
    if (!isRecording) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, handleKeyDown]);

  useEffect(() => {
    if (!isRecording) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsRecording(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isRecording]);

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-text-secondary">{label}</div>
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
        className={`px-2.5 h-[30px] rounded-md text-[13px] cursor-pointer flex items-center justify-center nasge-transition-quick ${
          isRecording
            ? "border border-accent/50 bg-accent-subtle text-accent"
            : "bg-bg-input border border-border-default text-text-primary"
        }`}
      >
        {isRecording ? <RecordingText /> : formatShortcut(value)}
      </div>
    </div>
  );
};

// Small helper to use useTranslation inside ShortcutInput (which doesn't have hook access itself)
const RecordingText: React.FC = () => {
  const { t } = useTranslation("settings");
  return <>{t("shortcuts.recording")}</>;
};

// ============================================================================
// MenuConfigSection
// ============================================================================

type MenuConfigSectionProps = {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  items: MenuItemConfig[];
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
  onItemEnabledChange,
  onReorder,
  onReset,
  hideIfSingleItem = false
}) => {
  const { t } = useTranslation("settings");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const getLabel = (id: string) => t(`menu.${id}`);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };

  const handleDragLeave = () => setDragOverId(null);

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

  const showItemsList = !(hideIfSingleItem && items.length <= 1);

  return (
    <div className="bg-bg-app/40 border border-border-subtle rounded-md p-3">
      {/* Header row: toggle + title + reset */}
      <div className={`flex items-center gap-3 ${showItemsList ? "mb-2" : ""}`}>
        <MiniToggle checked={enabled} onChange={() => onEnabledChange(!enabled)} />
        <div className="flex-1">
          <div className="text-[13px] font-medium text-text-primary">{title}</div>
          <div className="text-xs text-text-muted">{description}</div>
        </div>
        {showItemsList && (
          <button type="button" onClick={onReset} className={btnText}>{t("shortcuts.resetMenu")}</button>
        )}
      </div>

      {/* Items list */}
      {showItemsList && enabled && (
        <div className="flex flex-col gap-0.5 mt-2">
          {items.map(item => (
            <DraggableMenuItem
              key={item.id}
              id={item.id}
              label={getLabel(item.id)}
              enabled={item.enabled}
              onEnabledChange={(en) => onItemEnabledChange(item.id, en)}
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

// ============================================================================
// ImageMenuConfigSection (grouped)
// ============================================================================

type ImageMenuConfigSectionProps = {
  title: string;
  description: string;
  config: { enabled: boolean; groups: MenuGroupConfig[] };
  onEnabledChange: (enabled: boolean) => void;
  onItemEnabledChange: (itemId: string, enabled: boolean, groupId: 'preset' | 'align' | 'action') => void;
  onReorder: (itemIds: string[], groupId: 'preset' | 'align' | 'action') => void;
  onReset: () => void;
};

const GROUP_LABEL_KEYS: Record<string, string> = {
  preset: "contextMenu.groupSize",
  align: "contextMenu.groupAlign",
  action: "contextMenu.groupAction",
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
  const { t } = useTranslation("settings");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);

  const getLabel = (_groupId: string, id: string) => t(`menu.${id}`);

  const handleDragStart = (e: React.DragEvent, id: string, groupId: string) => {
    setDraggedId(id);
    setDragGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string, groupId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id && dragGroupId === groupId) setDragOverId(id);
  };

  const handleDragLeave = () => setDragOverId(null);

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
    <div className="bg-bg-app/40 border border-border-subtle rounded-md p-3">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-2">
        <MiniToggle checked={config.enabled} onChange={() => onEnabledChange(!config.enabled)} />
        <div className="flex-1">
          <div className="text-[13px] font-medium text-text-primary">{title}</div>
          <div className="text-xs text-text-muted">{description}</div>
        </div>
        <button type="button" onClick={onReset} className={btnText}>{t("shortcuts.resetMenu")}</button>
      </div>

      {/* Group lists */}
      {config.enabled && config.groups.map((group, index) => (
        <div key={group.groupId}>
          <div className={`text-[11px] text-text-muted pl-1 mb-1 ${index > 0 ? "mt-2" : "mt-1"}`}>
            {t(GROUP_LABEL_KEYS[group.groupId])}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map(item => (
              <DraggableMenuItem
                key={item.id}
                id={item.id}
                label={getLabel(group.groupId, item.id)}
                enabled={item.enabled}
                onEnabledChange={(en) => onItemEnabledChange(item.id, en, group.groupId)}
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

// ============================================================================
// MiniToggle — 28×18px for menu config sections
// ============================================================================

const MiniToggle: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`shrink-0 w-[28px] h-[18px] rounded-full relative p-0 border nasge-transition-quick cursor-pointer ${
      checked ? "bg-accent border-accent/50" : "bg-bg-hover border-border-accent"
    }`}
  >
    <div
      className={`absolute w-3 h-3 bg-white rounded-full top-[2px] shadow-sm nasge-transition-quick ${
        checked ? "left-[12px]" : "left-[2px]"
      }`}
    />
  </button>
);

// ============================================================================
// DraggableMenuItem
// ============================================================================

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
}) => (
  <div
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    onDragEnd={onDragEnd}
    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-grab nasge-transition-quick ${
      isDragOver
        ? "bg-accent-muted border border-dashed border-accent/50"
        : isDragging
          ? "bg-accent-subtle border border-transparent opacity-50"
          : "bg-bg-app/50 border border-transparent"
    }`}
  >
    {/* Drag handle */}
    <GripVerticalIcon className="w-3 h-3 text-text-muted shrink-0" />

    {/* Label */}
    <span className={`flex-1 text-[13px] ${enabled ? "text-text-primary" : "text-text-muted"}`}>
      {label}
    </span>

    {/* Checkbox */}
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEnabledChange(!enabled);
      }}
      className={`w-4 h-4 flex items-center justify-center rounded-sm border p-0 cursor-pointer nasge-transition-quick ${
        enabled
          ? "border-accent/50 bg-accent/30 text-accent"
          : "border-border-accent bg-transparent text-transparent"
      }`}
    >
      <CheckIcon className="w-2.5 h-2.5" />
    </button>
  </div>
);
