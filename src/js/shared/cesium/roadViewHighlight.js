import * as Cesium from "cesium";
import { FRUSTUMDEF } from "../../config/constants";
import { readProperty } from "./entityUtil";

// krpano에서 넘어오는 카메라 시야 값
let _sceneHeading = 0;  // 촬영된 heading 정보(북쪽 기준 시계)
let _viewHlookat = 0;
let _viewVlookat = 0;
let _viewFov = 120;

// 초기 krpano view 시야 값 세팅
export function setSceneView(heading) {
  _sceneHeading = Number(heading);
}

// krpano에서 view가 바뀔 때마다 App.jsx에서 호출
export function setViewHeadingDeg(hlookat, vlookat, fov) {
  if (Number.isFinite(hlookat)) {
    _viewHlookat = _sceneHeading + ((hlookat % 360) + 360) % 360;
  }
  if (Number.isFinite(vlookat)) {
    _viewVlookat = vlookat;
  }
  if (Number.isFinite(fov)) {
    _viewFov = fov;
  }
}

// 하이라이트 포인트 + frustum(옆면) + 원 관리용 전역 핸들
let _highlightPoint = null;
let _highlightCircle = null;
let _highlightFrustumSides = [];
let _highlightViewer = null;
let _highlightSphere = null;

/**
 * frustum 기하 계산
 *
 * target 엔티티(road point) 위치를 기준으로:
 *  1) road point 위치에서 cameraHeight(m) 위에 apexWorld(krpano 카메라 위치) 설정
 *  2) apexWorld 기준 ENU(local East-North-Up) 좌표계 생성
 *  3) _viewHlookat / _viewVlookat / _viewFov 로 시야 방향(forwardLocal) 계산
 *  4) near/far 평면 중심과 직사각형 코너 4개씩 (nearWorld, farWorld) 계산
 *  5) apexWorld에서 축 방향 near/far 중심까지의 거리(nearRadius, farRadius) 반환
 *
 * 여기서 nearRadius, farRadius는 apex에서 frustum 축을 따라간 거리
 */
function computeFrustumPoints(target, time, radiusMeters, cameraHeight) {
  if (!target || !target.position) return null;

  const basePos =
    typeof target.position.getValue === "function"
      ? target.position.getValue(time)
      : target.position;

  if (!basePos) return null;

  // road point 위로 cameraHeight(m) 올린 apexWorld (프러스텀 꼭짓점)
  const baseCarto = Cesium.Cartographic.fromCartesian(basePos);
  const apexCarto = new Cesium.Cartographic(
    baseCarto.longitude,
    baseCarto.latitude,
    (baseCarto.height || 0) + cameraHeight
  );
  const apexWorld = Cesium.Ellipsoid.WGS84.cartographicToCartesian(apexCarto);

  // apexWorld 기준 ENU 좌표계
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(apexWorld);

  // krpano h/v -> ENU 기준 forward 벡터
  const headingRad = Cesium.Math.toRadians(_viewHlookat || 0);
  const pitchRad = -Cesium.Math.toRadians(_viewVlookat || 0); // vlookat 부호 반전

  const cosPitch = Math.cos(pitchRad);
  const sinPitch = Math.sin(pitchRad);
  const sinHeading = Math.sin(headingRad);
  const cosHeading = Math.cos(headingRad);

  const forwardLocal = new Cesium.Cartesian3(
    cosPitch * sinHeading, // East
    cosPitch * cosHeading, // North
    sinPitch               // Up
  );
  Cesium.Cartesian3.normalize(forwardLocal, forwardLocal);

  const upLocal = new Cesium.Cartesian3(0, 0, 1);
  let rightLocal = Cesium.Cartesian3.cross(
    forwardLocal,
    upLocal,
    new Cesium.Cartesian3()
  );
  if (Cesium.Cartesian3.magnitude(rightLocal) === 0) {
    rightLocal = new Cesium.Cartesian3(1, 0, 0);
  }
  Cesium.Cartesian3.normalize(rightLocal, rightLocal);

  const trueUpLocal = Cesium.Cartesian3.cross(
    rightLocal,
    forwardLocal,
    new Cesium.Cartesian3()
  );
  Cesium.Cartesian3.normalize(trueUpLocal, trueUpLocal);

  // 옆면(near 코너, far 코너) 4개 선분 길이를 radiusMeters로 고정
  const sideLen = Number.isFinite(radiusMeters) && radiusMeters > 0
    ? radiusMeters
    : 4.0;

  // 수평 FOV 기준, 4:3 화면비 유지
  let fovDegX = Number.isFinite(_viewFov) && _viewFov > 1
    ? _viewFov * (FRUSTUMDEF.FRUSTUM_MAXFOV / FRUSTUMDEF.KRPANO_MAXFOV)
    : FRUSTUMDEF.FRUSTUM_MAXFOV;

  const fovRadX  = Cesium.Math.toRadians(fovDegX);
  const halfFovX = fovRadX * 0.5;

  const tanHalfX = Math.tan(halfFovX);
  const tanHalfY = tanHalfX / FRUSTUMDEF.RATIO;

  // 대각선 코너 방향의 shape factor: |f + right*tanX + up*tanY|
  const shapeFactor = Math.sqrt(
    1.0 +
    tanHalfX * tanHalfX +
    tanHalfY * tanHalfY
  ) || 1.0; // 0 방지

  const nearRadius = FRUSTUMDEF.NEAR_DISTANCE;

  // 옆면 길이 S = (farRadius - nearRadius) * shapeFactor
  const deltaR    = sideLen / shapeFactor;
  const farRadius = nearRadius + deltaR;

  const nearHalfX = nearRadius * tanHalfX;
  const nearHalfY = nearRadius * tanHalfY;
  const farHalfX  = farRadius  * tanHalfX;
  const farHalfY  = farRadius  * tanHalfY;

  const nearCenterLocal = Cesium.Cartesian3.multiplyByScalar(
    forwardLocal,
    nearRadius,
    new Cesium.Cartesian3()
  );
  const farCenterLocal = Cesium.Cartesian3.multiplyByScalar(
    forwardLocal,
    farRadius,
    new Cesium.Cartesian3()
  );

  function addScaled(base, d1, s1, d2, s2) {
    const p = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(d1, s1, p);
    const t = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(d2, s2, t);
    Cesium.Cartesian3.add(p, t, p);
    Cesium.Cartesian3.add(base, p, p);
    return p;
  }

  const nearCornersLocal = [
    addScaled(nearCenterLocal, rightLocal, -nearHalfX, trueUpLocal, -nearHalfY),
    addScaled(nearCenterLocal, rightLocal,  nearHalfX, trueUpLocal, -nearHalfY),
    addScaled(nearCenterLocal, rightLocal,  nearHalfX, trueUpLocal,  nearHalfY),
    addScaled(nearCenterLocal, rightLocal, -nearHalfX, trueUpLocal,  nearHalfY),
  ];

  const farCornersLocal = [
    addScaled(farCenterLocal, rightLocal, -farHalfX, trueUpLocal, -farHalfY),
    addScaled(farCenterLocal, rightLocal,  farHalfX, trueUpLocal, -farHalfY),
    addScaled(farCenterLocal, rightLocal,  farHalfX, trueUpLocal,  farHalfY),
    addScaled(farCenterLocal, rightLocal, -farHalfX, trueUpLocal,  farHalfY),
  ];

  function toWorld(local) {
    const result = new Cesium.Cartesian3();
    return Cesium.Matrix4.multiplyByPoint(enu, local, result);
  }

  const nearWorld = nearCornersLocal.map(toWorld);
  const farWorld = farCornersLocal.map(toWorld);

  return {
    apexWorld,
    nearWorld,
    farWorld,
    nearRadius,
    farRadius,
  };
}

/**
 * ph_nm == photoName 인 road-point 엔티티를 찾아
 *  - 포인트는 좌표만 쓰고 화면에서는 숨기고
 *  - z = CAMERA_HEIGHT 위치에 구
 *  - 프러스텀 옆면 4개
 */
export function highlightRoadPointByName(viewer, photoName) {
  if (!viewer || !photoName) return null;

  const ds = viewer?.dataSources?.getByName?.("road-points")?.[0] || null;
  if (!ds) {
    console.warn(
      "[roadViewHighlight.highlightRoadPointByName] road-points DataSource 없음"
    );
    return null;
  }

  // 이전 하이라이트 정리
  if (_highlightPoint) {
    try {
      if (_highlightPoint.point) _highlightPoint.point.show = false;
      _highlightPoint.show = false;
    } catch (err) {
      console.error(
        "[roadViewHighlight.highlightRoadPointByName] 이전 하이라이트 해제 중 오류:",
        err
      );
    } finally {
      _highlightPoint = null;
    }
  }

  if (_highlightViewer && _highlightSphere) {
    try {
      _highlightViewer.entities.remove(_highlightSphere);
    } catch (err) {
      console.error(
        "[roadViewHighlight.highlightRoadPointByName] 이전 구 제거 중 오류:",
        err
      );
    } finally {
      _highlightSphere = null;
    }
  }

  if (_highlightViewer && _highlightCircle) {
    try {
      _highlightViewer.entities.remove(_highlightCircle);
    } catch (err) {
      console.error(
        "[roadViewHighlight.highlightRoadPointByName] 이전 원 제거 중 오류:",
        err
      );
    } finally {
      _highlightCircle = null;
    }
  }

  if (_highlightViewer && _highlightFrustumSides.length > 0) {
    try {
      for (const e of _highlightFrustumSides) {
        _highlightViewer.entities.remove(e);
      }
    } catch (err) {
      console.error(
        "[roadViewHighlight.highlightRoadPointByName] 이전 frustum 제거 중 오류:",
        err
      );
    } finally {
      _highlightFrustumSides = [];
    }
  }

  const time = Cesium.JulianDate.now();
  const entities = ds.entities.values;
  let target = null;

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    const phNm = readProperty(ent, "ph_nm", time);

    const phUpper = String(phNm ?? "").trim().toUpperCase();
    const photoUpper = String(photoName ?? "").trim().toUpperCase();

    if (phUpper === photoUpper) {
      target = ent;
      break;
    }
  }

  if (!target) {
    console.warn(
      "[roadViewHighlight.highlightRoadPointByName] ph_nm=",
      photoName,
      " 인 포인트를 찾지 못함"
    );
    return null;
  }

  if (target.point) {
    target.point.show = false;
  }

  const basePos =
    typeof target.position.getValue === "function"
      ? target.position.getValue(time)
      : target.position;

  if (basePos) {
    const baseCarto = Cesium.Cartographic.fromCartesian(basePos);
    baseCarto.height = FRUSTUMDEF.CAMERA_HEIGHT;

    const spherePos = Cesium.Ellipsoid.WGS84.cartographicToCartesian(baseCarto);
    const sphereRadius = FRUSTUMDEF.VIEW_POINT_RADIUS;

    _highlightSphere = viewer.entities.add({
      name: "road-view-highlight-sphere",
      position: spherePos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(
          sphereRadius,
          sphereRadius,
          sphereRadius
        ),
        material: Cesium.Color.YELLOW,
      },
    });
  }

  target.show = true;
  target.billboard = undefined;

  _highlightPoint = target;
  _highlightViewer = viewer;

  const frustumEntities = [];

  function makeSideHierarchyCallback(sideIndex) {
    return new Cesium.CallbackProperty((cbTime) => {
      const data = computeFrustumPoints(
        target,
        cbTime,
        FRUSTUMDEF.RADIUS,
        FRUSTUMDEF.CAMERA_HEIGHT
      );
      if (!data) return [];

      const { nearWorld, farWorld } = data;
      const i = sideIndex;
      const j = (sideIndex + 1) % 4;

      const positions = [
        nearWorld[i],
        nearWorld[j],
        farWorld[j],
        farWorld[i],
      ];

      return new Cesium.PolygonHierarchy(positions);
    }, false);
  }

  const sideColor = Cesium.Color.fromCssColorString("#3cb6c6").withAlpha(0.8);

  for (let side = 0; side < 4; side++) {
    const sideEntity = viewer.entities.add({
      name: `road-view-frustum-side-${side}`,
      polygon: {
        hierarchy: makeSideHierarchyCallback(side),
        material: sideColor,
        perPositionHeight: true,
      },
    });
    frustumEntities.push(sideEntity);
  }

  _highlightFrustumSides = frustumEntities;

  return target;
}

export function clearRoadHighlight() {
  if (_highlightViewer && _highlightFrustumSides.length > 0) {
    try {
      for (const e of _highlightFrustumSides) {
        _highlightViewer.entities.remove(e);
      }
    } catch (err) {
      console.error(
        "[roadViewHighlight.clearRoadHighlight] frustum 제거 중 오류:",
        err
      );
    } finally {
      _highlightFrustumSides = [];
    }
  }

  if (_highlightViewer && _highlightSphere) {
    try {
      _highlightViewer.entities.remove(_highlightSphere);
    } catch (err) {
      console.error(
        "[roadViewHighlight.clearRoadHighlight] 구 제거 중 오류:",
        err
      );
    } finally {
      _highlightSphere = null;
    }
  }

  if (_highlightPoint) {
    try {
      if (_highlightPoint.point) _highlightPoint.point.show = false;
      _highlightPoint.show = false;
    } catch (err) {
      console.error(
        "[roadViewHighlight.clearRoadHighlight] 하이라이트 제거 중 오류:",
        err
      );
    } finally {
      _highlightPoint = null;
    }
  }

  _highlightViewer = null;
}
