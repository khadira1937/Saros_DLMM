/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@dlmm-copilot/core'],
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  env: {
    CUSTOM_KEY: 'value',
  },
  async rewrites() {
    return [
      {
        source: '/api/strategy/:path*',
        destination: `${process.env.NEXT_PUBLIC_STRATEGY_URL || 'http://localhost:4000'}/:path*`,
      },
    ];
  },
}

module.exports = nextConfig