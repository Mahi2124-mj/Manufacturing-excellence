import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';

/**
 * Renders its children into the header's `#header-actions` slot. Lets a page put
 * its top action buttons up in the header bar while keeping their handlers/state
 * in the page. Renders nothing until the slot exists.
 */
export default function HeaderPortal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById('header-actions'));
  }, []);
  return el ? createPortal(children, el) : null;
}
