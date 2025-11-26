import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { GEOSERVER_WMS } from "../../config/constants"

export default function CesiumView({
  style = { width: "100vw", height: "100vh" },
  onReady,
  onClickCenter
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (viewerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

    const viewer = new Cesium.Viewer(containerRef.current, {
      geocoder: false,              // 검색창
      homeButton: false,            // 집 모양 버튼
      sceneModePicker: false,       // 2D/3D 모든 변환
      baseLayerPicker: false,       // 베이스 맴 선택
      navigationHelpButton: false,  // 도움말 버튼
      timeline: false,              // 하단 타임라인 버튼
      animation: false,             // 애니메이션 컨롤러
      fullscreenButton: false,      // 전체 화면
      infoBox: false,               // 픽셀 정보 박스 제거
      selectionIndicator: false,    // 클릭 테두리 제거
    });
    viewerRef.current = viewer;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(128.4156, 34.9501, 280.0),
      orientation: { 
        heading: Cesium.Math.toRadians(-1.0), 
        pitch: Cesium.Math.toRadians(-45.0), 
        roll: 0 
      },
    });

    const baseWms = new Cesium.WebMapServiceImageryProvider({
      url: GEOSERVER_WMS.URL,
      layers: GEOSERVER_WMS.BASE_LAYER,
      parameters: { 
        service: "WMS", 
        version: "1.1.1", 
        request: "GetMap", 
        format: "image/png", 
        transparent: true 
      },
    });
    viewer.imageryLayers.addImageryProvider(baseWms);

    function pickLonLat(position) {
      const { scene } = viewer;
      let cartesian;
      if (scene.pickPositionSupported) 
        cartesian = scene.pickPosition(position);
      if (!Cesium.defined(cartesian)) {
        const ray = viewer.camera.getPickRay(position);
        cartesian = scene.globe.pick(ray, scene);
      }
      if (!Cesium.defined(cartesian)) {
        cartesian = viewer.camera.pickEllipsoid(position, scene.globe.ellipsoid);
      }
      if (!Cesium.defined(cartesian)) return null;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      return { lon: Cesium.Math.toDegrees(carto.longitude), lat: Cesium.Math.toDegrees(carto.latitude) };
    }

    viewer.screenSpaceEventHandler.setInputAction(async (click) => {
      const p = pickLonLat(click.position);
      if (!p) { 
        return; 
      }

      onClickCenter?.(p);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    onReady?.(viewer);

    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={style} />;
}
