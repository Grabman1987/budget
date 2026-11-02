// figma node: 215:123 Blueprint / Klassen und Schraffur
export function BlueprintKlassenUndSchraffur(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 720,
      height: 112,
      backgroundColor: "var(--surface)",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 220,
        height: 21,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 500,
        fontSize: 15,
        lineHeight: "21px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Bedarf"}</span>
      <svg width={220} height={18} viewBox="0 0 220 18" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 40,
        width: 220,
        height: 18,
        color: "var(--primary)",
      }}>
        <path d={"M 0 0 L 220 0 L 220 18 L 0 18 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={220} height={1} viewBox="0 -0.500 220 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 80,
        width: 220,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 220 0 L 220 -0.5 L 220 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "matrix(0.707,-0.707,0.707,0.707,-3,83)",
        transformOrigin: "0 0",
        width: 8,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "matrix(0.707,-0.707,0.707,0.707,217,83)",
        transformOrigin: "0 0",
        width: 8,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <span style={{
        position: "absolute",
        left: 240,
        top: 0,
        width: 220,
        height: 21,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 500,
        fontSize: 15,
        lineHeight: "21px",
        color: "var(--ink)",
      }}>{props.text2 ?? "Wunsch"}</span>
      <div style={{
        position: "absolute",
        left: 240,
        top: 40,
        width: 220,
        height: 18,
        overflow: "hidden",
        backgroundColor: "var(--surface)",
      }}>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,-18,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,-11,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,-4,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,3,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,10,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,17,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,24,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,31,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,38,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,45,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,52,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,59,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,66,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,73,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,80,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,87,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,94,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,101,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,108,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,115,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,122,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,129,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,136,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,143,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,150,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,157,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,164,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,171,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,178,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,185,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,192,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,199,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,206,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,213,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,220,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,227,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,234,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
      </div>
      <svg width={220} height={1} viewBox="0 -0.500 220 1" fill="none" style={{
        position: "absolute",
        left: 240,
        top: 80,
        width: 220,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 220 0 L 220 -0.5 L 220 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "matrix(0.707,-0.707,0.707,0.707,237,83)",
        transformOrigin: "0 0",
        width: 8,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "matrix(0.707,-0.707,0.707,0.707,457,83)",
        transformOrigin: "0 0",
        width: 8,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <span style={{
        position: "absolute",
        left: 480,
        top: 0,
        width: 220,
        height: 21,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 500,
        fontSize: 15,
        lineHeight: "21px",
        color: "var(--ink)",
      }}>{props.text3 ?? "Zukunft"}</span>
      <div style={{
        position: "absolute",
        left: 480,
        top: 40,
        width: 220,
        height: 18,
        overflow: "hidden",
        backgroundColor: "var(--surface)",
      }}>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,-18,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,-18,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,-11,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,-11,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,-4,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,-4,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,3,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,3,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,10,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,10,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,17,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,17,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,24,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,24,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,31,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,31,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,38,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,38,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,45,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,45,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,52,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,52,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,59,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,59,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,66,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,66,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,73,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,73,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,80,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,80,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,87,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,87,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,94,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,94,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,101,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,101,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,108,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,108,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,115,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,115,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,122,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,122,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,129,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,129,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,136,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,136,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,143,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,143,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,150,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,150,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,157,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,157,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,164,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,164,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,171,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,171,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,178,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,178,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,185,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,185,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,192,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,192,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,199,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,199,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,206,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,206,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,213,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,213,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,220,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,220,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,227,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,227,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,234,18)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.5,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={25.456} height={1} viewBox="0 -0.500 25.456 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,0.707,-0.707,0.707,234,0)",
          transformOrigin: "0 0",
          width: 25.456,
          height: 1,
          opacity: 0.4,
          color: "var(--positive)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 25.456 0 L 25.456 -0.5 L 25.456 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
      </div>
      <svg width={220} height={1} viewBox="0 -0.500 220 1" fill="none" style={{
        position: "absolute",
        left: 480,
        top: 80,
        width: 220,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 220 0 L 220 -0.5 L 220 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "matrix(0.707,-0.707,0.707,0.707,477,83)",
        transformOrigin: "0 0",
        width: 8,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "matrix(0.707,-0.707,0.707,0.707,697,83)",
        transformOrigin: "0 0",
        width: 8,
        height: 1,
        color: "var(--field)",
      }}>
        <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
}
export default BlueprintKlassenUndSchraffur;
