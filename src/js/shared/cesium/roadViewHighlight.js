import * as Cesium from "cesium";
import { FRUSTUMDEF } from "../../config/constants";
import { readProperty } from "./entityUtil";

/**
 * 1) krpano -> React(App.jsx)
 *    scene 변경 시: setSceneView(heading)
 *    view 변경 시: setViewHeadingDeg(h, v, fov)
 *
 * 2) React -> Cesium
 *    썸네일/scene 클릭 시: highlightRoadPointByName(viewer, photoName)
 *      - road-points DataSource에서 해당 포인트를 찾고
 *      - 포인트 자체는 숨기고, 위에 구(sphere)만 올림
 *      - frustum은 바로 만들지 않고, 내부 상태만 세팅
 *
 * 3) frustum 생성 타이밍 제어
 *    krpano에서 view 값이 한 번이라도 들어와야 함 (_viewReady)
 *    highlight 시작 후 200~300ms(ENTITY_DELAY)가 지나야 한다 (_entityVisible)
 *    위 두 조건을 모두 만족하는 시점에만 spawnFrustumNow()로 frustum을 최초 1회 생성
 *
 * 4) 결론
 *    krpano 기본 view(0,0,90)로 그려지는 초기 프레임은 아예 화면 표시 X
 *    최종 view 값이 세팅된 뒤, 200~300ms 정도 지난 다음에 원하는 방향으로만 frustum이 한 번에 나타남
 */

// krpano에서 넘어오는 카메라 시야 값(전역 상태)
let _sceneHeading = null;  // 촬영된 heading 정보(북쪽 기준 시계)
let _viewHlookat = null;
let _viewVlookat = null;
let _viewFov = null;

// krpano에서 실제 view 값이 최소 한 번 이상 들어왔는지 여부
//    false: 아직 기본값일 수도 있는 상태(0,0,90 등), frustum 계산/표시 금지
//    true : computeFrustumPoints에서 view 값을 신뢰해도 되는 상태
let _viewReady = false;

// 현재 하이라이트 상태를 구성하는 엔티티 핸들들
let _highlightPoint = null;       // 좌표 포인트 지도상 표시 X
let _highlightFrustumSides = [];  // krpano 바탕 frustum
let _highlightViewer = null;      // cesium viewer 인스턴스
let _highlightSphere = null;      // krpano 카메라 위치 표현 구 (frustum의 꼭짓점)

// 엔티티 표시 지연용 플래그
//    setTimeout(ENTITY_DELAY) 이후 true
//    - frustum/구가 화면에 나타나도 되는지 여부
//    - krpano view 자체는 그 사이에도 계속 업데이트되지만, 화면에만 안 보이게 막는 용도
let _entityVisible = true;

// frustum 생성 여부
//    false: 아직 프러스텀 polygon 엔티티(옆면 4개)가 생성되지 않은 상태
//    true : spawnFrustumNow가 한 번이라도 실행된 상태
//    - 한 scene/포인트 당 최초 1회만 생성하고, 이후에는 위치/모양만 CallbackProperty
let _frustumCreated = false;

// 초기 krpano scene heading 세팅
export function setSceneView(heading) {
  _sceneHeading = Number(heading);
  _viewReady = false;   // 새 scene 들어오면 view 준비 상태 초기화
}

// krpano에서 view(h/v/fov)가 바뀔 때마다 App.jsx에서 호출
export function setViewHeadingDeg(hlookat, vlookat, fov) {
  // scene heading을 더해 실제 북쪽 기준 절대 heading으로 변환
  if (Number.isFinite(hlookat)) {
    _viewHlookat = _sceneHeading + ((hlookat % 360) + 360) % 360;
  }
  if (Number.isFinite(vlookat)) {
    _viewVlookat = vlookat;
  }
  if (Number.isFinite(fov)) {
    _viewFov = fov;
  }

  // 한 번이라도 유효한 view 값이 들어왔다는 플래그
  _viewReady = true;

  // 이 시점에 frustum 생성 조건이 만족된다면, 여기서 최초 생성 시도
  trySpawnFrustum();
}

/**
 * Cesium 상에서 road point 기준 카메라 프러스텀 기하를 계산
 *
 * target 엔티티(road point)를 기준으로:
 *    1) 해당 포인트 좌표에서 cameraHeight(m) 위에 apexWorld(카메라 위치)를 만듬
 *    2) apexWorld 기준 ENU(local East-North-Up) 좌표계 행렬을 만듬
 *    3) _viewHlookat / _viewVlookat / _viewFov를 이용해 local forward/right/up 벡터를 만듬
 *    4) near/far 평면 중심과 직사각형 코너 4개씩(nearWorld, farWorld)을 계산
 *    5) apex에서 frustum 축(시야 방향)을 따라간 거리 nearRadius, farRadius를 결과에 포함
 *
 * 반환값:
 *  {
 *    apexWorld:  카메라 위치(Cartesian3),
 *    nearWorld:  near plane 코너들 (length=4, Cartesian3[]),
 *    farWorld:   far plane 코너들 (length=4, Cartesian3[]),
 *    nearRadius: apex->near 평면 중심까지 거리,
 *    farRadius:  apex->far 평면 중심까지 거리
 *  }
 *
 * _viewReady가 false인 경우(krpano view 값이 아직 준비되지 않은 경우), 계산을 아예 하지 않고 null을 반환
 */
function computeFrustumPoints(target, time, radiusMeters, cameraHeight) {
  if (!target || !target.position) return null;
  if (!_viewReady) return null;  // view 준비 전에는 계산하지 않음

  // target.position는 SampledPositionProperty일 수 있으므로 time 기준으로 값을 뽑음
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

  // apexWorld 기준 ENU 좌표계 (동/북/상 방향 벡터 프레임)
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(apexWorld);

  // krpano h/v -> ENU 기준 forward 벡터
  //    heading: 북쪽 기준 시계 방향 (degree)
  //    pitch  : 위/아래 각도 (vlookat, 부호 반전 필요)
  const headingRad = Cesium.Math.toRadians(_viewHlookat || 0);
  const pitchRad = -Cesium.Math.toRadians(_viewVlookat || 0); // vlookat 부호 반전

  const cosPitch = Math.cos(pitchRad);
  const sinPitch = Math.sin(pitchRad);
  const sinHeading = Math.sin(headingRad);
  const cosHeading = Math.cos(headingRad);

  // ENU 기준 forwardLocal = (East, North, Up)
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
    // forward가 완전히 위/아래를 향하는 특수 케이스 대비 (up과 평행)
    rightLocal = new Cesium.Cartesian3(1, 0, 0);
  }
  Cesium.Cartesian3.normalize(rightLocal, rightLocal);

  const trueUpLocal = Cesium.Cartesian3.cross(
    rightLocal,
    forwardLocal,
    new Cesium.Cartesian3()
  );
  Cesium.Cartesian3.normalize(trueUpLocal, trueUpLocal);

  // 옆면(near 코너, far 코너) 4개 선분 길이를 radiusMeters로 고정하기 위한 기준
  // sideLen은 "프러스텀 띠 길이"가 아니라, 우리가 원하는 시각화 범위 값이다.
  const sideLen =
    Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 4.0;

  // krpano FOV -> 수평 FOV (FRUSTUM_MAXFOV / KRPANO_MAXFOV 비율로 스케일)
  let fovDegX =
    Number.isFinite(_viewFov) && _viewFov > 1
      ? _viewFov * (FRUSTUMDEF.FRUSTUM_MAXFOV / FRUSTUMDEF.KRPANO_MAXFOV)
      : FRUSTUMDEF.FRUSTUM_MAXFOV;

  const fovRadX = Cesium.Math.toRadians(fovDegX);
  const halfFovX = fovRadX * 0.5;

  // 수평/수직 방향 반각의 tan 값
  const tanHalfX = Math.tan(halfFovX);
  const tanHalfY = tanHalfX / FRUSTUMDEF.RATIO; // RATIO로 화면비 보정 (예: 4:3)

  // 대각선 코너 방향으로의 scale factor
  // |f + right*tanX + up*tanY|의 길이를 구해,
  // 주어진 sideLen이 실제로 어느 정도 거리 차이(deltaR)에 해당하는지 보정하기 위함.
  const shapeFactor =
    Math.sqrt(1.0 + tanHalfX * tanHalfX + tanHalfY * tanHalfY) || 1.0; // 0 방지

  const nearRadius = FRUSTUMDEF.NEAR_DISTANCE;

  // 옆면 길이 S = (farRadius - nearRadius) * shapeFactor
  //   -> (farRadius - nearRadius) = S / shapeFactor
  //   -> deltaR = sideLen / shapeFactor
  const deltaR = sideLen / shapeFactor;
  const farRadius = nearRadius + deltaR;

  const nearHalfX = nearRadius * tanHalfX;
  const nearHalfY = nearRadius * tanHalfY;
  const farHalfX = farRadius * tanHalfX;
  const farHalfY = farRadius * tanHalfY;

  // near/far 중심 위치 벡터 (local 좌표계)
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

  // base + d1*s1 + d2*s2 형태의 보조 함수
  function addScaled(base, d1, s1, d2, s2) {
    const p = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(d1, s1, p);
    const t = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(d2, s2, t);
    Cesium.Cartesian3.add(p, t, p);
    Cesium.Cartesian3.add(base, p, p);
    return p;
  }

  // near/far 직사각형 코너 (local 좌표계)
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

  // ENU -> World(Cartesian3) 좌표 변환
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

// frustum을 만들 수 있는지 판단
function trySpawnFrustum() {
  if (_frustumCreated) return;
  if (!_highlightViewer || !_highlightPoint) return;
  if (!_viewReady) return;
  if (!_entityVisible) return;

  spawnFrustumNow();
}

// 프러스텀 옆면 polygon 4개를 생성하는 함수
function spawnFrustumNow() {
  if (_frustumCreated) return;
  if (!_highlightViewer || !_highlightPoint) return;

  const viewer = _highlightViewer;
  const target = _highlightPoint;

  const frustumEntities = [];

  // sideIndex(0~3)에 따라 frustum 한 변(사각형 하나)의 polygon hierarchy를 생성
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
        // show 조건:
        //    entityVisible: highlight 이후 0.5초 지연이 끝났는지
        //    viewReady    : krpano view 값이 최소 한 번 이상 들어왔는지
        show: new Cesium.CallbackProperty(() => {
          return _entityVisible && _viewReady;
        }, false),
      },
    });
    frustumEntities.push(sideEntity);
  }

  _highlightFrustumSides = frustumEntities;
  _frustumCreated = true;
}

// ph_nm 필드가 photoName과 일치하는 road-point 엔티티를 찾아 하이라이트
export function highlightRoadPointByName(viewer, photoName) {
  if (!viewer || !photoName) return null;

  const ds = viewer?.dataSources?.getByName?.("road-points")?.[0] || null;
  if (!ds) {
    console.warn(
      "[roadViewHighlight.highlightRoadPointByName] road-points DataSource 없음"
    );
    return null;
  }

  // 이전 하이라이트 정리: 포인트 show 되돌리기
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

  // 이전 구 제거
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

  // 이전 frustum 옆면 제거
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
      _frustumCreated = false;
    }
  }

  const time = Cesium.JulianDate.now();
  const entities = ds.entities.values;
  let target = null;

  // road-points 엔티티들 중 ph_nm == photoName 인 엔티티를 찾음 (대소문자 무시)
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

  // 원본 포인트의 point 표시를 숨긴다 (좌표만 사용)
  if (target.point) {
    target.point.show = false;
  }

  // 포인트 위치 기준으로 CAMERA_HEIGHT 높이에 구(sphere)
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
        // sphere도 frustum과 동일하게 지연 + viewReady 조건에 맞춰 표시
        show: new Cesium.CallbackProperty(() => {
          return _entityVisible && _viewReady;
        }, false),
      },
    });
  }

  target.show = true;
  target.billboard = undefined;

  _highlightPoint = target;
  _highlightViewer = viewer;

  // 새 하이라이트 시작 시 상태 초기화
  _frustumCreated = false;
  _entityVisible = false;

  // ENTITY_DELAY 지난 후 표시 플래그 켜고, 그 시점에 frustum 생성 시도
  setTimeout(() => {
    _entityVisible = true;
    trySpawnFrustum();
  }, FRUSTUMDEF.ENTITY_DELAY || 300);

  return target;
}

// 현재 하이라이트 상태를 전부 정리
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
      _frustumCreated = false;
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
  _entityVisible = true;
  _viewReady = false;
  _frustumCreated = false;
}
