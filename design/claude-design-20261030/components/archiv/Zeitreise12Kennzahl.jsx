// figma node: 438:1386 Zeitreise/12/Kennzahl
export function Zeitreise12Kennzahl(_p = {}) {
  const props = { ..._p, bezeichnung: _p.bezeichnung ?? "Zu verteilen", wert: _p.wert ?? "120,00 €", hinweis: _p.hinweis ?? "Eingänge − Zuweisungen" };
  return (
    <div className={props.className} style={{
      width: 404,
      height: 128,
      backgroundColor: "rgb(255,249,222)",
      boxShadow: "inset 0 0 0 1px rgb(198,212,216)",
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
        fontFamily: "Caveat, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 23,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(114,129,147)",
        flexShrink: 0,
      }}>{props.bezeichnung}</span>
      <span style={{
        position: "relative",
        fontFamily: "Caveat, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 700,
        fontSize: 39,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(40,74,121)",
        flexShrink: 0,
      }}>{props.wert}</span>
      <span style={{
        position: "relative",
        fontFamily: "Caveat, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 18,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(114,129,147)",
        flexShrink: 0,
      }}>{props.hinweis}</span>
    </div>
  );
}
export default Zeitreise12Kennzahl;
