/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: { '/api/admin/migrate': ['./migrations/**/*'] }
  }
};
export default nextConfig;
