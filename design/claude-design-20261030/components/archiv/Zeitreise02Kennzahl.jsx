// figma node: 438:147 Zeitreise/02/Kennzahl
export function Zeitreise02Kennzahl(_p = {}) {
  const props = { ..._p, bezeichnung: _p.bezeichnung ?? "Zu verteilen", wert: _p.wert ?? "120,00 €", hinweis: _p.hinweis ?? "Eingänge − Zuweisungen" };
  return (
    <div className={props.className} style={{
      width: 367.333,
      height: 128,
      backgroundColor: "rgb(255,255,255)",
      boxShadow: "inset 0 0 0 1px rgb(17,17,17)",
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
        fontFamily: "\"Courier Prime\", ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
        fontWeight: 400,
        fontSize: 13,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(68,68,68)",
        flexShrink: 0,
      }}>{props.bezeichnung}</span>
      <span style={{
        position: "relative",
        fontFamily: "\"Courier Prime\", ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
        fontWeight: 700,
        fontSize: 31,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(17,17,17)",
        flexShrink: 0,
      }}>{props.wert}</span>
      <span style={{
        position: "relative",
        fontFamily: "\"Courier Prime\", ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
        fontWeight: 400,
        fontSize: 11,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(68,68,68)",
        flexShrink: 0,
      }}>{props.hinweis}</span>
    </div>
  );
}
export default Zeitreise02Kennzahl;
