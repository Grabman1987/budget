// figma node: 189:1435 Fortschritt
export function Fortschritt(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 420,
      height: 64,
      backgroundColor: "var(--surface)",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "absolute",
        left: 16,
        top: 8,
        width: 388,
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "600 / 1.500 € · 40 %"}</span>
      <svg width={388} height={6} viewBox="0 0 388 6" fill="none" style={{
        position: "absolute",
        left: 16,
        top: 42,
        width: 388,
        height: 6,
        borderRadius: 3,
        color: "var(--line)",
      }}>
        <path d={"M 0 3 C 0 1.343 1.343 0 3 0 L 385 0 C 386.657 0 388 1.343 388 3 L 388 3 C 388 4.657 386.657 6 385 6 L 3 6 C 1.343 6 0 4.657 0 3 L 0 3 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <svg width={155.200} height={6} viewBox="0 0 155.200 6" fill="none" style={{
        position: "absolute",
        left: 16,
        top: 42,
        width: 155.2,
        height: 6,
        borderRadius: 3,
        color: "var(--positive)",
      }}>
        <path d={"M 0 3 C 0 1.343 1.343 0 3 0 L 152.2 0 C 153.857 0 155.2 1.343 155.2 3 L 155.2 3 C 155.2 4.657 153.857 6 152.2 6 L 3 6 C 1.343 6 0 4.657 0 3 L 0 3 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
}
export default Fortschritt;
