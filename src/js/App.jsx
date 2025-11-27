import { useRef, useState, useEffect } from "react";
import { loadRoad, clearRoad } from "./shared/cesium/roadLayer.js";
import KrpanoPanel from "./features/roadview/krPanoPanel.jsx";
import CesiumView from "./features/roadview/cesiumView.jsx";
import MultipleItems from "./features/roadview/thumnailCarousel.jsx";
import { KRPANO, CESIUMDEF } from "./config/constants";
import { roadPointsWithinMetersLocal, lonLatFromPosition } from "./shared/cesium/entityUtil.js";
import { highlightRoadPointByName, clearRoadHighlight, setSceneView, setViewHeadingDeg, } from "./shared/cesium/roadViewHighlight";

export default function App() {
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(false);    // 로드뷰 on/off 버튼 load
  const [roadOn, setRoadOn] = useState(false);      // 로드뷰 on/off 상태
  const [showPano, setShowPano] = useState(false);  // krpano on/off 상태
  const [startScene, setStartScene] = useState(null);   // ph_nm (PIC_...) 기준 scene명
  const [activeScene, setActiveScene] = useState(null); // krpano 현재 확인 중인 scene(ph_nm)
  const [nearPhotos, setNearPhotos] = useState([]);     // krpano, 클릭 기준 주변 사진 정보
  const [shootingDate, setShootingDate] = useState(KRPANO.DEFDATE); // krpano 촬영 날짜 선택
  const dateRef = useRef(shootingDate);

  // 사용 가능한 날짜 목록 (DEFDATE 먼저)
  const ALL_DATE_CHOICES = [
    KRPANO.DEFDATE,
    ...KRPANO.DATE_CHOICES.filter((d) => d !== KRPANO.DEFDATE),
  ];

  // 로드뷰 ON
  async function handleLoad() {
    if (!viewerRef.current || loading) return;
    setLoading(true);
    try {
      await loadRoad(viewerRef.current);
      setRoadOn(true); // 토글 ON
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // 로드뷰 OFF
  function handleClear() {
    if (!viewerRef.current) return;
    clearRoadHighlight();
    clearRoad(viewerRef.current);
    setRoadOn(false); // 토글 OFF
    setNearPhotos([]);
    setShowPano(false);
    setStartScene(null);
    setActiveScene(null);
  }

  // 상단 토글 버튼 핸들러(로드/제거 통합)
  async function toggleRoad() {
    if (!viewerRef.current || loading) return;
    if (roadOn) {
      handleClear();
    } else {
      await handleLoad();
    }
  }

  // 가까운 미리보기 사진
  function updateNearPhotosFromHits(hits) {
    if (!hits || hits.length === 0) {
      console.log("hit 없음");
      setNearPhotos([]);
      return;
    }
    const seen = new Set();
    const list = [];
    for (const h of hits) {
      const name = h?.ph_nm;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push({
        url: `${KRPANO.ROOT}/${dateRef.current}/panos/${name}${KRPANO.TUMB}`, name,
      });
    }
    setNearPhotos(list);
  }

  // krpano current scene에 따른 미리보기 업데이트
  function refreshPreviewByCenter(center) {
    if (!viewerRef.current || !center) {
      setNearPhotos([]);
      return;
    }
    const radius = CESIUMDEF.RADIUS;
    const hits = roadPointsWithinMetersLocal( viewerRef.current, center.lon, center.lat, radius );
    if (!hits || hits.length === 0) {
      setNearPhotos([]);
      return;
    }

    updateNearPhotosFromHits(hits);
  }

  function handleClickCenter(center) {
    refreshPreviewByCenter(center);
  }

  // 미리보기 클릭
  function handleThumbClick(ph_nm) {
    setStartScene(ph_nm);   // ph_nm (PIC_...) 저장
    setActiveScene(ph_nm);  // 썸네일 하이라이트용
    setShowPano(true);
    if (viewerRef.current) {
      highlightRoadPointByName(viewerRef.current, ph_nm);
    }
  }

  // krpano에서 scene 이동 시 포인트 이동 등
  function handleSceneChange(sceneInfo) {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const target = highlightRoadPointByName(viewer, sceneInfo.sceneName);

    if (!target) {
      console.log("[SCENE] 하이라이트 엔티티에서 position을 읽지 못함");
      return;
    }
    const time = viewer.clock.currentTime;
    const center = lonLatFromPosition(target.position, time);

    if (!center) {
      console.log("[SCENE] 하이라이트 엔티티에서 position 뽑을 수 없음");
      return;
    }

    setActiveScene(sceneInfo.sceneName);   // 미리보기 하이라이트 동기화
    setSceneView(sceneInfo.heading);      // frustum / 방향 동기화
    refreshPreviewByCenter(center);       // 미리보기 위치 이동
  }

  // 실시간 hlookat, vlookat, fov 변화 핸들링
  function handleViewChange(value) {
    setViewHeadingDeg(value.hlookat, value.vlookat, value.fov);
  }

  // 날짜가 바뀌면 현재 미리보기 URL도 즉시 재계산 + krpano 초기화
  useEffect(() => {
    setNearPhotos((prev) =>
      prev.map((it) => ({
        ...it,
        url: `${KRPANO.ROOT}/${shootingDate}/panos/${it.name}${KRPANO.TUMB}`,
      }))
    );
    dateRef.current = shootingDate;
    setShowPano(false);
    setStartScene(null);
    setActiveScene(null);
    clearRoadHighlight();
  }, [shootingDate]);

  // embedpano에 넘길 startscene id (scene_ 접두어 포함)
  const startSceneId =
    startScene != null ? `${KRPANO.SCENE_PREFIX}${startScene}` : null;

  return (
    <>
      <CesiumView
        onReady={(viewer) => (viewerRef.current = viewer)}
        onClickCenter={handleClickCenter}
      />

      {/* 상단: 로드뷰 토글만 유지, 날짜 선택은 캐러셀로 이동 */}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 10,
          background: "rgba(0,0,0,0.45)",
          padding: "8px 10px",
          borderRadius: 8,
          backdropFilter: "blur(4px)",
        }}
      >
        <button type="button" onClick={toggleRoad} disabled={loading}>
          {roadOn ? "로드 뷰 제거" : loading ? "로딩 중…" : "로드 뷰 불러오기"}
        </button>
      </div>

      {showPano && startScene && activeScene && (
        <KrpanoPanel
          viewerJsUrl={`${KRPANO.ROOT}/${shootingDate}/tour.js`}  // tour.js
          src={`${KRPANO.ROOT}/${shootingDate}${KRPANO.TOUR}`}    // tour.xml
          startSceneId={startSceneId}                             // vars.startscene
          widthPx={600}
          heightPx={400}
          initial="top-right"
          onClose={() => {
            setShowPano(false);
            setStartScene(null);
            setActiveScene(null);
            clearRoadHighlight();
          }}
          viewChange={handleViewChange}
          onSceneChange={handleSceneChange}
        />
      )}

      {/* 주변 포인트가 있을 때만 캐러셀 바 노출 */}
      {nearPhotos.length > 0 && (
        <MultipleItems
          images={nearPhotos}
          date={shootingDate}
          dateChoices={ALL_DATE_CHOICES}
          activeName={activeScene}
          onChangeDate={setShootingDate}
          onImageClick={handleThumbClick}
        />
      )}
    </>
  );
}
