import * as React from 'react';
export interface PrFbadgeProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  text?: string;
  status?: "geprüft" | "fällig";
}
export declare const PrFbadge: React.FC<PrFbadgeProps>;
export default PrFbadge;
