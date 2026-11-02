// figma node: 178:18 Feld / Deaktiviert
export function FeldDeaktiviert(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 330,
      height: 104,
      opacity: 0.55,
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: 18,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 500,
        fontSize: 13,
        lineHeight: "18px",
        color: "var(--muted)",
      }}>{props.children ?? props.text1 ?? "Feldbezeichnung"}</span>
      <div style={{
        position: "absolute",
        left: 0,
        top: 24,
        width: "100%",
        height: 44,
        borderRadius: 8,
        backgroundColor: "var(--surface)",
        boxShadow: "inset 0 0 0 1px var(--field)",
      }}>
        <span style={{
          position: "absolute",
          left: 12,
          top: 11,
          width: "calc(100% - 24px)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
          height: 21,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 400,
          fontSize: 15,
          lineHeight: "21px",
          color: "var(--ink)",
        }}>{props.text2 ?? "Nicht verfügbar"}</span>
      </div>
    </div>
  );
}
export default FeldDeaktiviert;
