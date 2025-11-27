import * as Cesium from "cesium";

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