import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

/**
 * images: Array<string | { url: string, name?: string }>
 * activeName: 현재 krpano에서 보고 있는 scene 이름
 * dateChoices: 선택 가능한 날짜 배열
 * onChangeDate: 날짜 변경 핸들러(e.g. setShootingDate)
 */
export default function MultipleItems({ images = [], date, dateChoices = [], activeName, onChangeDate, onImageClick }) {
  const base = images.map((it) =>
    typeof it === "string" ? { url: it } : it
  );

  // ph_nm 또는 scene name에서 날짜 추출
  const extractDate = (name) => {
    if (!name) return null;
    const parts = String(name).split("_");
    return parts.length > 1 ? parts[1] : null;
  };

  // 현재 선택된 날짜에 해당하는 사진만 필터링
  const items = base.filter((it) => extractDate(it.name) === date);

  const settings = {
    slidesToShow: 9,
    slidesToScroll: 1,
    infinite: false,
    swipeToSlide: true,
    arrows: true,
    dots: false,
    autoplay: false,
    adaptiveHeight: false,
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: "100%",
          background: "rgba(0,0,0,0.55)",
          padding: 10,
          backdropFilter: "blur(6px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* 날짜 선택 영역: 왼쪽 고정 */}
          <div
            style={{
              minWidth: 100,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              color: "#fff",
              fontSize: 15,
            }}
          >
            <span style={{ opacity: 0.85 }}>촬영 날짜</span>
            <select
              value={date}
              onChange={(e) => onChangeDate?.(e.target.value)}
              style={{
                height: 28,
                fontSize: 15,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {dateChoices.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* 가운데: 캐러셀 또는 "데이터 없음" 메시지 */}
          <div
            style={{
              flex: 1,
              // 캐러셀/문구 공통 최소 높이 고정 (이미지 높이 + 여유)
              minHeight: 120,
              display: "flex",
              alignItems: "center",
            }}
          >
            {items.length > 0 ? (
              <div style={{ width: "100%" }}>
                <Slider {...settings}>
                  {items.map((it, idx) => {
                    const isActive =
                      !!activeName &&
                      typeof it.name === "string" &&
                      it.name.toUpperCase() === activeName.toUpperCase();

                    return (
                      <div key={idx}>
                        <div style={{ padding: "0 5px" }}>
                          <div
                            style={{
                              backgroundColor: isActive
                                ? "rgba(255, 140, 0, 0.8)"
                                : "transparent",
                              padding: 4,
                              borderRadius: 9,
                              boxSizing: "border-box",
                            }}
                          >
                            <img
                              src={it.url}
                              alt={it.name || `photo-${idx}`}
                              style={{
                                width: "100%",
                                height: 100,
                                objectFit: "cover",
                                borderRadius: 7,
                                display: "block",
                                userSelect: "none",
                                cursor: it.name ? "pointer" : "default",
                              }}
                              draggable={false}
                              onClick={() =>
                                it.name && onImageClick?.(it.name)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Slider>
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  textAlign: "center",
                  color: "#fff",
                  fontSize: 20,
                }}
              >
                해당 월에 촬영된 로드뷰가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
