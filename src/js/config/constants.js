/**
 * Cesium 기본값
 */
export const CESIUMDEF = {
  RADIUS: 20,     // 클릭 반경(m)
}

/**
 * krpano 기본값
 */
export const FRUSTUMDEF = {
  RADIUS: 4,              // frustum radius 길이(m)
  NEAR_DISTANCE: 0.3,     // 카메라와 NEAR면 사이 고정 거리(m)
  CAMERA_HEIGHT: 2.0,     // viewpoint 높이
  VIEW_POINT_RADIUS: 0.7, // viewpoint sphere 반지름 길이
  RATIO: 4.0 / 3.0,       // krpano 화면 비율 등. frustum 가로:세로 비율
  KRPANO_MAXFOV: 140,     // 사용할 krpano의 최대 fov
  FRUSTUM_MAXFOV: 120     // 제공할 frustum의 최대 fov
}

/** 
 * Geoserver 기본값 
*/
// 라인 및 베이스 WMS
export const GEOSERVER_WMS = {
  URL: "/geoserver/Tongyeong/wms",
  LAYER: "Tongyeong:survey_line_25_09",
  BASE_LAYER: "Tongyeong:ahnjung_v1",
}

// 촬영 포인트 WFS
export const GEOSERVER_WFS = {
  BASE: "/geoserver/Tongyeong/ows",
  ROAD_VIEW: "Tongyeong:survey_point",
  SRS: "EPSG:4326",
};

/** 
 * krpano 기본값
*/
// krpano 관련 기본 폴더 등
export const KRPANO = {
  ROOT: "/vtour",                         // krpano 루크 폴더
  TOUR: "/tour.html?startscene=scene_",   // krpano 뷰어
  TUMB: ".tiles/thumb.jpg",               // krpano 미리보기 위치
  DEFDATE: "20250903",                    // krpano 최신 사진 폴더명
}