import * as React from 'react';
export interface DialogKopfProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Buchung bearbeiten". */
  text1?: string;
}
export declare const DialogKopf: React.FC<DialogKopfProps>;
export default DialogKopf;
