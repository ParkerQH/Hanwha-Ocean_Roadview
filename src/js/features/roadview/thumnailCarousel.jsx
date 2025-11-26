import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

/**
 * images: Array<string | { url: string, name?: string }>
 * activeName: 현재 krpano에서 보고 있는 scene 이름
 */
export default function MultipleItems({ images = [], date, onImageClick, activeName,}) {
  const base = images.map((it) =>
    typeof it === "string" ? { url: it } : it
  );

  const extractDate = (name) => {
    const checked = name?.split("_");
    return checked ? checked[1] : null;
  };

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

  if (items.length > 0) {
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
          <Slider {...settings}>
            {items.map((it, idx) => {
              const isActive =
                !!activeName &&
                typeof it.name === "string" &&
                it.name.toUpperCase() === activeName.toUpperCase();

              return (
                <div key={idx}>
                  <div 
                    style={{
                      padding: "0 5px" 
                    }}>
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
                        onClick={() => it.name && onImageClick?.(it.name)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </Slider>
        </div>
      </div>
    );
  }
}
