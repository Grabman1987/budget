// figma node: 11:193 Blueprint/Button/Primary
export function BlueprintButtonPrimary(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 170,
      height: 42,
      borderRadius: 6,
      backgroundColor: "rgb(208,244,255)",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 17px",
      boxSizing: "border-box",
      ...props.style,
    }}>
      <span style={{
        position: "relative",
        textAlign: "center",
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 14,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(8,45,86)",
      }}>{props.children ?? props.text1 ?? "Geld verteilen"}</span>
    </div>
  );
}
export default BlueprintButtonPrimary;
