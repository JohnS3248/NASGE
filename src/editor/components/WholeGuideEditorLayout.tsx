/**
 * WholeGuideEditorLayout — 全篇模式 layout
 *
 * 包裹 WholeGuideEditor + Outlet：
 *   - 编辑器组件持续 mount，避免 review 子路由切换时丢失光标 / 卸载 session lock / 重启 hook
 *   - 进入 review 子路由时编辑器 div 设 hidden（display:none），但 React tree 不卸载
 *   - Outlet 渲染 review 子路由组件
 */

import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import WholeGuideEditor from "./WholeGuideEditor";

const WholeGuideEditorLayout: React.FC = () => {
  const location = useLocation();
  const isReviewing = location.pathname.endsWith("/review");

  return (
    <>
      <div hidden={isReviewing} aria-hidden={isReviewing}>
        <WholeGuideEditor />
      </div>
      <Outlet />
    </>
  );
};

export default WholeGuideEditorLayout;
