import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // رفع المستندات: لحد 4 ميجا للملف (حد Vercel للطلب 4.5 ميجا)
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // اللغة الافتراضية عربي: الصفحة الرئيسية بتحوّل على /ar
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
};

export default nextConfig;
