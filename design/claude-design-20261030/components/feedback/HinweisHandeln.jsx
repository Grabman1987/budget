// figma node: 178:38 Hinweis / Handeln
export function HinweisHandeln(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 480,
      height: 80,
      position: "relative",
      color: "var(--negative)",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 480,
        height: 64,
        borderRadius: 8,
        backgroundColor: "var(--negativesoft)",
      }}>
        <div style={{
          position: "absolute",
          left: 12,
          top: 22,
          width: 20,
          height: 20,
          overflow: "hidden",
        }}>
          <svg width={16.667} height={15} viewBox="0 0 16.667 15" fill="none" style={{
            position: "absolute",
            left: 1.667,
            top: 2.5,
            width: 16.667,
            height: 15,
          }}>
            <path d={"M 8.333 0 L 8.989 -0.364 C 8.857 -0.602 8.606 -0.75 8.333 -0.75 C 8.061 -0.75 7.81 -0.602 7.678 -0.364 L 8.333 0 Z M 16.667 15 L 16.667 15.75 C 16.932 15.75 17.178 15.609 17.313 15.38 C 17.448 15.151 17.451 14.868 17.322 14.636 L 16.667 15 Z M 0 15 L -0.656 14.636 C -0.785 14.868 -0.781 15.151 -0.646 15.38 C -0.512 15.609 -0.266 15.75 0 15.75 L 0 15 Z M 9.083 5 C 9.083 4.586 8.748 4.25 8.333 4.25 C 7.919 4.25 7.583 4.586 7.583 5 L 8.333 5 L 9.083 5 Z M 7.583 9.167 C 7.583 9.581 7.919 9.917 8.333 9.917 C 8.748 9.917 9.083 9.581 9.083 9.167 L 8.333 9.167 L 7.583 9.167 Z M 8.333 10.917 C 7.919 10.917 7.583 11.252 7.583 11.667 C 7.583 12.081 7.919 12.417 8.333 12.417 L 8.333 11.667 L 8.333 10.917 Z M 8.342 12.417 C 8.756 12.417 9.092 12.081 9.092 11.667 C 9.092 11.252 8.756 10.917 8.342 10.917 L 8.342 11.667 L 8.342 12.417 Z M 8.333 0 L 7.678 0.364 L 16.011 15.364 L 16.667 15 L 17.322 14.636 L 8.989 -0.364 L 8.333 0 Z M 16.667 15 L 16.667 14.25 L 0 14.25 L 0 15 L 0 15.75 L 16.667 15.75 L 16.667 15 Z M 0 15 L 0.656 15.364 L 8.989 0.364 L 8.333 0 L 7.678 -0.364 L -0.656 14.636 L 0 15 Z M 8.333 5 L 7.583 5 L 7.583 9.167 L 8.333 9.167 L 9.083 9.167 L 9.083 5 L 8.333 5 Z M 8.333 11.667 L 8.333 12.417 L 8.342 12.417 L 8.342 11.667 L 8.342 10.917 L 8.333 10.917 L 8.333 11.667 Z"} fill="currentColor" fillRule="nonzero" />
          </svg>
        </div>
        <span style={{
          position: "absolute",
          left: 42,
          top: 23,
          width: 426,
          height: 18,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 400,
          fontSize: 13,
          lineHeight: "18px",
          color: "var(--negative)",
        }}>{props.children ?? props.text1 ?? "Eine Entscheidung ist erforderlich."}</span>
      </div>
    </div>
  );
}
export default HinweisHandeln;
