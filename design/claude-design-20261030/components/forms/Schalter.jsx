// figma node: 189:1413 Schalter
export function Schalter(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 180,
      height: 44,
      backgroundColor: "var(--surface)",
      position: "relative",
      ...props.style,
    }}>
      <svg width={48} height={26} viewBox="0 0 48 26" fill="none" style={{
        position: "absolute",
        left: 8,
        top: 9,
        width: 48,
        height: 26,
        borderRadius: 13,
        color: "var(--positive)",
      }}>
        <path d={"M 0 13 C 0 5.82 5.82 0 13 0 L 35 0 C 42.18 0 48 5.82 48 13 L 48 13 C 48 20.18 42.18 26 35 26 L 13 26 C 5.82 26 0 20.18 0 13 L 0 13 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={22} height={22} viewBox="0 0 22 22" fill="none" style={{
        position: "absolute",
        left: 34,
        top: 11,
        width: 22,
        height: 22,
        borderRadius: 11,
        color: "var(--surface)",
      }}>
        <path d={"M 0 11 C 0 4.925 4.925 0 11 0 L 11 0 C 17.075 0 22 4.925 22 11 L 22 11 C 22 17.075 17.075 22 11 22 L 11 22 C 4.925 22 0 17.075 0 11 L 0 11 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <span style={{
        position: "absolute",
        left: 72,
        top: 12,
        width: 100,
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Aktiviert"}</span>
    </div>
  );
}
export default Schalter;
