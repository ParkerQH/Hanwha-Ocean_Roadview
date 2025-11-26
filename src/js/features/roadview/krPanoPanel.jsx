import { useEffect, useRef, useState } from "react";

/**
 * vtour은 public/vtour 아래에 둔다. src는 tour.html로 둔다.
 * 크기는 px 고정(widthPx/heightPx). 마우스로 헤더를 끌어 이동.
 */
export default function KrpanoPanel({
  src = "/vtour/tour.html",
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
  const iframeRef = useRef(null);

  // 패널 위치
  const [pos, setPos] = useState({ x: -9999, y: -9999 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, startX: 0, startY: 0 });

  // 전체 화면 여부
  const [isMaximized, setIsMaximized] = useState(false);

  // 최초 위치 배치 + 리사이즈 대응
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

  // krpano에서 보내는 data 수신 (scene)
  useEffect(() => {
    const onMsg = (e) => {
      if (!iframeRef.current) return;
      if (e.source !== iframeRef.current.contentWindow) return;

      const data = e.data;

      if (data && data.type === "krpano-scene" && data.name) {
        onSceneChange?.({
          sceneName: data.name,
          heading: data.heading,
        });
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onSceneChange]);

  // krpano에서 보내는 data 수신 (view)
  useEffect(() => {
    const onMsg = (e) => {
      if (!iframeRef.current) return;
      if (e.source !== iframeRef.current.contentWindow) return;

      const data = e.data;

      if (data && data.type === "view-info") {
        viewChange?.({
          hlookat: data.hlookat,
          vlookat: data.vlookat,
          fov: data.fov,
        });
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [viewChange]);

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

      <iframe
        ref={iframeRef}
        src={src}
        style={{ flex: 1, border: "none", background: "#000" }}
      />
    </div>
  );
}
