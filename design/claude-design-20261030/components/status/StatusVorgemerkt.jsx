// figma node: 178:53 Status / Vorgemerkt
export function StatusVorgemerkt(_p = {}) {
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
        <svg width={3.333} height={6.667} viewBox="0 0 3.333 6.667" fill="none" style={{
          position: "absolute",
          left: 10,
          top: 5,
          width: 3.333,
          height: 6.667,
        }}>
          <path d={"M 0.75 0 C 0.75 -0.414 0.414 -0.75 0 -0.75 C -0.414 -0.75 -0.75 -0.414 -0.75 0 L 0 0 L 0.75 0 Z M 0 5 L -0.75 5 C -0.75 5.284 -0.589 5.544 -0.335 5.671 L 0 5 Z M 2.998 7.337 C 3.368 7.523 3.819 7.373 4.004 7.002 C 4.189 6.632 4.039 6.181 3.669 5.996 L 3.333 6.667 L 2.998 7.337 Z M 0 0 L -0.75 0 L -0.75 5 L 0 5 L 0.75 5 L 0.75 0 L 0 0 Z M 0 5 L -0.335 5.671 L 2.998 7.337 L 3.333 6.667 L 3.669 5.996 L 0.335 4.329 L 0 5 Z"} fill="currentColor" fillRule="nonzero" />
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
      }}>{props.children ?? props.text1 ?? "Vorgemerkt"}</span>
    </div>
  );
}
export default StatusVorgemerkt;
