// figma node: 189:1425 Dialog-Kopf
export function DialogKopf(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 540,
      height: 88,
      backgroundColor: "var(--surface)",
      position: "relative",
      color: "var(--muted)",
      ...props.style,
    }}>
      <span style={{
        position: "absolute",
        left: 24,
        top: 20,
        width: 444,
        height: 34,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 24,
        lineHeight: "34px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Buchung bearbeiten"}</span>
      <div style={{
        position: "absolute",
        left: 480,
        top: 16,
        width: 44,
        height: 44,
      }}>
        <div style={{
          position: "absolute",
          left: 10,
          top: 10,
          width: 24,
          height: 24,
          overflow: "hidden",
        }}>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" style={{
            position: "absolute",
            left: 6,
            top: 6,
            width: 12,
            height: 12,
          }}>
            <path d={"M 0.53 -0.53 C 0.237 -0.823 -0.237 -0.823 -0.53 -0.53 C -0.823 -0.237 -0.823 0.237 -0.53 0.53 L 0 0 L 0.53 -0.53 Z M 11.47 12.53 C 11.763 12.823 12.237 12.823 12.53 12.53 C 12.823 12.237 12.823 11.763 12.53 11.47 L 12 12 L 11.47 12.53 Z M -0.53 11.47 C -0.823 11.763 -0.823 12.237 -0.53 12.53 C -0.237 12.823 0.237 12.823 0.53 12.53 L 0 12 L -0.53 11.47 Z M 12.53 0.53 C 12.823 0.237 12.823 -0.237 12.53 -0.53 C 12.237 -0.823 11.763 -0.823 11.47 -0.53 L 12 0 L 12.53 0.53 Z M 0 0 L -0.53 0.53 L 11.47 12.53 L 12 12 L 12.53 11.47 L 0.53 -0.53 L 0 0 Z M 0 12 L 0.53 12.53 L 12.53 0.53 L 12 0 L 11.47 -0.53 L -0.53 11.47 L 0 12 Z"} fill="currentColor" fillRule="nonzero" />
          </svg>
        </div>
      </div>
    </div>
  );
}
export default DialogKopf;
