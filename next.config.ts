import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
      {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
      {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
      {key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains'},
      {key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'"},
    ];
    // This Vinext version's wildcard matcher does not include the bare '/'.
    return ['/', '/:path*'].map(source => ({source, headers}));
  },
};

export default nextConfig;
