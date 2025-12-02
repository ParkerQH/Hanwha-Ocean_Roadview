// src/features/road.jsx
import * as Cesium from "cesium";
import { DataFetcher } from "../api/DataFetcher.js";
import { GEOSERVER_WMS, GEOSERVER_WFS } from "../../config/constants.js";

// WMS(라인) 레이어 핸들 + WFS(포인트) DataSource 핸들
let roadWmsLayer = null;
let pointDS = null;

export async function loadRoad(
  viewer, layer,
  {
    // road 라인 wms
    wmsUrl = GEOSERVER_WMS.URL,
    wmsLayers = layer,
    wmsParams = {
      service: "WMS",
      version: "1.1.1",
      request: "GetMap",
      format: "image/png",
      transparent: true,
      tiled: true,
    },

    // 포인트 WFS 설정
    wfsPointBase = GEOSERVER_WFS.BASE,
    wfsPointType = GEOSERVER_WFS.ROAD_VIEW,
    wfsPointSrs = GEOSERVER_WFS.SRS,
    wfsPointCql = "",
  } = {}
) {
  if (!viewer) return null;

  // 1) 라인 WMS 올리기 (이미 올라가 있으면 show만 true)
  if (!roadWmsLayer) {
    const provider = new Cesium.WebMapServiceImageryProvider({
      url: wmsUrl,
      layers: wmsLayers,
      parameters: wmsParams,
    });
    roadWmsLayer = viewer.imageryLayers.addImageryProvider(provider);
    roadWmsLayer.alpha = 1.0;
    roadWmsLayer.show = true;
  } else {
    roadWmsLayer.show = true;
  }

  // 2) 포인트 WFS 로드 -> 화면 비가시 처리
  const fetcher = new DataFetcher({
    wfsBase: wfsPointBase,
    typeName: wfsPointType,
    srs: wfsPointSrs,
  });
  const featureCollection = await fetcher.wfsGet({ cql: wfsPointCql });

  // 기존 포인트 DataSource 제거
  if (pointDS) {
    try { viewer.dataSources.remove(pointDS); } catch {}
    pointDS = null;
  }

  // 포인트만 담긴 FC라고 가정
  pointDS = await Cesium.GeoJsonDataSource.load(featureCollection, {
    clampToGround: true,
  });
  pointDS.name = "road-points";

  // 화면 비가시
  for (const ent of pointDS.entities.values) {
    ent.show = false;
  }

  await viewer.dataSources.add(pointDS);

  return { wms: roadWmsLayer, points: pointDS };
}

export function clearRoad(viewer) {
  if (!viewer) {
    console.warn("[roadLayer.clearRoad] viewer is null/undefined");
    return;
  }

  if (roadWmsLayer) {
    try {
      viewer.imageryLayers.remove(roadWmsLayer, true);
    } catch (err) {
      console.error(
        "[roadLayer.clearRoad] failed to remove WMS layer:",
        err
      );
    } finally {
      roadWmsLayer = null;
    }
  }

  if (pointDS) {
    if (!viewer.dataSources) {
      console.warn(
        "[roadLayer.clearRoad] viewer.dataSources is not available"
      );
    } else {
      try {
        viewer.dataSources.remove(pointDS);
      } catch (err) {
        console.error(
          "[roadLayer.clearRoad] failed to remove points DataSource:",
          err
        );
      } finally {
        pointDS = null;
      }
    }
  }
}
