// figma node: 169:26 Button / Secondary
export function ButtonSecondary(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 180,
      height: 44,
      borderRadius: 8,
      backgroundColor: "var(--active)",
      display: "flex",
      flexDirection: "row",
      padding: "0px 14px 0px 14px",
      justifyContent: "center",
      alignItems: "center",
      flexWrap: "nowrap",
      boxSizing: "border-box",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "relative",
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 14,
        textAlign: "center",
        lineHeight: "20px",
        color: "var(--ink)",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}>{props.children ?? props.text1 ?? "Aktion"}</span>
    </div>
  );
}
export default ButtonSecondary;
