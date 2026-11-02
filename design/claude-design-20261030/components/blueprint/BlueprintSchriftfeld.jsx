// figma node: 215:2 Blueprint / Schriftfeld
export function BlueprintSchriftfeld(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} onClick={props.onClick} style={{
      width: 720,
      height: 136,
      backgroundColor: "var(--surface)",
      position: "relative",
      color: "var(--white)",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 720,
        height: 136,
        borderRadius: 2,
        backgroundColor: "var(--title)",
      }}>
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 720,
          height: 136,
          overflow: "hidden",
        }}>
          <svg width={720} height={136} viewBox="0 0 720 136" fill="none" style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 720,
            height: 136,
            opacity: 0.045,
          }}>
            <path d={"M 10 0 L 9.5 0 L 9.5 136 L 10 136 L 10.5 136 L 10.5 0 L 10 0 Z M 20 0 L 19.5 0 L 19.5 136 L 20 136 L 20.5 136 L 20.5 0 L 20 0 Z M 30 0 L 29.5 0 L 29.5 136 L 30 136 L 30.5 136 L 30.5 0 L 30 0 Z M 40 0 L 39.5 0 L 39.5 136 L 40 136 L 40.5 136 L 40.5 0 L 40 0 Z M 60 0 L 59.5 0 L 59.5 136 L 60 136 L 60.5 136 L 60.5 0 L 60 0 Z M 70 0 L 69.5 0 L 69.5 136 L 70 136 L 70.5 136 L 70.5 0 L 70 0 Z M 80 0 L 79.5 0 L 79.5 136 L 80 136 L 80.5 136 L 80.5 0 L 80 0 Z M 90 0 L 89.5 0 L 89.5 136 L 90 136 L 90.5 136 L 90.5 0 L 90 0 Z M 110 0 L 109.5 0 L 109.5 136 L 110 136 L 110.5 136 L 110.5 0 L 110 0 Z M 120 0 L 119.5 0 L 119.5 136 L 120 136 L 120.5 136 L 120.5 0 L 120 0 Z M 130 0 L 129.5 0 L 129.5 136 L 130 136 L 130.5 136 L 130.5 0 L 130 0 Z M 140 0 L 139.5 0 L 139.5 136 L 140 136 L 140.5 136 L 140.5 0 L 140 0 Z M 160 0 L 159.5 0 L 159.5 136 L 160 136 L 160.5 136 L 160.5 0 L 160 0 Z M 170 0 L 169.5 0 L 169.5 136 L 170 136 L 170.5 136 L 170.5 0 L 170 0 Z M 180 0 L 179.5 0 L 179.5 136 L 180 136 L 180.5 136 L 180.5 0 L 180 0 Z M 190 0 L 189.5 0 L 189.5 136 L 190 136 L 190.5 136 L 190.5 0 L 190 0 Z M 210 0 L 209.5 0 L 209.5 136 L 210 136 L 210.5 136 L 210.5 0 L 210 0 Z M 220 0 L 219.5 0 L 219.5 136 L 220 136 L 220.5 136 L 220.5 0 L 220 0 Z M 230 0 L 229.5 0 L 229.5 136 L 230 136 L 230.5 136 L 230.5 0 L 230 0 Z M 240 0 L 239.5 0 L 239.5 136 L 240 136 L 240.5 136 L 240.5 0 L 240 0 Z M 260 0 L 259.5 0 L 259.5 136 L 260 136 L 260.5 136 L 260.5 0 L 260 0 Z M 270 0 L 269.5 0 L 269.5 136 L 270 136 L 270.5 136 L 270.5 0 L 270 0 Z M 280 0 L 279.5 0 L 279.5 136 L 280 136 L 280.5 136 L 280.5 0 L 280 0 Z M 290 0 L 289.5 0 L 289.5 136 L 290 136 L 290.5 136 L 290.5 0 L 290 0 Z M 310 0 L 309.5 0 L 309.5 136 L 310 136 L 310.5 136 L 310.5 0 L 310 0 Z M 320 0 L 319.5 0 L 319.5 136 L 320 136 L 320.5 136 L 320.5 0 L 320 0 Z M 330 0 L 329.5 0 L 329.5 136 L 330 136 L 330.5 136 L 330.5 0 L 330 0 Z M 340 0 L 339.5 0 L 339.5 136 L 340 136 L 340.5 136 L 340.5 0 L 340 0 Z M 360 0 L 359.5 0 L 359.5 136 L 360 136 L 360.5 136 L 360.5 0 L 360 0 Z M 370 0 L 369.5 0 L 369.5 136 L 370 136 L 370.5 136 L 370.5 0 L 370 0 Z M 380 0 L 379.5 0 L 379.5 136 L 380 136 L 380.5 136 L 380.5 0 L 380 0 Z M 390 0 L 389.5 0 L 389.5 136 L 390 136 L 390.5 136 L 390.5 0 L 390 0 Z M 410 0 L 409.5 0 L 409.5 136 L 410 136 L 410.5 136 L 410.5 0 L 410 0 Z M 420 0 L 419.5 0 L 419.5 136 L 420 136 L 420.5 136 L 420.5 0 L 420 0 Z M 430 0 L 429.5 0 L 429.5 136 L 430 136 L 430.5 136 L 430.5 0 L 430 0 Z M 440 0 L 439.5 0 L 439.5 136 L 440 136 L 440.5 136 L 440.5 0 L 440 0 Z M 460 0 L 459.5 0 L 459.5 136 L 460 136 L 460.5 136 L 460.5 0 L 460 0 Z M 470 0 L 469.5 0 L 469.5 136 L 470 136 L 470.5 136 L 470.5 0 L 470 0 Z M 480 0 L 479.5 0 L 479.5 136 L 480 136 L 480.5 136 L 480.5 0 L 480 0 Z M 490 0 L 489.5 0 L 489.5 136 L 490 136 L 490.5 136 L 490.5 0 L 490 0 Z M 510 0 L 509.5 0 L 509.5 136 L 510 136 L 510.5 136 L 510.5 0 L 510 0 Z M 520 0 L 519.5 0 L 519.5 136 L 520 136 L 520.5 136 L 520.5 0 L 520 0 Z M 530 0 L 529.5 0 L 529.5 136 L 530 136 L 530.5 136 L 530.5 0 L 530 0 Z M 540 0 L 539.5 0 L 539.5 136 L 540 136 L 540.5 136 L 540.5 0 L 540 0 Z M 560 0 L 559.5 0 L 559.5 136 L 560 136 L 560.5 136 L 560.5 0 L 560 0 Z M 570 0 L 569.5 0 L 569.5 136 L 570 136 L 570.5 136 L 570.5 0 L 570 0 Z M 580 0 L 579.5 0 L 579.5 136 L 580 136 L 580.5 136 L 580.5 0 L 580 0 Z M 590 0 L 589.5 0 L 589.5 136 L 590 136 L 590.5 136 L 590.5 0 L 590 0 Z M 610 0 L 609.5 0 L 609.5 136 L 610 136 L 610.5 136 L 610.5 0 L 610 0 Z M 620 0 L 619.5 0 L 619.5 136 L 620 136 L 620.5 136 L 620.5 0 L 620 0 Z M 630 0 L 629.5 0 L 629.5 136 L 630 136 L 630.5 136 L 630.5 0 L 630 0 Z M 640 0 L 639.5 0 L 639.5 136 L 640 136 L 640.5 136 L 640.5 0 L 640 0 Z M 660 0 L 659.5 0 L 659.5 136 L 660 136 L 660.5 136 L 660.5 0 L 660 0 Z M 670 0 L 669.5 0 L 669.5 136 L 670 136 L 670.5 136 L 670.5 0 L 670 0 Z M 680 0 L 679.5 0 L 679.5 136 L 680 136 L 680.5 136 L 680.5 0 L 680 0 Z M 690 0 L 689.5 0 L 689.5 136 L 690 136 L 690.5 136 L 690.5 0 L 690 0 Z M 710 0 L 709.5 0 L 709.5 136 L 710 136 L 710.5 136 L 710.5 0 L 710 0 Z M 720 0 L 719.5 0 L 719.5 136 L 720 136 L 720.5 136 L 720.5 0 L 720 0 Z M 0 10 L 0 10.5 L 720 10.5 L 720 10 L 720 9.5 L 0 9.5 L 0 10 Z M 0 20 L 0 20.5 L 720 20.5 L 720 20 L 720 19.5 L 0 19.5 L 0 20 Z M 0 30 L 0 30.5 L 720 30.5 L 720 30 L 720 29.5 L 0 29.5 L 0 30 Z M 0 40 L 0 40.5 L 720 40.5 L 720 40 L 720 39.5 L 0 39.5 L 0 40 Z M 0 60 L 0 60.5 L 720 60.5 L 720 60 L 720 59.5 L 0 59.5 L 0 60 Z M 0 70 L 0 70.5 L 720 70.5 L 720 70 L 720 69.5 L 0 69.5 L 0 70 Z M 0 80 L 0 80.5 L 720 80.5 L 720 80 L 720 79.5 L 0 79.5 L 0 80 Z M 0 90 L 0 90.5 L 720 90.5 L 720 90 L 720 89.5 L 0 89.5 L 0 90 Z M 0 110 L 0 110.5 L 720 110.5 L 720 110 L 720 109.5 L 0 109.5 L 0 110 Z M 0 120 L 0 120.5 L 720 120.5 L 720 120 L 720 119.5 L 0 119.5 L 0 120 Z M 0 130 L 0 130.5 L 720 130.5 L 720 130 L 720 129.5 L 0 129.5 L 0 130 Z"} fill="currentColor" fillRule="nonzero" />
          </svg>
          <svg width={720} height={136} viewBox="0 0 720 136" fill="none" style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 720,
            height: 136,
            opacity: 0.13,
          }}>
            <path d={"M 0 0 L 0 -0.5 L -0.5 -0.5 L -0.5 0 L 0 0 Z M 0 0 L -0.5 0 L -0.5 136 L 0 136 L 0.5 136 L 0.5 0 L 0 0 Z M 50 0 L 49.5 0 L 49.5 136 L 50 136 L 50.5 136 L 50.5 0 L 50 0 Z M 100 0 L 99.5 0 L 99.5 136 L 100 136 L 100.5 136 L 100.5 0 L 100 0 Z M 150 0 L 149.5 0 L 149.5 136 L 150 136 L 150.5 136 L 150.5 0 L 150 0 Z M 200 0 L 199.5 0 L 199.5 136 L 200 136 L 200.5 136 L 200.5 0 L 200 0 Z M 250 0 L 249.5 0 L 249.5 136 L 250 136 L 250.5 136 L 250.5 0 L 250 0 Z M 300 0 L 299.5 0 L 299.5 136 L 300 136 L 300.5 136 L 300.5 0 L 300 0 Z M 350 0 L 349.5 0 L 349.5 136 L 350 136 L 350.5 136 L 350.5 0 L 350 0 Z M 400 0 L 399.5 0 L 399.5 136 L 400 136 L 400.5 136 L 400.5 0 L 400 0 Z M 450 0 L 449.5 0 L 449.5 136 L 450 136 L 450.5 136 L 450.5 0 L 450 0 Z M 500 0 L 499.5 0 L 499.5 136 L 500 136 L 500.5 136 L 500.5 0 L 500 0 Z M 550 0 L 549.5 0 L 549.5 136 L 550 136 L 550.5 136 L 550.5 0 L 550 0 Z M 600 0 L 599.5 0 L 599.5 136 L 600 136 L 600.5 136 L 600.5 0 L 600 0 Z M 650 0 L 649.5 0 L 649.5 136 L 650 136 L 650.5 136 L 650.5 0 L 650 0 Z M 700 0 L 699.5 0 L 699.5 136 L 700 136 L 700.5 136 L 700.5 0 L 700 0 Z M 0 0 L 0 0.5 L 720 0.5 L 720 0 L 720 -0.5 L 0 -0.5 L 0 0 Z M 0 50 L 0 50.5 L 720 50.5 L 720 50 L 720 49.5 L 0 49.5 L 0 50 Z M 0 100 L 0 100.5 L 720 100.5 L 720 100 L 720 99.5 L 0 99.5 L 0 100 Z"} fill="currentColor" fillRule="nonzero" />
          </svg>
        </div>
        <span style={{
          position: "absolute",
          left: 20,
          top: 12,
          width: 680,
          height: 17,
          fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          lineHeight: "17px",
          color: "var(--white)",
        }}>{props.children ?? props.text1 ?? "BLATT 02 / FINANZPLAN · REV 04"}</span>
        <span style={{
          position: "absolute",
          left: 20,
          top: 44,
          width: 680,
          height: 45,
          fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 600,
          fontSize: 32,
          lineHeight: "45px",
          color: "var(--white)",
        }}>{props.text2 ?? "Oktober 2026"}</span>
        <span style={{
          position: "absolute",
          left: 20,
          top: 100,
          width: 680,
          height: 17,
          fontFamily: "\"Barlow Semi Condensed\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          lineHeight: "17px",
          color: "var(--white)",
        }}>{props.text3 ?? "STAND 15.10.2026 / EUR"}</span>
      </div>
    </div>
  );
}
export default BlueprintSchriftfeld;
