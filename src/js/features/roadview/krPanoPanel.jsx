import { useEffect, useRef, useState } from "react";

// 현재 로드된 krpano viewer js 경로를 전역에 기록하기 위한 키
const KR_VIEWER_KEY = "__krpanoViewerUrl";

// 날짜별 krpano viewer js를 동적으로 로딩
function loadKrpanoViewer(viewerJsUrl) {
  return new Promise((resolve, reject) => {
    // 이미 같은 js 로딩되어 있고, embedpano 도 있으면 그대로 사용
    if (window.embedpano && window[KR_VIEWER_KEY] === viewerJsUrl) {
      resolve();
      return;
    }

    // 기존 viewer 스크립트(tag) 제거
    const oldScript = document.querySelector(
      'script[data-krpano-viewer="true"]'
    );
    if (oldScript) {
      oldScript.remove();
    }

    const script = document.createElement("script");
    script.src = viewerJsUrl;
    script.async = true;
    script.dataset.krpanoViewer = "true";

    script.onload = () => {
      window[KR_VIEWER_KEY] = viewerJsUrl;
      if (typeof window.embedpano !== "function") {
        reject(
          new Error(
            `[KrpanoPanel] ${viewerJsUrl} 로드 후에도 window.embedpano 없음`
          )
        );
      } else {
        resolve();
      }
    };

    script.onerror = () => {
      reject(new Error(`[KrpanoPanel] krpano viewer 로드 실패: ${viewerJsUrl}`));
    };

    document.body.appendChild(script);
  });
}

/**
 * vtour은 public/vtour/{날짜} 아래에 두는 구조.
 * - viewerJsUrl: "/vtour/20250903/tour.js"
 * - src(xml):    "/vtour/20250903/tour.xml"
 * - startSceneId: "scene_PIC_20250903_"
 */
export default function KrpanoPanel({
  viewerJsUrl,
  src = "/vtour/tour.xml",
  startSceneId,
  widthPx = 720,
  heightPx = 405,
  defaultMargin = 12,
  initial = "bottom-left", // "top-left" | "top-right" | "bottom-left" | "bottom-right"
  onClose,
  style,
  onSceneChange,
  viewChange,
  title = "Panorama",
}) {
  const headerRef = useRef(null);
  const panoContainerRef = useRef(null);

  // embedpano로 생성된 krpano 인터페이스 객체
  const krpanoRef = useRef(null);
  const panoIdRef = useRef(
    `krpano-viewer-${Math.random().toString(36).slice(2)}`
  );

  // 이벤트 리스너 참조(정리용)
  const sceneListenerRef = useRef(null);
  const viewListenerRef = useRef(null);

  // 패널 위치
  const [pos, setPos] = useState({ x: -9999, y: -9999 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, startX: 0, startY: 0 });

  // 전체 화면 여부
  const [isMaximized, setIsMaximized] = useState(false);

  // 패널 위치 잡기
  useEffect(() => {
    const place = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;

      const xRight = Math.max(defaultMargin, W - widthPx - defaultMargin);
      const yBottom = Math.max(defaultMargin, H - heightPx - defaultMargin);

      switch (initial) {
        case "top-left":
          setPos({ x: defaultMargin, y: defaultMargin });
          break;
        case "top-right":
          setPos({ x: xRight, y: defaultMargin });
          break;
        case "bottom-left":
          setPos({ x: defaultMargin, y: yBottom });
          break;
        default:
          setPos({ x: xRight, y: yBottom });
          break;
      }
    };

    if (isMaximized) {
      // 전체 화면일 때는 항상 (0,0)에서 시작
      setPos({ x: 0, y: 0 });
      return;
    }

    place();

    const onResize = () => {
      if (!isMaximized) place();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [defaultMargin, widthPx, heightPx, initial, isMaximized]);

  // 드래그 처리
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const onDown = (e) => {
      // 전체 화면 상태에서는 드래그 비활성
      if (isMaximized) return;

      // 버튼 영역 클릭은 드래그 시작 안 함
      const target = e.target;
      if (target && target.tagName === "BUTTON") return;

      dragRef.current.active = true;
      dragRef.current.sx = e.clientX;
      dragRef.current.sy = e.clientY;
      dragRef.current.startX = pos.x;
      dragRef.current.startY = pos.y;
    };

    const onMove = (e) => {
      if (!dragRef.current.active) return;

      // 버튼이 풀렸으면 즉시 종료 (보강)
      if ((e.buttons & 1) === 0) {
        dragRef.current.active = false;
        return;
      }

      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;

      const W = window.innerWidth;
      const H = window.innerHeight;

      const nx = Math.min(
        Math.max(0, dragRef.current.startX + dx),
        Math.max(0, W - widthPx)
      );
      const ny = Math.min(
        Math.max(0, dragRef.current.startY + dy),
        Math.max(0, H - heightPx)
      );

      setPos({ x: nx, y: ny });
    };

    const onUp = () => {
      dragRef.current.active = false;
    };

    header.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);

    return () => {
      header.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [pos.x, pos.y, widthPx, heightPx, isMaximized]);

  // ESC로 전체 화면 해제
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" || e.key === "Esc") {
        if (isMaximized) {
          // 확대 상태일 때만 축소
          setIsMaximized(false);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMaximized]);

  // 1) viewer js 로딩
  // 2) embedpano 호출
  // 3) krpano.events로 scene/view 변화 감시
  useEffect(() => {
    const container = panoContainerRef.current;
    if (!container) return;

    const panoId = panoIdRef.current;
    container.id = panoId;
    container.innerHTML = "";

    let cancelled = false;

    loadKrpanoViewer(viewerJsUrl)
      .then(() => {
        if (cancelled) return;
        if (typeof window.embedpano !== "function") {
          console.error("[KrpanoPanel] embedpano 없음");
          return;
        }

        function onready(krpano) {
          krpanoRef.current = krpano;

          const sceneListener = () => {
            if (!krpanoRef.current) return;

            const baseName = krpanoRef.current.get("scene[get(xml.scene)].title");

            const heading = krpanoRef.current.get("scene[get(xml.scene)].heading");

            if (typeof onSceneChange === "function") {
              onSceneChange({
                sceneName: baseName,
                heading: Number(heading) || 0,
              });
            }
          };

          const viewListener = () => {
            if (!krpanoRef.current) return;
            if (typeof viewChange !== "function") return;

            const h = Number(krpanoRef.current.get("view.hlookat")) || 0;
            const v = Number(krpanoRef.current.get("view.vlookat")) || 0;
            const fov = Number(krpanoRef.current.get("view.fov")) || 0;

            viewChange({ hlookat: h, vlookat: v, fov });
          };

          sceneListenerRef.current = sceneListener;
          viewListenerRef.current = viewListener;

          krpano.events.addListener("onnewpano", sceneListener);
          krpano.events.addListener("onviewchanged", viewListener);

          // 이미 scene 이 있으면 초기 상태 한 번 밀어줌
          sceneListener();
          viewListener();
        }

        const vars = startSceneId ? { startscene: startSceneId } : undefined;

        window.embedpano({
          target: panoId,
          xml: src,
          vars,
          onready,
        });
      })
      .catch((err) => {
        console.error(String(err));
      });

    return () => {
      cancelled = true;
      const krpano = krpanoRef.current;

      if (krpano) {
        if (sceneListenerRef.current) {
          try {
            krpano.events.removeListener(
              "onnewpano",
              sceneListenerRef.current
            );
          } catch (err) {
            console.warn("[KrpanoPanel] onnewpano remove 실패", err);
          }
        }
        if (viewListenerRef.current) {
          try {
            krpano.events.removeListener(
              "onviewchanged",
              viewListenerRef.current
            );
          } catch (err) {
            console.warn("[KrpanoPanel] onviewchanged remove 실패", err);
          }
        }
      }

      if (typeof window.removepano === "function") {
        try {
          window.removepano(panoId);
        } catch (err) {
          console.warn("[KrpanoPanel] removepano 실패:", err);
        }
      }

      krpanoRef.current = null;
      sceneListenerRef.current = null;
      viewListenerRef.current = null;
    };
  }, [viewerJsUrl, src, startSceneId]);

  const panelWidth = isMaximized ? "100vw" : `${widthPx}px`;
  const panelHeight = isMaximized ? "100vh" : `${heightPx}px`;
  const panelLeft = isMaximized ? 0 : pos.x;
  const panelTop = isMaximized ? 0 : pos.y;

  return (
    <div
      style={{
        position: "fixed",
        left: panelLeft,
        top: panelTop,
        width: panelWidth,
        height: panelHeight,
        zIndex: 25,
        background: "rgba(0,0,0,0.6)",
        border: "1px solid #333",
        borderRadius: isMaximized ? 0 : 8,
        boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        ref={headerRef}
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          cursor: isMaximized ? "default" : "move",
          userSelect: "none",
          touchAction: "none",
          background: "rgba(20,20,20,0.9)",
          color: "#ddd",
          fontSize: 14,
        }}
      >
        <span>{title}</span>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            style={{
              border: "1px solid #666",
              background: "#222",
              color: "#ddd",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            {isMaximized ? "축소" : "확대"}
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            style={{
              border: "1px solid #666",
              background: "#222",
              color: "#ddd",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </div>

      {/* embedpano 컨테이너 */}
      <div
        ref={panoContainerRef}
        style={{ flex: 1, border: "none", background: "#000" }}
      />
    </div>
  );
}
