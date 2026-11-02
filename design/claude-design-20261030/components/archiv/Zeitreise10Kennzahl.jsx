// figma node: 438:1200 Zeitreise/10/Kennzahl
export function Zeitreise10Kennzahl(_p = {}) {
  const props = { ..._p, bezeichnung: _p.bezeichnung ?? "Zu verteilen", wert: _p.wert ?? "120,00 €", hinweis: _p.hinweis ?? "Eingänge − Zuweisungen" };
  return (
    <div className={props.className} style={{
      width: 374.667,
      height: 128,
      borderRadius: 6,
      backgroundColor: "rgb(23,39,54)",
      boxShadow: "inset 0 0 0 1px rgb(50,72,88)",
      display: "flex",
      flexDirection: "column",
      gap: 7,
      padding: "16px 18px 16px 18px",
      alignItems: "flex-start",
      flexWrap: "nowrap",
      boxSizing: "border-box",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "relative",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 13,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(165,181,196)",
        flexShrink: 0,
      }}>{props.bezeichnung}</span>
      <span style={{
        position: "relative",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 700,
        fontSize: 31,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(240,245,250)",
        flexShrink: 0,
      }}>{props.wert}</span>
      <span style={{
        position: "relative",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 11,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(165,181,196)",
        flexShrink: 0,
      }}>{props.hinweis}</span>
    </div>
  );
}
export default Zeitreise10Kennzahl;
