// figma node: 189:1430 Diagramm-Legende
export function DiagrammLegende(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 420,
      height: 64,
      backgroundColor: "var(--surface)",
      position: "relative",
      ...props.style,
    }}>
      <svg width={32} height={3} viewBox="0 0 32 3" fill="none" style={{
        position: "absolute",
        left: 16,
        top: 24,
        width: 32,
        height: 3,
        color: "var(--positive)",
      }}>
        <path d={"M 0 0 L 32 0 L 32 3 L 0 3 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <span style={{
        position: "absolute",
        left: 60,
        top: 16,
        width: 70,
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.children ?? props.text1 ?? "Ist"}</span>
      <svg width={32} height={1} viewBox="0 0 32 1" fill="none" style={{
        position: "absolute",
        left: 160,
        top: 24,
        width: 32,
        height: 1,
      }}>
        <path d={"M 0 0 L 0 -0.5 L -0.5 -0.5 L -0.5 0 L 0 0 Z M 32 0 L 32.5 0 L 32.5 -0.5 L 32 -0.5 L 32 0 Z M 32 1 L 32 1.5 L 32.5 1.5 L 32.5 1 L 32 1 Z M 0 1 L -0.5 1 L -0.5 1.5 L 0 1.5 L 0 1 Z M 0 0 L -0.5 0 L -0.5 0.286 L 0 0.286 L 0.5 0.286 L 0.5 0 L 0 0 Z M 0 0.714 L -0.5 0.714 L -0.5 1 L 0 1 L 0.5 1 L 0.5 0.714 L 0 0.714 Z M 0 1 L 0 1.5 L 1.829 1.5 L 1.829 1 L 1.829 0.5 L 0 0.5 L 0 1 Z M 4.571 1 L 4.571 1.5 L 8.229 1.5 L 8.229 1 L 8.229 0.5 L 4.571 0.5 L 4.571 1 Z M 10.971 1 L 10.971 1.5 L 14.629 1.5 L 14.629 1 L 14.629 0.5 L 10.971 0.5 L 10.971 1 Z M 17.371 1 L 17.371 1.5 L 21.029 1.5 L 21.029 1 L 21.029 0.5 L 17.371 0.5 L 17.371 1 Z M 23.771 1 L 23.771 1.5 L 27.429 1.5 L 27.429 1 L 27.429 0.5 L 23.771 0.5 L 23.771 1 Z M 30.171 1 L 30.171 1.5 L 32 1.5 L 32 1 L 32 0.5 L 30.171 0.5 L 30.171 1 Z M 32 1 L 32.5 1 L 32.5 0.714 L 32 0.714 L 31.5 0.714 L 31.5 1 L 32 1 Z M 32 0.286 L 32.5 0.286 L 32.5 0 L 32 0 L 31.5 0 L 31.5 0.286 L 32 0.286 Z M 32 0 L 32 -0.5 L 30.171 -0.5 L 30.171 0 L 30.171 0.5 L 32 0.5 L 32 0 Z M 27.429 0 L 27.429 -0.5 L 23.771 -0.5 L 23.771 0 L 23.771 0.5 L 27.429 0.5 L 27.429 0 Z M 21.029 0 L 21.029 -0.5 L 17.371 -0.5 L 17.371 0 L 17.371 0.5 L 21.029 0.5 L 21.029 0 Z M 14.629 0 L 14.629 -0.5 L 10.971 -0.5 L 10.971 0 L 10.971 0.5 L 14.629 0.5 L 14.629 0 Z M 8.229 0 L 8.229 -0.5 L 4.571 -0.5 L 4.571 0 L 4.571 0.5 L 8.229 0.5 L 8.229 0 Z M 1.829 0 L 1.829 -0.5 L 0 -0.5 L 0 0 L 0 0.5 L 1.829 0.5 L 1.829 0 Z M 0 0 L 0 -1 L -1 -1 L -1 0 L 0 0 Z M 32 0 L 33 0 L 33 -1 L 32 -1 L 32 0 Z M 32 1 L 32 2 L 33 2 L 33 1 L 32 1 Z M 0 1 L -1 1 L -1 2 L 0 2 L 0 1 Z M 0 0 L -1 0 L -1 0.286 L 0 0.286 L 1 0.286 L 1 0 L 0 0 Z M 0 0.714 L -1 0.714 L -1 1 L 0 1 L 1 1 L 1 0.714 L 0 0.714 Z M 0 1 L 0 2 L 1.829 2 L 1.829 1 L 1.829 0 L 0 0 L 0 1 Z M 4.571 1 L 4.571 2 L 8.229 2 L 8.229 1 L 8.229 0 L 4.571 0 L 4.571 1 Z M 10.971 1 L 10.971 2 L 14.629 2 L 14.629 1 L 14.629 0 L 10.971 0 L 10.971 1 Z M 17.371 1 L 17.371 2 L 21.029 2 L 21.029 1 L 21.029 0 L 17.371 0 L 17.371 1 Z M 23.771 1 L 23.771 2 L 27.429 2 L 27.429 1 L 27.429 0 L 23.771 0 L 23.771 1 Z M 30.171 1 L 30.171 2 L 32 2 L 32 1 L 32 0 L 30.171 0 L 30.171 1 Z M 32 1 L 33 1 L 33 0.714 L 32 0.714 L 31 0.714 L 31 1 L 32 1 Z M 32 0.286 L 33 0.286 L 33 0 L 32 0 L 31 0 L 31 0.286 L 32 0.286 Z M 32 0 L 32 -1 L 30.171 -1 L 30.171 0 L 30.171 1 L 32 1 L 32 0 Z M 27.429 0 L 27.429 -1 L 23.771 -1 L 23.771 0 L 23.771 1 L 27.429 1 L 27.429 0 Z M 21.029 0 L 21.029 -1 L 17.371 -1 L 17.371 0 L 17.371 1 L 21.029 1 L 21.029 0 Z M 14.629 0 L 14.629 -1 L 10.971 -1 L 10.971 0 L 10.971 1 L 14.629 1 L 14.629 0 Z M 8.229 0 L 8.229 -1 L 4.571 -1 L 4.571 0 L 4.571 1 L 8.229 1 L 8.229 0 Z M 1.829 0 L 1.829 -1 L 0 -1 L 0 0 L 0 1 L 1.829 1 L 1.829 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
      <span style={{
        position: "absolute",
        left: 204,
        top: 16,
        width: 180,
        height: 20,
        fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "var(--ink)",
      }}>{props.text2 ?? "Prognose"}</span>
    </div>
  );
}
export default DiagrammLegende;
