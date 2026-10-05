import type { AnchorHTMLAttributes } from "react";

// Native navigation avoids the current vinext production Link chunk regression.
// Wallet identity is restored only when the server session matches eth_accounts.
export default function SiteLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a {...props} />;
}
