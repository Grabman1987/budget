// figma node: 215:117 Blueprint / Abschnitt
export function BlueprintAbschnitt(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 720,
      height: 56,
      backgroundColor: "var(--surface)",
      position: "relative",
      color: "var(--line)",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 720,
        height: 40,
      }}>
        <div style={{
          position: "absolute",
          left: 0,
          top: 2,
          width: 22,
          height: 22,
          borderRadius: "50%",
          boxShadow: "inset 0 0 0 1px var(--field)",
        }} />
        <span style={{
          position: "absolute",
          left: 0,
          top: 5,
          width: 22,
          height: 17,
          fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          textAlign: "center",
          lineHeight: "17px",
          color: "var(--muted)",
        }}>{props.children ?? props.text1 ?? "01"}</span>
        <span style={{
          position: "absolute",
          left: 34,
          top: 0,
          width: 686,
          height: 25,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 600,
          fontSize: 18,
          lineHeight: "25px",
          color: "var(--ink)",
        }}>{props.text2 ?? "Positionen und Herkunft"}</span>
        <svg width={720} height={1} viewBox="0 -0.500 720 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 34,
          width: 720,
          height: 1,
        }}>
          <path d={"M 0 -0.5 L 0 0 L 720 0 L 720 -0.5 L 720 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
      </div>
    </div>
  );
}
export default BlueprintAbschnitt;
