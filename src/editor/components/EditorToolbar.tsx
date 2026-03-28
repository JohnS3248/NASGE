import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorConfigStore, type ToolbarDockMode } from "../stores/useEditorConfigStore";

// ==================== Lucide SVG Icons ====================

const EyeOffIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
);

const StrikethroughIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4H9a3 3 0 0 0-2.83 4" />
    <path d="M14 12a4 4 0 0 1 0 8H6" />
    <line x1="4" x2="20" y1="12" y2="12" />
  </svg>
);

// Dock mode icons
const PanelLeftIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

const PanelTopIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
  </svg>
);

const MoveIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20" />
    <path d="m15 19-3 3-3-3" />
    <path d="m19 9 3 3-3 3" />
    <path d="M2 12h20" />
    <path d="m5 9-3 3 3 3" />
    <path d="m9 5 3-3 3 3" />
  </svg>
);

// ==================== Toolbar Button ====================

type ToolbarButtonProps = {
  label: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  isVertical: boolean;
};

const btnBase = "w-7 h-7 flex items-center justify-center rounded-sm text-xs font-semibold nasge-transition-quick cursor-pointer border";
const btnActive = "bg-accent/20 text-accent border-accent/30";
const btnInactive = "bg-transparent text-text-secondary border-transparent hover:bg-bg-hover hover:text-text-primary";

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, onClick, active, title }) => (
  <button
    type="button"
    title={title}
    className={`${btnBase} ${active ? btnActive : btnInactive}`}
    onClick={onClick}
  >
    {label}
  </button>
);

// ==================== Separator ====================

const Separator: React.FC<{ isVertical: boolean }> = ({ isVertical }) =>
  isVertical
    ? <div className="w-[70%] h-px bg-border-subtle mx-auto my-0.5" />
    : <div className="h-[70%] w-px bg-border-subtle my-auto mx-0.5" />;

// ==================== Dock Mode Toggle ====================

const DOCK_CYCLE: ToolbarDockMode[] = ['side', 'top', 'floating'];

const DockModeToggle: React.FC<{ mode: ToolbarDockMode; isVertical: boolean; onToggle: () => void }> = ({ mode, isVertical, onToggle }) => {
  const icon = mode === 'side'
    ? <PanelLeftIcon className="w-3.5 h-3.5" />
    : mode === 'top'
      ? <PanelTopIcon className="w-3.5 h-3.5" />
      : <MoveIcon className="w-3.5 h-3.5" />;

  const titles: Record<ToolbarDockMode, string> = {
    side: '侧边停靠（点击切换到顶部）',
    top: '顶部停靠（点击切换到浮动）',
    floating: '浮动模式（点击切换到侧边）',
  };

  return (
    <>
      <Separator isVertical={isVertical} />
      <button
        type="button"
        title={titles[mode]}
        className={`${btnBase} ${btnInactive}`}
        onClick={onToggle}
      >
        {icon}
      </button>
    </>
  );
};

// ==================== Button Definitions ====================

type ButtonDef = {
  key: string;
  label: React.ReactNode;
  title: string;
  isActive: (editor: Editor) => boolean;
  action: (editor: Editor) => void;
};

type ToolbarItem = ButtonDef | 'separator';

const TOOLBAR_ITEMS: ToolbarItem[] = [
  // 文字格式
  {
    key: 'bold',
    label: 'B',
    title: '粗体',
    isActive: (e) => e.isActive('bold'),
    action: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    label: <em style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}>I</em>,
    title: '斜体',
    isActive: (e) => e.isActive('italic'),
    action: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: 'underline',
    label: 'U',
    title: '下划线',
    isActive: (e) => e.isActive('underline'),
    action: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    key: 'strike',
    label: <StrikethroughIcon className="w-3.5 h-3.5" />,
    title: '删除线',
    isActive: (e) => e.isActive('strike'),
    action: (e) => e.chain().focus().toggleStrike().run(),
  },
  'separator',
  // 特殊格式
  {
    key: 'spoiler',
    label: <EyeOffIcon className="w-3.5 h-3.5" />,
    title: '隐藏文本',
    isActive: (e) => e.isActive('spoiler'),
    action: (e) => e.chain().focus().toggleSpoiler().run(),
  },
  {
    key: 'codeBlock',
    label: '<>',
    title: '代码块',
    isActive: (e) => e.isActive('codeBlock'),
    action: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    key: 'hr',
    label: '—',
    title: '分隔线',
    isActive: () => false,
    action: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  'separator',
  // 标题
  {
    key: 'h1',
    label: 'H1',
    title: '标题 1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    label: 'H2',
    title: '标题 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: 'H3',
    title: '标题 3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  'separator',
  // 列表
  {
    key: 'bulletList',
    label: '•',
    title: '项目符号列表',
    isActive: (e) => e.isActive('bulletList'),
    action: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    label: '1.',
    title: '有序列表',
    isActive: (e) => e.isActive('orderedList'),
    action: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'clearFormatting',
    label: 'Tx',
    title: '清除格式',
    isActive: () => false,
    action: (e) => e.chain().focus().unsetAllMarks().clearNodes().setParagraph().run(),
  },
];

// ==================== Main Position Hook ====================

function useMainRect() {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    const update = () => setRect(mainEl.getBoundingClientRect());
    update();

    const ro = new ResizeObserver(update);
    ro.observe(mainEl);
    // Observe ancestor containers: when siblings (e.g. PreviewPanel) toggle,
    // the parent resizes which shifts main's screen position
    if (mainEl.parentElement) {
      ro.observe(mainEl.parentElement);
      if (mainEl.parentElement.parentElement) {
        ro.observe(mainEl.parentElement.parentElement);
      }
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  return rect;
}

// ==================== EditorToolbar ====================

type EditorToolbarProps = {
  editor: Editor | null;
};

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  const toolbarPos = useEditorConfigStore((s) => s.toolbarPos);
  const setToolbarPos = useEditorConfigStore((s) => s.setToolbarPos);
  const dockMode = useEditorConfigStore((s) => s.toolbarDockMode);
  const setDockMode = useEditorConfigStore((s) => s.setToolbarDockMode);

  const mainRect = useMainRect();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [, setSelectionKey] = useState(0);

  // Floating mode state
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(dockMode !== 'floating');
  const [floatingPos, setFloatingPos] = useState(() => {
    if (toolbarPos.x >= 0 && toolbarPos.y >= 0) return toolbarPos;
    return { x: -1, y: -1 };
  });
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  // 监听编辑器选择变化以更新按钮状态
  useEffect(() => {
    if (!editor) return;
    const handler = () => setSelectionKey((k) => k + 1);
    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
    };
  }, [editor]);

  // Floating 入场动画 + 默认位置
  useEffect(() => {
    if (dockMode !== 'floating') {
      setIsVisible(true);
      return;
    }
    if (floatingPos.x < 0 || floatingPos.y < 0) {
      requestAnimationFrame(() => {
        const mainEl = document.querySelector("main");
        if (mainEl) {
          const rect = mainEl.getBoundingClientRect();
          const tw = toolbarRef.current?.offsetWidth ?? 44;
          setFloatingPos({ x: Math.max(4, rect.left - tw - 8), y: rect.top });
        } else {
          setFloatingPos({ x: 8, y: 200 });
        }
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      requestAnimationFrame(() => setIsVisible(true));
    }
  }, [dockMode, floatingPos]);

  // Floating 拖拽
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (dockMode !== 'floating') return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: floatingPos.x,
        posY: floatingPos.y,
      };
    },
    [dockMode, floatingPos]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newX = Math.max(0, Math.min(window.innerWidth - 60, dragStartRef.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, dragStartRef.current.posY + dy));
      setFloatingPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setToolbarPos(floatingPos);
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, floatingPos, setToolbarPos]);

  // Dock mode 循环
  const handleDockToggle = useCallback(() => {
    const idx = DOCK_CYCLE.indexOf(dockMode);
    const next = DOCK_CYCLE[(idx + 1) % DOCK_CYCLE.length];
    // 切换到 floating 时重置入场动画
    if (next === 'floating') {
      setIsVisible(false);
    }
    setDockMode(next);
  }, [dockMode, setDockMode]);

  if (!editor) return null;

  const isVertical = dockMode !== 'top';

  // 计算定位样式
  const positionStyle = (): React.CSSProperties => {
    if (dockMode === 'floating') {
      if (floatingPos.x < 0 || floatingPos.y < 0) return { position: 'fixed', left: -9999, top: -9999 };
      return {
        position: 'fixed',
        left: floatingPos.x,
        top: floatingPos.y,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0)' : 'translateX(-16px)',
        transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: isDragging ? 'grabbing' : 'grab',
      };
    }
    if (!mainRect) return { position: 'fixed', left: -9999, top: -9999 };

    if (dockMode === 'side') {
      const tw = toolbarRef.current?.offsetWidth ?? 40;
      const th = toolbarRef.current?.offsetHeight ?? 500;
      const minTop = 8;
      const maxTop = window.innerHeight - th - 8;
      return {
        position: 'fixed',
        left: Math.max(4, mainRect.left - tw - 8),
        top: Math.max(minTop, Math.min(maxTop, mainRect.top)),
      };
    }
    // top
    const th = toolbarRef.current?.offsetHeight ?? 40;
    return {
      position: 'fixed',
      left: mainRect.left,
      top: Math.max(0, mainRect.top - th - 6),
    };
  };

  return (
    <div
      ref={toolbarRef}
      onMouseDown={handleMouseDown}
      className={`z-[5000] flex ${isVertical ? 'flex-col' : 'flex-row'} items-center gap-0.5 bg-bg-surface/95 backdrop-blur-md border border-border-default rounded-md shadow-panel p-1 select-none`}
      style={positionStyle()}
    >
      {TOOLBAR_ITEMS.map((item, i) => {
        if (item === 'separator') return <Separator key={`sep-${i}`} isVertical={isVertical} />;
        return (
          <ToolbarButton
            key={item.key}
            label={item.label}
            title={item.title}
            active={item.isActive(editor)}
            onClick={() => item.action(editor)}
            isVertical={isVertical}
          />
        );
      })}
      <DockModeToggle mode={dockMode} isVertical={isVertical} onToggle={handleDockToggle} />
    </div>
  );
};

export default EditorToolbar;
