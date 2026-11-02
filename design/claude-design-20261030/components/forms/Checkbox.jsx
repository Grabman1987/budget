// figma node: 189:1408 Checkbox
export function Checkbox(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: "fit-content",
      minWidth: 120,
      height: 44,
      backgroundColor: "var(--surface)",
      position: "relative",
      display: "flex",
      alignItems: "center",
      padding: "0 10px 0 36px",
      boxSizing: "border-box",
      color: "var(--onprimary)",
      ...props.style,
    }}>
      <svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={{
        position: "absolute",
        left: 8,
        top: 12,
        width: 20,
        height: 20,
        borderRadius: 4,
        color: "var(--primary)",
      }}>
        <path d={"M 0 4 C 0 1.791 1.791 0 4 0 L 16 0 C 18.209 0 20 1.791 20 4 L 20 16 C 20 18.209 18.209 20 16 20 L 4 20 C 1.791 20 0 18.209 0 16 L 0 4 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <div style={{
        position: "absolute",
        left: 10,
        top: 14,
        width: 16,
        height: 16,
        overflow: "hidden",
      }}>
        <svg width={9.333} height={6.667} viewBox="0 0 9.333 6.667" fill="none" style={{
          position: "absolute",
          left: 3.333,
          top: 4,
          width: 9.333,
          height: 6.667,
        }}>
          <path d={"M 0.53 3.47 C 0.237 3.177 -0.237 3.177 -0.53 3.47 C -0.823 3.763 -0.823 4.237 -0.53 4.53 L 0 4 L 0.53 3.47 Z M 2.667 6.667 L 2.136 7.197 C 2.429 7.49 2.904 7.49 3.197 7.197 L 2.667 6.667 Z M 9.864 0.53 C 10.157 0.237 10.157 -0.237 9.864 -0.53 C 9.571 -0.823 9.096 -0.823 8.803 -0.53 L 9.333 0 L 9.864 0.53 Z M 0 4 L -0.53 4.53 L 2.136 7.197 L 2.667 6.667 L 3.197 6.136 L 0.53 3.47 L 0 4 Z M 2.667 6.667 L 3.197 7.197 L 9.864 0.53 L 9.333 0 L 8.803 -0.53 L 2.136 6.136 L 2.667 6.667 Z"} fill="currentColor" fillRule="nonzero" />
        </svg>
      </div>
      <span style={{
        position: "relative",
        whiteSpace: "nowrap",
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Auswahl"}</span>
    </div>
  );
}
export default Checkbox;
