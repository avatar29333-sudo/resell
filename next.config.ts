import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // رفع المستندات: لحد 4 ميجا للملف (حد Vercel للطلب 4.5 ميجا)
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // خطوط الـ PDF العربي (CON-06 / TXN-01) لازم تتنسخ مع الدوال على Vercel
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
  // اللغة الافتراضية عربي: الصفحة الرئيسية بتحوّل على /ar
  async redirects() {
    return [
      { source: "/", destination: "/ar", permanent: false },
    ];
  },
};

export default nextConfig;
