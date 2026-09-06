import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';

type ExternalLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  /**
   * Hand the URL to whichever app owns it — WhatsApp, Messages — instead of
   * showing it inside this one. Required for non-http schemes like `sms:`,
   * which a WebView cannot navigate to at all.
   */
  handoff?: boolean;
};

/**
 * A link out of the app.
 *
 * A WebView opens no new window, so `target="_blank"` does nothing on a device:
 * the link renders as a control that never responds, with no error. On native
 * this opens the URL through the system instead — in an in-app browser by
 * default, which keeps the user in the app for report files and attachments.
 */
export const ExternalLink: React.FC<ExternalLinkProps> = ({
  href,
  handoff = false,
  onClick,
  children,
  ...rest
}) => {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !Capacitor.isNativePlatform()) {
      return;
    }
    event.preventDefault();
    if (handoff) {
      AppLauncher.openUrl({ url: href });
    } else {
      Browser.open({ url: href });
    }
  };

  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
