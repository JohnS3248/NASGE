import { useEffect, useRef, useCallback } from "react";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "../tour/tour.css";
import { useTranslation } from "react-i18next";
import { useEditorConfigStore } from "../stores/useEditorConfigStore";
import { useGuideStore, type EditorMode } from "../stores/useGuideStore";
import { dialog } from "../stores/useDialogStore";
import { BASIC_STEPS, ADVANCED_STEPS } from "../tour/steps";
import type { TourStepDef } from "../tour/types";

/** 将 TourStepDef[] 转为 driver.js DriveStep[]（纯数据映射，不含 prepare 逻辑） */
function buildDriverSteps(
  defs: TourStepDef[],
  t: (key: string) => string,
): DriveStep[] {
  return defs.map((def) => ({
    ...(def.selector ? { element: def.selector } : {}),
    popover: {
      title: t(def.titleKey),
      description: t(def.descriptionKey),
      ...(def.side ? { side: def.side } : {}),
      ...(def.align ? { align: def.align } : {}),
    },
  }));
}

/**
 * 执行目标步骤的 prepare，等 React 渲染 2 帧后再跳转。
 * 解决时序问题：prepare 打开面板 → React 重渲染 → driver.js 测量元素位置。
 */
function moveToPrepared(
  driverObj: Driver,
  defs: TourStepDef[],
  targetIdx: number,
  moveFn: () => void,
) {
  const targetDef = defs[targetIdx];
  if (targetDef?.prepare) {
    targetDef.prepare();
    // 等 2 帧让 React 完成渲染
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        moveFn();
      });
    });
  } else {
    moveFn();
  }
}

/** 按当前 mode 过滤步骤 */
function filterByMode(steps: TourStepDef[], mode: EditorMode): TourStepDef[] {
  return steps.filter((s) => !s.showOnModes || s.showOnModes.includes(mode));
}

/**
 * 注入自定义按钮到 popover footer（替换默认 next/prev/done 按钮）。
 * 用于 Step 0 欢迎窗和 Step 5 完成窗。
 */
function injectCustomButtons(
  popover: { footerButtons: HTMLElement },
  buttons: Array<{ label: string; className: string; onClick: () => void }>,
) {
  const footer = popover.footerButtons;
  // 清空默认按钮
  footer.innerHTML = "";
  footer.className = "nasge-tour-welcome-btns";
  for (const btn of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = btn.label;
    el.className = btn.className;
    el.addEventListener("click", btn.onClick);
    footer.appendChild(el);
  }
}

export function useTour() {
  const driverRef = useRef<Driver | null>(null);
  const startAdvancedRef = useRef<((opts?: { replay?: boolean }) => void) | null>(null);
  const { t } = useTranslation("editor");

  const destroy = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
  }, []);

  /** 跳过/关闭 tour 时弹提示（非 replay 模式） */
  const showSkipHint = useCallback(() => {
    // 短暂延迟，等 driver.js overlay 完全清除后再弹
    setTimeout(() => {
      dialog.confirm({
        title: t("tour.skip"),
        message: t("tour.skipHint"),
        confirmText: t("tour.gotIt"),
        cancelText: "",
      });
    }, 200);
  }, [t]);

  const startAdvancedTour = useCallback(
    (options?: { replay?: boolean }) => {
      const replay = options?.replay ?? false;
      const mode = useGuideStore.getState().mode;

      const filteredDefs = filterByMode(ADVANCED_STEPS, mode);
      const steps = buildDriverSteps(filteredDefs, t);

      if (steps.length === 0) return;

      // 先执行第一步的 prepare（如果有），等渲染后再启动 tour
      const firstDef = filteredDefs[0];
      const launchTour = () => {
        driverRef.current = driver({
          steps,
          showProgress: true,
          progressText: `{{current}} / {{total}}`,
          allowClose: true,
        overlayClickBehavior: () => { /* 禁止点击遮罩关闭 */ },
          smoothScroll: true,
          stagePadding: 12,
          stageRadius: 8,
          popoverOffset: 12,
          nextBtnText: t("tour.next"),
          prevBtnText: t("tour.prev"),
          doneBtnText: t("tour.done"),
          showButtons: ["next", "previous", "close"],
          popoverClass: "nasge-tour-popover",

          // 时序控制：点下一步/上一步时，先执行目标步骤的 prepare 等渲染再跳转
          onNextClick: (_el, _step, { state }) => {
            const nextIdx = (state.activeIndex ?? 0) + 1;
            moveToPrepared(driverRef.current!, filteredDefs, nextIdx, () => {
              driverRef.current?.moveNext();
            });
          },
          onPrevClick: (_el, _step, { state }) => {
            const prevIdx = (state.activeIndex ?? 0) - 1;
            moveToPrepared(driverRef.current!, filteredDefs, prevIdx, () => {
              driverRef.current?.movePrevious();
            });
          },

          onCloseClick: () => {
            if (!replay) {
              useEditorConfigStore.getState().skipTour("advanced");
              showSkipHint();
            }
            destroy();
          },
          onDestroyed: () => {
            if (!replay) {
              useEditorConfigStore.getState().completeTour("advanced");
            }
            driverRef.current = null;
          },
        });

        driverRef.current.drive();
      };

      // 首步有 prepare → 先执行，等渲染后启动
      if (firstDef?.prepare) {
        firstDef.prepare();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => launchTour());
        });
      } else {
        launchTour();
      }
    },
    [t, destroy],
  );

  // 保持 ref 更新，供闭包内调用
  startAdvancedRef.current = startAdvancedTour;

  const startBasicTour = useCallback(
    (options?: { replay?: boolean }) => {
      const replay = options?.replay ?? false;
      const steps = buildDriverSteps(BASIC_STEPS, t);

      // 欢迎窗（index 0）：隐藏默认按钮，用自定义按钮
      const welcomeIdx = 0;
      // 完成窗（最后一步）
      const completeIdx = steps.length - 1;

      driverRef.current = driver({
        steps,
        showProgress: true,
        progressText: `{{current}} / {{total}}`,
        allowClose: true,
        overlayClickBehavior: () => { /* 禁止点击遮罩关闭 */ },
        smoothScroll: true,
        stagePadding: 12,
        stageRadius: 8,
        popoverOffset: 12,
        nextBtnText: t("tour.next"),
        prevBtnText: t("tour.prev"),
        doneBtnText: t("tour.done"),
        showButtons: ["next", "previous", "close"],
        popoverClass: "nasge-tour-popover",

        onPopoverRender: (popover, { state }) => {
          const idx = state.activeIndex;

          if (idx === welcomeIdx) {
            // Step 0 欢迎窗：[跳过引导] [开始基础演示 →]
            injectCustomButtons(popover, [
              {
                label: t("tour.skip"),
                className: "nasge-tour-btn-skip",
                onClick: () => {
                  if (!replay) {
                    useEditorConfigStore.getState().skipTour("basic");
                    showSkipHint();
                  }
                  destroy();
                },
              },
              {
                label: t("tour.start"),
                className: "nasge-tour-btn-start",
                onClick: () => {
                  driverRef.current?.moveNext();
                },
              },
            ]);
          } else if (idx === completeIdx) {
            // Step 5 完成窗：[我懂了，关闭] [看看更多 →]
            injectCustomButtons(popover, [
              {
                label: t("tour.gotIt"),
                className: "nasge-tour-btn-skip",
                onClick: () => {
                  if (!replay) {
                    useEditorConfigStore.getState().completeTour("basic");
                  }
                  destroy();
                },
              },
              {
                label: t("tour.seeMore"),
                className: "nasge-tour-btn-start",
                onClick: () => {
                  if (!replay) {
                    useEditorConfigStore.getState().completeTour("basic");
                  }
                  destroy();
                  // 短暂延迟后启动高级 tour
                  setTimeout(() => {
                    startAdvancedRef.current?.({ replay });
                  }, 300);
                },
              },
            ]);
          }
        },

        onCloseClick: () => {
          if (!replay) {
            useEditorConfigStore.getState().skipTour("basic");
            showSkipHint();
          }
          destroy();
        },

        // onDestroyed 在 × 关闭和走完时都会触发
        // 但我们已经在自定义按钮里处理了状态写入
        // 这里只做清理，不重复写状态
        onDestroyed: () => {
          driverRef.current = null;
        },
      });

      driverRef.current.drive();
    },
    [t, destroy, startAdvancedTour],
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    startBasicTour,
    startAdvancedTour,
    destroy,
  };
}
