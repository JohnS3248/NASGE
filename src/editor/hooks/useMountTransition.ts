import { useEffect, useState } from "react";

/**
 * 延迟卸载，等待退出动画播放完毕。
 *
 * @param isMounted - 组件逻辑上是否应该显示
 * @param unmountDelay - 退出动画时长（ms），卸载会延迟这么久
 * @returns shouldRender - DOM 是否应存在（包含退出动画期间）
 *
 * 用法：
 *   const shouldRender = useMountTransition(isOpen, 150);
 *   if (!shouldRender) return null;
 *   <div className={isOpen ? 'animate-dropdown-enter' : 'animate-dropdown-exit'}>
 */
export function useMountTransition(
  isMounted: boolean,
  unmountDelay: number,
): boolean {
  const [shouldRender, setShouldRender] = useState(isMounted);

  useEffect(() => {
    if (isMounted) {
      setShouldRender(true);
      return;
    }
    const timer = setTimeout(() => setShouldRender(false), unmountDelay);
    return () => clearTimeout(timer);
  }, [isMounted, unmountDelay]);

  return shouldRender;
}
