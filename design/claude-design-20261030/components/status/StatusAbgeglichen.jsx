// figma node: 178:58 Status / Abgeglichen
export function StatusAbgeglichen(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 220,
      height: 44,
      position: "relative",
      color: "var(--muted)",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 8,
        top: 12,
        width: 20,
        height: 20,
        overflow: "hidden",
      }}>
        <svg width={11.667} height={8.333} viewBox="0 0 11.667 8.333" fill="none" style={{
          position: "absolute",
          left: 4.167,
          top: 5,
          width: 11.667,
          height: 8.333,
        }}>
          <path d={"M 0.53 4.47 C 0.237 4.177 -0.237 4.177 -0.53 4.47 C -0.823 4.763 -0.823 5.237 -0.53 5.53 L 0 5 L 0.53 4.47 Z M 3.333 8.333 L 2.803 8.864 C 3.096 9.157 3.571 9.157 3.864 8.864 L 3.333 8.333 Z M 12.197 0.53 C 12.49 0.237 12.49 -0.237 12.197 -0.53 C 11.904 -0.823 11.429 -0.823 11.136 -0.53 L 11.667 0 L 12.197 0.53 Z M 0 5 L -0.53 5.53 L 2.803 8.864 L 3.333 8.333 L 3.864 7.803 L 0.53 4.47 L 0 5 Z M 3.333 8.333 L 3.864 8.864 L 12.197 0.53 L 11.667 0 L 11.136 -0.53 L 2.803 7.803 L 3.333 8.333 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
      </div>
      <span style={{
        position: "absolute",
        left: 40,
        top: 12,
        width: 172,
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 500,
        fontSize: 14,
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Abgeglichen"}</span>
    </div>
  );
}
export default StatusAbgeglichen;
