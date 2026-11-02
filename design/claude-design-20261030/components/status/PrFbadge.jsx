// figma node: 352:128 Prüfbadge (2 variants)
const __venc = (v) => String(v).replace(/[%|=]/g, encodeURIComponent);
const __vkey = (p) => "status=" + __venc(p.status);

export function PrFbadge(_p = {}) {
  const props = { ..._p, text: _p.text ?? "Geprüft · vor 2 T.", status: _p.status ?? "geprüft" };
  const __body0 = () => (
    <div className={props.className} onClick={props.onClick} style={{
      width: "fit-content",
      borderRadius: 999,
      backgroundColor: "var(--positivesoft)",
      display: "flex",
      flexDirection: "row",
      padding: "2px 8px 2px 8px",
      alignItems: "flex-start",
      flexWrap: "nowrap",
      boxSizing: "border-box",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "relative",
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "var(--positive)",
        flexShrink: 0,
        alignSelf: "stretch",
      }}>{props.text}</span>
    </div>
  );
  const __body1 = () => (
    <div className={props.className} style={{
      width: "fit-content",
      borderRadius: 999,
      backgroundColor: "var(--negativesoft)",
      display: "flex",
      flexDirection: "row",
      padding: "2px 8px 2px 8px",
      alignItems: "flex-start",
      flexWrap: "nowrap",
      boxSizing: "border-box",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "relative",
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: "nowrap",
        lineHeight: "100%",
        color: "var(--negative)",
        flexShrink: 0,
        alignSelf: "stretch",
      }}>{props.text}</span>
    </div>
  );
  const __impls = {
    // figma: Status=geprüft
    "status=geprüft": __body0,
    // figma: Status=fällig
    "status=fällig": __body1,
  };
  return (__impls[__vkey(props)] ?? __body0)();
}
export default PrFbadge;
