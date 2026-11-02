// figma node: 215:250 Blueprint / Stücklistenposition
export function BlueprintStCklistenposition(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 720,
      height: 102,
      backgroundColor: "var(--surface)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 720,
        height: 102,
        borderRadius: 4,
        backgroundColor: "var(--surface)",
        boxShadow: "inset 0 0 0 1px var(--field)",
      }}>
        <span style={{
          position: "absolute",
          left: 10,
          top: 12,
          width: 37.6,
          height: 17,
          fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          lineHeight: "17px",
          color: "var(--muted)",
        }}>{props.children ?? props.text1 ?? "POS"}</span>
        <span style={{
          position: "absolute",
          left: 67.6,
          top: 12,
          width: 390.4,
          height: 17,
          fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          lineHeight: "17px",
          color: "var(--muted)",
        }}>{props.text2 ?? "BEZEICHNUNG"}</span>
        <span style={{
          position: "absolute",
          left: 478,
          top: 12,
          width: 232,
          height: 17,
          fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          textAlign: "right",
          lineHeight: "17px",
          color: "var(--muted)",
        }}>{props.text3 ?? "BETRAG"}</span>
        <svg width={720} height={1} viewBox="0 -0.500 720 1" fill="none" style={{
          position: "absolute",
          left: 0,
          top: 36,
          width: 720,
          height: 1,
          color: "var(--field)",
        }}>
          <path d={"M 0 -0.5 L 0 0 L 720 0 L 720 -0.5 L 720 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <div style={{
          position: "absolute",
          left: 0,
          top: 44,
          width: 720,
          height: 52,
        }}>
          <span style={{
            position: "absolute",
            left: 10,
            top: 10,
            width: 37.6,
            height: 17,
            fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 500,
            fontSize: 12,
            lineHeight: "17px",
            color: "var(--subtle)",
          }}>{props.text4 ?? "01"}</span>
          <span style={{
            position: "absolute",
            left: 67.6,
            top: 10,
            width: 390.4,
            height: 20,
            fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 400,
            fontSize: 14,
            lineHeight: "20px",
            color: "var(--ink)",
          }}>Musterposition</span>
          <span style={{
            position: "absolute",
            left: 478,
            top: 10,
            width: 232,
            height: 20,
            fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 400,
            fontSize: 14,
            textAlign: "right",
            lineHeight: "20px",
            color: "var(--ink)",
          }}>120,00 €</span>
          <svg width={720} height={1} viewBox="0 -0.500 720 1" fill="none" style={{
            position: "absolute",
            left: 0,
            top: 52,
            width: 720,
            height: 1,
            color: "var(--line)",
          }}>
            <path d={"M 0 -0.5 L 0 0 L 720 0 L 720 -0.5 L 720 -1 L 0 -1 L 0 -0.5 Z"} fill="currentColor" fillRule="nonzero" />
          </svg>
        </div>
      </div>
    </div>
  );
}
export default BlueprintStCklistenposition;
