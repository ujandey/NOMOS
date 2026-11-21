import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Drawer({ titleId, label, close, children }: {
  titleId: string; label: string; close: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="evidence-drawer" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) close();
    }}>
    <div className="drawer-inner">
      <div className="drawer-head"><span>{label}</span>
        <button className="icon-button" aria-label={'Close ' + label.toLowerCase()} onClick={close}><X size={20} /></button></div>
      {children}
    </div>
  </dialog>;
}
