import * as Cesium from "cesium";

// 중심(lon,lat) 기준 반경(m) -> 경위도 BBOX(deg)
export function bboxFromCenterMeters(lon, lat, radiusMeters) {
  const latRad = Cesium.Math.toRadians(lat);
  const dLat = radiusMeters / 110574.0;
  const dLon = radiusMeters / (111320.0 * Math.cos(latRad));

  return {
    minLon: lon - dLon,
    minLat: lat - dLat,
    maxLon: lon + dLon,
    maxLat: lat + dLat,
  };
}

// CQL BBOX 문자열 생성
export function cqlBBOX({ geom = "geom" }, bbox) {
  const { minLon, minLat, maxLon, maxLat } = bbox;
  return `BBOX(${geom},${minLon},${minLat},${maxLon},${maxLat})`;
}

// BBOX로 포인트만 조회
export async function fetchPointsInBBox(
  { wfsBase, typeName, srsName = "EPSG:4326", geom = "geom", extraCql = "" },
  bbox
) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    srsName,
  });
  const cql = cqlBBOX({ geom }, bbox) + (extraCql ? ` AND (${extraCql})` : "");
  params.set("CQL_FILTER", cql);

  const url = `${wfsBase}?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok)
    throw new Error(`WFS BBOX failed: ${res.status} ${res.statusText}`);

  const fc = await res.json();
  return Array.isArray(fc?.features) ? fc.features : [];
}

export function lonLatFromPosition(
  position,
  time = Cesium.JulianDate.now()
) {
  if (!position) return null;

  const cart =
    typeof position.getValue === "function" ? position.getValue(time) : position;

  if (!cart) return null;

  const c = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
    h: c.height || 0,
  };
}

export function readProperty(entity, key, time = Cesium.JulianDate.now()) {
  const props = entity?.properties;

  if (!props) return undefined;

  if (typeof props.getValue === "function") {
    const all = props.getValue(time);

    if (all && Object.prototype.hasOwnProperty.call(all, key)) return all[key];
  }
  const prop = props[key];

  if (prop && typeof prop.getValue === "function") return prop.getValue(time);

  return prop;
}

// 두 lon/lat 사이의 지표 거리(m)
export function metersBetweenLonLat(a, b) {
  const geod = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(a.lon, a.lat),
    Cesium.Cartographic.fromDegrees(b.lon, b.lat)
  );
  return geod.surfaceDistance;
}

// DataSource에서 반경(m) 이내 포인트 전부 반환(거리 오름차순)
export function pointsWithinMetersInDataSource(
  ds,
  lon,
  lat,
  radiusMeters,
  time = Cesium.JulianDate.now()
) {
  if (!ds) return [];
  const latRad = Cesium.Math.toRadians(lat);
  const dLat = radiusMeters / 110574.0;
  const dLon = radiusMeters / (111320.0 * Math.cos(latRad));
  const minLon = lon - dLon;
  const maxLon = lon + dLon;
  const minLat = lat - dLat;
  const maxLat = lat + dLat;

  const out = [];
  const target = { lon, lat };
  const entities = ds.entities.values;

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (!ent.position) continue;
    const p = lonLatFromPosition(ent.position, time);
    if (!p) continue;
    if (p.lon < minLon || p.lon > maxLon || p.lat < minLat || p.lat > maxLat)
      continue;
    const d = metersBetweenLonLat(target, p);
    if (d <= radiusMeters) {
      out.push({
        entity: ent,
        ph_nm: readProperty(ent, "ph_nm", time),
        distance: d,
      });
    }
  }

  out.sort((a, b) => a.distance - b.distance);
  return out;
}

// viewer -> name이 'road-points'인 DS에서 반경(m) 내 포인트 전부
export function roadPointsWithinMetersLocal(viewer, lon, lat, radiusMeters = 5, time = Cesium.JulianDate.now()) {
  const ds = viewer?.dataSources?.getByName?.("road-points")?.[0] || null;

  if (!ds) return [];
  return pointsWithinMetersInDataSource(ds, lon, lat, radiusMeters, time);
}

// 선택 반경(ellipse) 한 개 유지
let _selectionCircle = null;
export function upsertSelectionCircle(viewer, lon, lat, radiusMeters, { outlineWidth = 2 } = {}) {
  if (!viewer) return null;
  const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
  if (!_selectionCircle) {
    _selectionCircle = viewer.entities.add({
      name: "selection-circle",
      position: pos,
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        height: 0,
        material: Cesium.Color.fromBytes(0, 153, 255, 40),
        outline: true,
        outlineColor: Cesium.Color.fromBytes(0, 153, 255, 255),
        outlineWidth,
      },
      zIndex: 9999,
    });
  } else {
    _selectionCircle.position = pos;
    _selectionCircle.ellipse.semiMajorAxis = radiusMeters;
    _selectionCircle.ellipse.semiMinorAxis = radiusMeters;
  }
  return _selectionCircle;
}