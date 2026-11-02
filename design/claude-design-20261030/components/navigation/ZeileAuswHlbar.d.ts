import * as React from 'react';
export interface ZeileAuswHlbarProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Lebensmittel". */
  text1?: string;
  /** Text content; defaults to "Zugewiesen 420,00 €". */
  text2?: string;
  /** Text content; defaults to "130,00 €". */
  text3?: string;
}
export declare const ZeileAuswHlbar: React.FC<ZeileAuswHlbarProps>;
export default ZeileAuswHlbar;
