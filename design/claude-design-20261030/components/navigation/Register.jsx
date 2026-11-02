// figma node: 189:1417 Register
export function Register(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 180,
      height: 44,
      backgroundColor: "var(--surface)",
      position: "relative",
      ...props.style,
    }}>
      <svg width={180} height={44} viewBox="0 0 180 44" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 180,
        height: 44,
        borderRadius: 8,
        color: "var(--active)",
      }}>
        <path d={"M 0 8 C 0 3.582 3.582 0 8 0 L 172 0 C 176.418 0 180 3.582 180 8 L 180 36 C 180 40.418 176.418 44 172 44 L 8 44 C 3.582 44 0 40.418 0 36 L 0 8 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <span style={{
        position: "absolute",
        left: 16,
        top: 12,
        width: 148,
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 14,
        textAlign: "center",
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Monat"}</span>
    </div>
  );
}
export default Register;
