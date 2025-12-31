import React, { useEffect, useState, useCallback, useRef } from "react";
import { Editor } from "@tiptap/react";

type TableControlsProps = {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

type ControlPosition = {
  tableElement: HTMLTableElement;
  top: number;
  left: number;
  width: number;
  height: number;
};

const TableControls: React.FC<TableControlsProps> = ({ editor, containerRef }) => {
  const [hoveredTable, setHoveredTable] = useState<ControlPosition | null>(null);
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
        setHoveredTable(null);
      }
    }, 150);
  }, [clearHideTimeout, isHoveringControl]);

  // 基于坐标检测鼠标是否在表格区域内
  const findTableAtPoint = useCallback((clientX: number, clientY: number): HTMLTableElement | null => {
    if (!containerRef.current) return null;

    // 获取编辑器内所有表格
    const tables = containerRef.current.querySelectorAll("table");

    for (const table of tables) {
      const rect = table.getBoundingClientRect();
      // 扩大检测区域，包括控制条区域
      const expandedRect = {
        left: rect.left,
        right: rect.right + 30, // 右侧控制条区域
        top: rect.top,
        bottom: rect.bottom + 25, // 底部控制条区域
      };

      if (
        clientX >= expandedRect.left &&
        clientX <= expandedRect.right &&
        clientY >= expandedRect.top &&
        clientY <= expandedRect.bottom
      ) {
        return table as HTMLTableElement;
      }
    }

    return null;
  }, [containerRef]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const tableElement = findTableAtPoint(e.clientX, e.clientY);

    if (tableElement) {
      clearHideTimeout();
      const containerRect = containerRef.current.getBoundingClientRect();
      const tableRect = tableElement.getBoundingClientRect();

      setHoveredTable({
        tableElement,
        top: tableRect.top - containerRect.top,
        left: tableRect.left - containerRect.left,
        width: tableRect.width,
        height: tableRect.height,
      });
    } else if (!isHoveringControl) {
      scheduleHide();
    }
  }, [containerRef, findTableAtPoint, clearHideTimeout, scheduleHide, isHoveringControl]);

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
    if (!editor || !hoveredTable) return;

    const { state } = editor;
    let lastCellPos: number | null = null;

    // 找到表格中最后一个单元格的位置
    state.doc.descendants((node, pos) => {
      if (node.type.name === "table") {
        const domNode = editor.view.nodeDOM(pos);
        if (domNode && (domNode === hoveredTable.tableElement || domNode.contains(hoveredTable.tableElement) || hoveredTable.tableElement.contains(domNode as Node))) {
          // 找到这个表格的最后一个单元格
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
      // 先将光标放在最后一个单元格内，然后添加行
      editor.chain().focus().setTextSelection(lastCellPos).addRowAfter().run();
    }
  }, [editor, hoveredTable]);

  const addColumn = useCallback(() => {
    if (!editor || !hoveredTable) return;

    const { state } = editor;
    let lastCellPos: number | null = null;

    // 找到表格中最后一行最后一个单元格的位置
    state.doc.descendants((node, pos) => {
      if (node.type.name === "table") {
        const domNode = editor.view.nodeDOM(pos);
        if (domNode && (domNode === hoveredTable.tableElement || domNode.contains(hoveredTable.tableElement) || hoveredTable.tableElement.contains(domNode as Node))) {
          // 找到这个表格的最后一个单元格
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
      // 先将光标放在最后一个单元格内，然后添加列
      editor.chain().focus().setTextSelection(lastCellPos).addColumnAfter().run();
    }
  }, [editor, hoveredTable]);

  if (!hoveredTable) return null;

  const controlBarStyle: React.CSSProperties = {
    position: "absolute",
    background: "rgba(102, 192, 244, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.2s ease",
    zIndex: 10,
  };

  const plusIconStyle: React.CSSProperties = {
    color: "rgba(102, 192, 244, 0.8)",
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
          ...controlBarStyle,
          top: hoveredTable.top + hoveredTable.height + 4,
          left: hoveredTable.left,
          width: hoveredTable.width,
          height: 16,
          borderRadius: "0 0 4px 4px",
        }}
        onMouseEnter={(e) => {
          handleControlMouseEnter();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.3)";
        }}
        onMouseLeave={(e) => {
          handleControlMouseLeave();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.15)";
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
          ...controlBarStyle,
          top: hoveredTable.top,
          left: hoveredTable.left + hoveredTable.width + 8,
          width: 16,
          height: hoveredTable.height,
          borderRadius: "0 4px 4px 0",
        }}
        onMouseEnter={(e) => {
          handleControlMouseEnter();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.3)";
        }}
        onMouseLeave={(e) => {
          handleControlMouseLeave();
          e.currentTarget.style.background = "rgba(102, 192, 244, 0.15)";
        }}
      >
        <span style={plusIconStyle}>+</span>
      </div>
    </>
  );
};

export default TableControls;
