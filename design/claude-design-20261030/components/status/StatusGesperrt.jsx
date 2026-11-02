// figma node: 178:62 Status / Gesperrt
export function StatusGesperrt(_p = {}) {
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
        <svg width={15} height={15} viewBox="0 0 15 15" fill="none" style={{
          position: "absolute",
          left: 2.5,
          top: 2.5,
          width: 15,
          height: 15,
        }}>
          <path d={"M 15 7.5 L 14.25 7.5 C 14.25 11.228 11.228 14.25 7.5 14.25 L 7.5 15 L 7.5 15.75 C 12.056 15.75 15.75 12.056 15.75 7.5 L 15 7.5 Z M 7.5 15 L 7.5 14.25 C 3.772 14.25 0.75 11.228 0.75 7.5 L 0 7.5 L -0.75 7.5 C -0.75 12.056 2.944 15.75 7.5 15.75 L 7.5 15 Z M 0 7.5 L 0.75 7.5 C 0.75 3.772 3.772 0.75 7.5 0.75 L 7.5 0 L 7.5 -0.75 C 2.944 -0.75 -0.75 2.944 -0.75 7.5 L 0 7.5 Z M 7.5 0 L 7.5 0.75 C 11.228 0.75 14.25 3.772 14.25 7.5 L 15 7.5 L 15.75 7.5 C 15.75 2.944 12.056 -0.75 7.5 -0.75 L 7.5 0 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
        <svg width={0.008} height={8.333} viewBox="0 0 0.008 8.333" fill="none" style={{
          position: "absolute",
          left: 10,
          top: 5.833,
          width: 0.008,
          height: 8.333,
        }}>
          <path d={"M 0.75 3.333 C 0.75 2.919 0.414 2.583 0 2.583 C -0.414 2.583 -0.75 2.919 -0.75 3.333 L 0 3.333 L 0.75 3.333 Z M -0.75 8.333 C -0.75 8.748 -0.414 9.083 0 9.083 C 0.414 9.083 0.75 8.748 0.75 8.333 L 0 8.333 L -0.75 8.333 Z M 0 -0.75 C -0.414 -0.75 -0.75 -0.414 -0.75 0 C -0.75 0.414 -0.414 0.75 0 0.75 L 0 0 L 0 -0.75 Z M 0.008 0.75 C 0.423 0.75 0.758 0.414 0.758 0 C 0.758 -0.414 0.423 -0.75 0.008 -0.75 L 0.008 0 L 0.008 0.75 Z M 0 3.333 L -0.75 3.333 L -0.75 8.333 L 0 8.333 L 0.75 8.333 L 0.75 3.333 L 0 3.333 Z M 0 0 L 0 0.75 L 0.008 0.75 L 0.008 0 L 0.008 -0.75 L 0 -0.75 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
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
      }}>{props.children ?? props.text1 ?? "Gesperrt"}</span>
    </div>
  );
}
export default StatusGesperrt;
