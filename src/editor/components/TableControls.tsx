import React, { useEffect, useState, useCallback, useRef } from "react";
import { Editor } from "@tiptap/react";

type TableControlsProps = {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

type TableInfo = {
  tableElement: HTMLTableElement;
  top: number;
  left: number;
  width: number;
  height: number;
};

type HoverArea = "none" | "row" | "column";

const TableControls: React.FC<TableControlsProps> = ({ editor, containerRef }) => {
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [hoverArea, setHoverArea] = useState<HoverArea>("none");
  const [isHoveringControl, setIsHoveringControl] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = window.setTimeout(() => {
      if (!isHoveringControl) {
        setHoverArea("none");
        setTableInfo(null);
      }
    }, 150);
  }, [clearHideTimeout, isHoveringControl]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const tables = containerRef.current.querySelectorAll("table");
    let foundTable: HTMLTableElement | null = null;
    let foundArea: HoverArea = "none";

    for (const table of tables) {
      const rect = table.getBoundingClientRect();

      // 检测是否在右侧控制条区域 (表格右边 0-35px)
      const inColumnArea =
        e.clientX >= rect.right &&
        e.clientX <= rect.right + 35 &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      // 检测是否在底部控制条区域 (表格下方 0-30px)
      const inRowArea =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.bottom &&
        e.clientY <= rect.bottom + 30;

      if (inColumnArea || inRowArea) {
        foundTable = table as HTMLTableElement;
        foundArea = inColumnArea ? "column" : "row";
        break;
      }
    }

    if (foundTable && foundArea !== "none") {
      clearHideTimeout();
      const containerRect = containerRef.current.getBoundingClientRect();
      const tableRect = foundTable.getBoundingClientRect();

      setTableInfo({
        tableElement: foundTable,
        top: tableRect.top - containerRect.top,
        left: tableRect.left - containerRect.left,
        width: tableRect.width,
        height: tableRect.height,
      });
      setHoverArea(foundArea);
    } else if (!isHoveringControl) {
      scheduleHide();
    }
  }, [containerRef, clearHideTimeout, scheduleHide, isHoveringControl]);

  const handleMouseLeave = useCallback(() => {
    if (!isHoveringControl) {
      scheduleHide();
    }
  }, [scheduleHide, isHoveringControl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      clearHideTimeout();
    };
  }, [containerRef, handleMouseMove, handleMouseLeave, clearHideTimeout]);

  const handleControlMouseEnter = useCallback(() => {
    clearHideTimeout();
    setIsHoveringControl(true);
  }, [clearHideTimeout]);

  const handleControlMouseLeave = useCallback(() => {
    setIsHoveringControl(false);
    scheduleHide();
  }, [scheduleHide]);

  const addRow = useCallback(() => {
    if (!editor || !tableInfo) return;

    const { state } = editor;
    let lastCellPos: number | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === "table") {
        const domNode = editor.view.nodeDOM(pos);
        if (domNode && (domNode === tableInfo.tableElement || domNode.contains(tableInfo.tableElement) || tableInfo.tableElement.contains(domNode as Node))) {
          node.descendants((childNode, childPos) => {
            if (childNode.type.name === "tableCell" || childNode.type.name === "tableHeader") {
              lastCellPos = pos + childPos + 1;
            }
          });
          return false;
        }
      }
      return true;
    });

    if (lastCellPos !== null) {
      editor.chain().focus().setTextSelection(lastCellPos).addRowAfter().run();
    }
  }, [editor, tableInfo]);

  const addColumn = useCallback(() => {
    if (!editor || !tableInfo) return;

    const { state } = editor;
    let lastCellPos: number | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === "table") {
        const domNode = editor.view.nodeDOM(pos);
        if (domNode && (domNode === tableInfo.tableElement || domNode.contains(tableInfo.tableElement) || tableInfo.tableElement.contains(domNode as Node))) {
          node.descendants((childNode, childPos) => {
            if (childNode.type.name === "tableCell" || childNode.type.name === "tableHeader") {
              lastCellPos = pos + childPos + 1;
            }
          });
          return false;
        }
      }
      return true;
    });

    if (lastCellPos !== null) {
      editor.chain().focus().setTextSelection(lastCellPos).addColumnAfter().run();
    }
  }, [editor, tableInfo]);

  if (!tableInfo) return null;

  const showRowControl = hoverArea === "row" || isHoveringControl;
  const showColumnControl = hoverArea === "column" || isHoveringControl;

  const controlBarBaseStyle: React.CSSProperties = {
    position: "absolute",
    background: "rgba(102, 192, 244, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "opacity 0.2s ease, background 0.2s ease",
    zIndex: 10,
  };

  const plusIconStyle: React.CSSProperties = {
    color: "rgba(102, 192, 244, 0.6)",
    fontSize: "16px",
    fontWeight: "bold",
    userSelect: "none",
  };

  return (
    <>
      {/* 底部控制条 - 添加行 */}
      <div
        className="nasge-table-control nasge-table-add-row"
        onClick={addRow}
        title="添加行"
        style={{
          ...controlBarBaseStyle,
          top: tableInfo.top + tableInfo.height + 4,
          left: tableInfo.left,
          width: tableInfo.width,
          height: 16,
          borderRadius: "0 0 4px 4px",
          opacity: showRowControl && hoverArea === "row" ? 1 : 0,
          pointerEvents: showRowControl && hoverArea === "row" ? "auto" : "none",
        }}
        onMouseEnter={(e) => {
          handleControlMouseEnter();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.2)";
        }}
        onMouseLeave={(e) => {
          handleControlMouseLeave();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.1)";
        }}
      >
        <span style={plusIconStyle}>+</span>
      </div>

      {/* 右侧控制条 - 添加列 */}
      <div
        className="nasge-table-control nasge-table-add-col"
        onClick={addColumn}
        title="添加列"
        style={{
          ...controlBarBaseStyle,
          top: tableInfo.top,
          left: tableInfo.left + tableInfo.width + 8,
          width: 16,
          height: tableInfo.height,
          borderRadius: "0 4px 4px 0",
          opacity: showColumnControl && hoverArea === "column" ? 1 : 0,
          pointerEvents: showColumnControl && hoverArea === "column" ? "auto" : "none",
        }}
        onMouseEnter={(e) => {
          handleControlMouseEnter();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.2)";
        }}
        onMouseLeave={(e) => {
          handleControlMouseLeave();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.1)";
        }}
      >
        <span style={plusIconStyle}>+</span>
      </div>
    </>
  );
};

export default TableControls;
