import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
      {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
      {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
      {key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains'},
      // Keep the same-origin campus iframe working. Script restrictions need
      // nonces for the framework's inline hydration scripts before enabling.
      {key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'"},
    ];
    // This Vinext version's wildcard matcher does not include the bare '/'.
    return ['/', '/:path*'].map(source => ({source, headers}));
  },
};

export default nextConfig;
