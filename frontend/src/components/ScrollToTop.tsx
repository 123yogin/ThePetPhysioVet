import React from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * React Router keeps the document scroll position across route changes. On a
 * phone that means tapping "Enquiries" from halfway down the schedule lands you
 * ~600px into the new screen with its heading off the top of the display, and no
 * sidebar on screen to say where you are.
 *
 * POP is excluded: that is the back button, where returning to where you were is
 * the whole point.
 */
export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  React.useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
};
