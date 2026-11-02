// figma node: 215:95 Blueprint / Maßkette
export function BlueprintMaKette(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 720,
      height: 112,
      backgroundColor: "var(--surface)",
      position: "relative",
      color: "var(--field)",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 8,
        width: 720,
        height: 92,
      }}>
        <span style={{
          position: "absolute",
          left: 8,
          top: 6,
          width: 164,
          height: 18,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 400,
          fontSize: 13,
          lineHeight: "18px",
          color: "var(--muted)",
        }}>{props.children ?? props.text1 ?? "Anfang"}</span>
        <span style={{
          position: "absolute",
          left: 8,
          top: 32,
          width: 164,
          height: 31,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 22,
          lineHeight: "31px",
          color: "var(--ink)",
        }}>{props.text2 ?? "10.000 €"}</span>
        <svg width={164} height={1} viewBox="0 -0.500 164 1" fill="none" style={{
          position: "absolute",
          left: 8,
          top: 68,
          width: 164,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 164 0 L 164 -0.5 L 164 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,5,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,169,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <span style={{
          position: "absolute",
          left: 188,
          top: 6,
          width: 164,
          height: 18,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 400,
          fontSize: 13,
          lineHeight: "18px",
          color: "var(--muted)",
        }}>{props.text3 ?? "Eigenleistung"}</span>
        <span style={{
          position: "absolute",
          left: 188,
          top: 32,
          width: 164,
          height: 31,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 22,
          lineHeight: "31px",
          color: "var(--ink)",
        }}>{props.text4 ?? "10.000 €"}</span>
        <svg width={164} height={1} viewBox="0 -0.500 164 1" fill="none" style={{
          position: "absolute",
          left: 188,
          top: 68,
          width: 164,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 164 0 L 164 -0.5 L 164 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,185,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,349,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <span style={{
          position: "absolute",
          left: 368,
          top: 6,
          width: 164,
          height: 18,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 400,
          fontSize: 13,
          lineHeight: "18px",
          color: "var(--muted)",
        }}>Markt</span>
        <span style={{
          position: "absolute",
          left: 368,
          top: 32,
          width: 164,
          height: 31,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 22,
          lineHeight: "31px",
          color: "var(--ink)",
        }}>2.170 €</span>
        <svg width={164} height={1} viewBox="0 -0.500 164 1" fill="none" style={{
          position: "absolute",
          left: 368,
          top: 68,
          width: 164,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 164 0 L 164 -0.5 L 164 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,365,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,529,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <span style={{
          position: "absolute",
          left: 548,
          top: 6,
          width: 164,
          height: 18,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 400,
          fontSize: 13,
          lineHeight: "18px",
          color: "var(--muted)",
        }}>Jetzt</span>
        <span style={{
          position: "absolute",
          left: 548,
          top: 32,
          width: 164,
          height: 31,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 22,
          lineHeight: "31px",
          color: "var(--ink)",
        }}>22.170 €</span>
        <svg width={164} height={1} viewBox="0 -0.500 164 1" fill="none" style={{
          position: "absolute",
          left: 548,
          top: 68,
          width: 164,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 164 0 L 164 -0.5 L 164 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,545,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={8} height={1} viewBox="0 -0.500 8 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "matrix(0.707,-0.707,0.707,0.707,709,71)",
          transformOrigin: "0 0",
          width: 8,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 8 0 L 8 -0.5 L 8 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
      </div>
    </div>
  );
}
export default BlueprintMaKette;
