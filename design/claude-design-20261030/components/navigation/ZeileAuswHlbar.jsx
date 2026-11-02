// figma node: 189:1420 Zeile · auswählbar
export function ZeileAuswHlbar(_p = {}) {
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
        top: 10,
        width: 250,
        height: 21,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 15,
        lineHeight: "21px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Lebensmittel"}</span>
      <span style={{
        position: "absolute",
        left: 16,
        top: 36,
        width: 250,
        height: 17,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 12,
        lineHeight: "17px",
        color: "var(--subtle)",
      }}>{props.text2 ?? "Zugewiesen 420,00 €"}</span>
      <span style={{
        position: "absolute",
        left: 280,
        top: 18,
        width: 124,
        height: 21,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 15,
        textAlign: "right",
        lineHeight: "21px",
        color: "var(--ink)",
      }}>{props.text3 ?? "130,00 €"}</span>
      <div style={{
        position: "absolute",
        left: 0,
        top: 63,
        width: 420,
        height: 1,
        backgroundColor: "var(--line)",
      }} />
    </div>
  );
}
export default ZeileAuswHlbar;
