// figma node: 438:1278 Zeitreise/11/Kennzahl
export function Zeitreise11Kennzahl(_p = {}) {
  const props = { ..._p, bezeichnung: _p.bezeichnung ?? "Zu verteilen", wert: _p.wert ?? "120,00 €", hinweis: _p.hinweis ?? "Eingänge − Zuweisungen" };
  return (
    <div className={props.className} style={{
      width: 438.667,
      height: 128,
      backgroundColor: "rgb(11,25,15)",
      boxShadow: "inset 0 0 0 1px rgb(45,99,64)",
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
        fontFamily: "\"IBM Plex Mono\", ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
        fontWeight: 400,
        fontSize: 13,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(92,166,114)",
        flexShrink: 0,
      }}>{props.bezeichnung}</span>
      <span style={{
        position: "relative",
        fontFamily: "\"IBM Plex Mono\", ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
        fontWeight: 700,
        fontSize: 31,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(136,233,156)",
        flexShrink: 0,
      }}>{props.wert}</span>
      <span style={{
        position: "relative",
        fontFamily: "\"IBM Plex Mono\", ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
        fontWeight: 400,
        fontSize: 11,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "rgb(92,166,114)",
        flexShrink: 0,
      }}>{props.hinweis}</span>
    </div>
  );
}
export default Zeitreise11Kennzahl;
