import { FormDialog, type PanelProps } from '@budget/ui';
import { DialogClose } from './dialog-close';
import '../pages/settings-form-dialog.css';

/** Account forms reuse the existing native dialog and scrolling form layout. */
export function AccountFormDialog({ children, ...props }: PanelProps) {
  return (
    <FormDialog {...props}>
      {props.open && (
        <>
          <div className="bk-head panel-head settings-form-head">
            <h2>{props.title}</h2>
            <DialogClose
              onClick={() => {
                if (!props.beforeClose || props.beforeClose()) props.onClose();
              }}
            />
          </div>
          <div className="bk-body panel-body">{children}</div>
        </>
      )}
    </FormDialog>
  );
}
