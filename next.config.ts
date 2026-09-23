import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_ENV: process.env.VERCEL_ENV || 'development' },
  async headers() { return [{ source: '/(.*)', headers: [
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  ]}]; },
};
export default config;
