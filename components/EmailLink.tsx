"use client";

import { useEffect, useState } from "react";

type Props = {
  user: string;
  domain: string;
  fallbackHref: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * E-posta bağlantısı. `mailto:` adresi yalnızca tarayıcıda, parçalardan
 * birleştirilir; HTML çıktısında düz e-posta adresi bulunmaz. Böylece
 * Cloudflare'in e-posta gizleme özelliği devreye girmez (DOM değişmez,
 * üçüncü taraf script enjekte edilmez). JS kapalıysa iletişim sayfasına
 * giden zarif bir yedek bağlantı kalır.
 */
export function EmailLink({
  user,
  domain,
  fallbackHref,
  className,
  children,
}: Props) {
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    setHref(`mailto:${user}@${domain}`);
  }, [domain, user]);

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
